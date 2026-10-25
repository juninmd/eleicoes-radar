import { describe, expect, test } from "bun:test";
import { createProjecao } from "./apuracao-projecao-estado.js";
import { chance } from "./apuracao-chance.js";
import { curva, deChance, deProjecao, nivelDe, registrarPrev } from "./apuracao-previsao.js";
import { dominio, renderPrevisao } from "./apuracao-previsao-view.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";
import type { Previsao, LadoPrev } from "./apuracao-previsao.js";
import type { PrevProps } from "./apuracao-previsao-view.js";
import type { LeituraChance, ParteChance } from "./apuracao-chance.js";
import type { Apuracao, Fase } from "./apuracao-tse.js";

const VENCEDOR = /\b(vencer[áa]?|venceu|vai ganhar|ser[áa] eleit[oa]s?|vencedor[ae]?s?)\b/i;
const cor = createCores(PALETA);
const avatar = (c: { id: string }, size: string) => `<i class="av ${size}" data-foto="${c.id}"></i>`;

const arq = (hora: string, { apto, apurado, validos, votos, fase = "parcial" }: { apto: number; apurado: number; validos: number; votos: Record<string, number>; fase?: Fase }) => ({
  fase, versao: { data: "04/10/2026", hora }, eleitorado: { apto, apurado }, votos: { validos }, secoes: { total: 100, totalizadas: Math.round((apurado / apto) * 100) },
  candidatos: Object.entries(votos).map(([id, v]) => ({ id, nome: `NOME ${id}`, partido: `P${id}`, votos: v })),
}) as unknown as Apuracao;
const SP = arq("20:00:00", { apto: 10000, apurado: 5000, validos: 4000, votos: { A: 2000, B: 1800, C: 200 } });
const BA = arq("20:00:00", { apto: 8000, apurado: 2000, validos: 1600, votos: { A: 500, B: 1000, C: 100 } });
const pesq = (id: string) => (id === "A" ? { fonte: "pesquisas" as const, media: 0.46, lo: 0.42, hi: 0.5 } : id === "B" ? { fonte: "modelo" as const, media: 0.3 } : null);

describe("nivelDe", () => {
  test("names the zone of the chance, with the edges going to the stronger zone", () => {
    expect([0.5, 0.599, 0.6, 0.799, 0.8, 0.949, 0.95, 0.999].map(nivelDe)).toEqual(["aberta", "aberta", "leve", "leve", "clara", "clara", "ampla", "ampla"]);
  });
});

describe("previsão do 1º turno (da Projeção)", () => {
  const l = createProjecao().ler([["SP", SP], ["BA", BA]]);
  const p = deProjecao(l, pesq)!;

  test("the favourite is the one with the larger chance of ending ahead, and the two chances add to 1", () => {
    expect(p.turno).toBe(1);
    expect(p.favorito.chance).toBeGreaterThanOrEqual(p.outro.chance);
    expect(p.favorito.chance + p.outro.chance).toBeCloseTo(1, 10);
    expect(p.nivel).toBe(nivelDe(p.favorito.chance));
    expect(new Set([p.favorito.id, p.outro.id])).toEqual(new Set(["A", "B"]));
  });

  test("count, simulation and polls are read for each one; a model number is not a poll", () => {
    const a = [p.favorito, p.outro].find((x) => x.id === "A")!, b = [p.favorito, p.outro].find((x) => x.id === "B")!;
    expect(a.apuracao).toBeCloseTo(2500 / 5600, 10);
    expect(a.pesquisa).toEqual({ media: 0.46, lo: 0.42, hi: 0.5 });
    expect(b.pesquisa).toBeNull(); // fonte "modelo": the Radar's model is not a poll average
    for (const x of [a, b]) { expect(x.mc[0]).toBeLessThanOrEqual(x.mc[1]); expect(x.mc[1]).toBeLessThanOrEqual(x.mc[2]); }
  });

  test("how much is still to come and the chance of a runoff come along; a part with no votes gives nothing", () => {
    expect(p.faltam).toBeGreaterThan(0);
    expect(p.contados).toBeGreaterThan(0);
    expect(p.contados).toBeLessThan(1);
    expect(p.decideNoPrimeiro! + p.segundoTurno!).toBeCloseTo(1, 10);
    expect(deProjecao(null, pesq)).toBeNull();
    expect(deProjecao(createProjecao().ler([["SP", null]]), pesq)).toBeNull();
  });
});

