import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AVANCO_MINIMO, cartaoExterior, COLUNAS, contagemLideres, ESTADO_GRANDE, eventosNoite, intensidade, posicoes, resumoUf, TILES, topoNacional } from "./apuracao-noite.js";
import { caixaDe } from "./apuracao-fx.js";
import { linhasUf } from "./apuracao-nacional.js";
import { parseApuracao } from "./apuracao-tse.js";
import { cand, file } from "./apuracao-fixtures.js";
import type { ResumoUf } from "./apuracao-noite.js";
import type { UfEstado } from "./apuracao-uf.js";

const mapa = JSON.parse(readFileSync("web/mapa-uf.json", "utf8")) as { viewBox: [number, number, number, number]; ufs: Record<string, { d: string }> };

describe("cartograma: onde fica cada estado", () => {
  test("every state of the map has a tile, no two share a cell, and all fit the 7 x 7 grid", () => {
    expect(Object.keys(mapa.ufs).sort()).toEqual(Object.keys(TILES).sort());
    const celulas = new Set(Object.values(TILES).map(([c, l]) => `${c},${l}`));
    expect(celulas.size).toBe(Object.keys(TILES).length);
    for (const [c, l] of Object.values(TILES)) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(COLUNAS); expect(l).toBeGreaterThanOrEqual(0); expect(l).toBeLessThan(COLUNAS); }
  });

  test("both shapes keep the state's own proportions, so folding the map is a move and a scale, never a stretch", () => {
    for (const [uf, g] of Object.entries(mapa.ufs)) {
      const c = caixaDe(g.d)!;
      const p = posicoes(uf, c, mapa.viewBox)!;
      expect(p).not.toBeNull();
      // the stage has the aspect of the view box: convert the percentages back to map units
      const [vw, vh] = [mapa.viewBox[2], mapa.viewBox[3]];
      const asp = (q: { w: number; h: number }) => ((q.w / 100) * vw) / ((q.h / 100) * vh);
      expect(asp(p.mapa)).toBeCloseTo((c[2] - c[0]) / (c[3] - c[1]), 6);
      expect(asp(p.carto)).toBeCloseTo(asp(p.mapa), 6);
    }
  });

  test("a tile stays inside its cell, and the geography is the real box of the shape", () => {
    const [vw, vh] = [mapa.viewBox[2], mapa.viewBox[3]];
    for (const [uf, g] of Object.entries(mapa.ufs)) {
      const c = caixaDe(g.d)!, p = posicoes(uf, c, mapa.viewBox)!, [col, lin] = TILES[uf]!;
      const x0 = (col * vw) / COLUNAS, x1 = ((col + 1) * vw) / COLUNAS, y0 = (lin * vh) / COLUNAS, y1 = ((lin + 1) * vh) / COLUNAS;
      expect((p.carto.l / 100) * vw).toBeGreaterThanOrEqual(x0 - 1e-6);
      expect(((p.carto.l + p.carto.w) / 100) * vw).toBeLessThanOrEqual(x1 + 1e-6);
      expect((p.carto.t / 100) * vh).toBeGreaterThanOrEqual(y0 - 1e-6);
      expect(((p.carto.t + p.carto.h) / 100) * vh).toBeLessThanOrEqual(y1 + 1e-6);
      expect(p.mapa.l).toBeCloseTo((c[0] / vw) * 100, 6);
      expect(p.mapa.t).toBeCloseTo((c[1] / vh) * 100, 6);
    }
  });

  test("a state with no tile, or an empty box, gets no position instead of a wrong one", () => {
    expect(posicoes("XX", [0, 0, 10, 10], mapa.viewBox)).toBeNull();
    expect(posicoes("SP", [5, 5, 5, 20], mapa.viewBox)).toBeNull();
  });
});

// A state file with two candidates, one of them ahead
const uf = (a: number, b: number, st: number, ts = 1000, apto = 5_000_000): UfEstado => ({
  status: "ok", erro: null, buscadoEm: null,
  dados: parseApuracao({ ...file({ cands: [cand("a1", "13", "ANA", "1", String(a), "0,00"), cand("b2", "22", "BETO", "2", String(b), "0,00")], s: { ts: String(ts), st: String(st) } }), e: { te: String(apto), est: String(Math.round(apto * (st / ts))), c: "1", a: "1" } }),
});
const resumos = (ufs: Record<string, UfEstado>) => new Map(linhasUf(ufs, "Presidente").map((l) => [l.uf, resumoUf(l)]));

