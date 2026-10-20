import { describe, expect, test } from "bun:test";
import { fatosCorrida, linhasCorrida, MAX_LINHAS } from "./apuracao-corrida.js";
import { parseApuracao } from "./apuracao-tse.js";
import { cand, file } from "./apuracao-fixtures.js";
import type { FixCand } from "./apuracao-fixtures.js";

// A file of one office with the given candidates (id, name, votes) and the sections counted so far
const arq = (cs: [string, string, number, string?][], st = 400, ts = 1000) => {
  const total = cs.reduce((s, c) => s + c[2], 0) || 1;
  const cands: FixCand[] = cs.map(([id, nome, votos, situacao], i) => cand(id, String(10 + i), nome, String(i + 1), String(votos), ((votos / total) * 100).toFixed(2).replace(".", ","), situacao ? "s" : "n", situacao ?? ""));
  return parseApuracao(file({ cands, s: { ts: String(ts), st: String(st) } }))!;
};

describe("corrida: as linhas", () => {
  test("ordered by votes whatever order the file had, and no more than eight", () => {
    const d = arq([["b", "BETO", 300], ["a", "ANA", 500], ["c", "CLARA", 200]]);
    expect(linhasCorrida(d).map((l) => l.id)).toEqual(["a", "b", "c"]);
    const muitos = arq(Array.from({ length: 12 }, (_, i) => [`x${i}`, `CAND ${i}`, 1000 - i] as [string, string, number]));
    expect(linhasCorrida(muitos)).toHaveLength(MAX_LINHAS);
    expect(linhasCorrida(muitos, 3)).toHaveLength(3);
    expect(linhasCorrida(muitos)[0]!.id).toBe("x0");
  });

  test("the TSE's own status text and highlight travel with the line, untouched", () => {
    const d = arq([["a", "ANA", 500, "Eleito"], ["b", "BETO", 300]]);
    const [a, b] = linhasCorrida(d);
    expect(a).toMatchObject({ id: "a", situacao: "Eleito", destaque: true, partido: "AAA" });
    expect(b).toMatchObject({ situacao: "", destaque: false });
  });
});

describe("corrida: os fatos da sessão", () => {
  test("the first file seen says where the count stands, not that something happened", () => {
    expect(fatosCorrida(null, arq([["a", "ANA", 500], ["b", "BETO", 300]]))).toEqual([]);
  });

  test("an overtake names both, the party of each, and the new place", () => {
    const antes = arq([["a", "ANA SOUZA", 500], ["b", "BETO LIMA", 400], ["c", "CLARA", 100]]);
    const depois = arq([["a", "ANA SOUZA", 500], ["b", "BETO LIMA", 600], ["c", "CLARA", 100]]);
    const f = fatosCorrida(antes, depois);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ tipo: "passou", id: "b" });
    expect(f[0]!.texto).toBe("Beto Lima (AAA) passou Ana Souza (AAA) e agora é 1º.");
  });

  test("nothing new, nothing reported", () => {
    const d = arq([["a", "ANA", 500], ["b", "BETO", 400]]);
    expect(fatosCorrida(d, d)).toEqual([]);
  });

  test("a milestone of the count is one line, in the file that crosses it", () => {
    const f = fatosCorrida(arq([["a", "ANA", 500], ["b", "BETO", 400]], 240), arq([["a", "ANA", 520], ["b", "BETO", 410]], 260));
    expect(f).toEqual([{ tipo: "marco", texto: "25% das seções totalizadas." }]);
    expect(fatosCorrida(arq([["a", "ANA", 500], ["b", "BETO", 400]], 260), arq([["a", "ANA", 520], ["b", "BETO", 410]], 270))).toEqual([]);
  });

  test("a status the TSE just marked is quoted as the TSE wrote it, once", () => {
    const antes = arq([["a", "ANA", 500], ["b", "BETO", 400]]);
    const depois = arq([["a", "ANA", 500, "Eleito"], ["b", "BETO", 400]]);
    const f = fatosCorrida(antes, depois);
    expect(f).toEqual([{ tipo: "tse", id: "a", texto: 'Ana: o TSE marcou "Eleito".' }]);
    expect(fatosCorrida(depois, depois)).toEqual([]);
  });

  test("the Radar never writes a verdict of its own in these lines", () => {
    const antes = arq([["a", "ANA", 500], ["b", "BETO", 400]], 900);
    const depois = arq([["a", "ANA", 500], ["b", "BETO", 700]], 1000);
    for (const f of fatosCorrida(antes, depois)) expect(f.texto).not.toMatch(/\b(vencer|vai ganhar|será eleit[oa]|vencedor)/i);
  });
});
