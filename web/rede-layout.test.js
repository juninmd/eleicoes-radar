import { describe, expect, test } from "bun:test";
import { egoOf, layout } from "./rede-layout.js";

const nodes = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
const links = [{ a: "a", b: "b" }, { a: "a", b: "c" }, { a: "d", b: "e" }];

describe("rede layout", () => {
  test("is deterministic and keeps every node inside the canvas", () => {
    const one = layout(nodes, links, { width: 400, height: 300 });
    const two = layout(nodes, links, { width: 400, height: 300 });
    expect(one).toEqual(two);
    for (const p of one) {
      expect(p.x).toBeGreaterThanOrEqual(24);
      expect(p.x).toBeLessThanOrEqual(376);
      expect(p.y).toBeGreaterThanOrEqual(24);
      expect(p.y).toBeLessThanOrEqual(276);
    }
  });
  test("members of a cluster end up closer to each other than to another cluster", () => {
    const mk = (h) => [h, ...Array.from({ length: 8 }, (_, i) => `${h}${i}`)];
    const ids = [...mk("A"), ...mk("B")];
    const ls = ["A", "B"].flatMap((h) => mk(h).slice(1).map((m) => ({ a: h, b: m })));
    const pts = layout(ids.map((id) => ({ id })), ls);
    const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const dists = (f) => pts.flatMap((p, i) => pts.slice(i + 1).filter((q) => f(p.id[0] === q.id[0])).map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
    expect(mean(dists((same) => same))).toBeLessThan(mean(dists((same) => !same)));
  });
  test("ego graph keeps the node, its neighbours and links between them only", () => {
    const e = egoOf("a", nodes, links);
    expect(e.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(e.links.length).toBe(2);
  });
  test("ignores links to unknown nodes and empty input", () => {
    expect(layout([], [])).toEqual([]);
    expect(layout([{ id: "x" }], [{ a: "x", b: "zz" }]).length).toBe(1);
  });
});
