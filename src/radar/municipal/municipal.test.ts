import { describe, expect, test } from "bun:test";
import { createCollector, munKey } from "./sources";
import { actualShare, fitShape, ratioOf, runoffsOf } from "./fit";
import { arquivoDe, arquivoDoPleito, RUNOFF } from "./build";
import { porTamanho, predictRace, score } from "./backtest";
import { cityShare, leanOf, logit, logistic, othersShare, solveAlpha } from "../../../web/municipio-modelo";
import type { MunElection, MunRace } from "./sources";

const row = (over: Record<string, string>) => ({ DS_CARGO: "Presidente", NR_TURNO: "1", NR_CANDIDATO: "13", NM_URNA_CANDIDATO: "LULA", SG_PARTIDO: "PT", SQ_CANDIDATO: "1", SG_UF: "SP", CD_MUNICIPIO: "71072", NM_MUNICIPIO: "SAO PAULO", QT_VOTOS_NOMINAIS: "100", DS_SIT_TOT_TURNO: "2º TURNO", ...over });

describe("coleta dos votos por município", () => {
  test("zones add up inside a municipality, rounds stay apart, and the Governor of each state is its own race", () => {
    const c = createCollector();
    c.add(row({ NR_ZONA: "1" })); c.add(row({ NR_ZONA: "2", QT_VOTOS_NOMINAIS: "50" }));
    c.add(row({ NR_CANDIDATO: "22", NM_URNA_CANDIDATO: "OUTRO", SG_PARTIDO: "PL", QT_VOTOS_NOMINAIS: "70" }));
    c.add(row({ NR_TURNO: "2", QT_VOTOS_NOMINAIS: "200" }));
    c.add(row({ DS_CARGO: "Governador", SG_UF: "RN", CD_MUNICIPIO: "1" }));
    c.add(row({ DS_CARGO: "Governador", SG_UF: "AC", CD_MUNICIPIO: "1" }));
    c.add(row({ DS_CARGO: "Deputado Federal" })); // not collected
    c.add(row({ NR_TURNO: "3" })); // not a round
    const e = c.done(2026);
    expect(e.races.map((r) => `${r.cargo}|${r.uf}`)).toEqual(["Governador|AC", "Governador|RN", "Presidente|BR"]);
    const pres = e.races.find((r) => r.cargo === "Presidente")!;
    expect(pres.cands.map((x) => x.n)).toEqual(["13", "22"]);
    expect(pres.mun["71072"]!.v1).toEqual([150, 70]);
    expect(pres.mun["71072"]!.v2).toEqual([200, 0]); // the candidate that was not in the runoff has zero, aligned with `cands`
  });

  test("the valid-votes column wins over the raw one, and municipality codes with or without a leading zero are the same city", () => {
    const c = createCollector();
    c.add(row({ QT_VOTOS_NOMINAIS_VALIDOS: "90", QT_VOTOS_NOMINAIS: "100", CD_MUNICIPIO: "01120" }));
    c.add(row({ QT_VOTOS_NOMINAIS_VALIDOS: "10", CD_MUNICIPIO: "1120" }));
    expect(munKey("01120")).toBe("1120");
    expect(munKey("1120")).toBe("1120");
    expect(Object.keys(c.done(2018).races[0]!.mun)).toEqual(["1120"]);
    expect(c.done(2018).races[0]!.mun["1120"]!.v1).toEqual([100]);
  });
});

