// Fits the deputy seat model on the 2018 and 2022 elections (money raised up to seven days before the vote, the
// previous election's result, vs who was elected) with a 2-fold backtest by UF, and writes data/modelo-deputados.json.
// Needs data/hist/{2014,2018,2022}.json (bun run radar:hist <year>): 2014 and 2018 are the "previous election" of each.
// Usage: bun run radar:model
import { writeFileSync } from "node:fs";
import { type Loaded, loadHist } from "../hist/load";
import { evaluate, features, FEATURES, fitIsotonic, fitLogistic, predictGroups, recalibrate, type SeatCand } from "./seats";

export const TRAIN_YEARS = [2018, 2022];
// 2022 first round was 02/10/2022; the cutoff everywhere is election day minus seven days.
export const CORTE_2022 = "2022-09-25";

const years = TRAIN_YEARS.map((y) => {
  const l: Loaded = loadHist(y);
  if (!l.withAnt) throw new Error(`data/hist/${y - 4}.json (com chave de pessoa) é necessário: bun run radar:hist ${y - 4}`);
  return { year: y, cands: l.withAnt.cands as SeatCand[], vagas: l.withAnt.vagas, elected: l.elected };
});
const ufOf = (c: SeatCand) => c.grupo.split("|")[0]!;
const ufs = [...new Set(years.flatMap((y) => y.cands.map(ufOf)))].sort();
const fold = (c: SeatCand) => ufs.indexOf(ufOf(c)) % 2;

// Features are built per election: the same state and cargo in two years must not be pooled into one group.
const rowsOf = (keep: (c: SeatCand) => boolean) => {
  const X: number[][] = [];
  const y: number[] = [];
  for (const e of years) {
    const sub = e.cands.filter(keep);
    const F = features(sub, e.vagas);
    for (const c of sub) {
      X.push(F.get(c.sq)!);
      y.push(e.elected.has(c.sq) ? 1 : 0);
    }
  }
  return { X, y };
};
const fit = (keep: (c: SeatCand) => boolean) => {
  const { X, y } = rowsOf(keep);
  return fitLogistic(X, y);
};

// Out-of-fold predictions: every UF is scored by a model that never saw it.
const oof = years.map(() => new Map<string, number>());
for (const k of [0, 1]) {
  const w = fit((c) => fold(c) !== k);
  years.forEach((e, i) => {
    for (const [sq, p] of predictGroups(e.cands.filter((c) => fold(c) === k), e.vagas, w)) oof[i]!.set(sq, p);
  });
}
const label = (i: number, c: SeatCand) => (years[i]!.elected.has(c.sq) ? 1 : 0);
// Calibration is itself cross-fitted: each fold's knots come from the other fold, pooled over both elections.
const knotsFor = (k: number) => {
  const p: number[] = [];
  const y: number[] = [];
  years.forEach((e, i) => {
    for (const c of e.cands) if (fold(c) !== k) { p.push(oof[i]!.get(c.sq)!); y.push(label(i, c)); }
  });
  return fitIsotonic(p, y);
};
const folds = [knotsFor(0), knotsFor(1)];
const backtestOf = (i: number) => {
  const e = years[i]!;
  return evaluate(e.cands, e.vagas, e.elected, new Map(e.cands.map((c) => [c.sq, recalibrate(oof[i]!.get(c.sq)!, folds[fold(c)]!)])));
};
const backtests = years.map((_, i) => backtestOf(i));
const backtest = backtests.at(-1)!; // reported to the reader: the latest election, scored out of fold
const knots = (() => {
  const p: number[] = [];
  const y: number[] = [];
  years.forEach((e, i) => e.cands.forEach((c) => { p.push(oof[i]!.get(c.sq)!); y.push(label(i, c)); }));
  return fitIsotonic(p, y);
})();
const coef = fit(() => true);

writeFileSync(
  "data/modelo-deputados.json",
  JSON.stringify({ treino: TRAIN_YEARS.join(" e "), anterior: 2022, corte: CORTE_2022, features: FEATURES, coef, knots, backtest }, null, 1),
);
for (const [i, b] of backtests.entries()) {
  console.log(`[modelo] ${years[i]!.year}: ${b.candidatos} candidaturas, ${b.vagas} vagas · acerto ${(b.acerto * 100).toFixed(1)}% vs ${(b.acertoBaseline * 100).toFixed(1)}% só por dinheiro · Brier ${b.brier.toFixed(4)}`);
}
for (const b of backtest.calibracao) console.log(`  ${b.faixa}: previsto ${(b.previsto * 100).toFixed(1)}% · observado ${(b.observado * 100).toFixed(1)}% (n=${b.n})`);
console.log(`[modelo] coef ${coef.map((c) => c.toFixed(3)).join(" ")}`);
