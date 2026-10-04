import { describe, expect, test } from "bun:test";
import { brNumber, parseApuracao, tseUrl } from "./apuracao-tse.js";

// Synthetic file in the shape of the TSE "-u.json" results (checked against the 2026 pre-election
// files and the populated 2024 mayor files). Names are made up.
const cand = (sqcand, n, nmu, seq, vap, pvap, e = "n", st = "") => ({ n, sqcand, nm: `${nmu} COMPLETO`, nmu, seq, e, st, vap, pvap, pvapn: pvap.replace(",", ".") });
const file = ({ cargo = {}, s = {}, e = {}, v = {}, cands = [], agr } = {}) => ({
  dg: "04/10/2026", hg: "19:41:07", t: "1",
  s: { ts: "1000", st: "400", snt: "600", ...s },
  e: { te: "500000", est: "200000", c: "160000", a: "40000", ...e },
  v: { tv: "160000", vvc: "140000", vv: "140000", vb: "8000", tvn: "12000", ...v },
  carg: [{ cd: "3", nmn: "Governador", nv: "1", agr: agr ?? [{ n: "1", nm: "A", com: "AAA", par: [{ n: "10", sg: "AAA", cand: cands }] }], ...cargo }],
});

describe("tseUrl", () => {
  const base = "https://resultados.tse.jus.br/oficial/ele2026";
  test("president uses the federal election code and the national file", () => {
    expect(tseUrl("Presidente", "BR")).toBe(`${base}/6257/dados/br/br-c0001-e006257-u.json`);
  });
  test("state offices use the state election code and a lower-case UF", () => {
    expect(tseUrl("Governador", "SP")).toBe(`${base}/6259/dados/sp/sp-c0003-e006259-u.json`);
    expect(tseUrl("Senador", "ac")).toBe(`${base}/6259/dados/ac/ac-c0005-e006259-u.json`);
    expect(tseUrl("Deputado Federal", "MG")).toBe(`${base}/6259/dados/mg/mg-c0006-e006259-u.json`);
    expect(tseUrl("Deputado Estadual", "RJ")).toBe(`${base}/6259/dados/rj/rj-c0007-e006259-u.json`);
    expect(tseUrl("Deputado Distrital", "DF")).toBe(`${base}/6259/dados/df/df-c0008-e006259-u.json`);
  });
  test("a UF or office that is not ours never reaches the URL", () => {
    expect(() => tseUrl("Governador", "../x")).toThrow();
    expect(() => tseUrl("Governador", "SPX")).toThrow();
    expect(() => tseUrl("Governador", "")).toThrow();
    expect(() => tseUrl("Prefeito", "SP")).toThrow();
  });
  test("names inherited from Object.prototype are not offices", () => {
    for (const cargo of ["constructor", "toString", "__proto__", "hasOwnProperty"]) expect(() => tseUrl(cargo, "SP")).toThrow("cargo desconhecido");
  });
});

describe("brNumber", () => {
  test("reads the decimal comma and never returns NaN", () => {
    expect(brNumber("29,48")).toBe(29.48);
    expect(brNumber("0,00")).toBe(0);
    expect(brNumber("1801139")).toBe(1801139);
    for (const bad of ["", undefined, null, "abc", "1,2,3", {}]) expect(brNumber(bad)).toBe(0);
  });
});

