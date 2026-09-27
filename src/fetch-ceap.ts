// Baixa o CSV bulk oficial da Cota para Exercício da Atividade Parlamentar (CEAP)
// nota a nota, todos os deputados, e filtra para os IDs que interessam (UF alvo).
// Fonte: camara.leg.br/cotas/Ano-{ANO}.csv.zip — mesmo dado usado no site de transparência
// da Câmara, mas em lote (evita paginar milhares de notas via API).
import { existsSync, mkdirSync } from "node:fs";
import { db } from "./db";

const ANOS = (process.env.CEAP_ANOS ?? "2024,2025,2026").split(",").map(Number);

function parseCsvLine(line: string): string[] {
  // formato: campos entre aspas, separados por ";"
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ";" && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function baixarEExtrair(ano: number): Promise<string> {
  const zipPath = `data/Ano-${ano}.zip`;
  const csvPath = `data/Ano-${ano}.csv`;
  if (existsSync(csvPath)) return csvPath;

  console.log(`[ceap] baixando Ano-${ano}.csv.zip...`);
  const res = await fetch(`https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`);
  if (!res.ok) throw new Error(`falha ao baixar CEAP ${ano}: ${res.status}`);
  await Bun.write(zipPath, await res.arrayBuffer());

  console.log(`[ceap] extraindo...`);
  mkdirSync("data", { recursive: true });
  // git-bash empurra um tar (libarchive sem suporte a zip) na frente do PATH;
  // força o tar nativo do Windows (bsdtar com suporte a zip).
  const tarBin =
    process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";
  const proc = Bun.spawn([tarBin, "-xf", zipPath, "-C", "data"]);
  await proc.exited;
  if (!existsSync(csvPath)) throw new Error(`extração não gerou ${csvPath}`);
  return csvPath;
}

export async function coletarCeap(deputadoIds: Set<number>) {
  const insert = db.prepare(
    `INSERT INTO despesas (deputadoId, ano, mes, fornecedor, cnpjCpf, subCota, dataEmissao, valorLiquido, numDocumento, urlDocumento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec("DELETE FROM despesas"); // recoleta simples por ano

  for (const ano of ANOS) {
    let csvPath: string;
    try {
      csvPath = await baixarEExtrair(ano);
    } catch (e) {
      console.warn(`[ceap] pulando ano ${ano}: ${(e as Error).message}`);
      continue;
    }

    const file = Bun.file(csvPath);
    const text = await file.text();
    const lines = text.split("\n");
    const header = parseCsvLine(lines[0]);
    const idx = (col: string) => header.indexOf(col);
    const iDep = idx("ideCadastro"); // chave = id da API v2 de deputados; nuDeputadoId é outro campo interno
    const iMes = idx("numMes");
    const iAno = idx("numAno");
    const iFornecedor = idx("txtFornecedor");
    const iCnpj = idx("txtCNPJCPF");
    const iSubCota = idx("txtDescricao");
    const iData = idx("datEmissao");
    const iValor = idx("vlrLiquido");
    const iNumDoc = idx("numDocumento") >= 0 ? idx("numDocumento") : idx("ideDocumento");
    const iUrl = idx("urlDocumento");

    let inserted = 0;
    const insertMany = db.transaction((rows: string[][]) => {
      for (const cols of rows) {
        const depId = Number(cols[iDep]);
        if (!deputadoIds.has(depId)) continue;
        insert.run(
          depId,
          Number(cols[iAno]) || ano,
          Number(cols[iMes]) || 0,
          cols[iFornecedor] ?? "",
          (cols[iCnpj] ?? "").trim(),
          cols[iSubCota] ?? "",
          cols[iData] ?? "",
          Number(cols[iValor]) || 0,
          cols[iNumDoc] ?? "",
          cols[iUrl] ?? ""
        );
        inserted++;
      }
    });

    const batch: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      batch.push(parseCsvLine(line));
    }
    insertMany(batch);
    console.log(`[ceap] ${ano}: ${inserted} notas salvas (de ${batch.length} linhas no arquivo)`);
  }
}