// A synthetic runoff built from the model itself, so the fit has a known answer.
function sintetico(year: number, uf: string, kappa: number, eta: number, alpha: number, n = 400): MunElection["races"][number] {
  const mun: MunRace["mun"] = {};
  let seed = year * 7 + uf.charCodeAt(0);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < n; i++) {
    const tot = 2000 + Math.floor(rnd() * 50000), so = 0.05 + rnd() * 0.5, lean = (rnd() - 0.5) * 3;
    const ab = tot * (1 - so), a = Math.round(ab * logistic(lean)), b = Math.round(ab) - a, o = tot - a - b;
    const s = logistic(alpha + (kappa + eta * othersShare({ a, b, o })) * leanOf({ a, b, o }));
    const v2 = Math.round(tot * 1.0);
    mun[String(i)] = { nome: `M${i}`, uf, v1: [a, b, o], v2: [Math.round(v2 * s), v2 - Math.round(v2 * s), 0] };
  }
  return { cargo: "Governador", uf, cands: [{ n: "1", nome: "A", partido: "PA", sq: "1", sit: "2º TURNO" }, { n: "2", nome: "B", partido: "PB", sq: "2", sit: "2º TURNO" }, { n: "3", nome: "C", partido: "PC", sq: "3", sit: "NÃO ELEITO" }], mun };
}

describe("ajuste e backtest", () => {
  test("the finalists are the two with runoff votes, and A is the one ahead in the first round", () => {
    const [r] = runoffsOf({ year: 2022, races: [sintetico(2022, "SP", 0.9, -0.5, 0)] });
    expect(r!.cities).toHaveLength(400);
    const a1 = r!.cities.reduce((s, c) => s + c.city.a, 0), b1 = r!.cities.reduce((s, c) => s + c.city.b, 0);
    expect(a1).toBeGreaterThanOrEqual(b1);
    // a race the other way round gives the same oriented finalist
    const inv = sintetico(2022, "SP", 0.9, -0.5, 0);
    for (const m of Object.values(inv.mun)) { m.v1 = [m.v1[1]!, m.v1[0]!, m.v1[2]!]; m.v2 = [m.v2![1]!, m.v2![0]!, 0]; }
    const [r2] = runoffsOf({ year: 2022, races: [inv] });
    expect(r2!.cities[0]!.city.a).toBe(r!.cities[0]!.city.a);
  });

  test("a race with fewer than two runoff candidates is skipped, and a city with no runoff votes is dropped", () => {
    const um = sintetico(2022, "SP", 0.9, -0.5, 0);
    for (const m of Object.values(um.mun)) m.v2 = [m.v2![0]! + m.v2![1]!, 0, 0];
    expect(runoffsOf({ year: 2022, races: [um] })).toHaveLength(0);
    const r = sintetico(2022, "SP", 0.9, -0.5, 0);
    r.mun["0"]!.v2 = [0, 0, 0];
    expect(runoffsOf({ year: 2022, races: [r] })[0]!.cities).toHaveLength(399);
  });

  test("the regression recovers the shape that generated the runoffs, across different race levels", () => {
    const races = runoffsOf({ year: 2022, races: [sintetico(2022, "SP", 0.8, -0.6, 0.3), sintetico(2022, "RN", 0.8, -0.6, -0.4), sintetico(2022, "AM", 0.8, -0.6, 0.1)] });
    const p = fitShape(races);
    expect(p.kappa).toBeCloseTo(0.8, 1);
    expect(p.eta).toBeCloseTo(-0.6, 1);
    expect(p.ratio).toBeCloseTo(1, 2);
  });

  test("with the shape known and the race level right, the city error is close to zero; with the level wrong it is not", () => {
    const [r] = runoffsOf({ year: 2022, races: [sintetico(2022, "SP", 0.8, -0.6, 0.3)] });
    const p = { kappa: 0.8, eta: -0.6, ratio: 1 };
    expect(score([predictRace(r!, p, "certo")]).rmse).toBeLessThan(0.1);
    const zero = score([predictRace(r!, p, "zero")]);
    expect(zero.rmse).toBeGreaterThan(1);
    expect(zero.erroNacionalAbs).toBeGreaterThan(1);
    expect(score([predictRace(r!, p, "certo")]).acertoVencedor).toBeGreaterThan(99);
  });

  test("the error by size class covers every city once, in the same order as the classes", () => {
    const [r] = runoffsOf({ year: 2022, races: [sintetico(2022, "SP", 0.8, -0.6, 0.3)] });
    const t = porTamanho([predictRace(r!, { kappa: 1, eta: 0, ratio: 1 }, "certo")]);
    expect(t.map((x) => x.ate)).toEqual([5000, 20000, 100000, null]);
    expect(t[0]!.rmse).toBeGreaterThan(0);
  });

  test("actualShare and ratioOf read the real runoff", () => {
    const [r] = runoffsOf({ year: 2022, races: [sintetico(2022, "SP", 0.8, -0.6, 0.3)] });
    expect(actualShare(r!)).toBeGreaterThan(0.5);
    expect(ratioOf([r!])).toBeCloseTo(1, 2);
  });

  test("the model's own algebra: logit/logistic, alpha at the extremes, cityShare stays inside (0,1)", () => {
    expect(logistic(logit(0.2))).toBeCloseTo(0.2, 12);
    const cs = [{ a: 10, b: 1, o: 0 }, { a: 0, b: 10, o: 5 }];
    for (const a of [-6, 0, 6]) for (const c of cs) { const s = cityShare(c, a, { kappa: 1, eta: 0, ratio: 1 }); expect(s).toBeGreaterThan(0); expect(s).toBeLessThan(1); }
    expect(solveAlpha(cs, 0.5, { kappa: 1, eta: 0, ratio: 1 }).limitado).toBe(false);
  });
});

