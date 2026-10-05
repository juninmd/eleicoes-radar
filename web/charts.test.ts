import { expect, test } from "bun:test";
import { bubbles, heat, hbars, legendSources, lorenz, SOURCES, stackRow } from "./charts.js";
import { sankey } from "./sankey.js";

const nums = (s) => [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

test("bars are proportional, and a zero value never draws a sliver that reads as data", () => {
  const html = hbars([{ label: "A", value: 50, text: "50" }, { label: "B", value: 25, text: "25" }, { label: "C", value: 0, text: "0" }]);
  expect([...html.matchAll(/<i style="width:([\d.]+)%/g)].map((m) => Number(m[1]))).toEqual([100, 50, 0]);
});

test("a marker shares the bar scale, so it can sit beyond the bar without clipping", () => {
  const html = hbars([{ label: "A", value: 20, marker: 40, text: "x" }]);
  expect(html).toContain('<i style="width:50.0%');
  expect(html).toContain('<em style="left:100.0%');
});

test("labels are escaped everywhere", () => {
  const evil = '<img src=x onerror="1">';
  for (const html of [
    hbars([{ label: evil, sub: evil, value: 1, text: evil }]),
    stackRow({ label: evil, vals: { publico: 1 }, total: 1, max: 1, text: evil }),
    bubbles([{ id: "a", label: evil, x: 10, y: 1, r: 1, title: evil }], { xFmt: String, yFmt: String }),
    heat({ rows: [{ key: "r", label: evil }], cols: [{ key: "c", label: evil }], cell: () => ({ text: evil, v: 0.5, title: evil }), caption: evil }),
    sankey({ left: [{ id: "a", label: evil, value: 1 }], right: [{ id: "b", label: evil, value: 1 }], links: [{ from: "a", to: "b", value: 1 }] }),
  ]) expect(html).not.toContain("<img");
});

test("a stacked row draws only the sources that exist and states their shares in text", () => {
  const html = stackRow({ label: "PL", vals: { publico: 75, pf: 25, partido: 0 }, total: 100, max: 200, text: "R$ 100" });
  expect((html.match(/class="seg /g) ?? []).length).toBe(2);
  expect(html).toContain("Fundos públicos 75%");
  expect(html).toContain("Pessoas físicas 25%");
  expect(html).toContain("width:50.0%"); // 100 of 200: comparable with the other rows
});

test("a row with no money has no bar at all, not an empty one", () => {
  expect(stackRow({ label: "X", vals: {}, total: 0, max: 100, text: "–" })).not.toContain("stack");
});

test("the legend and the rows use the same five sources in the same order", () => {
  expect(SOURCES.map((s) => s.cls)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  expect(legendSources().match(/class="key s\d"/g)).toHaveLength(5);
});

test("bubbles: points that cannot sit on a log axis are dropped, the rest are all drawn", () => {
  const pts = [{ id: "a", label: "A", x: 0, y: 1, r: 1, title: "a" }, { id: "b", label: "B", x: 100, y: 2, r: 4, title: "b" }, { id: "c", label: "C", x: 1e6, y: 3, r: 9, title: "c" }];
  const svg = bubbles(pts, { xFmt: String, yFmt: String });
  expect((svg.match(/<circle/g) ?? []).length).toBe(2);
  expect(bubbles([pts[0]], { xFmt: String, yFmt: String })).toBe("");
});

test("bubbles: only the highest points are named, the rest stay as tooltips", () => {
  const pts = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, label: `L${i}`, x: 10 ** (i % 5 + 2), y: i + 1, r: 1, title: `t${i}` }));
  const svg = bubbles(pts, { xFmt: String, yFmt: String, nLabels: 3 });
  expect((svg.match(/<g class="bub"><circle[^>]*\/><text/g) ?? []).length).toBe(3);
  expect(svg).toContain(">L11<");
  expect(svg).not.toContain(">L0<");
});

test("a bigger count draws a bigger bubble, and a larger y sits higher on the page", () => {
  const svg = bubbles([{ id: "a", label: "A", x: 100, y: 1, r: 1, title: "a" }, { id: "b", label: "B", x: 1000, y: 5, r: 16, title: "b" }], { xFmt: String, yFmt: String });
  const c = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  const [big, small] = c; // sorted: biggest drawn first
  expect(big[2]).toBeGreaterThan(small[2]);
  expect(big[1]).toBeLessThan(small[1]); // SVG y grows downward
});

test("bubbles on the first and last decade stay whole inside the frame instead of being cut by it", () => {
  const w = 640;
  const svg = bubbles([{ id: "a", label: "A", x: 1e4, y: 1, r: 80, title: "a" }, { id: "b", label: "B", x: 1e8, y: 2, r: 80, title: "b" }], { w, xFmt: String, yFmt: String });
  const c = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  expect(c).toHaveLength(2);
  for (const [cx, , r] of c) {
    expect(cx - r).toBeGreaterThanOrEqual(0);
    expect(cx + r).toBeLessThanOrEqual(w);
  }
});

test("concentration curve: eleven points from the origin, none when there is nothing to show", () => {
  const svg = lorenz([0.5, 0.7, 0.8, 0.85, 0.9, 0.93, 0.96, 0.98, 0.99, 1]);
  expect(nums(svg.match(/<polyline class="curve" points="([^"]+)"/)[1])).toHaveLength(22);
  expect(svg).toContain("10% que mais arrecadam ficam com 50%");
  expect(lorenz([])).toBe("");
  expect(lorenz(undefined)).toBe("");
});

test("heat map: a cell without data is marked as such and carries no colour", () => {
  const html = heat({ rows: [{ key: "r", label: "R" }], cols: [{ key: "a", label: "A" }, { key: "b", label: "B" }], cell: (r, c) => (c === "a" ? { text: "80%", v: 0.8, title: "t" } : { text: "–", v: null, title: "sem votos" }), caption: "c" });
  expect(html).toContain('style="--v:0.80"');
  expect(html).toContain('<td class="nd" title="sem votos">');
});

test("sankey: both columns use one scale and the ribbons fill their nodes exactly", () => {
  const svg = sankey({
    left: [{ id: "a", label: "A", value: 100, cls: "s1" }],
    right: [{ id: "x", label: "X", value: 60 }, { id: "y", label: "Y", value: 40 }],
    links: [{ from: "a", to: "x", value: 60 }, { from: "a", to: "y", value: 40 }],
  });
  const rects = [...svg.matchAll(/<rect class="skn[^"]*" x="[\d.]+" y="[\d.]+" width="14" height="([\d.]+)"/g)].map((m) => Number(m[1]));
  expect(rects[0]).toBeCloseTo(rects[1] + rects[2], 0);
  const paths = [...svg.matchAll(/ d="M[\d.]+,([\d.]+) C[^L]*? ([\d.]+),([\d.]+) L[\d.]+,([\d.]+)/g)];
  const thick = paths.map((m) => Number(m[4]) - Number(m[3]));
  expect(thick).toHaveLength(2);
  expect(thick[0] / thick[1]).toBeCloseTo(1.5, 1);
  expect(thick[0] + thick[1]).toBeCloseTo(rects[0], 0);
});

test("sankey: nodes and their gaps always fit inside the drawing, however many parties", () => {
  const right = Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, label: `R${i}`, value: 10 + i }));
  const total = right.reduce((a, r) => a + r.value, 0);
  const svg = sankey({ left: [{ id: "a", label: "A", value: total }], right, links: right.map((r) => ({ from: "a", to: r.id, value: r.value })), height: 300 });
  const boxes = [...svg.matchAll(/<rect class="skn[^"]*" x="[\d.]+" y="([\d.]+)" width="14" height="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  expect(boxes).toHaveLength(15);
  for (const [y, hgt] of boxes) { expect(y).toBeGreaterThanOrEqual(0); expect(y + hgt).toBeLessThanOrEqual(300); }
});

test("sankey: zero-value and dangling links are skipped, and no money means no chart", () => {
  const base = { left: [{ id: "a", label: "A", value: 10 }], right: [{ id: "x", label: "X", value: 10 }] };
  const svg = sankey({ ...base, links: [{ from: "a", to: "x", value: 10 }, { from: "a", to: "x", value: 0 }, { from: "zz", to: "x", value: 5 }] });
  expect((svg.match(/<path class="sk/g) ?? []).length).toBe(1);
  expect(sankey({ left: [{ id: "a", label: "A", value: 0 }], right: [], links: [] })).toBe("");
});

test("sankey: a stack of tiny nodes at the bottom keeps every label inside the drawing", () => {
  const right = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, label: `R${i}`, value: i === 0 ? 900 : 10 }));
  const svg = sankey({ left: [{ id: "a", label: "A", value: 1000 }], right, links: right.map((r) => ({ from: "a", to: r.id, value: r.value })), height: 440 });
  const ys = [...svg.matchAll(/<text class="sklab" x="[\d.]+" y="([\d.]+)" text-anchor="start"/g)].map((m) => Number(m[1]));
  expect(ys).toHaveLength(11);
  expect(Math.max(...ys)).toBeLessThanOrEqual(440);
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(15 - 1e-6);
});

test("sankey: labels of small neighbouring nodes never collide", () => {
  const right = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, label: `R${i}`, value: i === 0 ? 1000 : 1 }));
  const svg = sankey({ left: [{ id: "a", label: "A", value: 1009 }], right, links: right.map((r) => ({ from: "a", to: r.id, value: r.value })) });
  const ys = [...svg.matchAll(/<text class="sklab" x="[\d.]+" y="([\d.]+)" text-anchor="start"/g)].map((m) => Number(m[1]));
  expect(ys).toHaveLength(10);
  for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(15);
});
