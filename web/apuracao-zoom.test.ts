import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fatorRolagem } from "./apuracao-zoom.js";

describe("fatorRolagem: the mouse wheel zooms the map", () => {
  test("a plain wheel notch zooms in and out, symmetrical", () => {
    const dentro = fatorRolagem(-100, 0);
    const fora = fatorRolagem(100, 0);
    expect(dentro).toBeGreaterThan(1);
    expect(fora).toBeLessThan(1);
    expect(dentro * fora).toBeCloseTo(1, 10);
    expect(dentro).toBeLessThan(1.25); // one notch is a step, not a jump to the ceiling
  });

  test("lines and pages are converted to pixels before the factor", () => {
    expect(fatorRolagem(-3, 1)).toBeCloseTo(fatorRolagem(-48, 0), 10); // Firefox reports lines (16 px each)
    expect(fatorRolagem(-1, 2)).toBe(fatorRolagem(-160, 0)); // a page is clamped like a fast flick
  });

  test("a fast flick is clamped to one step", () => {
    expect(fatorRolagem(-1000, 0)).toBe(fatorRolagem(-160, 0));
    expect(fatorRolagem(1000, 0)).toBe(fatorRolagem(160, 0));
    expect(fatorRolagem(-1000, 0)).toBeLessThan(1.4);
  });

  test("no wheel movement means no zoom", () => {
    expect(fatorRolagem(0, 0)).toBe(1);
  });
});

test("apuracao-zoom listens to the wheel without waiting for Ctrl/⌘", () => {
  const code = readFileSync("web/apuracao-zoom.ts", "utf8");
  expect(code).toContain('vp.addEventListener("wheel", aoRolar, { passive: false })');
  expect(code).not.toContain("if (!e.ctrlKey && !e.metaKey) return;");
});