describe("arquivos de 2026 para a página", () => {
  const cand = (n: string, sit: string) => ({ n, nome: `C${n}`, partido: `P${n}`, sq: `sq${n}`, sit });
  const race = (cands: MunRace["cands"], mun: MunRace["mun"], cargo: "Presidente" | "Governador" = "Governador", uf = "RN"): MunRace => ({ cargo, uf, cands, mun });
  const mun = (a: number, b: number, o: number) => ({ nome: "X", uf: "RN", v1: [a, b, o] });

  test("only candidates the TSE marks '2º TURNO' are finalists; the leader of the first round is A", () => {
    const arq = arquivoDoPleito(race([cand("1", "2º TURNO"), cand("2", "2º TURNO"), cand("3", "NÃO ELEITO")], { "1": mun(10, 30, 5), "2": mun(20, 25, 5) }), 2026)!;
    expect(arq.a.n).toBe("2");
    expect(arq.b.n).toBe("1");
    expect(arq.cidades[0]).toEqual(["1", "X", "RN", 30, 10, 5]);
    expect(arq.cidades).toHaveLength(2);
    for (const t of ["2º TURNO", "2° TURNO", "2o turno"]) expect(RUNOFF.test(t)).toBe(true);
    for (const t of ["ELEITO", "NÃO ELEITO", "", "SUPLENTE"]) expect(RUNOFF.test(t)).toBe(false);
  });

  test("a race decided in the first round, one with three marked, or with a single municipality has no file", () => {
    expect(arquivoDoPleito(race([cand("1", "ELEITO"), cand("2", "NÃO ELEITO")], { "1": mun(1, 1, 1), "2": mun(1, 1, 1) }), 2026)).toBeNull();
    expect(arquivoDoPleito(race([cand("1", "2º TURNO"), cand("2", "2º TURNO"), cand("3", "2º TURNO")], { "1": mun(1, 1, 1), "2": mun(1, 1, 1) }), 2026)).toBeNull();
    expect(arquivoDoPleito(race([cand("1", "2º TURNO"), cand("2", "2º TURNO")], { "1": mun(1, 1, 1) }), 2026)).toBeNull(); // the Federal District
  });

  test("file names are safe and stable", () => {
    expect(arquivoDe("Presidente", "BR")).toBe("Presidente-BR.json");
    expect(arquivoDe("Governador", "RN")).toBe("Governador-RN.json");
  });

  test("the file carries no personal data: only the ballot names and numbers that the TSE publishes, and vote counts", () => {
    const arq = arquivoDoPleito(race([cand("1", "2º TURNO"), cand("2", "2º TURNO")], { "1": mun(10, 30, 5), "2": mun(20, 25, 5) }), 2026)!;
    expect(JSON.stringify(arq)).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}|(?<!\d)\d{11}(?!\d)/);
  });
});
