import { describe, expect, test } from "bun:test";
import { parseApuracao } from "./apuracao-tse.js";
import { renderApuracao } from "./apuracao.js";
import { atualizar, vazio } from "./apuracao-novidades.js";

// A raw TSE file of a governor's race: te/est decide how many electors are left, vap/pvap are the candidates' numbers.
const cand = (sqcand, n, nmu, seq, vap, pvap, st = "") => ({ n, sqcand, nm: nmu, nmu, seq, e: "n", st, vap, pvap });
const arquivo = ({ votos, te = "1000", est = "950", st = "950", cargo = "Governador", hg = "21:04:25" }) => {
  const total = votos.reduce((a, v) => a + v, 0);
  const cands = votos.map((v, i) => cand(`c${i + 1}`, String(10 * (i + 1)), `CAND ${"ABCD"[i]}`, String(i + 1), String(v), ((v / total) * 100).toFixed(2).replace(".", ",")));
  return {
    dg: "04/10/2026", hg,
    s: { ts: "1000", st },
    e: { te, est, c: est, a: "0" },
    v: { tv: String(total), vvc: String(total), vv: String(total), vb: "0", tvn: "0" },
    carg: [{ cd: "3", nmn: cargo, nv: "1", agr: [{ n: "1", nm: "A", com: "AAA", par: [{ n: "10", sg: "AAA", cand: cands }] }] }],
  };
};
const placar = (json, over = {}) => renderApuracao({
  snap: { status: "ok", dados: parseApuracao(json), buscadoEm: new Date("2026-10-04T21:05:00"), erro: null },
  cargo: "Governador", uf: "SP", byId: new Map(), avatar: () => "", limit: 40, ...over,
});
const runoff = () => arquivo({ votos: [400, 380, 100, 20] }); // falta 50: nobody can pass half, the third cannot reach the second

describe("the Placar of a one-seat race", () => {
  test("runoff guaranteed: the banner, then the head-to-head bar, before the table", () => {
    const html = placar(runoff());
    expect(html).toContain("Segundo turno garantido.");
    expect(html).toContain('class="apu-duelo"');
    expect(html.indexOf("Segundo turno garantido.")).toBeLessThan(html.indexOf('class="apu-duelo"'));
    expect(html.indexOf('class="apu-duelo"')).toBeLessThan(html.indexOf("<table"));
  });

  test("it never says who wins: only the arithmetic, labelled as the Radar's", () => {
    const antes = placar(runoff()).split("<details")[0];
    expect(antes).toContain("não é a marcação do TSE");
    expect(antes).not.toMatch(/venceu|vencedor|\beleit[oa]s?\b|vai vencer|será eleit/i);
  });

  test("a leader the proof already decides gets the first-round label and no runoff banner", () => {
    const html = placar(arquivo({ votos: [600, 150, 50], est: "800", st: "800" }));
    expect(html).toContain("Matematicamente");
    expect(html).not.toContain("Segundo turno garantido");
    expect(html).toContain('class="apu-duelo"'); // the bar still shows where the two stand
  });

  test("a close race with many electors left: the bar, no banner", () => {
    const html = placar(arquivo({ votos: [400, 380, 100, 20], est: "300", st: "300" }));
    expect(html).toContain('class="apu-duelo"');
    expect(html).not.toContain("Segundo turno garantido");
  });

  test("the other views and the other offices do not get it", () => {
    expect(placar(runoff(), { vista: "graficos" })).not.toContain("apu-duelo");
    expect(placar(arquivo({ votos: [400, 380, 100, 20], cargo: "Deputado Federal" }), { cargo: "Deputado Federal" })).not.toContain("apu-duelo");
  });

  test("a state file of the presidential race gets the bar but never the runoff claim", () => {
    const html = placar(arquivo({ votos: [400, 380, 100, 20], cargo: "Presidente" }), { cargo: "Presidente", uf: "SP" });
    expect(html).toContain('class="apu-duelo"');
    expect(html).not.toContain("Segundo turno garantido");
  });
});

describe("the list of updates on the Placar", () => {
  const estado = () => atualizar(vazio(), parseApuracao(runoff()), { cargo: "Governador", uf: "SP" });

  test("shown when the mount has lines, above the table, with the TSE's clock", () => {
    const html = placar(runoff(), { novidades: estado().itens });
    expect(html).toContain('data-k="novidades"');
    expect(html).toContain("<time>21:04</time>");
    expect(html.indexOf('data-k="novidades"')).toBeLessThan(html.indexOf("<table"));
  });

  test("absent when there is nothing to list, and on the other views", () => {
    expect(placar(runoff())).not.toContain("apu-novidades");
    expect(placar(runoff(), { novidades: estado().itens, vista: "graficos" })).not.toContain("apu-novidades");
  });

  test("a new file with the same numbers does not change the page: no redraw for a quiet poll", () => {
    const um = estado();
    const dois = atualizar(um, parseApuracao(runoff()), { cargo: "Governador", uf: "SP" });
    expect(dois).toBe(um);
  });
});
