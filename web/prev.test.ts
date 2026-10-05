import { expect, test } from "bun:test";
import type { Candidatura } from "./types.js";
import { chance, diasAntes, frescor, leitura, porque, prevBlock, rangeBar, rotulo, tendencia } from "./prev.js";

// Fixtures carry only the fields the code under test reads.
const fx = (o: object) => o as Candidatura;
const cand = (nome: string, media: number, lo: number, hi: number, extra = {}): Candidatura => fx({ id: nome, urna: nome, nome, partido: "PT", cargo: "Governador", uf: "SP", fin: { total: 0 }, prev: { p: 0.5, media, lo, hi, fonte: "pesquisas", ...extra } });

test("probability bands never overlap and cover 0 to 1", () => {
  expect(rotulo(0.9).txt).toBe("muito provável");
  expect(rotulo(0.85).txt).toBe("muito provável");
  expect(rotulo(0.84).txt).toBe("provável");
  expect(rotulo(0.3).txt).toBe("disputa aberta");
  expect(rotulo(0.05).txt).toBe("possível");
  expect(rotulo(0).txt).toBe("improvável");
  expect(rotulo(1).tom).toBe("alta");
});

test("chance never shows a false 0% or 100%", () => {
  expect(chance(0.999)).toBe(">99%");
  expect(chance(0.001)).toBe("<1%");
  expect(chance(0)).toBe("0%");
  expect(chance(0.123)).toBe("12%");
});

test("a move under half a point is called stable, not a trend", () => {
  expect(tendencia(0.004)!.txt).toBe("estável");
  expect(tendencia(-0.004)!.tom).toBe("flat");
  expect(tendencia(0.021)).toMatchObject({ seta: "▲", txt: "+2,1 p.p.", tom: "up" });
  expect(tendencia(-0.0349)).toMatchObject({ seta: "▼", txt: "−3,5 p.p.", tom: "down" });
  expect(tendencia(null)).toBeNull();
  expect(tendencia(undefined)).toBeNull();
});

test("poll age is counted back from election day (4 Oct), not from today", () => {
  expect(diasAntes("2026-10-03")).toBe(1);
  expect(frescor("2026-10-03")).toBe("1 dia antes da eleição");
  expect(frescor("2026-09-27")).toBe("7 dias antes da eleição");
  expect(frescor("2026-10-04")).toBe("no dia da eleição");
  expect(frescor(null)).toBe("");
});

test("lead reading says whether the 90% bands touch", () => {
  const apart = leitura(cand("Ana", 0.55, 0.5, 0.6), cand("Beto", 0.3, 0.25, 0.35));
  expect(apart).toContain("25,0 p.p.");
  expect(apart).toContain("não se cruzam");
  const close = leitura(cand("Ana", 0.42, 0.36, 0.48), cand("Beto", 0.4, 0.34, 0.46));
  expect(close).toContain("se cruzam");
  expect(close).not.toContain("não se cruzam");
});

test("the leader by win chance can trail on first-round average: say so instead of a negative lead", () => {
  const txt = leitura(cand("Ana", 0.3, 0.25, 0.35), cand("Beto", 0.34, 0.3, 0.4));
  expect(txt).toContain("Beto aparece à frente no 1º turno por 4,0 p.p.");
  expect(txt).toContain("2º turno");
  expect(leitura(cand("Ana", 0.3, 0.25, 0.35), null)).toBe("");
});

test("candidate names are escaped in generated text", () => {
  expect(leitura(cand("<b>x</b>", 0.55, 0.5, 0.6), cand("Beto", 0.3, 0.25, 0.35))).not.toContain("<b>x</b>");
});

test("deputy explanation lists facts, and under 1% says the model sees little", () => {
  const dep = { ...cand("Cris", 0, 0, 0), fin: { total: 1_500_000 }, ficha: { federacao: "Federação Brasil da Esperança - FE BRASIL" }, prev: { p: 0.62, fonte: "modelo", ex: { r: 3, g: 1200, lr: 1, ln: 20, vl: 4.2, dep: true } } };
  const lines = porque(fx(dep)).join(" ");
  expect(lines).toContain("3ª maior arrecadação");
  expect(lines).toContain("FE BRASIL");
  expect(lines).toContain("4,2");
  expect(lines).toContain("ocupação de deputado");
  expect(porque(fx({ ...dep, prev: { p: 0.004, fonte: "modelo" } }))[0]).toContain("menos de 1%");
  expect(porque(fx({ ...dep, fin: { total: 0 } }))[0]).toContain("Sem receita");
});

