import { describe, expect, test } from "bun:test";
import { parseApuracao } from "./apuracao-tse.js";
import { renderApuracao } from "./apuracao.js";

// Rendering of the "Matematicamente eleito" label on the single-race table; the proof itself is in apuracao-eleito.test.js.
const cand = (sqcand, n, nmu, seq, vap, pvap, e = "n", st = "") => ({ n, sqcand, nm: nmu, nmu, seq, e, st, vap, pvap });
const file = ({ cargo = {}, s = {}, e = {}, v = {}, cands = [] } = {}) => ({
  dg: "04/10/2026", hg: "19:41:07",
  s: { ts: "1000", st: "400", ...s },
  e: { te: "500000", est: "200000", c: "160000", a: "40000", ...e },
  v: { tv: "160000", vvc: "140000", vv: "140000", vb: "8000", tvn: "12000", ...v },
  carg: [{ cd: "3", nmn: "Governador", nv: "1", agr: [{ n: "1", nm: "A", com: "AAA", par: [{ n: "10", sg: "AAA", cand: cands }] }], ...cargo }],
});
const avatar = (c) => `<i class="av">${c.id}</i>`;
const byId = new Map([["a1", { id: "a1" }]]);
const view = (json, over = {}, extra = {}) => renderApuracao({ snap: { status: "ok", dados: parseApuracao(json), buscadoEm: new Date("2026-10-04T20:15:30"), erro: null, ...over }, cargo: "Governador", uf: "SP", byId, avatar, limit: 40, ...extra });

describe("matematicamente eleito", () => {
  // 900 of 1.000 electors already counted: at most 100 votes can still arrive, on top of the 800 valid ones.
  const quase = (cands, extra = {}) => file({ e: { te: "1000", est: "900", c: "800", a: "100" }, v: { tv: "800", vvc: "800", vv: "800", vb: "0", tvn: "0" }, cands, ...extra });
  const sem = (st) => [cand("a1", "10", "ANA SOUZA", "1", "600", "75,00", "n", st), cand("b2", "20", "BETO LIMA", "2", "200", "25,00")];
  const mat = (html) => (html.match(/class="rot alta mat"/g) ?? []).length;

  test("a leader no split of the remaining votes can overtake gets the label, the row highlight and the explanation", () => {
    const html = view(quase(sem("")));
    expect(mat(html)).toBe(1); // under the name, at every width: the TSE column is for the TSE's text only
    expect(html).toContain("Matematicamente eleito(a)</span>");
    expect(html.match(/<tr class="eleito">/g)).toHaveLength(1);
    expect(html).toContain('class="apu-decidido"');
    expect(html).toContain("não é a marcação do TSE");
    expect(html).not.toContain("st-col"); // no TSE status yet, so no TSE column: the label never borrows it
  });

  test("the label follows the candidate's gender when we know it, and stays neutral when we do not", () => {
    const own = (genero) => new Map([["a1", { id: "a1", genero }]]);
    expect(view(quase(sem("")), {}, { byId: own("Feminino") })).toContain("Matematicamente eleita</span>");
    expect(view(quase(sem("")), {}, { byId: own("Masculino") })).toContain("Matematicamente eleito</span>");
    expect(view(quase(sem("")), {}, { byId: own("Não informado") })).toContain("Matematicamente eleito(a)</span>");
  });

  test("not while the electors of the sections still to count could turn it around", () => {
    const html = view(quase(sem(""), { e: { te: "1600", est: "900", c: "800", a: "100" } })); // 700 left: 800 + 700 over 2 = 750 > 600
    expect(mat(html)).toBe(0);
    expect(html).not.toContain('class="eleito"');
    expect(html).not.toContain("apu-decidido");
    expect(html).toContain("<table"); // the ranking is still there, just without the label
  });

  test("the TSE's own 'Eleito' always wins: its text is shown, ours is not added", () => {
    const html = view(quase(sem("Eleito")));
    expect(mat(html)).toBe(0);
    expect(html).toContain(">Eleito</span>");
    expect(html.match(/<tr class="eleito">/g)).toHaveLength(1); // highlighted because of the TSE, not the proof
    expect(html).not.toContain("apu-decidido");
    expect(html).toContain("Situação (TSE)");
  });

  test("when the TSE says something else about the candidate the proof picked, the Radar says nothing", () => {
    const html = view(quase(sem("2º turno")));
    expect(mat(html)).toBe(0);
    expect(html).not.toContain("apu-decidido");
    expect(html).toContain(">2º turno</span>");
  });

  test("Senate: every seat holder is labelled once the last one is out of reach, and the banner is plural", () => {
    const cands = [cand("a1", "10", "ANA SOUZA", "1", "300", "37,50"), cand("b2", "20", "BETO LIMA", "2", "280", "35,00"), cand("c3", "30", "CLARA REIS", "3", "100", "12,50"), cand("d4", "40", "DUDU ROCHA", "4", "20", "2,50")];
    const html = view(file({ cargo: { cd: "5", nmn: "Senador", nv: "2" }, e: { te: "1000", est: "850", c: "700", a: "150" }, v: { tv: "700", vvc: "700", vv: "700", vb: "0", tvn: "0" }, cands }), {}, { cargo: "Senador" });
    expect(mat(html)).toBe(2); // one per seat holder
    expect(html.match(/<tr class="eleito">/g)).toHaveLength(2);
    expect(html).toContain("Matematicamente eleitos:</b> <b>Ana Souza</b> (AAA) e <b>Beto Lima</b> (AAA)");
  });

  test("proportional offices never get it: seats go to lists first", () => {
    const html = view(quase(sem(""), { cargo: { cd: "6", nmn: "Deputado Federal", nv: "1" } }), {}, { cargo: "Deputado Federal" });
    expect(mat(html)).toBe(0);
    expect(html).not.toContain("apu-decidido");
    expect(html).not.toContain("é rígida"); // and the how-to-read note about the rule appears only where the rule applies
  });

  test("the how-to-read text explains the rule where it applies", () => {
    expect(view(quase(sem("")))).toContain("é uma conta do Radar, não do TSE, e é rígida");
  });

  test("names in the banner are escaped", () => {
    const html = view(quase([cand("a1", "10", "<img src=x onerror=alert(1)>", "1", "600", "75,00"), cand("b2", "20", "BETO", "2", "200", "25,00")]));
    expect(html).toContain("apu-decidido");
    expect(html).not.toContain("<img src=x");
  });

  test("candidates the file gives no id (sqcand) are never labelled: they would all share one", () => {
    const html = view(quase([cand("", "10", "ANA", "1", "600", "75,00"), cand("", "20", "BETO", "2", "200", "25,00")]));
    expect(mat(html)).toBe(0);
    expect(html).not.toContain('class="eleito"');
  });

  test("the TSE calling someone else elected than the one the proof picked: the Radar says nothing", () => {
    const html = view(quase([cand("a1", "10", "ANA", "1", "600", "75,00"), cand("b2", "20", "BETO", "2", "200", "25,00", "s", "Eleito")]));
    expect(mat(html)).toBe(0);
    expect(html).not.toContain("apu-decidido");
    expect(html.match(/<tr class="eleito">/g)).toHaveLength(1); // only the TSE's own mark tints a row
  });

  test("the president is decided only on the national file, never on a state's slice of it", () => {
    const nacional = view(quase(sem("")), {}, { cargo: "Presidente", uf: "BR" });
    expect(mat(nacional)).toBe(1);
    expect(mat(view(quase(sem("")), {}, { cargo: "Presidente", uf: "SP" }))).toBe(0);
  });
});