describe("previsão do 2º turno (da Chance ao vivo)", () => {
  const partes: ParteChance[] = [{ id: "SP", a: 300, b: 200, restante: 500, prior: 0.5, esperado: 1000 }, { id: "ZZ", a: 0, b: 0, restante: 40, prior: 0.4, esperado: 40 }];
  const leitura = (ancora: number | null = null, ps = partes): LeituraChance => ({ chance: chance(ps, { sigmaComum: 0.16, sigmaParte: 0.11 }), partes: ps, ancora, erros: null });
  const a = { id: "a1", nome: "ANA SOUZA", partido: "AAA" }, b = { id: "b2", nome: "BETO LIMA", partido: "BBB" };

  test("the poll anchor is the share of A among the votes of one or the other: B has the rest; without it there is no poll row", () => {
    const p = deChance(leitura(0.52), a, b)!;
    const A = [p.favorito, p.outro].find((x) => x.id === "a1")!, B = [p.favorito, p.outro].find((x) => x.id === "b2")!;
    expect(A.pesquisa!.media).toBeCloseTo(0.52, 10);
    expect(B.pesquisa!.media).toBeCloseTo(0.48, 10);
    expect(deChance(leitura(null), a, b)!.favorito.pesquisa).toBeNull();
  });

  test("the count is each one's share of the two, and the band of B is the mirror of A's", () => {
    const p = deChance(leitura(), a, b)!;
    const A = [p.favorito, p.outro].find((x) => x.id === "a1")!, B = [p.favorito, p.outro].find((x) => x.id === "b2")!;
    expect(A.apuracao).toBeCloseTo(0.6, 10);
    expect(B.apuracao).toBeCloseTo(0.4, 10);
    expect(B.mc[0]).toBeCloseTo(1 - A.mc[2], 10);
    expect(B.mc[1]).toBeCloseTo(1 - A.mc[1], 10);
    expect(p.turno).toBe(2);
    expect(p.faltam).toBe(540);
    expect(p.decideNoPrimeiro).toBeNull();
  });

  test("before any vote the model alone speaks, so the count is empty; no model answer, no forecast", () => {
    const sem = [{ ...partes[0]!, a: 0, b: 0, restante: 1000 }];
    expect(deChance(leitura(null, sem), a, b)!.favorito.apuracao).toBeNull();
    expect(deChance({ ...leitura(), chance: null }, a, b)).toBeNull();
    expect(deChance(null, a, b)).toBeNull();
  });
});

describe("curva da noite", () => {
  const p = (fav: string, out: string, chanceFav: number): Previsao => ({ favorito: { id: fav, chance: chanceFav } as LadoPrev, outro: { id: out, chance: 1 - chanceFav } as LadoPrev } as Previsao);
  // The file's own date and time, as registrarPrev reads them.
  const at = (hora: string, data = "04/10/2026") => ({ versao: { data, hora } });

  test("one point per version of the file; the same version again, or an older one, changes nothing", () => {
    let h = registrarPrev([], p("A", "B", 0.6), at("19:00:00"));
    expect(registrarPrev(h, p("A", "B", 0.7), at("19:00:00"))).toBe(h);
    h = registrarPrev(h, p("A", "B", 0.7), at("19:01:00"));
    expect(registrarPrev(h, p("A", "B", 0.1), at("18:59:00"))).toBe(h);
    expect(h.map((x) => x.pa)).toEqual([0.6, 0.7]);
  });

  test("the curve keeps going past midnight: 00:05 of the next day is newer than 23:58 of the day before", () => {
    let h = registrarPrev([], p("A", "B", 0.6), at("23:58:00", "04/10/2026"));
    h = registrarPrev(h, p("A", "B", 0.7), at("00:05:00", "05/10/2026"));
    expect(h.map((x) => x.pa)).toEqual([0.6, 0.7]);
  });

  test("a file without a usable date is compared by its hour: the same hour again changes nothing, an older hour is ignored", () => {
    const semData = (hora: string) => ({ versao: { hora } });
    let h = registrarPrev([], p("A", "B", 0.6), semData("19:00:00"));
    h = registrarPrev(h, p("A", "B", 0.7), semData("19:00:00"));
    h = registrarPrev(h, p("A", "B", 0.8), semData("18:00:00"));
    expect(h.map((x) => x.pa)).toEqual([0.6]);
  });

  test("the curve is the chance of the current favourite: when the lead changes hands the old points are turned around", () => {
    let h = registrarPrev([], p("A", "B", 0.7), at("19:00:00"));
    h = registrarPrev(h, p("B", "A", 0.55), at("19:01:00"));
    const c = curva(h, p("B", "A", 0.55));
    expect(c.map((x) => x.p)).toEqual([expect.closeTo(0.3, 10), 0.55]);
  });

  test("another pair of leaders is another curve, and the memory is bounded", () => {
    let h = registrarPrev([], p("A", "B", 0.7), at("19:00:00"));
    h = registrarPrev(h, p("A", "C", 0.9), at("19:01:00"));
    expect(curva(h, p("A", "C", 0.9))).toHaveLength(1);
    let longo: ReturnType<typeof registrarPrev> = [];
    for (let i = 0; i < 300; i++) longo = registrarPrev(longo, p("A", "B", 0.5), at(`${String(10 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`));
    expect(longo.length).toBe(240);
  });
});

