import { describe, expect, test } from "bun:test";
import { RULES } from "./allocate";
import { score } from "./metrics";
import { simulate } from "./simulate";
import { fitVoteModel, type TrainCand, type Training } from "./votes";

const GRUPO = "SP|DEPUTADO FEDERAL";
const PARTIES = ["11", "22", "33", "44"];
// 4 lists x 6 candidates: money and votes fall down each list, the lists differ in strength, and the votes carry a
// fixed wobble (a perfectly tidy fixture would fit with zero noise and every draw would be the same).
const cands: TrainCand[] = PARTIES.flatMap((p, li) => Array.from({ length: 6 }, (_, i) => ({
  sq: `${p}-${i}`, grupo: GRUPO, lista: p, receita: ((4 - li) * 100_000) / (i + 1), ocupacao: "", numero: `${p}${10 + i}`, partido: p,
  votos: Math.round((((4 - li) * 90_000) / (i + 1)) * (1 + 0.6 * Math.sin(li * 5 + i * 2.3))),
})));
const nominal = (p: string) => cands.filter((c) => c.lista === p).reduce((a, c) => a + c.votos, 0);
const training: Training = {
  cands, vagas: new Map([[GRUPO, 5]]),
  legenda: new Map(PARTIES.map((p) => [`${GRUPO}|${p}`, nominal(p) * 0.1])), // every list gets the same legend ratio
};
const model = fitVoteModel([training]);
const rules = RULES["2018"]!;
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, v) => a + v, 0);

describe("fitVoteModel", () => {
  test("fits finite coefficients and no ghosts when everybody has votes", () => {
    expect(model.coef.every(Number.isFinite)).toBe(true);
    expect(model.ghost.every((g) => g === 0)).toBe(true);
    expect(model.legendRatios.every((r) => Math.abs(r - 0.1) < 1e-9)).toBe(true);
  });

  test("nothing to fit is an explicit error, not an index crash", () => {
    expect(() => fitVoteModel([])).toThrow("nenhum candidato com votos");
    expect(() => fitVoteModel([{ ...training, cands: cands.map((c) => ({ ...c, votos: 0 })) }])).toThrow("nenhum candidato com votos");
  });
});

describe("simulate", () => {
  const run = (seed: string, extra = {}) => simulate(cands, training.vagas, model, { draws: 200, seed, rules, ...extra });

  test("every draw fills the seats: chances and expected list seats both add up to them", () => {
    const r = run("a", { partyShock: true });
    expect(sum(r.p)).toBeCloseTo(5, 6);
    expect(sum(r.listSeats)).toBeCloseTo(5, 6);
    for (const p of r.p.values()) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1); }
  });

  test("the strongest candidate of the strongest list beats the weakest of the weakest", () => {
    const r = run("a");
    expect(r.p.get("11-0")!).toBeGreaterThan(r.p.get("44-5")!);
  });

  test("same seed, same chances; another seed moves them", () => {
    expect(run("a").p).toEqual(run("a").p);
    expect(run("b").p).not.toEqual(run("a").p);
  });

  test("with no noise the draw is deterministic: every chance is 0 or 1, whatever the seed", () => {
    const quiet = (seed: string) => run(seed, { noise: 0, listShock: false, partyShock: false });
    expect(quiet("a").p).toEqual(quiet("z").p);
    for (const p of quiet("a").p.values()) expect([0, 1]).toContain(p);
  });
});

describe("score", () => {
  test("empty input gives zeros, not NaN", () => {
    const s = score([], new Map(), new Set(), new Map(), new Map());
    for (const v of [s.brier, s.logloss, s.seatErr, s.listMae, s.acerto]) expect(Number.isNaN(v)).toBe(false);
  });
});
