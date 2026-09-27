// TSE candidate registry (consulta_cand_2026): every registered candidacy, with ballot
// name and personal profile. CPF and título eleitoral are read only as join keys and
// never leave this process.
import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { decodeLatin1, parseCsv, type Row } from "./csv";
import { onlyDigits } from "./stats";

export interface Registry {
  sq: string;
  nome: string;
  nomeUrna: string;
  numero: string;
  cargo: string;
  uf: string;
  partido: string;
  federacao: string;
  genero: string;
  corRaca: string;
  nascimento: string | null; // ISO
  ufNascimento: string;
  ocupacao: string;
  instrucao: string;
  cpf: string; // join key only
}

const NULLS = new Set(["#NULO", "#NE", "#NULO#", "NÃO DIVULGÁVEL", ""]);
const clean = (s: string | undefined) => (s && !NULLS.has(s.trim()) ? s.trim() : "");
// "DEPUTADO FEDERAL" -> "Deputado Federal", matching the finance files' labels.
const cargoLabel = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const isoDate = (s: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : null);

export function parseRegistry(rows: Iterable<Row>): Map<string, Registry> {
  const out = new Map<string, Registry>();
  for (const r of rows) {
    const cargo = cargoLabel(clean(r.DS_CARGO));
    if (!r.SQ_CANDIDATO || /^vice|suplente/i.test(cargo)) continue;
    out.set(r.SQ_CANDIDATO, {
      sq: r.SQ_CANDIDATO,
      nome: clean(r.NM_CANDIDATO),
      nomeUrna: clean(r.NM_URNA_CANDIDATO),
      numero: clean(r.NR_CANDIDATO),
      cargo,
      uf: clean(r.SG_UF),
      partido: clean(r.SG_PARTIDO),
      federacao: clean(r.NM_FEDERACAO),
      genero: clean(r.DS_GENERO),
      corRaca: clean(r.DS_COR_RACA),
      nascimento: isoDate(clean(r.DT_NASCIMENTO)),
      ufNascimento: clean(r.SG_UF_NASCIMENTO),
      ocupacao: clean(r.DS_OCUPACAO),
      instrucao: clean(r.DS_GRAU_INSTRUCAO),
      cpf: onlyDigits(r.NR_CPF_CANDIDATO).length === 11 ? onlyDigits(r.NR_CPF_CANDIDATO) : "",
    });
  }
  return out;
}

export function loadRegistry(zipPath = "data/tse/consulta_cand_2026.zip"): Map<string, Registry> {
  if (!existsSync(zipPath)) {
    console.warn(`[tse] ${zipPath} ausente: só candidaturas com prestação de contas aparecem`);
    return new Map();
  }
  const files = unzipSync(readFileSync(zipPath), { filter: (f) => f.name === "consulta_cand_2026_BRASIL.csv" });
  const data = Object.values(files)[0];
  return data ? parseRegistry(parseCsv(decodeLatin1(data))) : new Map();
}
