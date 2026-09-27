// Fits the deputy seat model on 2022 (money raised up to seven days before the vote
// vs who was elected) with a 2-fold backtest by UF, and writes data/modelo-deputados.json.
// Usage: bun run radar:model
import { writeFileSync } from "node:fs";
import { parseNumber } from "../csv";
import { forEachZipRow } from "../zip-csv";
import { evaluate, features, FEATURES, fitLogistic, fitIsotonic, predictGroups, recalibrate, type SeatCand } from "./seats";

const CAND = "data/tse/consulta_cand_2022.zip";
const CONTAS = "data/tse/prestacao_de_contas_eleitorais_candidatos_2022.zip";
// 2022 first round was 02/10; 27/09/2026 is seven days before 04/10/2026.
export const CORTE_2022 = "2022-09-25";

const isoFromBr = (d: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(d) ? `${d.slice(6)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : "");

const cands = new Map<string, SeatCand>();
const elected = new Set<string>();
await forEachZipRow(CAND, "consulta_cand_2022_BRASIL.csv", (r) => {
  if (!/^DEPUTADO/i.test(r.DS_CARGO ?? "") || !r.SQ_CANDIDATO) return;
  const fed = r.SG_FEDERACAO && !r.SG_FEDERACAO.startsWith("#") ? r.SG_FEDERACAO : "";
  cands.set(r.SQ_CANDIDATO, { sq: r.SQ_CANDIDATO, grupo: `${r.SG_UF}|${r.DS_CARGO!.toUpperCase()}`, lista: fed || r.SG_PARTIDO!, receita: 0, ocupacao: r.DS_OCUPACAO ?? "" });
  if (/^ELEITO/.test(r.DS_SIT_TOT_TURNO ?? "")) elected.add(r.SQ_CANDIDATO);
});

const rows = await forEachZipRow(CONTAS, "receitas_candidatos_2022_BRASIL.csv", (r) => {
  const c = cands.get(r.SQ_CANDIDATO ?? "");
  if (c && isoFromBr(r.DT_RECEITA ?? "") <= CORTE_2022) c.receita += parseNumber(r.VR_RECEITA);
});

const all = [...cands.values()];
const vagas = new Map<string, number>();
for (const sq of elected) {
  const g = cands.get(sq)!.grupo;
  vagas.set(g, (vagas.get(g) ?? 0) + 1);
}
const ufs = [...new Set(all.map((c) => c.grupo.split("|")[0]!))].sort();
const fold = (c: SeatCand) => ufs.indexOf(c.grupo.split("|")[0]!) % 2;

const fit = (train: SeatCand[]) => {
  const X = features(train, vagas);
  return fitLogistic(train.map((c) => X.get(c.sq)!), train.map((c) => (elected.has(c.sq) ? 1 : 0)));
};

// Out-of-fold predictions: every UF is scored by a model that never saw it.
const oof = new Map<string, number>();
for (const k of [0, 1]) {
  const w = fit(all.filter((c) => fold(c) !== k));
  const test = all.filter((c) => fold(c) === k);
  for (const [sq, p] of predictGroups(test, vagas, w)) oof.set(sq, p);
}
// Calibration is itself cross-fitted: each fold's knots come from the other fold.
const knotsOf = (k: number) => {
  const other = all.filter((c) => fold(c) !== k);
  return fitIsotonic(other.map((c) => oof.get(c.sq)!), other.map((c) => (elected.has(c.sq) ? 1 : 0)));
};
const folds = [knotsOf(0), knotsOf(1)];
const backtest = evaluate(all, vagas, elected, new Map(all.map((c) => [c.sq, recalibrate(oof.get(c.sq)!, folds[fold(c)]!)])));
const knots = fitIsotonic(all.map((c) => oof.get(c.sq)!), all.map((c) => (elected.has(c.sq) ? 1 : 0)));
const coef = fit(all);

writeFileSync(
  "data/modelo-deputados.json",
  JSON.stringify({ treino: "Eleições 2022", corte: CORTE_2022, features: FEATURES, coef, knots, backtest }, null, 1),
);
console.log(`[modelo] ${rows} receitas, ${all.length} candidaturas, ${elected.size} eleitos`);
console.log(`[modelo] backtest: acerto ${(backtest.acerto * 100).toFixed(1)}% vs ${(backtest.acertoBaseline * 100).toFixed(1)}% só por dinheiro · Brier ${backtest.brier.toFixed(4)}`);
for (const b of backtest.calibracao) console.log(`  ${b.faixa}: previsto ${(b.previsto * 100).toFixed(1)}% · observado ${(b.observado * 100).toFixed(1)}% (n=${b.n})`);
console.log(`[modelo] coef ${coef.map((c) => c.toFixed(3)).join(" ")}`);
