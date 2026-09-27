// Candidatos a Presidente e Governador (eleição 2026).
//
// BLOQUEIO REAL: dadosabertos.tse.jus.br e cdn.tse.jus.br devolvem 403 pra
// este ambiente (WAF/anti-bot do TSE, provavelmente por IP de datacenter).
// Não dá pra baixar automaticamente daqui. Solução: baixe manualmente no seu
// navegador e salve em data/consulta_cand_2026.zip — o parser abaixo lê o
// formato oficial do TSE sem alteração.
//
// Onde baixar (funciona no seu navegador normal):
//   https://dadosabertos.tse.jus.br/dataset/candidatos-2026
//   -> arquivo "consulta_cand_2026.zip" (BRASIL, todos os cargos)
//
// Dado é registro público de candidatura (Lei 9.504/97, art. 39-A e ss.) —
// não é dado pessoal sensível, é exigência de transparência eleitoral.
import { existsSync } from "node:fs";
import { db } from "./db";

const CARGOS_ALVO = new Set(["PRESIDENTE", "GOVERNADOR"]);

db.exec(`
CREATE TABLE IF NOT EXISTS candidatos (
  numeroCandidato TEXT,
  cargo TEXT,
  nomeUrna TEXT,
  nomeCompleto TEXT,
  partido TEXT,
  uf TEXT,
  situacao TEXT,
  ocupacao TEXT,
  grauInstrucao TEXT,
  genero TEXT,
  corRaca TEXT,
  valorMaxCampanha REAL,
  PRIMARY KEY (numeroCandidato, cargo, uf)
);
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

export async function importarCandidatos(csvPath = "data/consulta_cand_2026.csv") {
  if (!existsSync(csvPath)) {
    console.warn(
      `[candidatos] ${csvPath} não encontrado — baixe manualmente (ver comentário no topo do arquivo) e rode de novo.`
    );
    return;
  }

  // arquivos do TSE costumam vir em latin1
  const buf = await Bun.file(csvPath).arrayBuffer();
  const text = new TextDecoder("latin1").decode(buf);
  const lines = text.split("\n");
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/"/g, ""));
  const idx = (col: string) => header.indexOf(col);

  const iCargo = idx("DS_CARGO");
  const iNum = idx("NR_CANDIDATO");
  const iUrna = idx("NM_URNA_CANDIDATO");
  const iNome = idx("NM_CANDIDATO");
  const iPartido = idx("SG_PARTIDO");
  const iUf = idx("SG_UF");
  const iSituacao = idx("DS_SIT_TOT_TURNO");
  const iOcupacao = idx("DS_OCUPACAO");
  const iInstrucao = idx("DS_GRAU_INSTRUCAO");
  const iGenero = idx("DS_GENERO");
  const iCorRaca = idx("DS_COR_RACA");
  const iValorMax = idx("VR_DESPESA_MAX_CAMPANHA");

  const insert = db.prepare(
    `INSERT OR REPLACE INTO candidatos
     (numeroCandidato, cargo, nomeUrna, nomeCompleto, partido, uf, situacao, ocupacao, grauInstrucao, genero, corRaca, valorMaxCampanha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const cols = parseCsvLine(line).map((c) => c.replace(/"/g, ""));
    const cargo = (cols[iCargo] ?? "").toUpperCase();
    if (!CARGOS_ALVO.has(cargo)) continue;

    insert.run(
      cols[iNum] ?? "",
      cargo,
      cols[iUrna] ?? "",
      cols[iNome] ?? "",
      cols[iPartido] ?? "",
      cols[iUf] ?? "",
      cols[iSituacao] ?? "",
      cols[iOcupacao] ?? "",
      cols[iInstrucao] ?? "",
      cols[iGenero] ?? "",
      cols[iCorRaca] ?? "",
      Number((cols[iValorMax] ?? "0").replace(",", ".")) || 0
    );
    total++;
  }
  console.log(`[candidatos] ${total} candidatos a Presidente/Governador importados`);
}

if (import.meta.main) {
  await importarCandidatos();
}
