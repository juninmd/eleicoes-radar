import { describe, expect, test } from "bun:test";
import { acumular, analise, base, deriva, medir, medirDeriva, necessario, parteDe, restanteDe, simular, transferencia } from "./apuracao-projecao.js";

// Two parts with numbers that can be checked by hand.
const p1 = { id: "P1", versao: 1, apto: 1000, apurado: 500, validos: 400, votos: { A: 240, B: 120 } }; // remaining 400, A 60%, B 30%
const p2 = { id: "P2", versao: 1, apto: 2000, apurado: 1000, validos: 800, votos: { A: 200, B: 560 } }; // remaining 800, A 25%, B 70%

describe("restanteDe", () => {
  test("valid votes still to come = valid votes counted x electorate not yet counted / electorate counted", () => {
    expect(restanteDe(p1)).toBe(400);
    expect(restanteDe(p2)).toBe(800);
  });
  test("nothing remains when every section is in, and nothing can be said before the first one", () => {
    expect(restanteDe({ ...p1, apurado: 1000 })).toBe(0);
    expect(restanteDe({ ...p1, apurado: 0 })).toBe(0);
    expect(restanteDe({ ...p1, validos: 0 })).toBe(0);
    expect(restanteDe({ ...p1, apurado: 1200 })).toBe(0); // counted electorate above the total: the file is wrong, claim nothing
  });
});

describe("base", () => {
  const b = base([p1, p2]);
  test("each part keeps repeating its own shares in the votes to come, so a Lula-heavy part weighs by its size", () => {
    expect(b.restante).toBe(1200);
    expect(b.validos).toBe(1200);
    expect(b.final.A).toBeCloseTo(880 / 2400, 10);
    expect(b.final.B).toBeCloseTo(1360 / 2400, 10);
  });
  test("what is not in the list is 'outros', so the shares always add to 1, and the order is by final share", () => {
    expect(b.outros).toBeCloseTo(160 / 2400, 10); // 40 + 40 counted, 40 + 40 projected
    expect(Object.values(b.final).reduce((a, x) => a + x, 0) + b.outros).toBeCloseTo(1, 10);
    expect(b.ordem).toEqual(["B", "A"]);
  });
  test("with nothing counted there is nothing to project", () => {
    expect(base([]).ordem).toEqual([]);
    expect(base([{ ...p1, validos: 0, votos: {} }]).ordem).toEqual([]);
  });
});

describe("necessario", () => {
  const b = base([p1, p2]);
  test("share of the valid votes still to come that a candidate needs to reach 50% of the final total", () => {
    expect(necessario(b, "B")).toBeCloseTo(520 / 1200, 10);
    expect(necessario(b, "A")).toBeCloseTo(760 / 1200, 10);
  });
  test("above 100% it cannot be reached, and with nothing left it is decided by what is counted", () => {
    const quase = { ...p1, apurado: 900, validos: 800, votos: { A: 100, B: 100 } }; // 89 votes left, A would need 344 of them
    expect(necessario(base([quase]), "A")).toBeGreaterThan(1);
    expect(necessario(base([{ ...p1, apurado: 1000 }]), "A")).toBeNull();
  });
});

describe("medirDeriva", () => {
  const antes = { ...p1 };
  const depois = { ...p1, versao: 2, apurado: 600, validos: 500, votos: { A: 290, B: 190 } };
  test("margin of the new votes minus the margin the part already had, in the order A minus B", () => {
    const [s] = medirDeriva(antes, depois, "A", "B");
    expect(s.peso).toBe(100);
    expect(s.d).toBeCloseTo(-0.5, 10); // new votes: (50-70)/100 = -0.20; before: (240-120)/400 = +0.30
  });
  test("no new valid votes, or a file that went backwards, measures nothing", () => {
    expect(medirDeriva(antes, { ...antes, versao: 2 }, "A", "B")).toEqual([]);
    expect(medirDeriva(depois, antes, "A", "B")).toEqual([]);
  });
});

