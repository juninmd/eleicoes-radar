// Two-column Sankey (sources -> parties). Node height and ribbon width are proportional to
// the money; both columns use one scale, so a ribbon is never wider at one end than the other.
import { h } from "./format.js";

const PAD = { l: 250, r: 200, t: 8, b: 8 }; // left fits "Partido (recurso privado) R$ 17,9 mi" at 11px
const NODE_W = 14;
const GAP = { left: 10, right: 6 };
const LABEL_STEP = 15; // minimum distance between two labels of one column

// Push labels down until none is closer than `step` to the one above it, then pull the tail back up
// so the last one stays inside the drawing (an SVG clips whatever falls past its bottom edge).
function spread(ys, step, max) {
  const out = [];
  ys.forEach((y, i) => out.push(i && y < out[i - 1] + step ? out[i - 1] + step : y));
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i === out.length - 1 ? max : out[i + 1] - step);
  return out;
}

export function sankey({ left, right, links, w = 900, height = 440, fmt = String, ariaLabel = "Fluxo do dinheiro" }) {
  const total = left.reduce((a, n) => a + n.value, 0);
  if (!(total > 0)) return "";
  const inner = height - PAD.t - PAD.b;
  const k = (inner - Math.max(GAP.left * (left.length - 1), GAP.right * (right.length - 1))) / total;
  const place = (nodes, gap, x) => {
    let y = PAD.t + (inner - (total * k + gap * (nodes.length - 1))) / 2;
    return nodes.map((n) => { const o = { ...n, x, y, size: n.value * k, used: 0 }; y += o.size + gap; return o; });
  };
  const L = place(left, GAP.left, PAD.l);
  const R = place(right, GAP.right, w - PAD.r - NODE_W);
  const lm = new Map(L.map((n) => [n.id, n]));
  const rm = new Map(R.map((n) => [n.id, n]));
  const lo = new Map(L.map((n, i) => [n.id, i]));
  const ro = new Map(R.map((n, i) => [n.id, i]));
  const ls = links.filter((x) => x.value > 0 && lm.has(x.from) && rm.has(x.to)).map((x) => ({ ...x }));
  // Stack ribbons inside each node in the order of the node at the other end, so they cross as little as possible.
  for (const n of L) for (const x of ls.filter((q) => q.from === n.id).sort((a, b) => ro.get(a.to) - ro.get(b.to))) { x.y0 = n.y + n.used; n.used += x.value * k; }
  for (const n of R) { n.used = 0; for (const x of ls.filter((q) => q.to === n.id).sort((a, b) => lo.get(a.from) - lo.get(b.from))) { x.y1 = n.y + n.used; n.used += x.value * k; } }
  const ribbons = ls.map((x) => {
    const a = lm.get(x.from), b = rm.get(x.to);
    const x0 = a.x + NODE_W, x1 = b.x, xm = (x0 + x1) / 2, t = x.value * k;
    const d = `M${x0},${x.y0.toFixed(1)} C${xm},${x.y0.toFixed(1)} ${xm},${x.y1.toFixed(1)} ${x1},${x.y1.toFixed(1)} L${x1},${(x.y1 + t).toFixed(1)} C${xm},${(x.y1 + t).toFixed(1)} ${xm},${(x.y0 + t).toFixed(1)} ${x0},${(x.y0 + t).toFixed(1)} Z`;
    return `<path class="sk ${h(a.cls ?? "")}" d="${d}"><title>${h(a.label)} → ${h(b.label)}: ${h(fmt(x.value))}</title></path>`;
  }).join("");
  const side = (nodes, anchor, dx, cls) => {
    const ys = spread(nodes.map((n) => n.y + n.size / 2 + 4), LABEL_STEP, height - PAD.b - 2);
    return nodes.map((n, i) => `<rect class="skn ${cls(n)}" x="${n.x}" y="${n.y.toFixed(1)}" width="${NODE_W}" height="${Math.max(1, n.size).toFixed(1)}"/><text class="sklab" x="${n.x + dx}" y="${ys[i].toFixed(1)}" text-anchor="${anchor}">${h(n.label)} <tspan class="skv">${h(fmt(n.value))}</tspan></text>`).join("");
  };
  return `<svg class="pan-svg sankey" viewBox="0 0 ${w} ${height}" role="img" aria-label="${h(ariaLabel)}">${ribbons}${side(L, "end", -6, (n) => n.cls ?? "")}${side(R, "start", NODE_W + 6, () => "dest")}</svg>`;
}