describe("parseApuracao", () => {
  test("keeps the candidate order by votes, then by ballot sequence", () => {
    const r = parseApuracao(file({ cands: [cand("1", "10", "BETA", "2", "300", "30,00"), cand("2", "20", "ALFA", "1", "500", "50,00"), cand("3", "30", "GAMA", "3", "300", "30,00")] }));
    expect(r.candidatos.map((c) => c.nome)).toEqual(["ALFA", "BETA", "GAMA"]);
  });

  test("equal votes are ordered by ballot sequence even when the file lists them the other way round", () => {
    const r = parseApuracao(file({ cands: [cand("3", "30", "GAMA", "3", "300", "30,00"), cand("1", "10", "BETA", "2", "300", "30,00"), cand("2", "20", "ALFA", "1", "300", "30,00")] }));
    expect(r.candidatos.map((c) => c.nome)).toEqual(["ALFA", "BETA", "GAMA"]);
  });

  test("reads counts, shares and the label the TSE itself publishes", () => {
    const r = parseApuracao(file({ cands: [cand("280002551544", "22", "ALFA", "1", "1801139", "29,48", "s", "2º turno"), cand("9", "13", "BETA", "2", "10", "0,00", "n", "Não eleito")] }));
    expect(r.candidatos[0]).toEqual({ id: "280002551544", num: "22", nome: "ALFA", partido: "AAA", votos: 1801139, pct: 0.2948, destaque: true, situacao: "2º turno" });
    expect(r.candidatos[1]).toMatchObject({ destaque: false, situacao: "Não eleito" });
    expect(r.versao).toEqual({ data: "04/10/2026", hora: "19:41:07" });
    expect(r.cargo).toEqual({ codigo: "3", nome: "Governador", vagas: 1 });
    expect(r.secoes).toEqual({ total: 1000, totalizadas: 400 });
    expect(r.eleitorado).toEqual({ apto: 500000, apurado: 200000, comparecimento: 160000, abstencao: 40000 });
    expect(r.votos).toEqual({ total: 160000, validos: 140000, brancos: 8000, nulos: 12000 });
  });

  test('"e" marks a highlighted row but never invents a label: an empty status stays empty', () => {
    const r = parseApuracao(file({ cands: [cand("1", "10", "ALFA", "1", "5", "50,00", "s", "")] }));
    expect(r.candidatos[0]).toMatchObject({ destaque: true, situacao: "" });
  });

  test("before the first section is totalized the phase is waiting, even though the file exists", () => {
    const r = parseApuracao(file({ s: { st: "0", snt: "1000" }, v: { tv: "0", vvc: "0", vv: "0", vb: "0", tvn: "0" }, cands: [cand("1", "10", "ALFA", "1", "0", "0,00")] }));
    expect(r.fase).toBe("aguardando");
  });

  test("partial while sections are still missing, complete when all are in", () => {
    expect(parseApuracao(file()).fase).toBe("parcial");
    expect(parseApuracao(file({ s: { st: "1000", snt: "0" } })).fase).toBe("concluida");
  });

  test("a file that reports no total of sections is never called complete", () => {
    expect(parseApuracao(file({ s: { ts: "0", st: "5", snt: "0" } })).fase).toBe("parcial");
    expect(parseApuracao(file({ s: { ts: "0", st: "0", snt: "0" }, v: { tv: "0", vvc: "0", vv: "0", vb: "0", tvn: "0" } })).fase).toBe("aguardando");
  });

  test("valid votes fall back to nominal votes when the file has no vv", () => {
    const r = parseApuracao(file({ v: { vv: undefined, vvc: "7777" } }));
    expect(r.votos.validos).toBe(7777);
  });

  test("proportional offices expose seats per list and the electoral quotient when published", () => {
    const agr = [
      { n: "1", nm: "Federação X", com: "PT/PC do B/PV", vag: "9", par: [{ n: "13", sg: "PT", cand: [cand("1", "1300", "ALFA", "1", "100", "1,00")] }] },
      { n: "2", nm: "Partido Y", com: "PL", vag: "0", par: [{ n: "22", sg: "PL", cand: [cand("2", "2200", "BETA", "2", "90", "0,90")] }] },
    ];
    const r = parseApuracao(file({ cargo: { cd: "6", nmn: "Deputado Federal", nv: "70", qe: "210123" }, agr }));
    expect(r.cargo.vagas).toBe(70);
    expect(r.quociente).toBe(210123);
    expect(r.partidos).toEqual([{ nome: "PT/PC do B/PV", vagas: 9 }, { nome: "PL", vagas: 0 }]);
    expect(parseApuracao(file({ cargo: { qe: "" } })).quociente).toBeNull();
    expect(parseApuracao(file()).quociente).toBeNull();
  });

  test("anything that is not a results file is rejected instead of crashing the view", () => {
    for (const bad of [null, undefined, "x", 3, [], {}, { carg: [] }, { carg: [{}] }, { carg: "x" }]) expect(parseApuracao(bad)).toBeNull();
  });

  test("non-numeric fields from the source become 0, never NaN", () => {
    const r = parseApuracao(file({ s: { ts: "x", st: null }, e: { te: undefined }, cands: [cand("1", "10", "ALFA", "1", "abc", "??")] }));
    expect(r.secoes).toEqual({ total: 0, totalizadas: 0 });
    expect(r.candidatos[0]).toMatchObject({ votos: 0, pct: 0 });
    expect(r.eleitorado.apto).toBe(0);
  });

  test("text from the source stays plain text (escaping is the renderer's job)", () => {
    const r = parseApuracao(file({ cands: [cand("1", "10", "<img src=x onerror=1>", "1", "1", "1,00")] }));
    expect(r.candidatos[0].nome).toBe("<img src=x onerror=1>");
  });
});
