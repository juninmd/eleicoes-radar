import { expect, test } from "bun:test";
import { PAN_MODES, renderPanorama, vozDoVoto } from "./panorama.js";
import type { PanCtx, Panorama } from "./panorama.js";
import type { Apuracao } from "./apuracao-tse.js";
import type { CargoAgg, PartyAgg, Perfil } from "../src/radar/panorama";
import { FACETS, MIN_CELL, MIN_PERFIL, OUTRAS } from "./pan-perfil.js";
import { agendaView, partidosView } from "./pan-partidos.js";
import { aggregate, cor, genero, idade, instrucao, MIN_CELL as AGG_MIN_CELL, MIN_PERFIL as AGG_MIN_PERFIL, OUTRAS as AGG_OUTRAS } from "../src/radar/panorama.js";

type Cand = Parameters<typeof genero>[0];

const party = (o: Partial<PartyAgg> = {}): PartyAgg => ({ n: 5, comReceita: 4, total: 1000, publico: 600, partido: 200, pf: 200, proprio: 0, outros: 0, mediana: 250, mulheres: 2, vagas: 1.5, comCanal: 3, redes: { instagram: 3, tiktok: 1 }, ...o });
const CONC = [0.5, 0.7, 0.8, 0.9, 0.95, 0.97, 0.98, 0.99, 1, 1];
const agg = (o: Partial<CargoAgg> = {}): CargoAgg => ({
  n: 40, comReceita: 30, fontes: { publico: 1600, partido: 500, pf: 400, proprio: 0, outros: 0 },
  partidos: { AAA: party(), BBB: party({ n: 2, total: 500, publico: 100, partido: 400, pf: 0, mulheres: 1, vagas: 0.5 }), CCC: party({ n: 0, total: 0, publico: 0, partido: 0, pf: 0, mediana: 0, mulheres: 0, vagas: 0 }) },
  conc: CONC, perfil: null, ...o,
});
const perfil = (esperado: Perfil["esperado"]): Perfil => ({
  genero: { Feminino: 12, Masculino: 28 }, cor: { Branca: 20, Parda: 20 }, instrucao: { "Superior completo": 40 }, idade: { "35–44": 30, "45–54": 10 }, esperado,
});
const pan = (o: Partial<Panorama> = {}): Panorama => ({
  geradoEm: "2026-10-04T12:00:00Z",
  escopos: { SP: { "Deputado Federal": agg({ perfil: perfil(null) }), Governador: agg() }, BR: { "Deputado Federal": agg({ n: 513, perfil: perfil(null) }), Presidente: agg({ n: 9 }) } },
  agenda: { votacoes: [{ id: "v1", tema: "Impostos", proposicao: "PL 1/2025", resumo: "Resumo", posicao: "Não" }], partidos: { AAA: { n: 6, votos: { v1: [4, 1, 1] } }, BBB: { n: 3, votos: { v1: [0, 0, 3] } } } },
  ...o,
});
const ctx = (o: Partial<PanCtx> = {}): PanCtx => ({ modo: "partidos", pan: pan(), cargo: "Deputado Federal", uf: "SP", cands: [], ...o });
const cand = (id: string, cargo: string, partido: string, coligacao = "", federacao = "") => ({ id, cargo, partido, uf: "SP", nome: `Fulano ${id}`, ficha: { coligacao, federacao } });

test("without the aggregate file every tab says how to generate it instead of failing", () => {
  for (const modo of Object.keys(PAN_MODES)) expect(renderPanorama(ctx({ modo, pan: null }))).toContain("radar:panorama");
});

test("the presidential race has no scope switch; a state race offers its state and the whole country", () => {
  expect(renderPanorama(ctx({ cargo: "Presidente", uf: "BR" }))).not.toContain("data-pan-escopo");
  const html = renderPanorama(ctx());
  expect(html).toContain("Meu estado (SP)");
  expect(html).toContain('data-pan-escopo="br" aria-pressed="false"');
});

test("choosing the whole country reads the national aggregate, not the state one", () => {
  expect(renderPanorama(ctx({ modo: "perfil", escopo: "br" }))).toContain("513");
  expect(renderPanorama(ctx({ modo: "perfil", escopo: "uf" }))).not.toContain("513");
});

