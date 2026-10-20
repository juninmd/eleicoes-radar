import { describe, expect, test } from "bun:test";
import { histCorrida, horaCorrida, horaNoite, PASSO_INICIAL, PASSOS, quadroCorrida, quadroNoite } from "./apuracao-demo.js";
import { eventosNoite, resumoUf, topoNacional } from "./apuracao-noite.js";
import { fatosCorrida } from "./apuracao-corrida.js";
import { linhasUf } from "./apuracao-nacional.js";
import { avancoDe } from "./apuracao-nacional.js";
import { TILES } from "./apuracao-noite.js";

describe("simulação: a noite inventada", () => {
  test("the same step always gives the same file, and a step outside the night is pinned to its ends", () => {
    expect(quadroCorrida(30)).toEqual(quadroCorrida(30));
    expect(quadroCorrida(-4)).toBe(quadroCorrida(0));
    expect(quadroCorrida(999)).toBe(quadroCorrida(PASSOS - 1));
    expect(quadroNoite(12)).toBe(quadroNoite(12));
    expect(PASO()).toBe(true);
  });

  test("the count only moves forward: sections and votes never go down, pauses repeat the file before", () => {
    let secoes = 0, votos = 0;
    for (let i = 0; i < PASSOS; i++) {
      const d = quadroCorrida(i);
      const v = d.candidatos.reduce((s, c) => s + c.votos, 0);
      expect(d.secoes.totalizadas).toBeGreaterThanOrEqual(secoes);
      expect(v).toBeGreaterThanOrEqual(votos - 1); // rounding of six candidates
      secoes = d.secoes.totalizadas; votos = v;
    }
    expect(quadroCorrida(18).secoes.totalizadas).toBe(quadroCorrida(16).secoes.totalizadas); // steps 17 and 18 are the TSE's pause
    expect(quadroCorrida(PASSOS - 1).fase).toBe("concluida");
    expect(quadroCorrida(0).fase).not.toBe("concluida");
  });

  test("the race ends with the shares adding to 100% and the first two marked '2º turno', the way the TSE writes it", () => {
    const d = quadroCorrida(PASSOS - 1);
    expect(d.candidatos.reduce((s, c) => s + c.pct, 0)).toBeCloseTo(1, 6);
    expect(d.candidatos.slice(0, 2).map((c) => c.situacao)).toEqual(["2º turno", "2º turno"]);
    expect(d.candidatos.slice(2).every((c) => c.situacao === "")).toBe(true);
    expect([...d.candidatos].sort((a, b) => b.votos - a.votos).map((c) => c.id)).toEqual(d.candidatos.map((c) => c.id));
    expect(avancoDe(d.secoes)).toBe(1);
  });

  test("everything is made up: ids, names and parties of fictional people, no photos to find", () => {
    for (const i of [0, PASSO_INICIAL, PASSOS - 1]) {
      for (const c of quadroCorrida(i).candidatos) expect(c.id).toMatch(/^sim-/);
      for (const e of Object.values(quadroNoite(i).ufs)) for (const c of e.dados!.candidatos) expect(c.id).toMatch(/^sim-/);
    }
    expect(quadroCorrida(PASSOS - 1).versao.data).toBe("simulação");
  });

  test("the night has the 27 states of the map, every one of them finished at the end", () => {
    const f = quadroNoite(PASSOS - 1);
    expect(Object.keys(f.ufs).sort()).toEqual(Object.keys(TILES).sort());
    for (const e of Object.values(f.ufs)) expect(e.dados!.fase).toBe("concluida");
    expect(Object.values(quadroNoite(0).ufs).some((e) => e.dados!.fase === "aguardando")).toBe(true);
  });

  test("the night is worth watching: states open, states turn, and the whole country changes side at least once", () => {
    let antes: ReturnType<typeof resumos> | null = null, topoAntes: ReturnType<typeof topoNacional> | null = null;
    const tipos = new Map<string, number>();
    for (let i = 0; i < PASSOS; i++) {
      const linhas = linhasUf(quadroNoite(i).ufs, "Presidente");
      const r = resumos(linhas), topo = topoNacional(linhas);
      for (const e of eventosNoite(antes, r, topoAntes, topo)) tipos.set(e.tipo, (tipos.get(e.tipo) ?? 0) + 1);
      antes = r; topoAntes = topo;
    }
    expect(tipos.get("abre")).toBe(27);
    expect(tipos.get("virou")).toBeGreaterThanOrEqual(2);
    expect(tipos.get("total")).toBeGreaterThanOrEqual(1);
    expect(tipos.get("conclui")).toBeGreaterThanOrEqual(5);
  });

  test("the race has overtakes to show, and the chart history grows with the night", () => {
    let passou = 0;
    for (let i = 1; i < PASSOS; i++) passou += fatosCorrida(quadroCorrida(i - 1), quadroCorrida(i)).filter((f) => f.tipo === "passou").length;
    expect(passou).toBeGreaterThanOrEqual(3);
    expect(histCorrida(0)).toEqual([]);
    expect(histCorrida(PASSO_INICIAL).length).toBeGreaterThan(5);
    expect(histCorrida(PASSOS - 1).length).toBeGreaterThan(histCorrida(PASSO_INICIAL).length);
  });

  test("the clock of the night is a real time of day", () => {
    expect(horaCorrida(0)).toBe("17:30");
    expect(horaNoite(0)).toBe("18:00");
    expect(horaNoite(PASSOS - 1)).toMatch(/^\d{2}:\d{2}$/);
  });
});

const resumos = (linhas: ReturnType<typeof linhasUf>) => new Map(linhas.map((l) => [l.uf, resumoUf(l)]));
function PASO() { return PASSO_INICIAL > 0 && PASSO_INICIAL < PASSOS - 1; }
