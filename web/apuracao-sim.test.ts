import { describe, expect, test } from "bun:test";
import { PASSOS, agoraSim, alphaSim, anonimizar, criarNomeador, horaSim, marcarEleito, parcial, progresso, segundoTurno, somar, versionar } from "./apuracao-sim.js";
import { file, cand } from "./apuracao-fixtures.js";
import { parseApuracao } from "./apuracao-tse.js";
import type { Apuracao } from "./apuracao-tse.js";

const P = { kappa: 0.95, eta: -0.5, ratio: 1 };
const final = (cands = [cand("a1", "10", "ANA SOUZA", "1", "60000", "60,00", "s", "Eleito"), cand("b2", "20", "BETO LIMA", "2", "30000", "30,00"), cand("c3", "30", "CAIO REIS", "3", "10000", "10,00")]) =>
  parseApuracao(file({ s: { ts: "1000", st: "1000" }, v: { tv: "110000", vv: "100000", vvc: "100000", vb: "4000", tvn: "6000" }, cands }))!;
const somaVotos = (d: Apuracao) => d.candidatos.reduce((s, c) => s + c.votos, 0);

describe("nomes fictícios", () => {
  test("the same real key always gets the same fictional name, and two keys never share one", () => {
    const n = criarNomeador();
    const a = n.candidato("1|BR|13"), b = n.candidato("1|BR|22");
    expect(n.candidato("1|BR|13")).toEqual(a);
    expect(a.nome).not.toBe(b.nome);
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith("sim-")).toBe(true);
    // a fresh simulation renames the same way: the night is reproducible
    expect(criarNomeador().candidato("1|BR|13").nome).toBe(a.nome);
  });

  test("a hundred candidates still get distinct names", () => {
    const n = criarNomeador();
    const nomes = new Set(Array.from({ length: 100 }, (_, i) => n.candidato(`6|SP|${i}`).nome));
    expect(nomes.size).toBe(100);
  });

  test("a composed list maps piece by piece, so the same party reads the same in every list", () => {
    const n = criarNomeador();
    const pt = n.partido("PT");
    expect(n.lista("PT/PC do B/PV").split(" / ")[0]).toBe(pt);
    expect(n.lista("PT")).toBe(pt);
    expect(n.lista("PL")).not.toBe(pt);
    expect(n.partido("")).toBe("");
  });

  test("no real name, party or list survives", () => {
    const d = anonimizar(final(), "Governador", "SP", criarNomeador());
    const txt = JSON.stringify(d);
    for (const real of ["ANA SOUZA", "BETO LIMA", "CAIO REIS", "AAA", "a1", "b2"]) expect(txt).not.toContain(`"${real}"`);
    expect(d.candidatos.map((c) => c.votos)).toEqual([60000, 30000, 10000]);
    expect(d.candidatos[0]!.situacao).toBe("Eleito");
  });

  test("the president keeps one fictional name across states; other offices are per state", () => {
    const n = criarNomeador();
    const pres = (uf: string) => anonimizar(final(), "Presidente", uf, n).candidatos[0]!;
    expect(pres("SP")).toEqual(pres("BA"));
    const gov = (uf: string) => anonimizar(final(), "Governador", uf, n).candidatos[0]!;
    expect(gov("SP").id).not.toBe(gov("BA").id);
    expect(n.buscar("Presidente|BR|10")).toBe(pres("SP").id);
    expect(n.buscar("Presidente|BR|99")).toBeNull();
  });
});

describe("caminho da noite", () => {
  test("each file only moves forward and closes at the last step", () => {
    for (const chave of ["Governador|SP", "Presidente|ZZ", "Senador|AC"]) {
      let antes = 0;
      for (let k = 0; k < PASSOS; k++) {
        const q = progresso(chave, k);
        expect(q).toBeGreaterThanOrEqual(antes);
        antes = q;
      }
      expect(progresso(chave, 0)).toBe(0);
      expect(progresso(chave, PASSOS - 1)).toBe(1);
    }
  });

  test("a partial file never shows the TSE's status texts and counts fewer votes", () => {
    const f = final();
    const meio = Array.from({ length: PASSOS }, (_, k) => k).find((k) => { const q = progresso("x", k); return q > 0.3 && q < 0.7; })!;
    const d = parcial(f, "x", meio);
    expect(d.fase).toBe("parcial");
    expect(d.candidatos.every((c) => c.situacao === "" && !c.destaque)).toBe(true);
    expect(somaVotos(d)).toBeLessThan(somaVotos(f));
    expect(d.secoes.totalizadas).toBeLessThan(f.secoes.total);
    expect(d.eleitorado.apto).toBe(f.eleitorado.apto);
    expect(Math.abs(somaVotos(d) - somaVotos(f) * progresso("x", meio))).toBeLessThan(5);
  });

  test("the last step is the real final file", () => {
    const f = final();
    const d = parcial(f, "x", PASSOS - 1);
    expect(d.fase).toBe("concluida");
    expect(d.candidatos).toEqual(f.candidatos);
    expect(d.votos).toEqual(f.votos);
  });

  test("a state slice of the president never carries status texts, even complete", () => {
    const d = parcial(final(), "x", PASSOS - 1, { situacao: false });
    expect(d.candidatos.every((c) => c.situacao === "" && !c.destaque)).toBe(true);
  });

  test("before the first section the file is waiting", () => {
    const chave = Array.from({ length: 50 }, (_, i) => `k${i}`).find((c) => progresso(c, 0) === 0 && progresso(c, 1) === 0)!;
    expect(parcial(final(), chave, 0).fase).toBe("aguardando");
  });

  test("the early lean fades: the order of a close race can change during the night, never at the end", () => {
    const f = final([cand("a1", "10", "A", "1", "50100", "50,10"), cand("b2", "20", "B", "2", "49900", "49,90")]);
    const ordens = new Set<string>();
    for (const chave of ["s1", "s2", "s3", "s4", "s5", "s6"]) for (let k = 1; k < PASSOS; k++) {
      const d = parcial(f, chave, k);
      if (d.fase !== "aguardando") ordens.add(d.candidatos[0]!.id);
    }
    expect(ordens.size).toBe(2);
    expect(parcial(f, "s1", PASSOS - 1).candidatos[0]!.id).toBe("a1");
  });
});

