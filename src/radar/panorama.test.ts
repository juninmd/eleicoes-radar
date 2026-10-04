import { describe, expect, test } from "bun:test";
import { aggregate, aggregateAgenda, cor, foldMap, genero, idade, instrucao, MIN_CELL, MIN_PERFIL, OUTRAS } from "./panorama";

const cand = (o: Record<string, unknown> = {}) => ({
  cargo: "Deputado Federal", partido: "AAA", genero: "Masculino", corRaca: "Branca",
  ficha: { instrucao: "SUPERIOR COMPLETO", nascimento: "1980-01-01" },
  fin: { total: 100, publico: 60, partido: 20, pf: 10, proprio: 5 }, ...o,
});
const many = (n: number, f: (i: number) => Record<string, unknown> = () => ({})) => Array.from({ length: n }, (_, i) => cand(f(i)));

describe("category normalisation", () => {
  test("TSE ships the same category in two cases; they must land in one bucket", () => {
    expect(genero(cand({ genero: "MASCULINO" }))).toBe(genero(cand({ genero: "Masculino" })));
    expect(cor(cand({ corRaca: "PARDA" }))).toBe(cor(cand({ corRaca: "Parda" })));
    expect(cor(cand({ corRaca: "INDÍGENA" }))).toBe("Indígena");
  });
  test("unknown or empty values are reported as such, never dropped", () => {
    expect(genero(cand({ genero: "" }))).toBe("Não informado");
    expect(instrucao(cand({ ficha: {} }))).toBe("Não informado");
    expect(instrucao(cand({ ficha: { instrucao: "LÊ E ESCREVE" } }))).toBe("Fundamental ou menos");
    expect(instrucao(cand({ ficha: { instrucao: "SUPERIOR INCOMPLETO" } }))).toBe("Superior incompleto");
  });
  test("age is counted on election day, not on the 1st of January", () => {
    expect(idade(cand({ ficha: { nascimento: "2001-10-04" } }))).toBe("25–34"); // turns 25 on the day
    expect(idade(cand({ ficha: { nascimento: "2001-10-05" } }))).toBe("18–24"); // one day short
    expect(idade(cand({ ficha: { nascimento: "1961-10-04" } }))).toBe("65 ou mais");
    expect(idade(cand({ ficha: { nascimento: "xx" } }))).toBe("Não informado");
    expect(idade(cand({ ficha: {} }))).toBe("Não informado");
  });
});