test("a race missing from the aggregate is reported, not drawn empty", () => {
  expect(renderPanorama(ctx({ cargo: "Senador", modo: "dinheiro" }))).toContain("Sem candidaturas a Senador em SP");
});

test("party names and candidate names are escaped in every tab", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const p = pan();
  p.escopos.SP["Deputado Federal"].partidos[evil] = party({ vagas: 3 });
  p.agenda.partidos[evil] = { n: 5, votos: { v1: [1, 1, 0] } };
  const cands = [cand("1", "Governador", "PL", `${evil}: PL / PP`), cand("2", "Governador", "PP", `${evil}: PL / PP`)];
  for (const modo of Object.keys(PAN_MODES)) {
    expect(renderPanorama(ctx({ modo, pan: p, cands, cargo: modo === "aliancas" ? "Governador" : "Deputado Federal" }))).not.toContain("<img src=x");
  }
});

test("no tab prints NaN, undefined or Infinity, even with empty parties and a single candidacy", () => {
  const p = pan();
  p.escopos.SP["Deputado Federal"].partidos.DDD = party({ n: 1, total: 0, publico: 0, mediana: 0, mulheres: 0, vagas: 0 });
  const cands = [cand("1", "Deputado Federal", "PT", "", "FEDERAÇÃO X - FE"), cand("2", "Deputado Federal", "PCdoB", "", "FEDERAÇÃO X - FE")];
  for (const modo of Object.keys(PAN_MODES)) {
    for (const metrica of ["total", "n", "publico", "mulheres", "vagas"]) {
      expect(renderPanorama(ctx({ modo, pan: p, cands, metrica }))).not.toMatch(/NaN|undefined|Infinity/);
    }
  }
});

test("a party with fewer than three candidacies gets no percentage: one or two people do not describe a party", () => {
  const html = renderPanorama(ctx({ metrica: "mulheres" }));
  const row = html.match(/<li class="pan-row">(?:(?!<\/li>).)*BBB(?:(?!<\/li>).)*<\/li>/s)![0];
  expect(row).toContain(">–<");
  expect(html).toContain("menos de 3 candidaturas");
});

test("a withheld women count (null, or missing in an older export) shows a dash, never 0%", () => {
  const p = pan();
  const parties = p.escopos.SP["Deputado Federal"].partidos;
  parties.AAA.mulheres = null; // n = 5, so only the file's withholding can explain the dash
  delete (parties.BBB as Partial<PartyAgg>).mulheres;
  const html = renderPanorama(ctx({ pan: p, metrica: "mulheres" }));
  const row = html.match(/<li class="pan-row">(?:(?!<\/li>).)*AAA(?:(?!<\/li>).)*<\/li>/s)![0];
  expect(row).toContain('<b class="pan-v">–</b>'); // the printed value, not the bar's width
  expect(html).toContain("menos de 5 mulheres");
  expect(html).not.toMatch(/NaN|undefined|Infinity/);
  const cells = [...html.matchAll(/<tr><th scope="row">(AAA|BBB)<\/th>(.*?)<\/tr>/gs)].map((m) => [...m[2].matchAll(/<td class="num">(.*?)<\/td>/g)].map((c) => c[1])[4]);
  expect(cells).toEqual(["–", "–"]); // the table's Mulheres column
});

test("an unknown metric falls back to money, and seats appear only when some party has them", () => {
  expect(renderPanorama(ctx({ metrica: "xyz" }))).toContain('data-pan-metrica="total" aria-pressed="true"');
  const p = pan();
  for (const x of Object.values(p.escopos.SP["Deputado Federal"].partidos)) x.vagas = 0;
  expect(renderPanorama(ctx({ pan: p }))).not.toContain('data-pan-metrica="vagas"');
});

test("single-seat races call the model output a chance, deputies call it expected seats", () => {
  expect(renderPanorama(ctx({ cargo: "Governador" }))).toContain("Chance de eleição");
  expect(renderPanorama(ctx({ cargo: "Deputado Federal" }))).toContain("Vagas esperadas");
});