describe("acumular e deriva", () => {
  const v2 = { ...p1, versao: 2, apurado: 600, validos: 500, votos: { A: 290, B: 190 } };
  test("a part is measured only when a newer version with more votes arrives, and the same file twice counts once", () => {
    let mem = acumular(null, [p1, p2], "A", "B");
    expect(mem.amostras).toHaveLength(0);
    mem = acumular(mem, [p1, p2], "A", "B");
    expect(mem.amostras).toHaveLength(0);
    mem = acumular(mem, [v2, p2], "A", "B");
    expect(mem.amostras).toHaveLength(1);
    mem = acumular(mem, [v2, p2], "A", "B");
    expect(mem.amostras).toHaveLength(1);
  });
  test("a version older than the one held never replaces it", () => {
    let mem = acumular(acumular(null, [v2], "A", "B"), [p1], "A", "B");
    expect(mem.ultimo.P1.versao).toBe(2);
  });
  test("the drift is the average weighted by the new votes, and it is unknown until enough votes were measured", () => {
    let mem = acumular(acumular(null, [p1, p2], "A", "B"), [v2, p2], "A", "B");
    expect(deriva(mem, { minimo: 1000 })).toBeNull();
    const d = deriva(mem, { minimo: 50 });
    expect(d.mu).toBeCloseTo(-0.5, 10);
    expect(d.sigmaUf).toBe(0);
    expect(d.peso).toBe(100);
  });
  test("when the pair of leaders is no longer the same two candidates, the old margin means something else: the measurements restart", () => {
    let mem = acumular(acumular(null, [p1], "A", "B"), [v2], "A", "B");
    mem = acumular(mem, [v2], "A", "C"); // the same two swapped is kept (negated): see the tight-race tests below
    expect(mem.amostras).toHaveLength(0);
  });
  test("the spread across parts is weighted too", () => {
    const mem = { ultimo: {}, a: "A", b: "B", amostras: [{ peso: 100, d: -0.02 }, { peso: 100, d: -0.06 }] };
    const d = deriva(mem, { minimo: 1 });
    expect(d.mu).toBeCloseTo(-0.04, 10);
    expect(d.sigmaUf).toBeCloseTo(0.02, 10);
  });
});

describe("simular", () => {
  // Leader A at 48% with 20% of the valid votes still to come: reaching 50% needs 58% of what is left.
  const parte = { id: "X", versao: 1, apto: 1000, apurado: 800, validos: 800, votos: { A: 384, B: 352 } };
  const opts = { a: "A", b: "B", n: 1000, semente: 7 };

  test("the same input and seed give the same answer, so the screen does not flicker on a repaint", () => {
    expect(simular([parte], { ...opts, mu: -0.03 })).toEqual(simular([parte], { ...opts, mu: -0.03 }));
  });
  test("a leader below 50% who needs far more than the rest can give has no chance of winning in the 1st round", () => {
    const r = simular([parte], { ...opts, mu: -0.03, sigmaComum: 0.015, sigmaUf: 0.03 });
    expect(r.p1turno.A).toBe(0);
    expect(r.p1turno.B).toBe(0);
    expect(r.segundoTurno).toBe(1);
  });
  test("when the rest is huge in favour of A, A wins in the 1st round almost always", () => {
    const r = simular([parte], { ...opts, mu: 0.4, sigmaComum: 0.01, sigmaUf: 0.01 });
    expect(r.p1turno.A).toBeGreaterThan(0.95);
  });
  test("the chances of the 1st round and of the 2nd add to 1, and the band is ordered", () => {
    const r = simular([parte], { ...opts, mu: 0.1, sigmaComum: 0.05, sigmaUf: 0.05 });
    expect(r.p1turno.A + r.p1turno.B + r.segundoTurno).toBeCloseTo(1, 10);
    for (const id of ["A", "B"]) {
      const [lo, mid, hi] = r.faixa[id];
      expect(lo).toBeLessThanOrEqual(mid);
      expect(mid).toBeLessThanOrEqual(hi);
    }
  });
  test("with every section in there is nothing left to simulate: the counted share decides, with no noise", () => {
    const fechada = { ...parte, apurado: 1000, votos: { A: 410, B: 300 } }; // 410 of 800 valid = 51,25%
    const r = simular([fechada], { ...opts, mu: -0.1, sigmaComum: 0.1, sigmaUf: 0.1 });
    expect(r.p1turno.A).toBe(1);
    expect(r.faixa.A[0]).toBeCloseTo(r.faixa.A[2], 10);
  });
  test("a margin shift never pushes a share outside 0..1", () => {
    const r = simular([parte], { ...opts, mu: 5, sigmaComum: 1, sigmaUf: 1 });
    for (const id of ["A", "B"]) for (const q of r.faixa[id]) { expect(q).toBeGreaterThanOrEqual(0); expect(q).toBeLessThanOrEqual(1); }
  });
});

