import { expect, test } from "bun:test";
import { renderExpectativa } from "./expectativa.js";

const avatar = () => "";
const prev = (p, media, extra = {}) => ({ p, media, lo: media - 0.04, hi: media + 0.04, fonte: "pesquisas", p2t: 0.9, tend: 0.012, ...extra });
const cand = (id, nome, partido, pr, extra = {}) => ({ id, nome, urna: nome, partido, num: "13", cargo: "Governador", uf: "SP", fin: { total: 0 }, prev: pr, ...extra });

const gov = [cand("1", "ANA", "PT", prev(0.6, 0.42)), cand("2", "BETO", "PL", prev(0.4, 0.4)), cand("3", "CLARA", "PSOL", prev(0, 0.05, { p2t: 0, tend: null }))];
const corrida = {
  cargo: "Governador", uf: "SP", vagas: 1, pesquisas: 3, institutos: ["A", "B"], desde: "2026-09-20", ultima: "2026-10-03", p1turno: 0.02,
  refTendencia: "2026-09-18", candidatos: ["1", "2", "3"], confrontos: [{ a: "1", b: "2", qa: 0.51, n: 2 }],
  primeiroTurno: [{ instituto: "A", fim: "2026-10-03", amostra: 1000, margem: 3, votos: { 1: 40, 2: 38, 3: 4 }, indecisos: 12 }],
  segundoTurno: [{ instituto: "A", fim: "2026-10-03", amostra: 1000, votos: { 1: 48, 2: 46 } }],
};
const exp = { fontes: [{ uf: "SP", url: "https://pt.wikipedia.org/wiki/x" }], vagas: {}, corridas: [corrida], metodo: { janelaDias: 21, meiaVidaDias: 10, erroSistematico: 0.035, simulacoes: 20000, tendenciaDias: 14 }, modelo: null };

test("a majoritarian race explains the number: reading, trend, legend, runoff average and method", () => {
  const html = renderExpectativa({ exp, cargo: "Governador", uf: "SP", cands: gov, avatar, limit: 40 });
  expect(html).toContain("Vantagem de <b>2,0 p.p.</b>"); // lead over the runner-up
  expect(html).toContain("se cruzam"); // 0.42±0.04 vs 0.40±0.04 touch
  expect(html).toContain("1 dia antes da eleição");
  expect(html).toContain("+1,2 p.p."); // trend column
  expect(html).toContain("Marca escura"); // legend
  expect(html).toContain("51,0% × 49,0%"); // head-to-head average used by the simulations
  expect(html).toContain("2 pesquisas");
  expect(html).toContain("Como esta média é calculada");
  expect(html).toContain("20.000 simulações");
  expect(html).toContain("Indecisos"); // poll table keeps the undecided share visible
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("NaN");
});

test("the chance columns come right after the name, so a phone that scrolls the table sideways still shows them", () => {
  const html = renderExpectativa({ exp, cargo: "Governador", uf: "SP", cands: gov, avatar, limit: 40 });
  const head = [...html.match(/<thead><tr>(.*?)<\/tr><\/thead>/s)[1].matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1]);
  expect(head.slice(0, 3)).toEqual(["Candidato", "Vence", "2º turno"]);
  expect(head.slice(3)).toEqual(["Votos válidos (média e faixa de 90%)", "2 semanas"]);
  const firstRow = html.match(/<tbody><tr>(.*?)<\/tr>/s)[1];
  expect(firstRow.match(/<t[hd]/g)).toHaveLength(head.length); // header and cells stay aligned
  expect(firstRow.indexOf("60%")).toBeLessThan(firstRow.indexOf('class="bar"'));
});

// .sr text is absolutely placed; unless the sideways-scrolling box is its containing block, it escapes the
// clip and a phone gets a page-wide horizontal scrollbar (measured: 531px of document in a 390px viewport).
test("screen-reader text inside a sideways-scrolling table is clipped by that box, not by the page", async () => {
  const read = (f) => Bun.file(new URL(`./${f}`, import.meta.url)).text();
  expect(await read("expectativa.css")).toMatch(/\.sr\s*\{[^}]*position:\s*absolute/);
  expect(await read("styles.css")).toMatch(/\.scroll\s*\{[^}]*overflow-x:\s*auto[^}]*position:\s*relative/);
  expect(renderExpectativa({ exp, cargo: "Governador", uf: "SP", cands: gov, avatar, limit: 40 })).toMatch(/<div class="scroll">.*class="sr"/s);
});

test("a race without polls and a missing export both degrade to a message", () => {
  expect(renderExpectativa({ exp, cargo: "Governador", uf: "RJ", cands: gov, avatar, limit: 40 })).toContain("Nenhuma pesquisa");
  expect(renderExpectativa({ exp: null, cargo: "Governador", uf: "SP", cands: gov, avatar, limit: 40 })).toContain("ainda não foram gerados");
});

test("an older export without the new fields still renders", () => {
  const old = { ...exp, metodo: undefined, corridas: [{ ...corrida, confrontos: undefined, refTendencia: undefined, primeiroTurno: [{ instituto: "A", fim: "2026-10-03", amostra: null, votos: { 1: 40 } }] }] };
  const html = renderExpectativa({ exp: old, cargo: "Governador", uf: "SP", cands: gov, avatar, limit: 40 });
  expect(html).toContain("tem <b>60%</b> de chance de vencer");
  expect(html).not.toContain("Como esta média é calculada");
  expect(html).not.toContain("undefined");
});

test("deputies: each row says what the model looked at, and the lead counts bands", () => {
  const dep = (id, p, ex) => cand(id, `DEP ${id}`, "PT", { p, fonte: "modelo", ...(ex && { ex }) }, { cargo: "Deputado Federal", fin: { total: 900000 } });
  const cands = [dep("a", 0.9, { r: 2, g: 1100, lr: 1, ln: 30, vl: 5.1, dep: true }), dep("b", 0.4, { r: 40, g: 1100, lr: 3, ln: 30, vl: 5.1, dep: false }), dep("c", 0.004)];
  const e = { ...exp, vagas: { "SP|DEPUTADO FEDERAL": 70 }, modelo: { backtest: { acerto: 0.58, acertoBaseline: 0.49, calibracao: [{ faixa: "70–90%", previsto: 0.76, observado: 0.74, n: 468 }, { faixa: "90–100%", previsto: 0.95, observado: 0.75, n: 4 }] } } };
  const html = renderExpectativa({ exp: e, cargo: "Deputado Federal", uf: "SP", cands, avatar, limit: 40 });
  expect(html).toContain("2ª arrecadação");
  expect(html).toContain("já é deputado(a)");
  expect(html).toContain("<b>1</b> candidaturas com eleição provável (60%+) e <b>1</b> em disputa aberta (30–60%)");
  expect(html).toContain("74% das 468 candidaturas"); // bins with fewer than 30 candidacies are not quoted
  expect(html).not.toContain("das 4 candidaturas");
  expect(html).not.toContain("undefined");
});