test("an agenda cell with no Sim or Não vote is blank, not 0% or NaN", () => {
  const html = agendaView(pan().agenda);
  const bbb = html.match(/<tr><th scope="row">BBB.*?<\/tr>/s)![0];
  expect(bbb).toContain('class="nd"');
  expect(bbb).not.toMatch(/0%|NaN/);
  expect(html).toContain("80%"); // AAA: 4 Sim of 5 Sim+Não; the lone "outro" vote is not counted against it
  expect(html).toContain("1 votações da agenda"); // the count comes from the file, not from a constant
});

test("money: the lead quotes public and individual shares of the total, and the bottom half is 1 minus the top-50% share", () => {
  const html = renderPanorama(ctx({ modo: "dinheiro" }));
  expect(html).toMatch(/<b>64%<\/b> veio de fundos públicos e <b>16%<\/b> de pessoas físicas/); // 1600 and 400 of 2500
  expect(html).toContain("30 de 40 candidaturas a Deputado Federal"); // comReceita of n: the others declared nothing
  expect(html).toMatch(/10% que mais arrecadam ficam com <b>50%<\/b>/);
  expect(html).toMatch(/50% que menos arrecadam, com <b>5%<\/b>/); // 1 - 0.95
});

test("money: no declared revenue gives an explanation, and missing concentration data does not break the page", () => {
  const zero = pan();
  zero.escopos.SP["Deputado Federal"] = agg({ fontes: { publico: 0, partido: 0, pf: 0, proprio: 0, outros: 0 } });
  expect(renderPanorama(ctx({ modo: "dinheiro", pan: zero }))).toContain("Ainda sem receita declarada");
  const noConc = pan();
  noConc.escopos.SP["Deputado Federal"] = agg({ conc: [] });
  const html = renderPanorama(ctx({ modo: "dinheiro", pan: noConc }));
  expect(html).toContain("sem receita para medir concentração");
  expect(html).not.toContain("<polyline");
});

test("money: the flow chart folds parties beyond the top ten into one node and keeps the totals", () => {
  const p = pan();
  const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`P${i}`, party({ total: 100 + i, publico: 100 + i, partido: 0, pf: 0 })]));
  p.escopos.SP["Deputado Federal"] = agg({ partidos: many, fontes: { publico: 1500, partido: 0, pf: 0, proprio: 0, outros: 0 } });
  const html = renderPanorama(ctx({ modo: "dinheiro", pan: p }));
  expect(html).toContain("Demais (4)");
  expect(html).toContain("Os 12 maiores de 14 partidos com receita");
});

test("profile: a group too small to show says so and prints no counts that could point at people", () => {
  const html = renderPanorama(ctx({ modo: "perfil", cargo: "Governador" }));
  expect(html).toContain("pouco para agrupar por perfil");
  expect(html).not.toContain("Feminino");
});

test("profile: the expected-seats marker and its explanation appear only when the aggregate carries expected seats", () => {
  const sem = renderPanorama(ctx({ modo: "perfil" }));
  expect(sem).not.toContain("<em");
  expect(sem).not.toContain("vagas esperadas pelo modelo");
  const p = pan();
  p.escopos.SP["Deputado Federal"] = agg({ perfil: perfil({ genero: { Feminino: 20, Masculino: 50 }, cor: { Branca: 40, Parda: 30 }, instrucao: { "Superior completo": 70 }, idade: { "35–44": 70 } }) });
  const com = renderPanorama(ctx({ modo: "perfil", pan: p }));
  expect(com).toContain("<em");
  expect(com).toContain("vagas esperadas pelo modelo");
  expect(com).toContain("30% · 29%"); // Feminino: 12 of 40 candidacies, 20 of 70 expected seats
  expect(com).toContain("não usa gênero, cor ou raça");
  expect(com).toContain("uma estimativa, não um resultado"); // the marker IS the model's expected composition; it must not be disowned as "not a forecast"
  expect(com).not.toContain("não é uma previsão");
});

test("profile: a category of fewer than 5 people is folded away, with its model chance, but still counts in the shares", () => {
  const p = pan();
  const gender = { Feminino: 18, Masculino: 18, "Não informado": 1 };
  p.escopos.SP["Deputado Federal"] = agg({ perfil: { ...perfil(null), cor: { Branca: 36, Indígena: 1 }, genero: gender, esperado: { genero: gender, cor: { Branca: 9, Indígena: 0.4 }, instrucao: { "Superior completo": 9 }, idade: { "35–44": 9 } } } });
  const html = renderPanorama(ctx({ modo: "perfil", pan: p }));
  expect(html).not.toContain("Indígena");
  expect(html).not.toContain("Não informado");
  expect(html).toContain("Categorias com menos de 5 candidaturas não aparecem separadas");
  expect(html).toContain("97%"); // Branca: 36 of 37, the hidden one is not removed from the denominator
});