describe("transferencia", () => {
  test("the share of the other candidates' voters, among those who vote, that the runner-up needs to catch up", () => {
    // leader 47,2%, runner-up 44,9%, others 7,9%; 37,5% of the others stay home -> 4,9375% vote
    const x = transferencia({ a: 0.472, b: 0.449 }, 0.375);
    expect(x).toBeCloseTo(0.5 + 0.023 / (2 * 0.049375), 6);
  });
  test("it grows with abstention among the others and above 100% means it cannot be done by that alone", () => {
    expect(transferencia({ a: 0.472, b: 0.449 }, 0.5)).toBeGreaterThan(transferencia({ a: 0.472, b: 0.449 }, 0.25));
    expect(transferencia({ a: 0.6, b: 0.3 }, 0.3)).toBeGreaterThan(1);
  });
  test("with nobody else in the race there is no one to win over", () => {
    expect(transferencia({ a: 0.55, b: 0.45 }, 0.3)).toBeNull();
  });
});

describe("parteDe", () => {
  test("a part is built from the parsed file: ids and votes by candidate, the electorate counted and the version as a number", () => {
    const d = {
      versao: { data: "04/10/2026", hora: "20:00:00" }, eleitorado: { apto: 1000, apurado: 500 }, votos: { validos: 400 },
      secoes: { total: 10, totalizadas: 5 }, candidatos: [{ id: "A", votos: 240 }, { id: "B", votos: 120 }],
    };
    expect(parteDe("SP", d)).toEqual({ id: "SP", versao: 20261004200000, apto: 1000, apurado: 500, validos: 400, secoes: { total: 10, totalizadas: 5 }, votos: { A: 240, B: 120 } });
  });
});

describe("medir e analise", () => {
  const v2 = { ...p1, versao: 2, apurado: 600, validos: 500, votos: { A: 290, B: 190 } };

  test("the drift memory follows the two candidates ahead in the base scenario", () => {
    const mem = medir(medir(null, [p1, p2]), [v2, p2]);
    expect([mem.a, mem.b]).toEqual(["B", "A"]);
    expect(mem.amostras).toHaveLength(1);
  });

  test("before any drift was measured the spread is wide and neutral, and the view is told the drift is unknown", () => {
    const r = analise([p1, p2], medir(null, [p1, p2]));
    expect(r.medida).toBeNull();
    expect(r.params).toEqual({ mu: 0, sigmaComum: 0.04, sigmaUf: 0.04 });
    expect([r.a, r.b2]).toEqual(["B", "A"]);
  });

  test("after a measurement the simulation runs with it", () => {
    const r = analise([v2, p2], medir(medir(null, [p1, p2]), [v2, p2]));
    expect(r.medida.mu).toBeCloseTo(0.5, 10);
    expect(r.params.mu).toBeCloseTo(0.5, 10);
    expect(r.params.sigmaUf).toBeGreaterThanOrEqual(0.02);
  });

  test("it carries what the 1st-round and the 2nd-round sections need: what each leader needs, and the runner-up's transfer range", () => {
    const r = analise([p1, p2], null);
    expect(r.precisa.B).toBeCloseTo(520 / 1200, 10);
    expect(r.precisa.A).toBeCloseTo(760 / 1200, 10);
    expect(r.segundo).toHaveLength(2);
    expect(r.segundo[1]).toBeGreaterThan(r.segundo[0]); // more abstention among the others, more they must win over
  });

  test("with fewer than two candidates counted there is nothing to analyse", () => {
    expect(analise([{ ...p1, votos: { A: 400 } }], null)).toBeNull();
    expect(analise([], null)).toBeNull();
  });

  test("a measurement made for another pair of leaders is not used", () => {
    const outro = { ultimo: {}, a: "X", b: "Y", amostras: [{ peso: 1e9, d: -0.9 }] };
    expect(analise([p1, p2], outro).medida).toBeNull();
  });
});

