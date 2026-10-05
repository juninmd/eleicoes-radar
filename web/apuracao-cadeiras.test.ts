import { describe, expect, test } from "bun:test";
import { cadeiras } from "./apuracao-cadeiras.js";
import type { DadosCadeiras } from "./apuracao-cadeiras.js";
import type { Candidato } from "./apuracao-tse.js";

const c = (id: string, lista: string, votos: number, extra: Partial<Candidato> = {}): Candidato => ({ id, nome: id.toUpperCase(), partido: lista, num: "1", votos, pct: 0, destaque: false, situacao: "", lista, ...extra });
const dados = (over: Partial<DadosCadeiras> = {}): DadosCadeiras => ({
  secoes: { total: 100, totalizadas: 90 },
  partidos: [{ nome: "L1", vagas: 2 }, { nome: "L2", vagas: 1 }, { nome: "L3", vagas: 0 }],
  candidatos: [c("a", "L1", 1000), c("b", "L1", 900), c("c", "L1", 850), c("d", "L1", 10), c("e", "L2", 500), c("f", "L2", 100), c("g", "L3", 50)],
  ...over,
});

describe("cadeiras", () => {
  const r = cadeiras(dados());

  test("each list gets as many seats as the TSE gave it, filled by votes inside the list", () => {
    expect(r.listas.map((l) => l.nome)).toEqual(["L1", "L2"]); // L3 has no seat
    expect(r.listas[0].dentro.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.listas[0].fora.map((x) => x.id)).toEqual(["c", "d"]);
    expect(r.total).toBe(3);
  });

  test("the margin is last in minus first out, in votes", () => {
    expect(r.listas[0].margem).toBe(50);
    expect(r.listas[1].margem).toBe(400);
  });

  test("a seat is tight when the gap is smaller than the votes the last one in can still receive at this stage of the count", () => {
    // 90% counted: the last in has 900 and can still get about 900 x 10/90 = 100 votes
    expect(r.listas[0].apertada).toBe(true); // 50 < 100
    expect(r.listas[1].apertada).toBe(false); // 400 > 55
    expect(r.apertadas.map((l) => l.nome)).toEqual(["L1"]);
  });

  test("it hands the view the votes the last one in can still receive, so the screen can show the comparison it rests on", () => {
    expect(r.listas[0].aindaPode).toBeCloseTo(100); // 900 x 10/90
    expect(cadeiras(dados({ secoes: { total: 100, totalizadas: 100 } })).listas[0].aindaPode).toBe(0);
  });

  test("with every section in nothing is tight, and with none counted nothing can be called", () => {
    expect(cadeiras(dados({ secoes: { total: 100, totalizadas: 100 } })).listas.every((l) => !l.apertada)).toBe(true);
    expect(cadeiras(dados({ secoes: { total: 100, totalizadas: 0 } })).listas).toEqual([]);
  });

  test("a list with fewer candidates than seats has no first-out to compare with", () => {
    const so = cadeiras(dados({ partidos: [{ nome: "L2", vagas: 3 }], candidatos: [c("e", "L2", 500), c("f", "L2", 100)] }));
    expect(so.listas[0].dentro).toHaveLength(2);
    expect(so.listas[0].margem).toBeNull();
    expect(so.listas[0].apertada).toBe(false);
  });

  test("the biggest lists come first, and a candidate with no list in the file is left out instead of guessed", () => {
    const d = dados({ partidos: [{ nome: "L2", vagas: 1 }, { nome: "L1", vagas: 2 }], candidatos: [...dados().candidatos, c("z", "", 99999)] });
    const out = cadeiras(d);
    expect(out.listas.map((l) => l.nome)).toEqual(["L1", "L2"]);
    expect(out.listas.flatMap((l) => l.dentro.concat(l.fora)).some((x) => x.id === "z")).toBe(false);
  });

  test("without a file, or for an office with no lists, it answers with nothing", () => {
    expect(cadeiras(null).listas).toEqual([]);
    expect(cadeiras({ ...dados(), partidos: [] }).listas).toEqual([]);
  });
});