test("profile: the folded bucket the aggregator writes is shown, with its model chance and a note saying what it is", () => {
  const p = pan();
  const gender = { Feminino: 20, Masculino: 15, [AGG_OUTRAS]: 5 };
  p.escopos.SP["Deputado Federal"] = agg({ perfil: { ...perfil(null), genero: gender, esperado: { genero: { Feminino: 5, Masculino: 3, [AGG_OUTRAS]: 1 }, cor: {}, instrucao: {}, idade: {} } } });
  const html = renderPanorama(ctx({ modo: "perfil", pan: p }));
  expect(html).toContain("Outras categorias");
  expect(html).toContain("foram reunidas em");
  expect(html).not.toContain("não aparecem separadas");
  expect(html).toContain("5 candidaturas"); // the bucket's own sub-label
});

test("profile: the thresholds and the bucket label on screen are the ones the aggregator enforces", () => {
  expect(MIN_CELL).toBe(AGG_MIN_CELL);
  expect(OUTRAS).toBe(AGG_OUTRAS);
  expect(MIN_PERFIL).toBe(AGG_MIN_PERFIL);
  expect(renderPanorama(ctx({ modo: "perfil" }))).toContain(`${MIN_PERFIL} candidaturas ou mais`);
});

test("profile labels are the ones the aggregator writes, so no group is ever dropped from a chart", () => {
  const written = {
    genero: [genero({ genero: "FEMININO" } as Cand), genero({ genero: "masculino" } as Cand), genero({} as Cand)],
    cor: [cor({ corRaca: "BRANCA" } as Cand), cor({ corRaca: "PARDA" } as Cand), cor({ corRaca: "PRETA" } as Cand), cor({ corRaca: "AMARELA" } as Cand), cor({ corRaca: "INDÍGENA" } as Cand), cor({} as Cand)],
    instrucao: ["SUPERIOR COMPLETO", "SUPERIOR INCOMPLETO", "ENSINO MÉDIO COMPLETO", "ENSINO FUNDAMENTAL INCOMPLETO", "LÊ E ESCREVE", "ANALFABETO", ""].map((s) => instrucao({ ficha: { instrucao: s } } as Cand)),
    idade: ["2010-01-01", "2000-01-01", "1990-01-01", "1980-01-01", "1970-01-01", "1960-01-01", "1950-01-01", "x"].map((n) => idade({ ficha: { nascimento: n } } as Cand)),
  };
  for (const f of FACETS) {
    const known = new Set(f.ordem);
    expect(written[f.key].filter((l) => !known.has(l))).toEqual([]);
    expect(new Set(written[f.key]).size).toBeGreaterThan(1);
  }
});

test("alliances: a coalition race lists each list once with its parties and candidates", () => {
  const col = "UNIDOS: PL / PP / FEDERAÇÃO X (1-AAA / 2-BBB)";
  const cands = [cand("1", "Governador", "PL", col), cand("2", "Governador", "PSTU")];
  const html = renderPanorama(ctx({ modo: "aliancas", cargo: "Governador", cands }));
  expect(html).toContain("<b>1</b> aliança reúne <b>4</b> partidos");
  expect(html).toContain("Fulano 1");
  expect(html).toContain("PSTU");
  expect(html).toContain("Sem aliança registrada");
  expect(html).toContain("podem se coligar");
});

