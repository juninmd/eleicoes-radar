import { describe, expect, test } from "bun:test";
import { alphaDe, chance, partesDe, priores, sigmas } from "./apuracao-chance.js";
import { file, cand } from "./apuracao-fixtures.js";
import { parseApuracao } from "./apuracao-tse.js";
import type { ParteChance } from "./apuracao-chance.js";
import type { Erros, MunArquivo } from "./apuracao-municipios.js";

const S = { sigmaComum: 0.16, sigmaParte: 0.11 };
const parte = (id: string, a: number, b: number, restante: number, prior = 0.5, esperado = 1000): ParteChance => ({ id, a, b, restante, prior, esperado });

describe("chance ao vivo", () => {
  test("everything counted: the one ahead has it all, nothing is drawn", () => {
    const c = chance([parte("SP", 510, 490, 0), parte("RJ", 100, 110, 0)], S)!;
    expect(c.a).toBe(1);
    expect(c.b).toBe(0);
    expect(c.faixa[0]).toBe(c.faixa[2]);
    expect(c.contados).toBe(1);
  });

  test("no vote yet: only the model speaks, and a 50% prior gives about even chances", () => {
    const c = chance([parte("SP", 0, 0, 1000), parte("RJ", 0, 0, 800)], S)!;
    expect(c.peso).toBe(0);
    expect(c.desvio).toBe(0);
    expect(Math.abs(c.a - 0.5)).toBeLessThan(0.05);
    expect(c.a + c.b + c.empate).toBeCloseTo(1);
  });

  test("a prior well ahead before any vote is a high chance, not a certainty", () => {
    const c = chance([parte("SP", 0, 0, 1000, 0.56)], { sigmaComum: 0.284, sigmaParte: 0 })!;
    expect(c.a).toBeGreaterThan(0.8);
    expect(c.a).toBeLessThan(1);
  });

  test("the deviation the count shows moves the parts still to come", () => {
    // SP counted, and A runs 6 points above what the model said there; RJ has not started
    const sem = chance([parte("SP", 0, 0, 1000, 0.5, 1000), parte("RJ", 0, 0, 1000, 0.48, 1000)], S)!;
    const com = chance([parte("SP", 280, 220, 500, 0.5, 1000), parte("RJ", 0, 0, 1000, 0.48, 1000)], S)!;
    expect(com.desvio).toBeGreaterThan(0.02);
    expect(com.peso).toBeGreaterThan(0.8);
    expect(com.a).toBeGreaterThan(sem.a + 0.3);
    expect(com.faixa[1]).toBeGreaterThan(0.5);
  });

  test("with the deviation measured the band keeps the order of arrival: never a near-certainty at a third of the count", () => {
    const c = chance([parte("SP", 2600, 2400, 10_000, 0.5, 15_000)], { sigmaComum: 0.16, sigmaParte: 0 })!;
    expect(c.faixa[2] - c.faixa[0]).toBeGreaterThan(0.02);
    expect(c.a).toBeLessThan(0.99);
  });

  test("a tiny early count barely moves the prior", () => {
    const c = chance([parte("SP", 3, 1, 999_996, 0.5, 1_000_000)], S)!;
    expect(c.peso).toBeLessThan(0.01);
    expect(Math.abs(c.desvio)).toBeLessThan(0.01);
  });

  test("the band narrows as the count advances", () => {
    const larga = (x: ReturnType<typeof chance>) => x!.faixa[2] - x!.faixa[0];
    const cedo = chance([parte("SP", 100, 100, 1800)], S), tarde = chance([parte("SP", 950, 950, 100)], S);
    expect(larga(tarde)).toBeLessThan(larga(cedo) / 3);
  });

  test("the same input always gives the same numbers, never NaN", () => {
    const ps = [parte("SP", 0, 1, 10, 0), parte("ZZ", 5, 0, 0, 1, 0), parte("RJ", 0, 0, 100, 0.999999)];
    const x = chance(ps, S)!, y = chance(ps, S)!;
    expect(x).toEqual(y);
    for (const v of [x.a, x.b, x.empate, ...x.faixa, x.previa, x.desvio, x.peso, x.contados]) expect(Number.isFinite(v)).toBe(true);
  });

  test("nothing counted and nothing expected: no chance to show", () => expect(chance([parte("SP", 0, 0, 0, 0.5, 0)], S)).toBeNull());
});

