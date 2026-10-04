import { expect, test } from "bun:test";
import { fold, matches, SORTS, semEvidencia } from "./lista.js";

const cand = (o = {}) => ({ nome: "JOSÉ DA SILVA", urna: "ZÉ DO POVO", num: "1234", partido: "PC do B", fin: { total: 0 }, ...o });
const row = (nota, cobertura, total = 0) => ({ s: { nota, cobertura }, c: { num: "1", fin: { total } } });

test("search ignores accents and case in both directions", () => {
  expect(matches(cand(), "jose")).toBe(true);
  expect(matches(cand({ nome: "Jose Lima", urna: "" }), "JOSÉ")).toBe(true);
  expect(matches(cand(), "ze do")).toBe(true);
  expect(matches(cand(), "maria")).toBe(false);
});

test("a number matches from its first digit, not from the middle", () => {
  expect(matches(cand(), "12")).toBe(true);
  expect(matches(cand(), "34")).toBe(false);
});

test("a party matches as a whole, with or without the spaces and case of its acronym", () => {
  expect(matches(cand(), "pcdob")).toBe(true);
  expect(matches(cand(), "PC do B")).toBe(true);
  expect(matches(cand(), "pc")).toBe(false);
});

test("an empty or blank query keeps everyone; a missing urna name does not crash", () => {
  expect(matches(cand(), "")).toBe(true);
  expect(matches(cand(), "   ")).toBe(true);
  expect(matches(cand({ urna: undefined }), "zzz")).toBe(false);
  expect(fold(undefined)).toBe("");
});

test("without a score, the list is ordered by campaign money instead of arbitrary order", () => {
  const rows = [row(null, 0, 10), row(null, 0, 900), row(null, 0, 300)];
  expect(rows.sort(SORTS.nota).map((r) => r.c.fin.total)).toEqual([900, 300, 10]);
});

test("a scored candidate outranks an unscored one; equal scores prefer more evidence", () => {
  const rows = [row(null, 0, 999), row(60, 0.3), row(60, 0.9)];
  expect(rows.sort(SORTS.nota).map((r) => [r.s.nota, r.s.cobertura])).toEqual([[60, 0.9], [60, 0.3], [null, 0]]);
});

test("sorting by evidence puts the best documented first, then the higher score", () => {
  const rows = [row(80, 0.2), row(50, 0.9), row(70, 0.9)];
  expect(rows.sort(SORTS.evidencia).map((r) => r.s.nota)).toEqual([70, 50, 80]);
});

test("the no-evidence hint needs a non-empty list where nobody has any", () => {
  expect(semEvidencia([])).toBe(false);
  expect(semEvidencia([row(null, 0), row(null, 0)])).toBe(true);
  expect(semEvidencia([row(null, 0), row(50, 0.1)])).toBe(false);
});
