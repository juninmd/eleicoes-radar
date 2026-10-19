// Writes web/data/municipal/: for each 2026 race that went to a runoff (President and the governors), the first-round valid votes of
// the two finalists and of everyone else in each municipality, plus the model and the errors the backtest measured. The estimate
// itself is computed in the browser (web/apuracao-municipios.ts), so the reader can change the scenario without a new build.
// Run after `bun run radar:mun-hist 2026` and `bun run radar:mun-backtest`. Usage: bun run radar:municipal
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Erros, Finalista, MunArquivo, MunIndice } from "../../../web/apuracao-municipios";
import type { Params } from "../../../web/municipio-modelo";
import type { MunElection, MunRace } from "./sources";

const OUT = "web/data/municipal";
export const RUNOFF = /^2[ºo°]?\s*TURNO$/i; // the TSE's outcome text of a candidate who goes to the runoff

const slug = (s: string) => s.normalize("NFD").replace(/[^\w]+/g, "");
export const arquivoDe = (cargo: string, uf: string) => `${slug(cargo)}-${uf}.json`;

// null when the race had no runoff, or its finalists are not exactly two, or it has a single municipality (the Federal District).
export function arquivoDoPleito(race: MunRace, ano: number): MunArquivo | null {
  const fin = race.cands.map((c, i) => ({ c, i })).filter(({ c }) => RUNOFF.test(c.sit.trim()));
  const cods = Object.keys(race.mun);
  if (fin.length !== 2 || cods.length < 2) return null;
  const total = (i: number) => cods.reduce((s, k) => s + (race.mun[k]!.v1[i] ?? 0), 0);
  const [x, y] = total(fin[0]!.i) >= total(fin[1]!.i) ? [fin[0]!, fin[1]!] : [fin[1]!, fin[0]!];
  const id = ({ c }: { c: MunRace["cands"][number] }): Finalista => ({ n: c.n, nome: c.nome, partido: c.partido, sq: c.sq });
  const cidades: MunArquivo["cidades"] = [];
  for (const k of cods) {
    const m = race.mun[k]!;
    const a = m.v1[x.i] ?? 0, b = m.v1[y.i] ?? 0;
    const o = m.v1.reduce((s, v) => s + (v ?? 0), 0) - a - b;
    if (a + b + o > 0) cidades.push([k, m.nome, m.uf, a, b, o]);
  }
  return { cargo: race.cargo, uf: race.uf, ano, a: id(x), b: id(y), cidades };
}

if (import.meta.main) {
  for (const f of ["data/hist/mun-2026.json", "data/municipal-modelo.json"]) if (!existsSync(f)) throw new Error(`falta ${f} (bun run radar:mun-hist 2026 / bun run radar:mun-backtest)`);
  const e: MunElection = JSON.parse(readFileSync("data/hist/mun-2026.json", "utf8"));
  const modelo: Record<string, { params: Params; erros: Erros }> & { geradoEm: string } = JSON.parse(readFileSync("data/municipal-modelo.json", "utf8"));
  mkdirSync(OUT, { recursive: true });
  const disputas: MunIndice["disputas"] = [];
  for (const race of e.races) {
    const arq = arquivoDoPleito(race, e.year);
    if (!arq) continue;
    const arquivo = arquivoDe(arq.cargo, arq.uf);
    writeFileSync(`${OUT}/${arquivo}`, JSON.stringify(arq));
    disputas.push({ cargo: arq.cargo, uf: arq.uf, arquivo, a: arq.a, b: arq.b });
    console.log(`[municipal] ${arq.cargo} ${arq.uf}: ${arq.a.nome} x ${arq.b.nome}, ${arq.cidades.length} municípios`);
  }
  const indice: MunIndice = {
    geradoEm: new Date().toISOString(), modeloEm: modelo.geradoEm,
    params: { Presidente: modelo.Presidente!.params, Governador: modelo.Governador!.params },
    erros: { Presidente: modelo.Presidente!.erros, Governador: modelo.Governador!.erros },
    disputas,
  };
  writeFileSync(`${OUT}/index.json`, JSON.stringify(indice));
  console.log(`[municipal] ${disputas.length} disputas em ${OUT}/`);
}
