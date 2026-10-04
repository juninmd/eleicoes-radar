import { describe, expect, test } from "bun:test";
import { lideres } from "./expectativa";

const f = (sq: string, media: number) => ({ sq, media, lo: media - 0.05, hi: media + 0.05, pVitoria: 0, p2turno: null, tendencia: null });
const quem = new Map([["1", { nome: "Ana", partido: "AAA" }], ["2", { nome: "Beto", partido: "BBB" }], ["3", { nome: "Cris", partido: "CCC" }], ["4", { nome: "Duda", partido: "DDD" }]]);

describe("lideres", () => {
  test("keeps the best-placed candidates by poll average, highest first", () => {
    expect(lideres([f("2", 0.3), f("1", 0.5), f("4", 0.1), f("3", 0.2)], quem, 3).map((l) => l.sq)).toEqual(["1", "2", "3"]);
  });

  test("a tie is broken by candidate id, so a rebuild never reshuffles the map", () => {
    expect(lideres([f("3", 0.4), f("1", 0.4)], quem).map((l) => l.sq)).toEqual(["1", "3"]);
  });

  test("a candidate with no poll mentions is not a leader, and one we cannot name is skipped", () => {
    expect(lideres([f("1", 0), f("9", 0.6), f("2", 0.2)], quem).map((l) => l.sq)).toEqual(["2"]);
  });

  test("carries what the map prints and rounds like the rest of the poll data", () => {
    const [l] = lideres([f("1", 0.123456)], quem);
    expect(l).toEqual({ sq: "1", nome: "Ana", partido: "AAA", media: 0.1235, lo: 0.0735, hi: 0.1735 });
  });
});
