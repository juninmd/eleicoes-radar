// One streaming pass per TSE file for a past general election: cadastro, accounts up to the cutoff, votes, legend
// votes and seats. Each pass keeps only what the Monte Carlo needs, because the vote files are 3-4 GB of text.
import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { decodeLatin1, parseCsv, parseNumber } from "../csv";
import { forEachZipRow } from "../zip-csv";
import { cargoKey, DEPUTIES, isoDate, legendVotes, listKey, MAJORITARIAN, nominalVotes, personKey } from "./parse";

export interface HistCand {
  sq: string;
  uf: string;
  cargo: string;
  numero: string;
  partido: string;
  lista: string; // coalition / federation / isolated-party id, unique per state
  ocupacao: string;
  nome: string;
  pk: string; // person key across elections: civil name + birth date (CPF is masked in most older files)
  receita: number; // money raised up to seven days before the vote
  votos: number; // valid nominal votes, 1st round
  votos2: number; // 2nd round (governor, president), else 0
  sit: string; // DS_SIT_TOT_TURNO
}

interface YearCfg { cutoff: string; contas: { zip: string; file: string; byNumber: boolean } }

// Cutoff = election day minus seven days, the same rule the 2026 numbers use.
export const YEARS: Record<number, YearCfg> = {
  2014: { cutoff: "2014-09-28", contas: { zip: "prestacao_final_2014.zip", file: "receitas_candidatos_2014_brasil.txt", byNumber: true } },
  2018: { cutoff: "2018-09-30", contas: { zip: "prestacao_de_contas_eleitorais_candidatos_2018.zip", file: "receitas_candidatos_2018_BRASIL.csv", byNumber: false } },
  2022: { cutoff: "2022-09-25", contas: { zip: "prestacao_de_contas_eleitorais_candidatos_2022.zip", file: "receitas_candidatos_2022_BRASIL.csv", byNumber: false } },
};

const TSE = "data/tse";
const wanted = (cargo: string) => DEPUTIES.has(cargo) || MAJORITARIAN.has(cargo);

export async function readCands(year: number): Promise<Map<string, HistCand>> {
  const out = new Map<string, HistCand>();
  await forEachZipRow(`${TSE}/consulta_cand_${year}.zip`, `consulta_cand_${year}_BRASIL.csv`, (r) => {
    const cargo = cargoKey(r.DS_CARGO);
    if (!wanted(cargo) || !r.SQ_CANDIDATO) return;
    out.set(r.SQ_CANDIDATO, {
      sq: r.SQ_CANDIDATO, uf: r.SG_UF ?? "", cargo, numero: r.NR_CANDIDATO ?? "", partido: r.SG_PARTIDO ?? "", lista: listKey(r),
      ocupacao: r.DS_OCUPACAO ?? "", nome: r.NM_URNA_CANDIDATO || r.NM_CANDIDATO || "", pk: personKey(r), receita: 0, votos: 0, votos2: 0, sit: r.DS_SIT_TOT_TURNO ?? "",
    });
  });
  return out;
}

// 2014 accounts carry their own candidate sequence, so they are matched by state, cargo and ballot number instead.
export async function addMoney(year: number, cands: Map<string, HistCand>): Promise<number> {
  const { cutoff, contas } = YEARS[year]!;
  const byNumber = new Map<string, HistCand>();
  if (contas.byNumber) for (const c of cands.values()) byNumber.set(`${c.uf}|${c.cargo}|${c.numero}`, c);
  let matched = 0;
  await forEachZipRow(`${TSE}/${contas.zip}`, contas.file, (r) => {
    const c = contas.byNumber ? byNumber.get(`${r.UF}|${cargoKey(r.Cargo)}|${r["Numero candidato"]}`) : cands.get(r.SQ_CANDIDATO ?? "");
    if (!c) return;
    const date = isoDate(r.DT_RECEITA ?? r["Data da receita"] ?? "");
    if (date > cutoff) return;
    c.receita += parseNumber(r.VR_RECEITA ?? r["Valor receita"]);
    matched++;
  });
  return matched;
}

export async function addVotes(year: number, cands: Map<string, HistCand>): Promise<number> {
  return forEachZipRow(`${TSE}/votacao_candidato_munzona_${year}.zip`, `votacao_candidato_munzona_${year}_BRASIL.csv`, (r) => {
    const c = cands.get(r.SQ_CANDIDATO ?? "");
    if (!c) return;
    if (r.NR_TURNO === "1") c.votos += nominalVotes(r);
    else if (r.NR_TURNO === "2") c.votos2 += nominalVotes(r);
  });
}

// Legend votes per list: needed to rebuild the quotient exactly.
export async function readLegenda(year: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await forEachZipRow(`${TSE}/votacao_partido_munzona_${year}.zip`, `votacao_partido_munzona_${year}_BRASIL.csv`, (r) => {
    const cargo = cargoKey(r.DS_CARGO);
    if (r.NR_TURNO !== "1" || !DEPUTIES.has(cargo)) return;
    const k = `${r.SG_UF}|${cargo}|${listKey(r)}`;
    out[k] = (out[k] ?? 0) + legendVotes(r);
  });
  return out;
}

export function readVagas(year: number): Record<string, number> {
  const zip = `${TSE}/consulta_vagas_${year}.zip`;
  const out: Record<string, number> = {};
  if (!existsSync(zip)) return out;
  for (const [name, data] of Object.entries(unzipSync(readFileSync(zip), { filter: (f) => f.name.endsWith(".csv") }))) {
    if (name.endsWith("_BR.csv")) continue; // presidency only; the per-state or BRASIL files carry the rest
    for (const r of parseCsv(decodeLatin1(data))) {
      if (r.SG_UF && r.SG_UF !== "BR") out[`${r.SG_UF}|${cargoKey(r.DS_CARGO)}`] = Number(r.QT_VAGA) || 0;
    }
  }
  return out;
}
