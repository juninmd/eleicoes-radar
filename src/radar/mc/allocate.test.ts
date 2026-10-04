import { describe, expect, test } from "bun:test";
import { allocate, quotient, RULES, type ListVotes } from "./allocate";

const list = (id: string, legenda: number, ...votos: number[]): ListVotes => ({ id, legenda, cands: votos.map((v, i) => ({ id: `${id}${i + 1}`, votos: v })) });
const names = (s: Set<string>) => [...s].sort();

describe("quotient", () => {
  test("a fraction up to one half is dropped and above it rounds up (art. 106)", () => {
    expect(quotient(10, 4)).toBe(2); // 2.5
    expect(quotient(11, 4)).toBe(3); // 2.75
    expect(quotient(9, 4)).toBe(2); // 2.25
    expect(quotient(12, 4)).toBe(3);
  });
});

describe("allocate", () => {
  // N=4, V=13000, QE=3250. QP: A=2 (8500/3250), B=1, C=0. The 4th seat goes to the best average:
  // A 8500/3=2833 beats B 3500/2=1750 and C 1000.
  const lists = [list("A", 0, 4000, 3000, 1500), list("B", 0, 3000, 500), list("C", 0, 1000)];

  test("quotient seats first, then the leftover by highest average", () => {
    const r = allocate(lists, 4, RULES["2018"]!);
    expect(r.qe).toBe(3250);
    expect(names(r.elected)).toEqual(["A1", "A2", "A3", "B1"]);
    expect(Object.fromEntries(r.seatsByList)).toEqual({ A: 3, B: 1, C: 0 });
  });

  test("legend votes count for the list's quotient and averages but name nobody", () => {
    const r = allocate([list("A", 3000, 1000, 500), list("B", 0, 2200, 300)], 2, RULES["2018"]!);
    // V = 7000, QE = 3500: A has 4500 -> 1 seat (A1), B has 2500 -> 0; leftover: A 4500/2 = 2250 vs B 2500 -> B.
    expect(r.qe).toBe(3500);
    expect(names(r.elected)).toEqual(["A1", "B1"]);
  });

  // A has 1996 legend votes and one candidate with 4 votes; B has two candidates with 150 and 120. N=2, V=2270, QE=1135.
  const weakCand = [list("A", 1996, 4), list("B", 0, 150, 120)];

  test("a candidate below 10% of the quotient cannot take the seat the list's votes earned (2018)", () => {
    // A earns a quotient seat (2000/1135 = 1) but A1 has 4 votes (< 113.5): the seat goes to the list that has eligible candidates.
    const r = allocate(weakCand, 2, RULES["2018"]!);
    expect(names(r.elected)).toEqual(["B1", "B2"]);
  });

  test("2014 had no individual minimum", () => {
    expect(names(allocate(weakCand, 2, RULES["2014"]!).elected)).toEqual(["A1", "B1"]);
  });

  test("when nobody clears the individual minimum the most voted fill the seats (art. 111 last resort)", () => {
    const r = allocate([list("A", 0, 4), list("B", 0, 3)], 2, RULES["2018"]!);
    expect(names(r.elected)).toEqual(["A1", "B1"]);
  });

  test("2022: a list under 80% of the quotient is out of the first leftover phase", () => {
    // N=3, V=10400, QE=3467: A has 6000 -> 1 quotient seat; 80% of QE = 2773.6, so B (2400) and C (2000) are out.
    // Leftover 1: A 6000/2 = 3000 (a2 has 2000 >= 20% of QE) beats the rest anyway, so A takes it.
    // Leftover 2: A has no candidate left, phase one is exhausted, phase two opens to everybody: B 2400 > C 2000.
    const lists22 = [list("A", 0, 4000, 2000), list("B", 0, 2400), list("C", 0, 2000)];
    const r = allocate(lists22, 3, RULES["2022"]!);
    expect(names(r.elected)).toEqual(["A1", "A2", "B1"]);
  });

  test("2022 vs the unrestricted rule: the 80% list barrier decides who gets the leftover", () => {
    // N=4, V=10000, QE=2500. QP: A 4900 -> 1, B 3200 -> 1, C 1900 -> 0. Two leftovers. 80% of QE = 2000, so C (1900) is out of phase one
    // and A takes both (4900/2 = 2450, then 4900/3 = 1633 against B's 1600).
    const barrier = [list("A", 0, 2000, 1500, 1000, 400), list("B", 0, 3200), list("C", 0, 1900)];
    expect(names(allocate(barrier, 4, RULES["2022"]!).elected)).toEqual(["A1", "A2", "A3", "B1"]);
    // Same votes with the barrier removed: C's 1900 average beats A's third seat (4900/3 = 1633).
    expect(names(allocate(barrier, 4, { ...RULES["2022"]!, sobrasListMin: 0 }).elected)).toEqual(["A1", "A2", "B1", "C1"]);
  });

  test("a leftover goes to the best average that still has an eligible candidate", () => {
    // N=3, V=9000, QE=3000. A has 6000 but only one candidate with votes: it can use 1 seat, not 2.
    const r = allocate([list("A", 0, 6000), list("B", 0, 2000, 1000)], 3, RULES["2018"]!);
    expect(names(r.elected)).toEqual(["A1", "B1", "B2"]);
  });

  test("seats elected never exceed the seats, whatever the votes", () => {
    for (const seats of [1, 2, 7, 30]) {
      const many = Array.from({ length: 8 }, (_, i) => list(`L${i}`, i * 13, ...Array.from({ length: 12 }, (_, k) => 1000 / (k + 1) + i * 37)));
      for (const rules of Object.values(RULES)) expect(allocate(many, seats, rules).elected.size).toBeLessThanOrEqual(seats);
    }
  });

  test("no votes or no seats elects nobody", () => {
    expect(allocate([list("A", 0, 0, 0)], 3, RULES["2018"]!).elected.size).toBe(0);
    expect(allocate(lists, 0, RULES["2018"]!).elected.size).toBe(0);
    expect(allocate([], 5, RULES["2022"]!).qe).toBe(0);
  });

  test("a tie between equal lists is settled by id, whatever the order of the input", () => {
    const a = allocate([list("A", 0, 1000), list("B", 0, 1000)], 1, RULES["2018"]!);
    const b = allocate([list("B", 0, 1000), list("A", 0, 1000)], 1, RULES["2018"]!);
    expect(names(a.elected)).toEqual(["A1"]);
    expect(names(b.elected)).toEqual(["A1"]);
  });
});
