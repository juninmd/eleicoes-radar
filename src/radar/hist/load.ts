// A past election as the seat models see it: deputy candidacies with money, votes and the previous election's result,
// the seats on offer and who was elected. Reads data/hist/<year>.json (bun run radar:hist <year>).
import { existsSync, readFileSync } from "node:fs";
import type { TrainCand, Training } from "../mc/votes";
import type { HistElection } from "./aggregate";
import { buildAnt } from "./ant";
import { DEPUTIES, isElected } from "./parse";

export interface Loaded {
  year: number;
  training: Training; // without the previous election
  withAnt: Training | null; // with it, when data/hist/<year - 4>.json exists and carries person keys
  elected: Set<string>;
}

const read = (year: number): HistElection | null => (existsSync(`data/hist/${year}.json`) ? JSON.parse(readFileSync(`data/hist/${year}.json`, "utf8")) : null);

export function loadHist(year: number): Loaded {
  const h = read(year);
  if (!h) throw new Error(`data/hist/${year}.json não existe (bun run radar:hist ${year})`);
  const deps = h.cands.filter((c) => DEPUTIES.has(c.cargo) && c.uf);
  const cands: TrainCand[] = deps.map((c) => ({ sq: c.sq, grupo: `${c.uf}|${c.cargo}`, lista: c.lista, receita: c.receita, ocupacao: c.ocupacao, numero: c.numero, partido: c.partido, votos: c.votos }));
  const vagas = new Map(Object.entries(h.vagas).filter(([k]) => DEPUTIES.has(k.split("|")[1]!)));
  const legenda = new Map(Object.entries(h.legenda));
  const prev = read(year - 4);
  let withAnt: Training | null = null;
  if (prev?.cands.some((c) => c.pk)) {
    const ant = buildAnt(prev, deps);
    withAnt = { cands: cands.map((c) => ({ ...c, ant: ant.get(c.sq)! })), vagas, legenda };
  }
  return { year, training: { cands, vagas, legenda }, withAnt, elected: new Set(deps.filter((c) => isElected(c.sit)).map((c) => c.sq)) };
}