describe("view da Previsão", () => {
  const lado = (id: string, nome: string, chanceX: number, over: Partial<LadoPrev> = {}): LadoPrev => ({ id, nome, partido: `P${id}`, chance: chanceX, pesquisa: { media: 0.45, lo: 0.41, hi: 0.49 }, apuracao: 0.47, mc: [0.46, 0.48, 0.5], ...over });
  const prev = (over: Partial<Previsao> = {}, f = lado("a1", "ANA SOUZA", 0.82), o = lado("b2", "BETO LIMA", 0.18)): Previsao => ({ turno: 1, favorito: f, outro: o, nivel: nivelDe(f.chance), n: 2000, contados: 0.6, faltam: 3_400_000, decideNoPrimeiro: 0.2, segundoTurno: 0.8, defasadas: [], ...over });
  const props = (over: Partial<PrevProps> = {}): PrevProps => ({ estado: "ok", previsao: prev(), hist: [], avatar, cor, ...over });

  test("compacto: cabe numa tela e guarda o detalhe em details", () => {
    const html = renderPrevisao(props({ compacto: true }));
    expect(html).toContain("prev prev-compacto");
    expect(html).toContain("prev-tab");
    expect(html).toContain("As três leituras e a curva");
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(html).not.toContain("prev-main"); // o bloco grande fica no modo completo
  });

  test("says it is the Radar's estimate, names who is likely to end ahead with the photo and the chance, and never says a winner", () => {
    const html = renderPrevisao(props());
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(html).toContain("deve terminar à frente");
    expect(html).toContain("Vantagem clara");
    expect(html.match(/data-foto="a1"/g)).toHaveLength(1);
    expect(html).toContain("Em 1.640 dos 2.000 sorteios");
    expect(html).not.toMatch(VENCEDOR);
  });

  test("a close race does not claim a leader: 'aparece à frente, por pouco', and the zone is named", () => {
    const html = renderPrevisao(props({ previsao: prev({}, lado("a1", "ANA SOUZA", 0.55), lado("b2", "BETO LIMA", 0.45)) }));
    expect(html).toContain("aparece à frente, por pouco");
    expect(html).toContain("Disputa aberta");
    expect(html).not.toContain("deve terminar à frente");
  });

  test("the three readings of each of the two, on one ruler each; the order is favourite first", () => {
    const html = renderPrevisao(props());
    expect(html.match(/class="prev-leit"/g)).toHaveLength(2);
    expect(html.indexOf("Ana Souza")).toBeLessThan(html.indexOf("Beto Lima"));
    for (const w of ["Pesquisas", "Apuração", "Monte Carlo"]) expect(html.match(new RegExp(`</i>${w}</span>`, "g"))).toHaveLength(2);
    expect(html).toContain("faixa 41,0 a 49,0");
    expect(html).toContain("faixa 46,0 a 50,0");
  });

  test("no poll for a candidate: the row says so instead of inventing one; no votes yet: the count row is empty", () => {
    const html = renderPrevisao(props({ previsao: prev({}, lado("a1", "ANA SOUZA", 0.82, { pesquisa: null, apuracao: null })) }));
    expect(html).toContain("sem média de pesquisas");
    expect(html).toContain("sem votos");
  });

  test("no vote counted yet: the card says it is a preview that only repeats the polls", () => {
    const html = renderPrevisao(props({ previsao: prev({}, lado("a1", "ANA SOUZA", 0.82, { apuracao: null })) }));
    expect(html).toContain("Prévia, sem votos apurados");
    expect(html).toContain("só repete as pesquisas");
    expect(html).not.toContain("deve terminar à frente");
  });

  test("never a false 0% or 100%, and a chance beyond 99% reads as such on the photo too", () => {
    const html = renderPrevisao(props({ previsao: prev({}, lado("a1", "ANA SOUZA", 0.9995), lado("b2", "BETO LIMA", 0.0005)) }));
    expect(html).toContain("mais de 99%");
    expect(html).toContain("menos de 1%");
    expect(html).toContain("&gt;99%");
    const dito = [/<p class="prev-nums">.*?<\/p>/s, /prev-pct">.*?<\/b>/s, /<dt>Final esperado.*?<\/dd>/s].map((r) => r.exec(html)![0]).join(" ");
    expect(dito).not.toMatch(/(^|[^\d,.])(100|0)%/);
  });

  test("1st round adds the chance of a runoff; the runoff does not", () => {
    expect(renderPrevisao(props())).toContain("Chance de 2º turno");
    const r2 = renderPrevisao(props({ previsao: prev({ turno: 2, decideNoPrimeiro: null, segundoTurno: null }) }));
    expect(r2).not.toContain("Chance de 2º turno");
    expect(r2).toContain("Presidente · Brasil · 2º turno");
  });

  test("files the feed kept after a failure are named", () => {
    const html = renderPrevisao(props({ previsao: prev({ defasadas: ["SP", "RJ"] }) }));
    expect(html).toContain("Números desatualizados");
    expect(html).toContain("2 arquivos (SP, RJ) usam o último recebido");
    expect(renderPrevisao(props())).not.toContain("Números desatualizados");
  });

  test("the curve of the night: a hint until there are two points, then the line with its end", () => {
    expect(renderPrevisao(props())).toContain("segunda atualização do TSE");
    const h = [{ hora: "19:00:00", t: 1, a: "a1", b: "b2", pa: 0.6 }, { hora: "19:01:00", t: 2, a: "a1", b: "b2", pa: 0.82 }];
    const html = renderPrevisao(props({ hist: h }));
    expect(html).toContain('aria-label="Chance de Ana Souza terminar à frente, de 60% às 19:00 a 82% às 19:01"');
    expect(html).toContain('class="linha"');
    expect(html).not.toContain("segunda atualização do TSE");
  });

  test("while the files load it says how many answered; with no votes it says why there is nothing; a finished count defers to the TSE", () => {
    expect(renderPrevisao({ estado: "carregando", avatar, cor, arquivos: { chegaram: 12, esperados: 28 } })).toContain("12 de 28 arquivos do TSE responderam");
    expect(renderPrevisao(props({ previsao: null }))).toContain("Ainda não há votos apurados");
    const fim = renderPrevisao({ estado: "concluida", avatar, cor });
    expect(fim).toContain("vale o resultado do TSE");
    expect(fim).not.toContain("prev-leit");
    expect(renderPrevisao({ estado: "sem-disputa", avatar, cor })).toContain("não tem 2º turno");
  });

  test("names come out escaped", () => {
    const html = renderPrevisao(props({ previsao: prev({}, lado("a1", "<IMG SRC=X>", 0.82)) }));
    expect(html).not.toContain("<IMG");
    expect(html).toContain("&lt;");
  });

  test("the axis fits what is on it and keeps a minimum width", () => {
    const [lo, hi] = dominio(lado("a1", "A", 0.8));
    expect(lo).toBeLessThanOrEqual(0.41 - 0.04 + 1e-9);
    expect(hi).toBeGreaterThanOrEqual(0.5 + 0.04 - 1e-9);
    const [l2, h2] = dominio(lado("a1", "A", 0.8, { pesquisa: null, apuracao: 0.3, mc: [0.3, 0.3, 0.3] }));
    expect(h2 - l2).toBeGreaterThanOrEqual(0.16 - 1e-9);
    expect(l2).toBeGreaterThanOrEqual(0);
  });
});

