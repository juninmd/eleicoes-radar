// Rastro do dinheiro público das emendas parlamentares: quanto cada deputado
// direcionou e pra quem foi (favorecido). Fonte: Portal da Transparência,
// dataset EmendasParlamentares (nacional — filtramos por nome dos deputados
// de SP já coletados).
import { existsSync } from "node:fs";
import { db } from "./db";

db.exec(`
CREATE TABLE IF NOT EXISTS emendas (
  deputadoId INTEGER,
  ano INTEGER,
  tipo TEXT,
  uf TEXT,
  municipio TEXT,
  funcao TEXT,
  valorEmpenhado REAL,
  valorPago REAL
);
CREATE INDEX IF NOT EXISTS idx_emendas_dep ON emendas(deputadoId);

CREATE TABLE IF NOT EXISTS emendas_favorecidos (
  deputadoId INTEGER,
  favorecido TEXT,
  cnpjCpf TEXT,
  naturezaJuridica TEXT,
  tipoFavorecido TEXT,
  uf TEXT,
  municipio TEXT,
  valorRecebido REAL
);
CREATE INDEX IF NOT EXISTS idx_emfav_dep ON emendas_favorecidos(deputadoId);
`);

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ";" && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const normalizarNome = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const numeroBr = (s: string) => Number((s ?? "0").replace(/\./g, "").replace(",", ".")) || 0;

export async function coletarEmendas() {
  const zipPath = "data/EmendasParlamentares.zip";
  if (!existsSync(zipPath)) {
    console.warn(`[emendas] ${zipPath} não encontrado, pulando.`);
    return;
  }

  const deputados = db.query<{ id: number; nome: string }, []>(`SELECT id, nome FROM deputados`).all();
  const porNome = new Map<string, number>();
  for (const d of deputados) porNome.set(normalizarNome(d.nome), d.id);

  const tarBin = process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";

  for (const arq of ["EmendasParlamentares.csv", "EmendasParlamentares_PorFavorecido.csv"]) {
    const outPath = `data/${arq}`;
    if (!existsSync(outPath)) {
      const proc = Bun.spawn([tarBin, "-C", "data", "-xf", zipPath, arq]);
      await proc.exited;
    }
  }

  // 1. EmendasParlamentares.csv — totais empenhado/pago por deputado
  {
    const buf = await Bun.file("data/EmendasParlamentares.csv").arrayBuffer();
    const text = new TextDecoder("latin1").decode(buf);
    const lines = text.split("\n");
    const header = parseCsvLine(lines[0]).map((h) => h.replace(/"/g, ""));
    const idx = (c: string) => header.indexOf(c);
    const iAutor = idx("Nome do Autor da Emenda");
    const iAno = idx("Ano da Emenda");
    const iTipo = idx("Tipo de Emenda");
    const iUf = idx("UF");
    const iMun = idx("Município");
    const iFuncao = idx("Nome Função");
    const iEmpenhado = idx("Valor Empenhado");
    const iPago = idx("Valor Pago");

    db.exec("DELETE FROM emendas");
    const insert = db.prepare(
      `INSERT INTO emendas (deputadoId, ano, tipo, uf, municipio, funcao, valorEmpenhado, valorPago) VALUES (?,?,?,?,?,?,?,?)`
    );
    let matched = 0;
    const insertMany = db.transaction((rows: string[][]) => {
      for (const cols of rows) {
        const nome = normalizarNome((cols[iAutor] ?? "").replace(/"/g, ""));
        const depId = porNome.get(nome);
        if (!depId) continue;
        insert.run(
          depId,
          Number(cols[iAno]) || 0,
          (cols[iTipo] ?? "").replace(/"/g, ""),
          (cols[iUf] ?? "").replace(/"/g, ""),
          (cols[iMun] ?? "").replace(/"/g, ""),
          (cols[iFuncao] ?? "").replace(/"/g, ""),
          numeroBr(cols[iEmpenhado]),
          numeroBr(cols[iPago])
        );
        matched++;
      }
    });
    const batch: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]?.trim()) continue;
      batch.push(parseCsvLine(lines[i]));
    }
    insertMany(batch);
    console.log(`[emendas] ${matched} registros de emenda casados com deputados de SP (de ${batch.length} linhas nacionais)`);
  }

  // 2. PorFavorecido.csv — quem recebeu (maior arquivo, 181MB — processa em stream por linha)
  {
    const file = Bun.file("data/EmendasParlamentares_PorFavorecido.csv");
    const buf = await file.arrayBuffer();
    const text = new TextDecoder("latin1").decode(buf);
    const lines = text.split("\n");
    const header = parseCsvLine(lines[0]).map((h) => h.replace(/"/g, ""));
    const idx = (c: string) => header.indexOf(c);
    const iAutor = idx("Nome do Autor da Emenda");
    const iFavorecido = idx("Favorecido");
    const iCnpj = idx("Código do Favorecido");
    const iNatureza = idx("Natureza Jurídica");
    const iTipoFav = idx("Tipo Favorecido");
    const iUf = idx("UF Favorecido");
    const iMun = idx("Município Favorecido");
    const iValor = idx("Valor Recebido");

    db.exec("DELETE FROM emendas_favorecidos");
    const insert = db.prepare(
      `INSERT INTO emendas_favorecidos (deputadoId, favorecido, cnpjCpf, naturezaJuridica, tipoFavorecido, uf, municipio, valorRecebido) VALUES (?,?,?,?,?,?,?,?)`
    );
    let matched = 0;
    const insertMany = db.transaction((rows: string[][]) => {
      for (const cols of rows) {
        const nome = normalizarNome((cols[iAutor] ?? "").replace(/"/g, ""));
        const depId = porNome.get(nome);
        if (!depId) continue;
        insert.run(
          depId,
          (cols[iFavorecido] ?? "").replace(/"/g, ""),
          (cols[iCnpj] ?? "").replace(/"/g, ""),
          (cols[iNatureza] ?? "").replace(/"/g, ""),
          (cols[iTipoFav] ?? "").replace(/"/g, ""),
          (cols[iUf] ?? "").replace(/"/g, ""),
          (cols[iMun] ?? "").replace(/"/g, ""),
          numeroBr(cols[iValor])
        );
        matched++;
      }
    });
    const batch: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]?.trim()) continue;
      batch.push(parseCsvLine(lines[i]));
    }
    insertMany(batch);
    console.log(`[emendas] ${matched} favorecidos casados com deputados de SP (de ${batch.length} linhas nacionais)`);
  }
}

if (import.meta.main) {
  await coletarEmendas();
}