describe("segundo turno derivado", () => {
  test("the two finalists split the runoff valid votes; nobody else stays", () => {
    const t1 = final();
    const t2 = segundoTurno(t1, ["a1", "b2"], { ...P, ratio: 0.98 });
    expect(t2.candidatos.map((c) => c.id).sort()).toEqual(["a1", "b2"]);
    expect(somaVotos(t2)).toBe(t2.votos.validos);
    expect(t2.votos.validos).toBe(Math.round(100000 * 0.98));
    expect(t2.candidatos[0]!.id).toBe("a1");
    expect(t2.candidatos.every((c) => c.situacao === "")).toBe(true);
  });

  test("two finalists tied in the first round start the runoff tied", () => {
    const t1 = final([cand("a1", "10", "A", "1", "40000", "40,00"), cand("b2", "20", "B", "2", "40000", "40,00"), cand("c3", "30", "C", "3", "20000", "20,00")]);
    const [x, y] = segundoTurno(t1, ["a1", "b2"], P).candidatos;
    expect(Math.abs(x!.votos - y!.votos)).toBeLessThanOrEqual(1);
  });

  test("the invented lean of the eliminated voters moves the runoff, the same for the whole country", () => {
    const t1 = final();
    const a = (alpha: number) => segundoTurno(t1, ["a1", "b2"], P, alpha).candidatos.find((c) => c.id === "a1")!.votos;
    expect(a(0.2)).toBeGreaterThan(a(0));
    expect(a(-0.2)).toBeLessThan(a(0));
    expect(alphaSim("Presidente", "SP")).toBe(alphaSim("Presidente", "BA"));
    expect(Math.abs(alphaSim("Governador", "AC"))).toBeLessThanOrEqual(0.25);
  });

  test("a complete governor runoff marks the one ahead, never before it closes", () => {
    const t2 = segundoTurno(final(), ["a1", "b2"], P);
    expect(marcarEleito(t2).candidatos.map((c) => c.situacao)).toEqual(["Eleito", "Não eleito"]);
    expect(marcarEleito({ ...t2, fase: "parcial" }).candidatos.every((c) => c.situacao === "")).toBe(true);
  });
});

describe("soma nacional", () => {
  const uf = (a: number, b: number, c: number, st = "1000") =>
    parseApuracao(file({ s: { ts: "1000", st }, v: { vv: String(a + b + c), vvc: String(a + b + c), tv: String(a + b + c) }, cands: [cand("a1", "10", "A", "1", String(a), "0"), cand("b2", "20", "B", "2", String(b), "0"), cand("c3", "30", "C", "3", String(c), "0")] }))!;

  test("adds every file by candidate and recomputes the shares", () => {
    const br = somar([uf(100, 50, 10), uf(20, 70, 0)], 1)!;
    expect(br.candidatos.map((c) => [c.id, c.votos])).toEqual([["a1", 120], ["b2", 120], ["c3", 10]]);
    expect(br.votos.validos).toBe(250);
    expect(br.candidatos[0]!.pct).toBeCloseTo(0.48);
    expect(br.secoes.total).toBe(2000);
  });

  test("closed with nobody above half: the two first go to the runoff", () => {
    const br = somar([uf(45, 40, 15), uf(45, 40, 15)], 1)!;
    expect(br.candidatos.map((c) => c.situacao)).toEqual(["2º turno", "2º turno", "Não eleito"]);
  });

  test("closed above half, or in the runoff: the one ahead is marked", () => {
    expect(somar([uf(60, 30, 10)], 1)!.candidatos[0]!.situacao).toBe("Eleito");
    expect(somar([uf(52, 48, 0)], 2)!.candidatos.map((c) => c.situacao)).toEqual(["Eleito", "Não eleito", "Não eleito"]);
  });

  test("while any file is open there are no status texts", () => {
    const br = somar([uf(60, 30, 10), uf(10, 10, 10, "500")], 1)!;
    expect(br.fase).toBe("parcial");
    expect(br.candidatos.every((c) => c.situacao === "")).toBe(true);
  });

  test("nothing to add gives nothing", () => expect(somar([], 1)).toBeNull());
});

test("each step has its own time on the day of its round, so versions keep their order", () => {
  expect(horaSim(0)).toBe("17:00:00");
  expect(horaSim(20)).toBe("18:00:00");
  expect(versionar(final(), 20, 2).versao).toEqual({ data: "25/10/2026", hora: "18:00:00" });
  expect(agoraSim(20, 1).toISOString()).toBe("2026-10-04T21:00:20.000Z");
});