describe("entrada da chance", () => {
  const arq: MunArquivo = {
    cargo: "Presidente", uf: "BR", ano: 2026, a: { n: "13", nome: "A", partido: "X", sq: "a1" }, b: { n: "22", nome: "B", partido: "Y", sq: "b2" },
    cidades: [["1", "C1", "SP", 600, 400, 0], ["2", "C2", "SP", 300, 700, 0], ["3", "C3", "ZZ", 10, 30, 0]],
  };
  const P = { kappa: 1, eta: 0, ratio: 1 };

  test("the president's parts are the states of his cities, the exterior included", () => {
    const pri = priores(arq, P, 0, true);
    expect(Object.keys(pri).sort()).toEqual(["SP", "ZZ"]);
    expect(pri.SP!.esperado).toBe(2000);
    expect(pri.SP!.prior).toBeCloseTo(0.45, 2);
    expect(pri.ZZ!.prior).toBeLessThan(0.3);
    expect(Object.keys(priores({ ...arq, uf: "AC" }, P, 0, false))).toEqual(["AC"]);
  });

  test("the poll anchor moves the race to the poll's share", () => {
    const pri = priores(arq, P, alphaDe(arq, P, 0.55), true);
    const total = (pri.SP!.prior * pri.SP!.esperado + pri.ZZ!.prior * pri.ZZ!.esperado) / (pri.SP!.esperado + pri.ZZ!.esperado);
    expect(total).toBeCloseTo(0.55, 3);
    expect(alphaDe(arq, P, null)).toBe(0);
  });

  test("a part without a file waits for the model; a part with votes uses what is left of it", () => {
    const sp = parseApuracao(file({ cands: [cand("a1", "13", "A", "1", "600", "60,00"), cand("b2", "22", "B", "2", "400", "40,00")], v: { vv: "1000", vvc: "1000" } }))!;
    const ps = partesDe([["SP", sp], ["RJ", null]], priores(arq, P, 0, true), "a1", "b2");
    const by = Object.fromEntries(ps.map((p) => [p.id, p]));
    expect(by.SP!.a).toBe(600);
    expect(by.SP!.restante).toBeCloseTo((1000 * (500000 - 200000)) / 200000);
    expect(by.RJ!.restante).toBe(0); // no file and no prior for RJ: nothing expected
    expect(by.ZZ!.restante).toBe(by.ZZ!.esperado);
  });

  test("the noise comes from the backtest: the model's race error, or the poll's with an anchor", () => {
    const e = { nacionalSemAncoraRmse: 4.1, porTamanho: [{ ate: null, rmse: 2.8 }] } as Erros;
    expect(sigmas(e, false, 28).sigmaComum).toBeCloseTo(0.164);
    expect(sigmas(e, true, 28).sigmaComum).toBeCloseTo(0.12);
    expect(sigmas(e, false, 28).sigmaParte).toBeCloseTo(0.112);
    expect(sigmas(e, false, 1).sigmaParte).toBe(0);
  });
});

describe("leitura da chance", () => {
  test("the draws run again only when a count changes", async () => {
    const { createChance } = await import("./apuracao-chance.js");
    const arq: MunArquivo = { cargo: "Governador", uf: "AC", ano: 2026, a: { n: "1", nome: "A", partido: "X", sq: "a1" }, b: { n: "2", nome: "B", partido: "Y", sq: "b2" }, cidades: [["1", "C1", "AC", 600, 400, 100]] };
    const d = parseApuracao(file({ cands: [cand("a1", "1", "A", "1", "60", "60,00"), cand("b2", "2", "B", "2", "40", "40,00")], v: { vv: "100", vvc: "100" } }))!;
    const c = createChance();
    const e = { params: { kappa: 0.8, eta: -0.7, ratio: 1 }, erros: null, arq, fontes: [["AC", d]] as [string, typeof d][], idA: "a1", idB: "b2", ancora: null };
    const x = c.ler(e), y = c.ler(e);
    expect(y.chance).toBe(x.chance);
    const z = c.ler({ ...e, fontes: [["AC", { ...d, candidatos: d.candidatos.map((k) => ({ ...k, votos: k.votos + 1 })) }]] });
    expect(z.chance).not.toBe(x.chance);
    expect(x.partes.map((p) => p.id)).toEqual(["AC"]);
  });
});
