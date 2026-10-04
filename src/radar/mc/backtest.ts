// Leave-one-election-out backtest of the deputy models on 2014, 2018 and 2022: train on the other elections, predict the
// held-out one with the money known seven days before the vote, score against who really won.
// Two feature sets: "base" (money, list, occupation, number) on all three elections, and "+ antes" (adds the person's
// and the party's result in the previous election), which only exists where that earlier file is on disk.
// Usage: bun run radar:mc-backtest [draws]   (needs data/hist/<year>.json from radar:hist)
import { existsSync } from "node:fs";
import { type Loaded, loadHist } from "../hist/load";
import { features, fitIsotonic, fitLogistic, predictGroups } from "../model/seats";
import { RULES } from "./allocate";
import { line, listSeatsFrom, type Score, score } from "./metrics";
import { simulate } from "./simulate";
import { fitVoteModel, type Training } from "./votes";

// The production logistic, refit on the training elections; isotonic knots come from its in-sample predictions.
function logistic(train: { t: Training; elected: Set<string> }[]) {
  const X: number[][] = [];
  const y: number[] = [];
  for (const { t, elected } of train) {
    const F = features(t.cands, t.vagas);
    for (const c of t.cands) {
      X.push(F.get(c.sq)!);
      y.push(elected.has(c.sq) ? 1 : 0);
    }
  }
  const w = fitLogistic(X, y);
  const raw: number[] = [];
  const lab: number[] = [];
  for (const { t, elected } of train) {
    const p = predictGroups(t.cands, t.vagas, w);
    for (const c of t.cands) {
      raw.push(p.get(c.sq)!);
      lab.push(elected.has(c.sq) ? 1 : 0);
    }
  }
  return { w, knots: fitIsotonic(raw, lab) };
}

export interface Row { year: number; set: string; scores: Record<string, Score> }

export function evaluateSet(set: string, held: Loaded, train: Loaded[], pick: (l: Loaded) => Training, draws: number): Row {
  const t = pick(held);
  const lg = logistic(train.map((l) => ({ t: pick(l), elected: l.elected })));
  const pLog = predictGroups(t.cands, t.vagas, lg.w);
  const pIso = predictGroups(t.cands, t.vagas, lg.w, lg.knots);
  const model = fitVoteModel(train.map((l) => pick(l)));
  const rules = RULES[String(held.year)]!;
  const mc = (o: { partyShock?: boolean; listShock?: boolean }, m = model) => {
    const r = simulate(t.cands, t.vagas, m, { draws, seed: `${held.year}`, rules, ...o });
    return { r, s: score(t.cands, t.vagas, held.elected, r.p, r.listSeats) };
  };
  const model2 = fitVoteModel(train.map((l) => pick(l)), lg.w);
  const twoStage = () => mc({ partyShock: false }, model2);
  const solo = mc({ partyShock: false, listShock: false });
  const lista = mc({ partyShock: false });
  const two = twoStage();
  const full = mc({ partyShock: true });
  // Average of the two families: a cheap ensemble, to see whether they err in different places.
  const blend = new Map(t.cands.map((c) => [c.sq, (pIso.get(c.sq)! + lista.r.p.get(c.sq)!) / 2]));
  return {
    year: held.year,
    set,
    scores: {
      "logística (grupo)": score(t.cands, t.vagas, held.elected, pLog, listSeatsFrom(t.cands, pLog)),
      "logística + isotônica": score(t.cands, t.vagas, held.elected, pIso, listSeatsFrom(t.cands, pIso)),
      "MC só candidato": solo.s,
      "MC + lista": lista.s,
      "MC + lista + partido": full.s,
      "MC 2 etapas (z logística)": two.s,
      "média logística + MC lista": score(t.cands, t.vagas, held.elected, blend, listSeatsFrom(t.cands, blend)),
    },
  };
}

if (import.meta.main) {
  const draws = Number(process.argv[2] ?? 1000);
  const loaded = [2014, 2018, 2022].filter((y) => existsSync(`data/hist/${y}.json`)).map(loadHist);
  const rows: Row[] = [];
  for (const held of loaded) {
    rows.push(evaluateSet("base", held, loaded.filter((l) => l !== held), (l) => l.training, draws));
    if (held.withAnt) rows.push(evaluateSet("+ antes", held, loaded.filter((l) => l !== held && l.withAnt), (l) => l.withAnt ?? l.training, draws));
  }
  for (const r of rows) {
    console.log(`\nEleição ${r.year}, atributos ${r.set} (${draws} sorteios)`);
    for (const [name, s] of Object.entries(r.scores)) console.log(line(name, s));
  }
}
