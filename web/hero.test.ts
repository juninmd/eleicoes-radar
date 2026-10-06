import { expect, test } from "bun:test";
import { countUp, easeOut } from "./hero.js";

test("easeOut goes from 0 to 1 and never overshoots", () => {
  expect(easeOut(0)).toBe(0);
  expect(easeOut(1)).toBe(1);
  for (let t = 0; t <= 1; t += 0.1) expect(easeOut(t)).toBeLessThanOrEqual(1);
});

test("countUp without an animation clock writes the final value", () => {
  const el = { textContent: "–" } as HTMLElement;
  countUp(el, 1234, (n) => `#${n}`);
  expect(el.textContent).toBe("#1234");
});
