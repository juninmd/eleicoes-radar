import { expect, test } from "bun:test";
import { packLayout } from "./al-layout.js";

const nodes = (...ids) => ids.map((id) => ({ id, label: id, n: 1 }));
const clique = (ids) => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => ({ a, b, w: 1 })));
// Three separate lists, as in a state race: a federation of three, two pairs.
const G = { nodes: nodes("PT", "PV", "PCDOB", "PP", "UNIAO", "REDE", "PSOL"), links: [...clique(["PT", "PV", "PCDOB"]), ...clique(["PP", "UNIAO"]), ...clique(["REDE", "PSOL"])] };
const clusterOf = (id) => (["PT", "PV", "PCDOB"].includes(id) ? 0 : ["PP", "UNIAO"].includes(id) ? 1 : 2);

test("every node is placed exactly once, with finite coordinates, inside the frame", () => {
  const { nodes: pos, height } = packLayout(G.nodes, G.links, { width: 900 });
  expect(pos.map((n) => n.id).sort()).toEqual(G.nodes.map((n) => n.id).sort());
  for (const n of pos) {
    expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    expect(n.x).toBeGreaterThan(0); expect(n.x).toBeLessThan(900);
    expect(n.y).toBeGreaterThan(0); expect(n.y).toBeLessThan(height);
  }
});

test("a circle keeps room for its label above it and for a wide label beside it", () => {
  // The 8-party coalition is what pushes circles to the edge of their box; small cliques stay mid-box.
  const big = nodes("A", "B", "C", "D", "E", "F", "G", "H");
  const { nodes: pos, height } = packLayout([...G.nodes, ...big], [...G.links, ...clique(big.map((n) => n.id))]);
  for (const n of pos) {
    expect(n.y - 18 - 4 - 11).toBeGreaterThanOrEqual(0); // biggest radius, gap, text height
    expect(n.y + 18).toBeLessThanOrEqual(height);
    expect(n.x).toBeGreaterThanOrEqual(50); expect(n.x).toBeLessThanOrEqual(850);
  }
});

test("clusters do not overlap: their bounding boxes are disjoint, so no edge crosses another list", () => {
  const { nodes: pos } = packLayout(G.nodes, G.links);
  const bb = [0, 1, 2].map((c) => {
    const xs = pos.filter((n) => clusterOf(n.id) === c).map((n) => n.x), ys = pos.filter((n) => clusterOf(n.id) === c).map((n) => n.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const apart = bb[i].x1 < bb[j].x0 || bb[j].x1 < bb[i].x0 || bb[i].y1 < bb[j].y0 || bb[j].y1 < bb[i].y0;
    expect(apart).toBe(true);
  }
});

test("a narrow frame wraps clusters onto more rows instead of squeezing them", () => {
  const wide = packLayout(G.nodes, G.links, { width: 1400 });
  const narrow = packLayout(G.nodes, G.links, { width: 520 });
  expect(narrow.height).toBeGreaterThan(wide.height);
});

test("same input, same picture; an empty graph is an empty picture", () => {
  expect(packLayout(G.nodes, G.links)).toEqual(packLayout(G.nodes, G.links));
  expect(packLayout([], []).nodes).toEqual([]);
});

test("a party with no link of its own still gets a spot", () => {
  const { nodes: pos } = packLayout(nodes("A", "B", "C"), clique(["A", "B"]));
  expect(pos).toHaveLength(3);
  expect(new Set(pos.map((n) => `${n.x},${n.y}`)).size).toBe(3);
});

test("the busiest real race shape (20 parties: coalitions of 10 and 8, a federation of 2) stays compact and readable", () => {
  const a = ["REPUBLICANOS", "PODE", "PL", "PSDB", "CIDADANIA", "PRD", "SOLIDARIEDADE", "UNIAO", "PP", "NOVO"];
  const b = ["PDT", "MDB", "PSB", "PSD", "AVANTE", "PT", "PCDOB", "PV"];
  const c = ["PSOL", "REDE"];
  const all = [...a, ...b, ...c].map((id, i) => ({ id, label: id, n: 1 + (i % 7) * 6 }));
  const max = Math.max(...all.map((n) => n.n));
  const radius = (n) => 6 + 12 * Math.sqrt(n.n / max);
  const { nodes: pos, height } = packLayout(all, [...clique(a), ...clique(b), ...clique(c)], { width: 900, radius });
  expect(height).toBeLessThanOrEqual(560); // was ~890 before the cluster frames were tightened
  const rect = (p) => { const r = radius(p), w = Math.max(2 * r, 6.6 * p.label.length); return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - r - 15, y1: p.y + r }; };
  const touching = [];
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    const p = rect(pos[i]), q = rect(pos[j]);
    if (Math.min(p.x1, q.x1) > Math.max(p.x0, q.x0) && Math.min(p.y1, q.y1) > Math.max(p.y0, q.y0)) touching.push(`${pos[i].id}/${pos[j].id}`);
  }
  expect(touching).toEqual([]);
});

test("party names in a crowded coalition do not overlap, whatever the force layout did", () => {
  const names = ["SOLIDARIEDADE", "REPUBLICANOS", "DEMOCRATA", "MOBILIZA", "CIDADANIA", "AVANTE", "PODE", "AGIR", "UNIAO", "MDB", "PL", "PP"];
  const { nodes: pos } = packLayout(nodes(...names), clique(names), { radius: () => 12 });
  const box = (p) => { const w = Math.max(24, 6.6 * p.label.length); return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - 27, y1: p.y + 12 }; }; // label above a 12px circle
  const touching = [];
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    const a = box(pos[i]), b = box(pos[j]);
    if (Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0)) touching.push(`${pos[i].id}/${pos[j].id}`);
  }
  expect(touching).toEqual([]);
});