describe("aggregate", () => {
  test("party rows add up to the cargo money, and 'outros' never goes negative", () => {
    const list = [
      cand({ partido: "AAA", fin: { total: 100, publico: 60, partido: 20, pf: 10, proprio: 5 } }), // outros = 5
      cand({ partido: "BBB", fin: { total: 50, publico: 50, partido: 0, pf: 0, proprio: 0 } }),
      cand({ partido: "BBB", fin: { total: 10, publico: 8, partido: 8, pf: 0, proprio: 0 } }), // parts exceed total
    ];
    const g = aggregate(list)["Deputado Federal"]!;
    expect(g.n).toBe(3);
    expect(g.partidos.BBB!.n).toBe(2);
    expect(g.partidos.AAA!.outros).toBe(5);
    expect(g.partidos.BBB!.outros).toBe(0); // clamped: the parts of the third candidacy exceed its total
    expect(Object.values(g.partidos).reduce((a, p) => a + p.total, 0)).toBe(160);
    expect(g.fontes).toEqual({ publico: 118, partido: 28, pf: 10, proprio: 5, outros: 5 });
  });

  test("with consistent data the sources add up exactly to the money raised", () => {
    const g = aggregate(many(5, (i) => ({ fin: { total: 100 + i, publico: 60, partido: 20, pf: 10, proprio: 5 } })))["Deputado Federal"]!;
    expect(Object.values(g.fontes).reduce((a, b) => a + b, 0)).toBe(Object.values(g.partidos).reduce((a, p) => a + p.total, 0));
  });

  test("median ignores candidacies without revenue so empty campaigns do not drag a party to zero", () => {
    const g = aggregate([cand({ fin: { total: 0 } }), cand({ fin: { total: 100 } }), cand({ fin: { total: 300 } })])["Deputado Federal"]!;
    expect(g.partidos.AAA!.mediana).toBe(200);
    expect(g.partidos.AAA!.comReceita).toBe(2);
    expect(g.comReceita).toBe(2);
  });

  test("expected seats are the sum of the model chances, women counted across spellings", () => {
    const women = many(6, (i) => ({ prev: { p: 0.25 }, genero: i % 2 ? "FEMININO" : "Feminino" }));
    const g = aggregate([...women, ...many(5)])["Deputado Federal"]!;
    expect(g.partidos.AAA!.vagas).toBe(1.5);
    expect(g.partidos.AAA!.mulheres).toBe(6);
  });

  // The party rows would otherwise hand back the very cell the profile folds: their sum is the Feminino count.
  test("women per party are published only when the Feminino cell itself is published", () => {
    const run = (women: number, notInformed: number) => aggregate(many(40, (i) => ({ partido: i % 2 ? "AAA" : "BBB", genero: i < women ? "Feminino" : i >= 40 - notInformed ? "" : "Masculino" })))["Deputado Federal"]!;
    const folded = run(1, 4); // 1 woman, 4 not informed: Feminino sits in "Outras categorias" in the profile
    expect(folded.perfil!.genero.Feminino).toBeUndefined();
    expect(Object.values(folded.partidos).map((p) => p.mulheres)).toEqual([null, null]);
    const shown = run(5, 0);
    expect(shown.perfil!.genero.Feminino).toBe(5);
    expect(Object.values(shown.partidos).reduce((a, p) => a + p.mulheres!, 0)).toBe(5);
  });

  test("concentration is cumulative, ends at 100% and is withheld when it would mislead", () => {
    const g = aggregate(many(20, (i) => ({ fin: { total: 20 - i } })))["Deputado Federal"]!;
    expect(g.conc).toHaveLength(10);
    expect(g.conc.at(-1)).toBe(1);
    expect(g.conc.every((v, i, a) => i === 0 || v >= a[i - 1]!)).toBe(true);
    expect(g.conc[0]).toBeCloseTo((20 + 19) / 210, 3); // top 10% of 20 = 2 candidacies
    // 11 equal campaigns: the top 10% is 1.1 of them, not 2 (which would claim 18%).
    const eleven = aggregate(many(11, () => ({ fin: { total: 100 } })))["Deputado Federal"]!.conc;
    expect(eleven.map((v) => Math.round(v * 100))).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(aggregate(many(9))["Deputado Federal"]!.conc).toEqual([]); // too few candidacies
    expect(aggregate(many(20, () => ({ fin: { total: 0 } })))["Deputado Federal"]!.conc).toEqual([]); // no money to split
  });

  test("a profile is published only for groups large enough not to point at individuals", () => {
    expect(aggregate(many(MIN_PERFIL - 1))["Deputado Federal"]!.perfil).toBeNull();
    const p = aggregate(many(MIN_PERFIL))["Deputado Federal"]!.perfil!;
    expect(p.genero.Masculino).toBe(MIN_PERFIL);
    expect(p.esperado).toBeNull(); // no model chances in this fixture
  });

  test("expected composition weighs each group by the model chance", () => {
    const list = many(MIN_PERFIL, (i) => ({ genero: i < 10 ? "Feminino" : "Masculino", prev: { p: i < 10 ? 0.1 : 0.4 } }));
    const e = aggregate(list)["Deputado Federal"]!.perfil!.esperado!;
    expect(e.genero.Feminino).toBe(1); // 10 x 0.1
    expect(e.genero.Masculino).toBe(8); // 20 x 0.4
  });

  test("a category with a handful of people is folded away in the file itself, not only hidden on screen", () => {
    // 35 men, 1 woman, 4 not informed: those two small groups are 5 people together, so they share one bucket.
    const list = many(40, (i) => ({ genero: i < 35 ? "Masculino" : i < 36 ? "Feminino" : "" }));
    const g = aggregate(list)["Deputado Federal"]!.perfil!.genero;
    expect(g).toEqual({ Masculino: 35, [OUTRAS]: 5 });
    // With only 4 people in the small groups the bucket is too small to hide who is in it, so the big group joins.
    const tiny = aggregate(many(40, (i) => ({ genero: i < 36 ? "Masculino" : i < 37 ? "Feminino" : "" })))["Deputado Federal"]!.perfil!.genero;
    expect(tiny).toEqual({ [OUTRAS]: 40 });
  });

  test("every published count is at least the minimum, in every facet and in the expected composition", () => {
    const list = many(60, (i) => ({
      genero: i % 29 === 0 ? "Feminino" : "Masculino", corRaca: ["BRANCA", "PARDA", "PRETA", "AMARELA", "INDÍGENA"][i % 5 === 0 ? 0 : i % 17 === 0 ? 4 : 1],
      ficha: { instrucao: i < 3 ? "LÊ E ESCREVE" : "SUPERIOR COMPLETO", nascimento: `${1950 + (i % 40)}-06-15` }, prev: { p: 0.1 },
    }));
    const p = aggregate(list)["Deputado Federal"]!.perfil!;
    for (const f of ["genero", "cor", "instrucao", "idade"] as const) {
      expect(Object.values(p[f]).every((n) => n >= MIN_CELL)).toBe(true);
      expect(Object.values(p[f]).reduce((a, b) => a + b, 0)).toBe(60); // folding loses nobody
      expect(Object.keys(p.esperado![f]).sort()).toEqual(Object.keys(p[f]).sort()); // same buckets
      expect(Object.values(p.esperado![f]).reduce((a, b) => a + b, 0)).toBeCloseTo(6, 5); // 60 x 0.1
    }
  });

  test("output carries no person: no names, ids, CPF-shaped text or free-text fields", () => {
    const list = many(MIN_PERFIL, (i) => ({ nome: `FULANO ${i} DE TAL`, id: `sq-${i}`, cpf: "123.456.789-09", urna: "Zé" }));
    const json = JSON.stringify(aggregate(list));
    expect(json).not.toMatch(/FULANO|sq-\d|Zé|urna|nome/);
    expect(json).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });
});

