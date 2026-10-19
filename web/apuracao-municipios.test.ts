import { describe, expect, test } from "bun:test";
import { alvoDe, analisar, margemDe, pesquisaDoPar, shareNeutro } from "./apuracao-municipios.js";
import type { Erros, MunArquivo } from "./apuracao-municipios.js";
import type { Params } from "./municipio-modelo.js";

const P: Params = { kappa: 0.9, eta: -0.5, ratio: 1 };
const f = (n: string, sq: string) => ({ n, nome: `Cand ${n}`, partido: `P${n}`, sq });
const arq: MunArquivo = {
  cargo: "Presidente", uf: "BR", ano: 2026, a: f("22", "A"), b: f("13", "B"),
  cidades: [["1", "São Paulo", "SP", 6000, 3000, 1000], ["2", "Salvador", "BA", 1000, 7000, 1500], ["3", "Ação Pequena", "SP", 60, 50, 10], ["4", "Natal", "RN", 2000, 2200, 800], ["5", "Ex", "ZZ", 10, 90, 5]],
};
const erros: Erros = { cidade: 3.2, porTamanho: [{ ate: 100, rmse: 9 }, { ate: 10000, rmse: 4 }, { ate: null, rmse: 2.5 }], nacionalSemAncora: 3.6, nacionalSemAncoraRmse: 4.1, acertoVencedor: 95, erroVotos: 3, disputas: 6, anos: [2002, 2022] };
const todos = { uf: "", busca: "" };

describe("análise do 2º turno por município", () => {
  test("the scenario 'meu' makes the cities add up to the chosen total", () => {
    const a = analisar(arq, P, { modo: "meu", alvo: 0.52 }, todos, erros);
    expect(a.shareA).toBeCloseTo(0.52, 6);
    expect(a.votosA + a.votosB).toBeCloseTo(a.votos, 6);
    expect(a.cidades).toHaveLength(5);
  });

  test("'neutro' uses alpha = 0 and the total is whatever the cities give", () => {
    const a = analisar(arq, P, { modo: "neutro", alvo: 0.9 }, todos);
    expect(a.alpha).toBe(0);
    expect(a.shareA).toBeCloseTo(shareNeutro(arq, P), 10);
    expect(alvoDe({ modo: "neutro", alvo: 0.9 })).toBeNull();
    expect(alvoDe({ modo: "meu", alvo: 0.99 })).toBe(0.95);
  });

  test("cities ahead are counted per finalist, and the cities are sorted by estimated votes", () => {
    const a = analisar(arq, P, { modo: "neutro", alvo: 0.5 }, todos);
    expect(a.aFrente + a.bFrente + a.empate).toBe(5);
    expect(a.aFrente).toBe(2); // São Paulo and the small one
    expect(a.cidades.map((c) => c.nome)).toEqual(["São Paulo", "Salvador", "Natal", "Ação Pequena", "Ex"]);
  });

  test("filters by state and by name, ignoring case and accents", () => {
    expect(analisar(arq, P, { modo: "neutro", alvo: 0.5 }, { uf: "SP", busca: "" }).cidades.map((c) => c.nome)).toEqual(["São Paulo", "Ação Pequena"]);
    const b = analisar(arq, P, { modo: "neutro", alvo: 0.5 }, { uf: "", busca: "  acao " });
    expect(b.cidades.map((c) => c.nome)).toEqual(["Ação Pequena"]);
    expect(b.total).toBe(1);
    expect(analisar(arq, P, { modo: "neutro", alvo: 0.5 }, { uf: "RN", busca: "salvador" }).total).toBe(0);
  });

  test("state totals add up to the race, and the filter does not change the totals", () => {
    const tudo = analisar(arq, P, { modo: "meu", alvo: 0.5 }, todos);
    const filtrado = analisar(arq, P, { modo: "meu", alvo: 0.5 }, { uf: "BA", busca: "" });
    expect(tudo.porUf.reduce((s, u) => s + u.votos, 0)).toBeCloseTo(tudo.votos, 6);
    expect(filtrado.votos).toBeCloseTo(tudo.votos, 6);
    expect(tudo.porUf.map((u) => u.uf)).toContain("ZZ");
  });

  test("the error band of a city is the one of its size class, from the backtest", () => {
    expect(margemDe(50, erros)).toBe(9);
    expect(margemDe(5000, erros)).toBe(4);
    expect(margemDe(5e6, erros)).toBe(2.5);
    expect(Number.isNaN(margemDe(50, null))).toBe(true);
    const a = analisar(arq, P, { modo: "neutro", alvo: 0.5 }, todos, erros);
    expect(a.cidades.find((c) => c.nome === "São Paulo")!.pm).toBe(4);
    expect(Number.isNaN(analisar(arq, P, { modo: "neutro", alvo: 0.5 }, todos).cidades[0]!.pm)).toBe(true);
  });

  test("a poll for the pair is found in either order, and a pair with no poll gives null", () => {
    const c = [{ a: "X", b: "Y", qa: 0.46 }, { a: "B", b: "A", qa: 0.51 }];
    expect(pesquisaDoPar(c, "X", "Y")).toBe(0.46);
    expect(pesquisaDoPar(c, "Y", "X")).toBeCloseTo(0.54, 10);
    expect(pesquisaDoPar(c, "A", "B")).toBeCloseTo(0.49, 10);
    expect(pesquisaDoPar(c, "A", "Z")).toBeNull();
    expect(pesquisaDoPar(undefined, "A", "B")).toBeNull();
  });
});
