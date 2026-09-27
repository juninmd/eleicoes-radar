import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("data", { recursive: true });

export const db = new Database("data/eleicoes.sqlite");
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS deputados (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  nomeCivil TEXT,
  partido TEXT,
  uf TEXT,
  urlFoto TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS despesas (
  deputadoId INTEGER,
  ano INTEGER,
  mes INTEGER,
  fornecedor TEXT,
  cnpjCpf TEXT,
  subCota TEXT,
  dataEmissao TEXT,
  valorLiquido REAL,
  numDocumento TEXT,
  urlDocumento TEXT
);
CREATE INDEX IF NOT EXISTS idx_despesas_dep ON despesas(deputadoId);
CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor ON despesas(cnpjCpf);

CREATE TABLE IF NOT EXISTS proposicoes (
  id INTEGER PRIMARY KEY,
  deputadoId INTEGER,
  siglaTipo TEXT,
  ano INTEGER,
  ementa TEXT,
  dataApresentacao TEXT,
  descricaoSituacao TEXT,
  aprovada INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prop_dep ON proposicoes(deputadoId);

CREATE TABLE IF NOT EXISTS discursos (
  deputadoId INTEGER,
  dataHoraInicio TEXT,
  sumario TEXT
);
CREATE INDEX IF NOT EXISTS idx_disc_dep ON discursos(deputadoId);
`);