describe("drift memory in a tight race and with files that carry no version", () => {
  const parte = (id, versao, apurado, validos, A, B) => ({ id, versao, apto: 100000, apurado, validos, votos: { A, B } });

  test("when the two leaders swap places the margin only changes sign: what was measured is kept, not thrown away", () => {
    let mem = medir(null, [parte("SP", 1, 40000, 40000, 20100, 19900), parte("BA", 1, 40000, 40000, 20050, 19950)]);
    mem = medir(mem, [parte("SP", 2, 60000, 60000, 30000, 30000), parte("BA", 2, 60000, 60000, 30060, 29940)]); // A still ahead
    const antes = deriva(mem, { minimo: 1 });
    mem = medir(mem, [parte("SP", 3, 70000, 70000, 34900, 35100), parte("BA", 3, 70000, 70000, 34990, 35010)]); // B edges ahead
    expect(mem.a).toBe("B");
    const depois = deriva(mem, { minimo: 1 });
    expect(depois).not.toBeNull();
    expect(depois.peso).toBeGreaterThan(antes.peso); // the new measurement was added on top of the old ones
    // the two samples taken while A led, re-read as the margin B-A, are the negation of what was measured then
    const velhas = mem.amostras.slice(0, 2);
    expect(velhas.reduce((s, x) => s + x.peso * x.d, 0) / velhas.reduce((s, x) => s + x.peso, 0)).toBeCloseTo(-antes.mu, 10);
  });

  test("a different pair of leaders (not the same two swapped) still starts the measurement over", () => {
    const base3 = (id, versao, A, B, C) => ({ id, versao, apto: 100000, apurado: 50000, validos: 50000 * versao, votos: { A, B, C } });
    let mem = medir(null, [base3("SP", 1, 20000, 15000, 5000)]);
    mem = medir(mem, [base3("SP", 2, 40000, 30000, 10000)]);
    expect(mem.amostras.length).toBeGreaterThan(0);
    mem = acumular(mem, [base3("SP", 3, 45000, 30000, 70000)], "C", "A"); // C and A lead now: B left the pair
    expect(mem.amostras).toEqual([]);
  });

  test("a file with no date or time is taken as newer, like the feed does, instead of freezing the projection on the first one", () => {
    const sem = (apurado, validos, A, B) => ({ id: "SP", versao: NaN, apto: 100000, apurado, validos, votos: { A, B } });
    const mem = medir(medir(null, [sem(10000, 10000, 6000, 4000)]), [sem(20000, 20000, 11000, 9000)]);
    expect(mem.ultimo.SP.validos).toBe(20000);
    expect(deriva(mem, { minimo: 1 })).not.toBeNull(); // 10.000 new votes were measured
  });

  test("an older version never replaces the newer one held", () => {
    const mem = medir(medir(null, [parte("SP", 2, 20000, 20000, 11000, 9000)]), [parte("SP", 1, 10000, 10000, 6000, 4000)]);
    expect(mem.ultimo.SP.validos).toBe(20000);
  });
});
