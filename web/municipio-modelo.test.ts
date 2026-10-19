import { describe, expect, test } from "bun:test";
import { ALPHA_MAX, alvoValido, cityShare, estimate, leanOf, logistic, logit, othersShare, raceShare, solveAlpha } from "./municipio-modelo.js";
import type { City, Params } from "./municipio-modelo.js";

const P: Params = { kappa: 0.9, eta: -0.5, ratio: 1 };
const cities: City[] = [{ a: 700, b: 200, o: 100 }, { a: 300, b: 500, o: 200 }, { a: 50, b: 40, o: 10 }, { a: 4000, b: 4200, o: 1800 }];

describe("estimativa de 2º turno por município", () => {
  test("swapping the finalists swaps the shares: A and B are only labels", () => {
    for (const c of cities) {
      const trocado: City = { a: c.b, b: c.a, o: c.o };
      expect(cityShare(trocado, 0, P)).toBeCloseTo(1 - cityShare(c, 0, P), 10);
    }
  });

  test("with alpha = 0 an even city stays even, and the finalist ahead stays ahead", () => {
    expect(cityShare({ a: 300, b: 300, o: 400 }, 0, P)).toBeCloseTo(0.5, 10);
    expect(cityShare({ a: 600, b: 200, o: 200 }, 0, P)).toBeGreaterThan(0.5);
    expect(cityShare({ a: 200, b: 600, o: 200 }, 0, P)).toBeLessThan(0.5);
  });

  test("a city keeps less of its lean when more voters had chosen someone else (eta < 0)", () => {
    const poucos = cityShare({ a: 600, b: 300, o: 100 }, 0, P);
    const muitos = cityShare({ a: 300, b: 150, o: 550 }, 0, P); // same lean between A and B
    expect(poucos).toBeGreaterThan(muitos);
    expect(muitos).toBeGreaterThan(0.5);
  });

  test("a city where a finalist had no votes stays finite and inside (0, 1)", () => {
    const s = cityShare({ a: 0, b: 1000, o: 0 }, 0, P);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.1);
    expect(Number.isFinite(cityShare({ a: 0, b: 0, o: 0 }, 0, P))).toBe(true);
  });

  test("the race share grows with alpha, and solveAlpha reaches any target the model can produce", () => {
    let antes = 0;
    for (let a = -3; a <= 3; a += 0.5) {
      const s = raceShare(cities, a, P);
      expect(s).toBeGreaterThan(antes);
      antes = s;
    }
    for (const alvo of [0.3, 0.45, 0.5, 0.52, 0.7]) {
      const r = solveAlpha(cities, alvo, P);
      expect(r.limitado).toBe(false);
      expect(raceShare(cities, r.alpha, P)).toBeCloseTo(alvo, 6);
    }
  });

  test("a target the model cannot reach is pinned to the limit and flagged, never faked", () => {
    const r = solveAlpha(cities, 0.9999, P);
    expect(r.limitado).toBe(true);
    expect(r.alpha).toBe(ALPHA_MAX);
    expect(raceShare(cities, r.alpha, P)).toBeLessThan(0.9999);
    expect(solveAlpha(cities, 0.0001, P)).toMatchObject({ limitado: true, alpha: -ALPHA_MAX });
  });

  test("votes: each city gets ratio x its first-round valid votes, split by the share, and the totals add up", () => {
    const { alpha } = solveAlpha(cities, 0.55, { ...P, ratio: 1.02 });
    const est = estimate(cities, alpha, { ...P, ratio: 1.02 });
    cities.forEach((c, i) => {
      expect(est[i]!.votes).toBeCloseTo((c.a + c.b + c.o) * 1.02, 8);
      expect(est[i]!.votesA + est[i]!.votesB).toBeCloseTo(est[i]!.votes, 8);
    });
    const a = est.reduce((s, e) => s + e.votesA, 0), t = est.reduce((s, e) => s + e.votes, 0);
    expect(a / t).toBeCloseTo(0.55, 6);
  });

  test("helpers: logit and logistic are inverses, the target range is clamped, shares of others are fractions", () => {
    expect(logistic(logit(0.37))).toBeCloseTo(0.37, 12);
    expect(alvoValido(0.99)).toBe(0.95);
    expect(alvoValido(0.01)).toBe(0.05);
    expect(alvoValido(0.52)).toBe(0.52);
    expect(othersShare({ a: 1, b: 1, o: 2 })).toBe(0.5);
    expect(othersShare({ a: 0, b: 0, o: 0 })).toBe(0);
    expect(leanOf({ a: 10, b: 10, o: 99 })).toBeCloseTo(0, 12);
  });
});
