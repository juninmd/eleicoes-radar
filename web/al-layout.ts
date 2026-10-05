// Alliance graphs are many small, disconnected cliques. One force layout over all of them pushes
// every cluster to the frame and clips its labels, so each cluster gets its own box and the boxes
// are packed in rows. Deterministic: same input, same picture.
import { layout } from "./rede-layout.js";
import type { Link, Placed } from "./rede-layout.js";

interface Box { w: number; h: number }
interface Row<N> { items: { cl: N[]; box: Box }[]; w: number; h: number }

// rede-layout keeps a centre 24px from its box edge; these margins add room for a label (wider than its circle) and the one above it.
const OUTER = 28;
const TOP = 12;

const boxOf = (k: number): Box => {
  const side = Math.min(470, 64 + 40 * k);
  return { w: side, h: Math.round(side * 0.62) };
};

const PAD = 24; // rede-layout's own clamp: a centre never gets closer than this to its box edge
const LABEL = { char: 6.6, height: 15 }; // 11px bold text, and the room it takes above its circle
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// A force layout ignores label width, so neighbours can end up with their names on top of each other.
// Push overlapping label boxes apart along the axis of smaller overlap, keeping every centre inside its box.
function untangle<N extends { label: string }>(pos: (N & Placed)[], box: Box, radius: (n: N) => number) {
  const rect = (p: N & Placed) => {
    const r = radius(p), w = Math.max(2 * r, LABEL.char * p.label.length);
    return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - r - LABEL.height, y1: p.y + r };
  };
  for (let pass = 0; pass < 300; pass++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = rect(pos[i]), b = rect(pos[j]);
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox <= -1 || oy <= -1) continue; // keep 1px of air, so rounding the coordinates cannot make boxes touch again
        const axis = ox < oy ? "x" : "y";
        const d = ((axis === "x" ? ox : oy) / 2 + 1) * (pos[i][axis] <= pos[j][axis] ? 1 : -1);
        pos[i][axis] -= d;
        pos[j][axis] += d;
        moved = true;
      }
    }
    for (const p of pos) { p.x = clamp(p.x, PAD, box.w - PAD); p.y = clamp(p.y, PAD, box.h - PAD); }
    if (!moved) break;
  }
}

function clusters<N extends { id: string }>(nodes: N[], links: Link[]) {
  const parent = new Map<string, string>(nodes.map((n) => [n.id, n.id]));
  const find = (x: string) => { while (parent.get(x) !== x) x = parent.get(x)!; return x; };
  for (const l of links) if (parent.has(l.a) && parent.has(l.b)) parent.set(find(l.a), find(l.b));
  const by = new Map<string, N[]>();
  for (const n of nodes) {
    const r = find(n.id);
    (by.get(r) ?? by.set(r, []).get(r)!).push(n);
  }
  return [...by.values()].sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1));
}

// radius(node) is the circle size the caller will draw; label boxes are spaced with it.
export function packLayout<N extends { id: string; label: string }>(nodes: N[], links: Link[], { width = 900, radius = () => 12 }: { width?: number; radius?: (n: N) => number } = {}): { nodes: (N & Placed)[]; height: number } {
  const usable = width - 2 * OUTER;
  const rows: Row<N>[] = [];
  for (const cl of clusters(nodes, links)) {
    const box = boxOf(cl.length);
    let row = rows[rows.length - 1];
    if (!row || row.w + box.w > usable) rows.push((row = { items: [], w: 0, h: 0 }));
    row.items.push({ cl, box });
    row.w += box.w;
    row.h = Math.max(row.h, box.h);
  }
  const placed: (N & Placed)[] = [];
  let y0 = TOP;
  for (const row of rows) {
    let x0 = OUTER + (usable - row.w) / 2;
    for (const { cl, box } of row.items) {
      const ids = new Set(cl.map((n) => n.id));
      const pos = layout(cl, links.filter((l) => ids.has(l.a) && ids.has(l.b)), { width: box.w, height: box.h });
      untangle(pos, box, radius);
      for (const p of pos) placed.push({ ...p, x: Math.round((p.x + x0) * 10) / 10, y: Math.round((p.y + y0) * 10) / 10 });
      x0 += box.w;
    }
    y0 += row.h;
  }
  return { nodes: placed, height: y0 + 12 };
}