test("a number that repeats the party's is named in the explanation, and only then", () => {
  const base = { ...cand("Cris", 0, 0, 0), num: "2222", fin: { total: 1_500_000 }, prev: { p: 0.62, fonte: "modelo", ex: { r: 3, g: 1200, lr: 1, ln: 20, vl: 4.2, dep: false, rep: true } } };
  expect(porque(fx(base)).join(" ")).toContain("<b>2222</b> repete o do partido");
  const plain = { ...base, num: "2223", prev: { ...base.prev, ex: { ...base.prev.ex, rep: false } } };
  expect(porque(fx(plain)).join(" ")).not.toContain("repete o do partido");
  const old = { ...base, prev: { ...base.prev, ex: { r: 3, g: 1200, lr: 1, ln: 20, vl: 4.2, dep: false } } }; // data built before the feature existed
  expect(porque(fx(old)).join(" ")).not.toContain("repete o do partido");
});

test("the previous election is explained with its year, and only for who has something to say", () => {
  const ex = { r: 3, g: 1200, lr: 1, ln: 20, vl: 4.2, dep: false, rep: false };
  const base = { ...cand("Cris", 0, 0, 0), cargo: "Deputado Federal", fin: { total: 1_500_000 }, prev: { p: 0.62, fonte: "modelo", ex: { ...ex, el: true, ps: 0.0123, lp: 0.31 } } };
  const lines = porque(fx(base), 2022).join(" ");
  expect(lines).toContain("Foi eleito(a) deputado(a) em 2022");
  expect(lines).toContain("Teve <b>1,2%</b> dos votos para Deputado Federal no estado em 2022");
  expect(lines).toContain("partidos da lista somaram <b>31,0%</b>");
  const fresh = porque(fx({ ...base, prev: { ...base.prev, ex: { ...ex, el: false, ps: null, lp: 0 } } }), 2022).join(" ");
  expect(fresh).not.toContain("Foi eleito");
  expect(fresh).not.toContain("Teve <b>");
  expect(fresh).not.toContain("partidos da lista");
  expect(porque(fx({ ...base, prev: { ...base.prev, ex } })).join(" ")).not.toContain("Foi eleito"); // data built before the feature existed
});

test("a probable deputy whose data has no explanation says so instead of claiming under 1%", () => {
  const stale = { ...cand("Cris", 0, 0, 0), prev: { p: 0.62, fonte: "modelo" } };
  expect(porque(fx(stale))[0]).toContain("não veio nesta versão");
  expect(porque(fx(stale)).join(" ")).not.toContain("menos de 1%");
  expect(porque(fx({ ...stale, prev: { p: 0.0049, fonte: "modelo" } }))[0]).toContain("menos de 1%");
  expect(chance(0.0049)).toBe("<1%"); // the same threshold the number on screen uses
  expect(chance(0.005)).toBe("1%");
});

test("the 90% band is available as text, not only as a tooltip", () => {
  const html = rangeBar({ media: 0.42, lo: 0.36, hi: 0.48 }, 0.5, "Ana");
  expect(html).toContain('class="sr"');
  expect(html).toContain("faixa de 90% de 36,0% a 48,0%");
});

test("dossier block places the candidate in the race and reads the simulation count from the data", () => {
  const exp = { metodo: { simulacoes: 20000 }, corridas: [{ cargo: "Governador", uf: "SP", candidatos: ["Beto", "Ana"], ultima: "2026-10-03" }] };
  const html = prevBlock(fx({ ...cand("Ana", 0.3, 0.25, 0.35, { tend: 0.02, p2t: 0.4 }), prev: { p: 0.3, media: 0.3, lo: 0.25, hi: 0.35, fonte: "pesquisas", tend: 0.02, p2t: 0.4 } }), exp);
  expect(html).toContain("2º de 2</b> em chance de vencer"); // candidatos are ordered by win chance, not by average
  expect(html).not.toContain("na média das pesquisas");
  expect(html).toContain("disputa aberta");
  expect(html).toContain("1 dia antes da eleição");
  expect(html).toContain("20.000");
  expect(prevBlock(fx({ ...cand("Z", 0, 0, 0), prev: null }), exp)).toBe("");
});

test("the election the model looked back at comes from the model, in every sentence that names it", () => {
  const dep = { ...cand("Cris", 0, 0, 0), fin: { total: 1_500_000 }, prev: { p: 0.004, fonte: "modelo" } };
  expect(porque(fx(dep), 2018)[0]).toContain("quem se elegeu em 2018");
  expect(porque(fx(dep), 2018)[0]).not.toContain("2022");
  expect(porque(fx({ ...dep, prev: { p: 0.62, fonte: "modelo", ex: { r: 3, g: 9, lr: 1, ln: 5, vl: 2, dep: false, rep: false, el: true, ps: 0.031, lp: 0.2 } } }), 2018).join(" ")).toContain("em 2018");
});
