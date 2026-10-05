// Deterministic force layout (no animation, no dependencies): nodes are placed once
// by repulsion + spring + centre pull, so the picture is identical on every load.
export function layout(nodes, links, { width = 900, height = 620, iterations = 400 } = {}) {
  const n = nodes.length;
  const idx = new Map(nodes.map((d, i) => [d.id, i]));
  const pos = nodes.map((_, i) => {
    const a = i * 2.399963; // golden angle: reproducible, well spread start
    const r = Math.min(width, height) * 0.42 * Math.sqrt((i + 0.5) / Math.max(1, n));
    return { x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r };
  });
  const edges = links.map((l) => [idx.get(l.a), idx.get(l.b), l.w ?? 1]).filter(([a, b]) => a !== undefined && b !== undefined && a !== b);
  // Fruchterman-Reingold: repulsion k^2/d, attraction d^2/k, cooling temperature.
  const k = Math.sqrt((width * height) / Math.max(1, n)) * 0.75;
  const pad = 24;
  for (let it = 0; it < iterations; it++) {
    const t = (Math.min(width, height) / 8) * (1 - it / iterations) + 0.5;
    const dx = new Float64Array(n), dy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let x = pos[i].x - pos[j].x, y = pos[i].y - pos[j].y;
        let d = Math.hypot(x, y);
        if (d < 0.01) { x = 0.1 * (i - j); y = 0.1; d = Math.hypot(x, y); }
        const f = (k * k) / d / d;
        dx[i] += x * f; dy[i] += y * f; dx[j] -= x * f; dy[j] -= y * f;
      }
    }
    for (const [a, b, w] of edges) {
      const x = pos[a].x - pos[b].x, y = pos[a].y - pos[b].y;
      const d = Math.hypot(x, y) || 0.01;
      const f = (d / k) * Math.min(1.5, 0.4 + w);
      dx[a] -= x * f; dy[a] -= y * f; dx[b] += x * f; dy[b] += y * f;
    }
    for (let i = 0; i < n; i++) {
      dx[i] += (width / 2 - pos[i].x) * 0.01; dy[i] += (height / 2 - pos[i].y) * 0.01;
      const d = Math.hypot(dx[i], dy[i]) || 1;
      const step = Math.min(d, t);
      pos[i].x = Math.max(pad, Math.min(width - pad, pos[i].x + (dx[i] / d) * step));
      pos[i].y = Math.max(pad, Math.min(height - pad, pos[i].y + (dy[i] / d) * step));
    }
  }
  return nodes.map((d, i) => ({ ...d, x: Math.round(pos[i].x * 10) / 10, y: Math.round(pos[i].y * 10) / 10 }));
}

// Neighbourhood of a node: itself, direct neighbours and the links between them.
export function egoOf(id, nodes, links) {
  const near = new Set([id]);
  for (const l of links) { if (l.a === id) near.add(l.b); if (l.b === id) near.add(l.a); }
  return { nodes: nodes.filter((d) => near.has(d.id)), links: links.filter((l) => near.has(l.a) && near.has(l.b)) };
}

// Two-tier layout for dense bipartite data: hubs (parties) on an outer ring, members
// (suppliers) at the weighted centroid of their hubs, then pushed apart until they no
// longer overlap. Deterministic, and readable where a force layout collapses into a ball.
export function ringLayout(hubs, members, links, { width = 900, height = 620, gap = 3 } = {}) {
  const cx = width / 2, cy = height / 2;
  const R = Math.min(width, height) / 2 - 34;
  const ring = hubs.map((d, i) => {
    const a = (i / Math.max(1, hubs.length)) * Math.PI * 2 - Math.PI / 2;
    return { ...d, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
  });
  const at = new Map(ring.map((d) => [d.id, d]));
  const pull = new Map();
  for (const l of links) {
    const hub = at.get(l.a) ?? at.get(l.b);
    const mem = hub === at.get(l.a) ? l.b : l.a;
    if (!hub) continue;
    const c = pull.get(mem) ?? { x: 0, y: 0, w: 0 };
    const w = l.w ?? 1;
    c.x += hub.x * w; c.y += hub.y * w; c.w += w;
    pull.set(mem, c);
  }
  const inner = members.map((d, i) => {
    const c = pull.get(d.id);
    const a = i * 2.399963; // members with no hub still get a reproducible spot
    const home = c && c.w ? { x: c.x / c.w, y: c.y / c.w } : { x: cx + Math.cos(a) * R * 0.3, y: cy + Math.sin(a) * R * 0.3 };
    // Centroids of many hubs all fall near the middle: fan them out by index so they do not start stacked.
    return { ...d, x: cx + (home.x - cx) * 0.85 + Math.cos(a) * 6, y: cy + (home.y - cy) * 0.85 + Math.sin(a) * 6, hx: home.x, hy: home.y };
  });
  for (let it = 0; it < 220; it++) {
    for (let i = 0; i < inner.length; i++) {
      for (let j = i + 1; j < inner.length; j++) {
        const p = inner[i], q = inner[j];
        let x = p.x - q.x, y = p.y - q.y;
        let d = Math.hypot(x, y);
        const min = (p.r ?? 6) + (q.r ?? 6) + gap;
        if (d >= min) continue;
        if (d < 0.01) { x = 0.1 * (i - j); y = 0.1; d = Math.hypot(x, y); }
        const push = (min - d) / 2 / d;
        p.x += x * push; p.y += y * push; q.x -= x * push; q.y -= y * push;
      }
    }
    for (const p of inner) {
      p.x += (p.hx - p.x) * 0.02; p.y += (p.hy - p.y) * 0.02; // stay near own hubs
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), max = R - 28;
      if (d > max) { p.x = cx + (dx / d) * max; p.y = cy + (dy / d) * max; }
    }
  }
  const round = (d) => ({ ...d, x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 });
  return [...ring.map(round), ...inner.map(round)];
}
