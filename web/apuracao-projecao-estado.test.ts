import { describe, expect, test } from "bun:test";
import { createProjecao } from "./apuracao-projecao-estado.js";

// Same shape the parser (apuracao-tse.js) hands to the views, reduced to what the projection reads.
const arq = (hora, { apto, apurado, validos, votos, fase = "parcial" }) => ({
  fase, versao: { data: "04/10/2026", hora },
  eleitorado: { apto, apurado }, votos: { validos }, secoes: { total: 100, totalizadas: Math.round((apurado / apto) * 100) },
  candidatos: Object.entries(votos).map(([id, v]) => ({ id, nome: `NOME ${id}`, partido: `P${id}`, votos: v })),
});
const SP1 = arq("20:00:00", { apto: 10000, apurado: 5000, validos: 4000, votos: { A: 2000, B: 1800, C: 200 } });
const BA1 = arq("20:00:00", { apto: 8000, apurado: 2000, validos: 1600, votos: { A: 500, B: 1000, C: 100 } });

describe("createProjecao", () => {
  test("before any file has numbers there is nothing to project", () => {
    const p = createProjecao();
    const out = p.ler([["SP", null], ["BA", arq("20:00:00", { apto: 10, apurado: 0, validos: 0, votos: { A: 0, B: 0 }, fase: "aguardando" })]]);
    expect(out.analise).toBeNull();
    expect(out.partes).toEqual([]);
  });

  test("one file is enough for a single-seat race, and the names come from the files", () => {
    const out = createProjecao().ler([["SP", SP1]]);
    expect(out.partes).toHaveLength(1);
    expect(out.analise.a).toBe("A");
    expect(out.nomes.A).toEqual({ nome: "NOME A", partido: "PA" });
  });

  test("the same files give back the same object: a repaint does not run the simulation again", () => {
    const p = createProjecao();
    const um = p.ler([["SP", SP1], ["BA", BA1]]);
    expect(p.ler([["SP", SP1], ["BA", BA1]])).toBe(um);
  });

  test("a file the feed kept after a failure is listed as old, and the answer is recomputed when that flag flips even if the file did not change", () => {
    const p = createProjecao();
    const limpo = p.ler([["SP", SP1, false], ["BA", BA1, false]]);
    expect(limpo.defasadas).toEqual([]);
    const velho = p.ler([["SP", SP1, true], ["BA", BA1, false]]);
    expect(velho.defasadas).toEqual(["SP"]);
    expect(velho).not.toBe(limpo);
    expect(velho.analise.a).toBe(limpo.analise.a); // the numbers are the same: the flag only changes what the screen says
    expect(p.ler([["SP", SP1, true], ["BA", BA1, false]])).toBe(velho); // and then it is memoized again
  });

  test("a source with no flag counts as current", () => {
    expect(createProjecao().ler([["SP", SP1], ["BA", BA1]]).defasadas).toEqual([]);
  });

  test("the drift is only known after a newer version of a file arrives, and then it is measured", () => {
    const p = createProjecao();
    expect(p.ler([["SP", SP1], ["BA", BA1]]).analise.medida).toBeNull();
    // B leads overall, so the margin is B - A. BA's new 1.600 votes split B +1.000 / A +650: margin 350/1600, against 500/1600 already in BA.
    const BA2 = arq("20:05:00", { apto: 8000, apurado: 4000, validos: 3200, votos: { A: 1150, B: 2000, C: 50 } });
    const depois = p.ler([["SP", SP1], ["BA", BA2]]);
    expect(depois.analise.a).toBe("B");
    expect(depois.analise.medida).not.toBeNull();
    expect(depois.analise.medida.mu).toBeCloseTo((350 - 500) / 1600, 5);
  });

  test("a file older than the one already held neither replaces it nor counts as a measurement", () => {
    const p = createProjecao();
    const novo = arq("20:05:00", { apto: 8000, apurado: 4000, validos: 3200, votos: { A: 1150, B: 2000, C: 50 } });
    p.ler([["SP", SP1], ["BA", novo]]);
    const out = p.ler([["SP", SP1], ["BA", BA1]]); // the TSE answered with the old BA file
    expect(out.analise.medida).toBeNull();
  });

  test("starting another race forgets the drift measured on the previous one", () => {
    const p = createProjecao();
    const BA2 = arq("20:05:00", { apto: 8000, apurado: 4000, validos: 3200, votos: { A: 1150, B: 2000, C: 50 } });
    p.ler([["SP", SP1], ["BA", BA1]]);
    p.ler([["SP", SP1], ["BA", BA2]]);
    p.reiniciar();
    expect(p.ler([["SP", SP1], ["BA", BA2]]).analise.medida).toBeNull();
  });
});
