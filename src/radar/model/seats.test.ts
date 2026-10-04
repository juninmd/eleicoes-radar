import { describe, expect, test } from "bun:test";
import { createCsvParser, parseCsv } from "../csv";
import { explain, features, fitIsotonic, fitLogistic, predictGroups, recalibrate, type SeatCand } from "./seats";

const cand = (sq: string, lista: string, receita: number, ocupacao = "EMPRESÁRIO", grupo = "SP|DEPUTADO FEDERAL"): SeatCand => ({ sq, grupo, lista, receita, ocupacao });

describe("seat model", () => {
  const vagas = new Map([["SP|DEPUTADO FEDERAL", 2], ["AC|DEPUTADO FEDERAL", 1]]);
  const cs = [cand("a", "X", 900), cand("b", "X", 50), cand("c", "Y", 40, "DEPUTADO"), cand("d", "Y", 10), cand("e", "Z", 0), cand("f", "Q", 10, "EMPRESÁRIO", "AC|DEPUTADO FEDERAL")];

  test("features scale money by seats and flag missing money and sitting deputies", () => {
    const X = features(cs, vagas);
    expect(X.get("a")![1]).toBeGreaterThan(X.get("b")![1]!);
    expect(X.get("e")![4]).toBe(1);
    expect(X.get("c")![5]).toBe(1);
    // "b" is second on the richest list: its rank feature is better than "d", last on a poor list.
    expect(X.get("b")![3]).toBeLessThan(X.get("d")![3]!);
  });

  test("features match the vectors the stored coefficients were trained on (captured before place() was extracted)", () => {
    const golden: Record<string, number[]> = {
      a: [1, 0.593327, 0.667829, -1.064711, 0, 0, 0],
      b: [1, -2.207275, 0.667829, -0.371564, 0, 0, 0],
      c: [1, -2.407946, -1.89712, -0.09531, 0, 1, 0],
      d: [1, -3.506558, -1.89712, 0.597837, 0, 0, 0],
      e: [1, -4.60517, -2.995732, 0, 1, 0, 0],
      f: [1, 0.00995, 0.04879, -0.693147, 0, 0, 0],
    };
    const X = features(cs, vagas);
    for (const [sq, want] of Object.entries(golden)) want.forEach((w, i) => expect(X.get(sq)![i]).toBeCloseTo(w, 5));
  });

  test("explain reports the same ranks and list weight the features use", () => {
    const why = explain(cs, vagas);
    expect(why.get("a")).toEqual({ r: 1, g: 5, lr: 1, ln: 2, vl: 1.9, dep: false }); // list X holds 950 of 1000 in money × 2 seats
    expect(why.get("b")).toMatchObject({ r: 2, lr: 2, ln: 2 });
    expect(why.get("c")).toMatchObject({ r: 3, lr: 1, dep: true });
    expect(why.get("e")).toMatchObject({ r: 5, ln: 1, vl: 0 }); // no money: no expected seats
    expect(why.get("f")).toMatchObject({ r: 1, g: 1 }); // groups are independent
  });

  test("group probabilities add up to the seats before recalibration", () => {
    const p = predictGroups(cs, vagas, [0, 1, 0.1, -0.3, -0.3, 2, 0]);
    const sp = ["a", "b", "c", "d", "e"].reduce((s, k) => s + p.get(k)!, 0);
    expect(sp).toBeCloseTo(2, 3);
    expect(p.get("f")).toBeCloseTo(1, 3); // sole candidate for one seat
    expect(p.get("a")).toBeGreaterThan(p.get("e")!);
  });

  test("logistic regression recovers the direction of a separable signal", () => {
    const X = Array.from({ length: 200 }, (_, i) => [1, i / 100 - 1]);
    const y = X.map(([, x]) => (x! + (Math.sin(x! * 50) * 0.3) > 0 ? 1 : 0));
    const w = fitLogistic(X, y);
    expect(w[1]).toBeGreaterThan(1);
  });

  test("isotonic calibration is monotone and maps to observed rates", () => {
    const knots = fitIsotonic([0.1, 0.2, 0.3, 0.8, 0.9], [0, 1, 0, 1, 1]);
    for (let i = 1; i < knots.length; i++) expect(knots[i]![1]).toBeGreaterThanOrEqual(knots[i - 1]![1]);
    expect(recalibrate(0.95, knots)).toBe(1);
    expect(recalibrate(0.05, knots)).toBe(0);
    expect(recalibrate(0.5, null)).toBe(0.5);
  });
});

describe("incremental CSV", () => {
  const text = '"A";"B"\r\n"x;1";"he said ""hi"""\r\n"multi\nline";"2"\r\n';

  test("chunked parsing equals whole-text parsing at every split point", () => {
    const whole = [...parseCsv(text)];
    expect(whole).toEqual([{ A: "x;1", B: 'he said "hi"' }, { A: "multi\nline", B: "2" }]);
    for (let cut = 1; cut < text.length; cut++) {
      const p = createCsvParser();
      const rows = [...p.feed(text.slice(0, cut)), ...p.feed(text.slice(cut)), ...p.end()];
      expect(rows).toEqual(whole);
    }
  });
});