test("alliances: for deputies only federations count, and the page says why coalitions are absent", () => {
  const fed = "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL";
  const cands = [cand("1", "Deputado Federal", "PT", "", fed), cand("2", "Deputado Federal", "PCdoB", "", fed), cand("3", "Deputado Federal", "NOVO"), cand("4", "Deputado Federal", "NOVO")];
  const html = renderPanorama(ctx({ modo: "aliancas", cands }));
  expect(html).toContain("Coligação para deputado deixou de existir");
  expect(html).toContain("<b>1</b> aliança reúne <b>2</b> partidos");
  expect(html).toContain("NOVO (2)");
  expect(html).not.toContain("Fulano"); // deputy lists are too long to name candidates; only a count
  expect(html).toContain("2 candidaturas");
  expect(html).not.toContain("Linha fina"); // no coalition line exists for deputies
  expect(renderPanorama(ctx({ modo: "aliancas", cargo: "Governador", cands: [cand("1", "Governador", "PL", "X: PL / PP")] }))).toContain("Linha fina");
});

test("alliances: no registered alliance and no candidacies are told apart", () => {
  const solos = [cand("1", "Governador", "PL"), cand("2", "Governador", "PSOL")];
  expect(renderPanorama(ctx({ modo: "aliancas", cargo: "Governador", cands: solos }))).toContain("todos os partidos concorrem sozinhos");
  expect(renderPanorama(ctx({ modo: "aliancas", cargo: "Governador", cands: [] }))).toContain("Sem candidaturas a Governador em SP");
});

test("alliances are per state: the whole-country switch does not change that tab", () => {
  const cands = [cand("1", "Governador", "PL", "X: PL / PP"), cand("2", "Governador", "PP", "X: PL / PP")];
  const a = renderPanorama(ctx({ modo: "aliancas", cargo: "Governador", cands, escopo: "uf" }));
  expect(renderPanorama(ctx({ modo: "aliancas", cargo: "Governador", cands, escopo: "br" }))).toBe(a);
  expect(a).not.toContain("data-pan-escopo");
});

test("alliances only use candidacies of the state on screen", () => {
  const cands = [cand("1", "Governador", "PL", "X: PL / PP"), { ...cand("2", "Governador", "PSOL", "Y: PSOL / PT"), uf: "RJ" }];
  const html = renderPanorama(ctx({ modo: "aliancas", cargo: "Governador", cands }));
  expect(html).not.toContain("PSOL");
});

test("digital presence counts candidacies per platform and publishes no links", () => {
  const c = (canais: { r: string; u: string }[] | null) => ({ cargo: "Governador", partido: "AAA", canais });
  const out = aggregate([c([{ r: "instagram", u: "https://a/1" }, { r: "instagram", u: "https://a/2" }, { r: "x", u: "https://a/3" }]), c(null), c([{ r: "tiktok", u: "https://a/4" }])]);
  const p = out.Governador!.partidos.AAA!;
  expect(p).toMatchObject({ n: 3, comCanal: 2, redes: { instagram: 1, x: 1, tiktok: 1 } });
  expect(JSON.stringify(out)).not.toContain("https://");
});

test("the parties tab shows a share of candidacies for a platform and hides it under the minimum", () => {
  const data = agg({ partidos: { AAA: party({ n: 4, redes: { instagram: 3 } }), BBB: party({ n: 2, redes: { instagram: 2 } }) } });
  const html = partidosView({ data, cargo: "Governador", label: "Brasil", metrica: "instagram" });
  expect(html).toContain("Instagram por partido");
  expect(html).toContain("75%");
  expect(html).toContain("não mede alcance");
});

test("the Redes tab reports platform coverage and dated followers, never a ranking", () => {
  const data = agg({ n: 8, partidos: { AAA: party({ n: 5, comCanal: 4, redes: { instagram: 4, x: 1 } }), BBB: party({ n: 3, comCanal: 1, redes: { instagram: 1 } }) } });
  const cands = [
    { id: "1", cargo: "Governador", partido: "BBB", nome: "ZED", uf: "SP", bio: { seguidores: [{ rede: "x", n: 2_000_000, em: "2025-02-26" }] } },
    { id: "2", cargo: "Governador", partido: "AAA", nome: "ABEL", uf: "SP", bio: { seguidores: [{ rede: "youtube", n: 1_500, em: "2024-03-01" }] } },
    { id: "3", cargo: "Governador", partido: "AAA", nome: "OUTRO UF", uf: "RJ", bio: { seguidores: [{ rede: "x", n: 5, em: "2025-01-01" }] } },
  ] as Parameters<typeof renderPanorama>[0]["cands"];
  const pan = { geradoEm: "", escopos: { SP: { Governador: data } }, agenda: { votacoes: [], partidos: {} } } as unknown as Panorama;
  const html = renderPanorama({ modo: "redes", pan, cargo: "Governador", uf: "SP", cands });
  expect(html).toContain("5</b> de 8 candidaturas");
  expect(html).toContain("Instagram");
  expect(html).toContain("02/2025");
  expect(html).not.toContain("OUTRO UF");
  expect(html.indexOf("ABEL")).toBeLessThan(html.indexOf("ZED")); // party order (AAA before BBB), not follower count
  expect(html).not.toMatch(/\bmelhor\b|\bmais popular\b/i);
});