describe("foldMap", () => {
  const fold = (counts: Record<string, number>) => { const m = foldMap(counts); return Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, m[k]]).filter(([k, v]) => v !== k)); };
  test("nothing is folded when every category is big enough", () => {
    expect(fold({ A: 20, B: 5, C: 30 })).toEqual({});
  });
  test("small categories that add up to the minimum share one bucket", () => {
    expect(fold({ A: 20, B: 2, C: 2, D: 3 })).toEqual({ B: OUTRAS, C: OUTRAS, D: OUTRAS });
  });
  test("a lone small category cannot be read off as the total minus the others, so a neighbour joins it", () => {
    // 2 alone would be total - visible; with the next smallest (6) the bucket is 8 and hides which of the two is small.
    expect(fold({ A: 30, B: 6, C: 2 })).toEqual({ B: OUTRAS, C: OUTRAS });
  });
  test("ties fold in a fixed order, so the same data always gives the same file", () => {
    expect(fold({ Z: 1, A: 1, M: 9 })).toEqual(fold({ M: 9, A: 1, Z: 1 }));
    expect(fold({ Z: 2, A: 2, B: 2, M: 50 })).toEqual({ Z: OUTRAS, A: OUTRAS, B: OUTRAS });
  });
});

describe("aggregateAgenda", () => {
  const agenda = { temas: { impostos: { nome: "Impostos", votos: [{ id: "v1", proposicao: "PL 1", resumo: "r1", posicao: "Não" }, { id: "v2", proposicao: "PL 2", resumo: "r2", posicao: "Sim" }] } } };
  const dep = (partido: string, votos: Record<string, string>) => ({ ...cand({ partido }), mandato: { agenda: { votos } } });

  test("counts yes, no and other per party; a missing vote counts for nobody", () => {
    const a = aggregateAgenda([dep("AAA", { v1: "Sim", v2: "Não" }), dep("AAA", { v1: "Abstenção" }), dep("AAA", {})], agenda);
    expect(a.partidos.AAA!.n).toBe(3);
    expect(a.partidos.AAA!.votos.v1).toEqual([1, 0, 1]);
    expect(a.partidos.AAA!.votos.v2).toEqual([0, 1, 0]); // two deputies did not vote on v2
    expect(a.votacoes.map((v) => v.tema)).toEqual(["Impostos", "Impostos"]);
  });

  test("candidacies without a mandate are not deputies and must not appear", () => {
    const a = aggregateAgenda([cand({ partido: "ZZZ" }), dep("AAA", { v1: "Sim" })], agenda);
    expect(Object.keys(a.partidos)).toEqual(["AAA"]);
  });
});