describe("noite: o que mudou entre duas leituras do país", () => {
  test("the first look reports nothing", () => {
    expect(eventosNoite(null, resumos({ SP: uf(600, 400, 500) }), null, null)).toEqual([]);
  });

  test("a state that had no numbers and now has one is 'abre'", () => {
    const antes = resumos({ SP: uf(0, 0, 0) });
    const e = eventosNoite(antes, resumos({ SP: uf(600, 400, 20) }), null, null);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ tipo: "abre", uf: "SP" });
  });

  test("a turn needs enough of the count behind it: the first urns are noise", () => {
    const antes = (st: number) => resumos({ RJ: uf(600, 400, st) });
    const depois = resumos({ RJ: uf(400, 600, 600) });
    expect(eventosNoite(antes(50), depois, null, null)).toEqual([]); // 5% was counted before
    const e = eventosNoite(antes(Math.round(AVANCO_MINIMO * 1000)), depois, null, null);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ tipo: "virou", uf: "RJ", id: "b2" });
    expect(e[0]!.texto).toContain("RJ virou: Beto passa à frente");
  });

  test("the same leader is not an event", () => {
    expect(eventosNoite(resumos({ SP: uf(600, 400, 500) }), resumos({ SP: uf(700, 300, 600) }), null, null)).toEqual([]);
  });

  test("finishing earns a line only for a big state (the electorate says which)", () => {
    const grande = eventosNoite(resumos({ SP: uf(600, 400, 990, 1000, ESTADO_GRANDE) }), resumos({ SP: uf(600, 400, 1000, 1000, ESTADO_GRANDE) }), null, null);
    expect(grande).toHaveLength(1);
    expect(grande[0]).toMatchObject({ tipo: "conclui", uf: "SP" });
    expect(eventosNoite(resumos({ AC: uf(600, 400, 990, 1000, 600_000) }), resumos({ AC: uf(600, 400, 1000, 1000, 600_000) }), null, null)).toEqual([]);
  });

  test("the country changing side is one line, and only once the count is far enough", () => {
    const topo = (a: number, b: number, st: number) => topoNacional(linhasUf({ SP: uf(a, b, st) }, "Presidente"));
    const t0 = topo(600, 400, 500), t1 = topo(400, 600, 500);
    const e = eventosNoite(resumos({ SP: uf(600, 400, 500) }), resumos({ SP: uf(400, 600, 500) }), t0, t1);
    expect(e.filter((x) => x.tipo === "total")).toHaveLength(1);
    expect(e.find((x) => x.tipo === "total")!.texto).toContain("No total do país, Beto passa à frente");
    expect(eventosNoite(resumos({ SP: uf(600, 400, 20) }), resumos({ SP: uf(400, 600, 20) }), topo(600, 400, 20), topo(400, 600, 20)).filter((x) => x.tipo === "total")).toEqual([]);
  });

  test("no line, in any case, hands out a verdict", () => {
    const antes = resumos({ SP: uf(600, 400, 500, 1000, ESTADO_GRANDE) });
    const depois = resumos({ SP: uf(400, 600, 1000, 1000, ESTADO_GRANDE) });
    const t = (x: ReturnType<typeof resumos>) => topoNacional(linhasUf({ SP: uf(x.get("SP")!.id === "a1" ? 600 : 400, x.get("SP")!.id === "a1" ? 400 : 600, 500) }, "Presidente"));
    for (const e of eventosNoite(antes, depois, t(antes), t(depois))) expect(e.texto).not.toMatch(/\b(vencer|vai ganhar|será eleit[oa]|vencedor)/i);
  });
});

describe("noite: a faixa de cima", () => {
  test("the two most voted nationally, summed over the state files, and A's share of the two", () => {
    const t = topoNacional(linhasUf({ SP: uf(600, 400, 500), RJ: uf(100, 300, 500) }, "Presidente"));
    expect(t.duelo!.a).toMatchObject({ id: "a1", votos: 700 });
    expect(t.duelo!.b).toMatchObject({ id: "b2", votos: 700 });
    expect(t.duelo!.parcelaA).toBeCloseTo(0.5, 10);
    expect(t.arquivos).toEqual({ com: 2, de: 2 });
    expect(topoNacional(linhasUf({ SP: uf(0, 0, 0) }, "Presidente")).duelo).toBeNull();
  });

  test("for the governors the strip counts the states each party leads", () => {
    const lista = contagemLideres(resumos({ SP: uf(600, 400, 500), RJ: uf(100, 300, 500), MG: uf(900, 100, 500), AC: uf(0, 0, 0) }).values() as Iterable<ResumoUf>);
    expect(lista).toEqual([{ partido: "AAA", n: 3 }]); // both candidates of the fixture share one party; the state with no numbers counts for nobody
    expect(contagemLideres([])).toEqual([]);
  });

  test("the colour gets stronger with the margin and never leaves its range", () => {
    expect(intensidade(0)).toBeCloseTo(0.28, 10);
    expect(intensidade(0.25)).toBeCloseTo(1, 10);
    expect(intensidade(0.9)).toBeCloseTo(1, 10);
    expect(intensidade(-0.1)).toBeCloseTo(0.28, 10);
    expect(intensidade(0.1)).toBeGreaterThan(intensidade(0.05));
  });
});

describe("cartão do exterior", () => {
  test("sem cidades (2º turno) o cartão explica a ausência em vez de ficar vazio, e nunca promete círculos", () => {
    const html = cartaoExterior({ semCidades: true, cor: () => "#000" });
    expect(html).toContain("2º turno");
    expect(html).toContain("1º turno");
    expect(html).not.toMatch(/vencedor|vai ganhar|será eleito/i);
  });
  test("sem dados e sem aviso devolve vazio (o cartão fica escondido)", () => {
    expect(cartaoExterior({ cor: () => "#000" })).toBe("");
  });
});