test("Câmara-only links do not count as channels declared to the TSE", () => {
  const c = (canais: { r: string; c?: 1 }[]) => ({ cargo: "Deputado Federal", partido: "AAA", canais });
  const p = aggregate([c([{ r: "instagram" }]), c([{ r: "instagram", c: 1 }, { r: "x", c: 1 }])])["Deputado Federal"]!.partidos.AAA!;
  expect(p).toMatchObject({ comCanal: 1, redes: { instagram: 1 } });
  expect(p.redes.x).toBeUndefined();
});

// "Redes e voto" slot: stale-response guard, shared download and cache rule.
const apCom = (situacao: string, fase: "concluida" | "parcial" = "concluida") => ({
  versao: { data: "", hora: "" }, cargo: { codigo: "1", nome: "Presidente", vagas: 1 }, fase,
  secoes: { total: 1, totalizadas: 1 }, eleitorado: { apto: 1, apurado: 1, comparecimento: 1, abstencao: 0 },
  votos: { total: 1, validos: 1, brancos: 0, nulos: 0 }, quociente: null, partidos: [],
  candidatos: [{ id: "1", num: "1", nome: "X", partido: "AAA", votos: 1, pct: 1, destaque: false, situacao, lista: "L" }],
}) as Apuracao;
const slotRoot = () => {
  const slot = { innerHTML: `<h3>Redes e voto</h3>`, querySelector: (_: string) => ({ outerHTML: "<h3>Redes e voto</h3>" }) };
  const root = { querySelector: (s: string) => (s === "#pan-voto" ? slot : null) } as unknown as HTMLElement;
  return { root, slot };
};
const ctxRedes = (cargo = "Presidente"): PanCtx => ({ modo: "redes", pan: {} as Panorama, cargo, uf: "BR", cands: [] });

test("vozDoVoto: two draws in a row share one download, and a runoff file marked '2º turno' is cached", async () => {
  const { root } = slotRoot();
  let calls = 0;
  const fill = vozDoVoto(root, () => ctxRedes(), () => "uf", async () => { calls++; return apCom("2º turno"); });
  await Promise.all([fill(), fill()]);
  await fill();
  expect(calls).toBe(1);
});

test("vozDoVoto: a partial count is read again, and the late answer of an older draw never overwrites the newer one", async () => {
  const { root, slot } = slotRoot();
  const waiting: ((a: Apuracao) => void)[] = [];
  let ctx = ctxRedes("Presidente");
  const fill = vozDoVoto(root, () => ctx, () => "uf", (url) => new Promise((res) => { waiting.push((a) => res(a)); void url; }));
  const first = fill();
  ctx = ctxRedes("Governador"); ctx.uf = "SP";
  const second = fill();
  waiting[1]!(apCom("", "parcial"));
  await second;
  const after = slot.innerHTML;
  waiting[0]!(apCom("", "parcial"));
  await first;
  expect(slot.innerHTML).toBe(after);
  void fill();
  expect(waiting.length).toBe(3); // partial -> not cached, so it asks again
});

test("vozDoVoto: a failed download leaves an escaped message and does not break the next draw", async () => {
  const { root, slot } = slotRoot();
  let fail = true;
  const fill = vozDoVoto(root, () => ctxRedes(), () => "uf", async () => { if (fail) throw new Error("<b>x</b>"); return apCom("Eleito"); });
  await fill();
  expect(slot.innerHTML).toContain("&lt;b&gt;x&lt;/b&gt;");
  expect(slot.innerHTML).not.toContain("<b>x</b>");
  fail = false;
  await fill();
  expect(slot.innerHTML).not.toContain("Não deu para ler");
});
