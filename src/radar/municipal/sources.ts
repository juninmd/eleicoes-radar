// One streaming pass per TSE "votacao_candidato_munzona" zip: valid votes of each President and Governor candidate in each
// municipality, both rounds. The President comes from the _BR file (every municipality, small); each Governor from the file of
// his state. Everything else in those 3-4 GB zips (deputies, senators) is skipped.
import { forEachZipRow } from "../zip-csv";
import type { Row } from "../csv";

export const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
export const YEARS_MUN = [2002, 2006, 2010, 2014, 2018, 2022, 2026] as const;
export type Cargo = "Presidente" | "Governador";

// `sit`: the TSE's own outcome text of the candidate ("2º TURNO", "ELEITO", "NÃO ELEITO"...), which is how the finalists of 2026 are known.
export interface MunCand { n: string; nome: string; partido: string; sq: string; sit: string }
// `v1` / `v2`: valid votes per candidate, aligned with `cands`; `v2` is absent where there was no runoff.
export interface MunRow { nome: string; uf: string; v1: number[]; v2?: number[] }
export interface MunRace { cargo: Cargo; uf: string; cands: MunCand[]; mun: Record<string, MunRow> }
export interface MunElection { year: number; races: MunRace[] }

// TSE municipality codes are "01120" in the old files and "1120" in the new ones: the number is the key.
export const munKey = (cd: string | undefined): string => String(Number(cd ?? "") || (cd ?? "").trim());

const cargoDe = (ds: string | undefined): Cargo | null => {
  const s = (ds ?? "").trim().toUpperCase();
  return s === "PRESIDENTE" ? "Presidente" : s === "GOVERNADOR" ? "Governador" : null;
};
const votes = (r: Row): number => {
  const n = Number(r.QT_VOTOS_NOMINAIS_VALIDOS ?? r.QT_VOTOS_NOMINAIS ?? "0");
  return Number.isFinite(n) ? n : 0;
};

// Accumulates rows; the candidate order is the order they are first seen, `n` (ballot number) is the identity across rounds.
export function createCollector() {
  const races = new Map<string, MunRace & { idx: Map<string, number> }>();
  return {
    add(r: Row) {
      const cargo = cargoDe(r.DS_CARGO);
      const turno = r.NR_TURNO;
      if (!cargo || (turno !== "1" && turno !== "2") || !r.NR_CANDIDATO) return;
      const uf = cargo === "Presidente" ? "BR" : r.SG_UF ?? "";
      const key = `${cargo}|${uf}`;
      let race = races.get(key);
      if (!race) races.set(key, (race = { cargo, uf, cands: [], mun: {}, idx: new Map() }));
      let i = race.idx.get(r.NR_CANDIDATO);
      if (i === undefined) {
        i = race.cands.length;
        race.idx.set(r.NR_CANDIDATO, i);
        race.cands.push({ n: r.NR_CANDIDATO, nome: r.NM_URNA_CANDIDATO || r.NM_CANDIDATO || "", partido: r.SG_PARTIDO ?? "", sq: r.SQ_CANDIDATO ?? "", sit: r.DS_SIT_TOT_TURNO ?? "" });
      }
      const cod = munKey(r.CD_MUNICIPIO);
      const m = (race.mun[cod] ??= { nome: r.NM_MUNICIPIO ?? "", uf: r.SG_UF ?? "", v1: [] });
      const bucket = turno === "1" ? m.v1 : (m.v2 ??= []);
      bucket[i] = (bucket[i] ?? 0) + votes(r);
    },
    done(year: number): MunElection {
      const out: MunRace[] = [];
      for (const { idx: _idx, ...race } of races.values()) {
        const n = race.cands.length;
        for (const m of Object.values(race.mun)) {
          m.v1 = Array.from({ length: n }, (_, i) => m.v1[i] ?? 0);
          if (m.v2) m.v2 = Array.from({ length: n }, (_, i) => m.v2![i] ?? 0);
        }
        out.push(race);
      }
      return { year, races: out.sort((a, b) => a.cargo.localeCompare(b.cargo) || a.uf.localeCompare(b.uf)) };
    },
  };
}

export async function readElection(year: number, dir = "data/tse"): Promise<MunElection> {
  const zip = `${dir}/votacao_candidato_munzona_${year}.zip`;
  const c = createCollector();
  await forEachZipRow(zip, `votacao_candidato_munzona_${year}_BR.csv`, (r) => { if (cargoDe(r.DS_CARGO) === "Presidente") c.add(r); });
  for (const uf of UFS) await forEachZipRow(zip, `votacao_candidato_munzona_${year}_${uf}.csv`, (r) => { if (cargoDe(r.DS_CARGO) === "Governador") c.add(r); });
  return c.done(year);
}
