// Candidatos a Presidente/Vice — extraídos do arquivo de CNPJ de campanha do
// TSE (formato largura-fixa, sem cabeçalho oficial documentado em CSV).
// Cargos de âmbito nacional (Presidente) não precisam de UF, então dá pra
// popular sem o registro oficial "consulta_cand" (esse seguimos bloqueados
// nele — ver fetch-tse-candidatos.ts). Governador fica pendente: este
// arquivo não carrega UF do candidato, só o CNPJ da conta de campanha.
import { existsSync } from "node:fs";
import { db } from "./db";

const CARGOS_NACIONAIS = ["VICE-PRESIDENTE", "PRESIDENTE"]; // ordem importa: testar VICE antes

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
  cnpjCampanha TEXT,
  PRIMARY KEY (numeroCandidato, cargo, uf)
);
`);
// cnpjCampanha pode não existir se a tabela já foi criada antes por fetch-tse-candidatos.ts
try {
  db.exec(`ALTER TABLE candidatos ADD COLUMN cnpjCampanha TEXT`);
} catch {
  /* coluna já existe */
}

export async function importarCandidatosPresidenteViaCnpj(txtPath = "data/cnpj_candidatos_2026.txt") {
  if (!existsSync(txtPath)) {
    console.warn(`[candidatos-cnpj] ${txtPath} não encontrado.`);
    return;
  }
  const buf = await Bun.file(txtPath).arrayBuffer();
  const text = new TextDecoder("latin1").decode(buf);
  const lines = text.split("\n");

  const insert = db.prepare(
    `INSERT OR REPLACE INTO candidatos
     (numeroCandidato, cargo, nomeUrna, nomeCompleto, partido, uf, situacao, cnpjCampanha)
     VALUES (?, ?, ?, ?, '', '', '', ?)`
  );

  let total = 0;
  for (const line of lines) {
    if (!line || line.length < 20) continue;
    const idxEleicao = line.indexOf("ELEICAO");
    if (idxEleicao < 14) continue;
    const cnpj = line.slice(0, 14);
    if (!/^\d{14}$/.test(cnpj)) continue;
    const resto = line.slice(idxEleicao);
    const m = resto.match(/^ELEICAO\s+\d{4}\s+(.+?)\s{2,}/);
    if (!m) continue;
    const blob = m[1].trim();

    let cargoEncontrado: string | null = null;
    let nome = blob;
    for (const cargo of CARGOS_NACIONAIS) {
      if (blob.endsWith(cargo)) {
        cargoEncontrado = cargo === "VICE-PRESIDENTE" ? "VICE-PRESIDENTE" : "PRESIDENTE";
        nome = blob.slice(0, blob.length - cargo.length).trim();
        break;
      }
    }
    if (!cargoEncontrado) continue; // não é candidatura de âmbito nacional

    insert.run(cnpj, cargoEncontrado, nome, nome, cnpj);
    total++;
  }
  console.log(`[candidatos-cnpj] ${total} candidatos a Presidente/Vice importados (via CNPJ de campanha)`);
}

if (import.meta.main) {
  await importarCandidatosPresidenteViaCnpj();
}
