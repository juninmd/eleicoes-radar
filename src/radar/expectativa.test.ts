import { describe, expect, test } from "bun:test";
import { lideres, modelProblem, scoreDeputies } from "./expectativa";
import type { HistElection } from "./hist/aggregate";
import { FEATURES } from "./model/seats";
import type { Candidate } from "./tse";

const f = (sq: string, media: number) => ({ sq, media, lo: media - 0.05, hi: media + 0.05, pVitoria: 0, p2turno: null, tendencia: null });
const quem = new Map([["1", { nome: "Ana", partido: "AAA" }], ["2", { nome: "Beto", partido: "BBB" }], ["3", { nome: "Cris", partido: "CCC" }], ["4", { nome: "Duda", partido: "DDD" }]]);

describe("lideres", () => {
  test("keeps the best-placed candidates by poll average, highest first", () => {
    expect(lideres([f("2", 0.3), f("1", 0.5), f("4", 0.1), f("3", 0.2)], quem, 3).map((l) => l.sq)).toEqual(["1", "2", "3"]);
  });

  test("a tie is broken by candidate id, so a rebuild never reshuffles the map", () => {
    expect(lideres([f("3", 0.4), f("1", 0.4)], quem).map((l) => l.sq)).toEqual(["1", "3"]);
  });

  test("a candidate with no poll mentions is not a leader, and one we cannot name is skipped", () => {
    expect(lideres([f("1", 0), f("9", 0.6), f("2", 0.2)], quem).map((l) => l.sq)).toEqual(["2"]);
  });

  test("carries what the map prints and rounds like the rest of the poll data", () => {
    const [l] = lideres([f("1", 0.123456)], quem);
    expect(l).toEqual({ sq: "1", nome: "Ana", partido: "AAA", media: 0.1235, lo: 0.0735, hi: 0.1735 });
  });
});

describe("scoreDeputies", () => {
  const cand = (sq: string, nome: string, nascimento: string, partido: string, numero: string, total: number) =>
    ({ sq, nome, nascimento, partido, numero, uf: "SP", cargo: "Deputado Federal", ocupacao: "ADVOGADO", finance: { total } }) as unknown as Candidate;
  const h = (sq: string, pk: string, numero: string, votos: number, sit: string) => ({ sq, uf: "SP", cargo: "DEPUTADO FEDERAL", numero, partido: "X", lista: "1", ocupacao: "", nome: sq, pk, receita: 0, votos, votos2: 0, sit });
  const prev: HistElection = { year: 2022, cutoff: "", vagas: {}, legenda: {}, cands: [h("o", "ANA SILVA|1970-01-01", "1301", 900, "ELEITO POR QP"), h("p", "OUTRO|1960-01-01", "1302", 100, "NÃO ELEITO")] };
  // A model that rewards having won last time and has no other opinion.
  const coef = FEATURES.map((f) => (f === "eleito antes" ? 3 : 0));
  const vagas = new Map([["SP|DEPUTADO FEDERAL", 1]]);
  const out = scoreDeputies(
    [cand("a", "Ana Silva", "1970-01-01", "PT", "1301", 100), cand("b", "Bia Souza", "1980-02-02", "PT", "1302", 100)],
    vagas, { coef, knots: [] }, prev,
  );

  test("a candidate who won last time, matched by civil name and birth date, outranks an identical newcomer", () => {
    expect(out.get("a")!.p).toBeGreaterThan(out.get("b")!.p);
    expect(out.get("a")!.ex).toMatchObject({ el: true, ps: 0.9 });
    expect(out.get("b")!.ex).toMatchObject({ el: false, ps: null });
  });

  test("the chances of one race add up to its seats", () => {
    expect(out.get("a")!.p + out.get("b")!.p).toBeCloseTo(1, 3);
  });
});

describe("modelProblem", () => {
  const ok = { coef: FEATURES.map(() => 0), features: [...FEATURES], anterior: 2022 };
  const has = (file: string) => file === "data/hist/2022.json";

  test("a model that matches the code and has its previous election on disk is usable", () => {
    expect(modelProblem(ok, has)).toBeNull();
  });

  test("same number of features in another order is rejected, not silently misread", () => {
    expect(modelProblem({ ...ok, features: [...FEATURES].reverse() }, has)).toContain("outra versão");
  });

  test("a model from an older version (fewer coefficients, no anterior) is rejected", () => {
    expect(modelProblem({ coef: [0, 1, 2], features: ["a", "b", "c"] }, has)).toContain("outra versão");
    expect(modelProblem({ ...ok, anterior: undefined }, has)).toContain("outra versão");
    expect(modelProblem({ ...ok, anterior: Number("x") }, has)).toContain("outra versão");
  });

  test("a missing previous-election file says which command makes it", () => {
    expect(modelProblem({ ...ok, anterior: 2018 }, has)).toBe("falta data/hist/2018.json (bun run radar:hist 2018)");
  });
});
