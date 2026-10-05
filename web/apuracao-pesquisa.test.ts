import { describe, expect, test } from "bun:test";
import { comparar, delta, resumoFaixa } from "./apuracao-pesquisa.js";
import type { Prev } from "../src/radar/expectativa";

const poll = (media: unknown, lo: number, hi: number) => ({ fonte: "pesquisas", media, lo, hi }) as unknown as Prev;

describe("comparar", () => {
  test("only a poll-based expectation can be compared with the count", () => {
    expect(comparar({ pct: 0.4 }, null)).toBeNull();
    expect(comparar({ pct: 0.4 }, undefined)).toBeNull();
    expect(comparar({ pct: 0.4 }, { fonte: "modelo", p: 0.6 } as Prev)).toBeNull();
    expect(comparar({ pct: 0.4 }, { fonte: "pesquisas" })).toBeNull();
    expect(comparar({ pct: 0.4 }, poll("0.4", 0.3, 0.5))).toBeNull(); // not a number: never coerce
  });

  test("difference is count minus poll average, in the same base (share of valid votes)", () => {
    const r = comparar({ pct: 0.4448 }, poll(0.4, 0.35, 0.45));
    expect(r!.media).toBe(0.4);
    expect(r!.diff).toBeCloseTo(0.0448, 6);
    expect(r!.dentro).toBe(true);
    expect(comparar({ pct: 0.3 }, poll(0.4, 0.35, 0.45))!.dentro).toBe(false);
  });

  test("the edges of the 90% band count as inside", () => {
    expect(comparar({ pct: 0.35 }, poll(0.4, 0.35, 0.45))!.dentro).toBe(true);
    expect(comparar({ pct: 0.45 }, poll(0.4, 0.35, 0.45))!.dentro).toBe(true);
  });

  test("a missing band says unknown instead of outside", () => {
    expect(comparar({ pct: 0.9 }, { fonte: "pesquisas", media: 0.4 })!.dentro).toBeNull();
  });
});

describe("delta", () => {
  test("arrow and points, with the direction also in words for screen readers", () => {
    expect(delta(0.0182)).toEqual({ seta: "▲", txt: "1,8 p.p.", sr: "1,8 pontos percentuais acima da média das pesquisas" });
    expect(delta(-0.0349)).toEqual({ seta: "▼", txt: "3,5 p.p.", sr: "3,5 pontos percentuais abaixo da média das pesquisas" });
  });
  test("under a twentieth of a point is equal, not a direction", () => {
    expect(delta(0.0004)).toMatchObject({ seta: "▬", txt: "0,0 p.p." });
    expect(delta(-0.0004).seta).toBe("▬");
  });
});

describe("resumoFaixa", () => {
  test("counts only candidates with 3% or more in the polls: tiny ones fall outside any band by noise", () => {
    const cmps = [{ media: 0.46, dentro: true }, { media: 0.44, dentro: false }, { media: 0.03, dentro: true }, { media: 0.029, dentro: false }, { media: 0.001, dentro: false }];
    expect(resumoFaixa(cmps)).toEqual({ dentro: 2, total: 3 });
  });
  test("candidates whose band is unknown are not counted either way", () => {
    expect(resumoFaixa([{ media: 0.4, dentro: null }, { media: 0.3, dentro: true }])).toEqual({ dentro: 1, total: 1 });
  });
  test("nothing to summarize gives null", () => {
    expect(resumoFaixa([])).toBeNull();
    expect(resumoFaixa([{ media: 0.01, dentro: true }])).toBeNull();
  });
});
