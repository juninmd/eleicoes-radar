// Chart primitives for the Panorama tabs. Pure functions returning HTML/SVG strings, no
// dependencies. Every number a chart draws is also printed as text next to it.
import { h, pct } from "./format.js";

// Same order and colours as the dossier money bar, so a source never changes colour.
export type SourceKey = "publico" | "partido" | "pf" | "proprio" | "outros";
type Labelled = { label: string; sub?: string };
type HBarRow = Labelled & { value: number; marker?: number; text: string };
type Bubble = { id: string; label: string; x: number; y: number; r: number; title: string };
type HeatCell = { text: string; v: number | null; title: string };

export const SOURCES: { key: SourceKey; nome: string; cls: string }[] = [
  { key: "publico", nome: "Fundos públicos", cls: "s1" },
  { key: "partido", nome: "Partido (recurso privado)", cls: "s2" },
  { key: "pf", nome: "Pessoas físicas", cls: "s3" },
  { key: "proprio", nome: "Próprio candidato", cls: "s4" },
  { key: "outros", nome: "Outros", cls: "s5" },
];

export const legendSources = () =>
  `<ul class="pan-legend" aria-label="Fontes do dinheiro">${SOURCES.map((s) => `<li><i class="key ${s.cls}"></i>${h(s.nome)}</li>`).join("")}</ul>`;

const label = (r: Labelled) => `<span class="pan-l">${h(r.label)}${r.sub ? `<small>${h(r.sub)}</small>` : ""}</span>`;

// Row split by source; the bar length is total/max, so rows stay comparable with each other.
export function stackRow({ label: name, sub, vals, total, max, text }: Labelled & { vals: Partial<Record<SourceKey, number>>; total: number; max: number; text: string }) {
  const parts = SOURCES.filter((s) => vals[s.key]! > 0);
  if (!total || !parts.length) return `<li class="pan-row">${label({ label: name, sub })}<span class="pan-track"></span><b class="pan-v">${h(text)}</b></li>`;
  const width = max > 0 ? Math.max(1, (total / max) * 100) : 0;
  const desc = parts.map((s) => `${s.nome} ${pct(vals[s.key]! / total)}`).join(", ");
  return `<li class="pan-row">${label({ label: name, sub })}<span class="pan-track"><span class="stack" style="width:${width.toFixed(1)}%" role="img" aria-label="${h(name)}: ${h(desc)}">${parts.map((s) => `<span class="seg ${s.cls}" style="flex-grow:${vals[s.key]}" title="${h(s.nome)}: ${pct(vals[s.key]! / total)}"></span>`).join("")}</span></span><b class="pan-v">${h(text)}</b></li>`;
}

// Plain bars. `marker` (optional) draws a second reference value on the same scale.
export function hbars(rows: HBarRow[], { max }: { max?: number } = {}) {
  const top = max ?? Math.max(0, ...rows.flatMap((r) => [r.value ?? 0, r.marker ?? 0]));
  const at = (v: number) => (top > 0 && v > 0 ? Math.min(100, (v / top) * 100) : 0);
  return `<ul class="pan-bars">${rows.map((r) => `<li class="pan-row">${label(r)}<span class="pan-track"><i style="width:${Math.max(r.value > 0 ? 1 : 0, at(r.value)).toFixed(1)}%"></i>${r.marker! > 0 ? `<em style="left:${at(r.marker!).toFixed(1)}%"></em>` : ""}</span><b class="pan-v">${h(r.text)}</b></li>`).join("")}</ul>`;
}

// Bubble chart, log x. Points with x <= 0 cannot sit on a log axis and are left out.
export function bubbles(points: Bubble[], { w = 640, height = 380, xFmt, yFmt, nLabels = 8 }: { w?: number; height?: number; xFmt: (v: number) => string; yFmt: (v: number) => string; nLabels?: number }) {
  const pts = points.filter((p) => p.x > 0);
  if (!pts.length) return "";
  const m = { l: 52, r: 16, t: 14, b: 40 };
  const lo = Math.floor(Math.log10(Math.min(...pts.map((p) => p.x))));
  const hi = Math.max(Math.ceil(Math.log10(Math.max(...pts.map((p) => p.x)))), lo + 1);
  const ymax = Math.max(1e-9, ...pts.map((p) => p.y)) * 1.15;
  const pad = 0.25; // decades of margin, so a value sitting on a gridline is not cut by the frame
  const X = (v: number) => m.l + ((Math.log10(v) - lo + pad) / (hi - lo + 2 * pad)) * (w - m.l - m.r);
  const Y = (v: number) => height - m.b - (v / ymax) * (height - m.t - m.b);
  const rmax = Math.max(...pts.map((p) => p.r));
  const R = (v: number) => 5 + 15 * Math.sqrt(v / rmax);
  const named = new Set([...pts].sort((a, b) => b.y - a.y).slice(0, nLabels).map((p) => p.id));
  const gx = Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i));
  const gy = [0, 1, 2, 3, 4].map((i) => (ymax * i) / 4);
  return `<svg class="pan-svg" viewBox="0 0 ${w} ${height}" role="img" aria-label="Gráfico de bolhas: ${pts.length} partidos">
    ${gy.map((v) => `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="tick" x="${m.l - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${h(yFmt(v))}</text>`).join("")}
    ${gx.map((v) => `<line class="grid" y1="${m.t}" y2="${height - m.b}" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}"/><text class="tick" x="${X(v).toFixed(1)}" y="${height - m.b + 16}" text-anchor="middle">${h(xFmt(v))}</text>`).join("")}
    ${[...pts].sort((a, b) => b.r - a.r).map((p) => `<g class="bub"><circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${R(p.r).toFixed(1)}"/>${named.has(p.id) ? `<text x="${X(p.x).toFixed(1)}" y="${(Y(p.y) - R(p.r) - 3).toFixed(1)}" text-anchor="middle">${h(p.label)}</text>` : ""}<title>${h(p.title)}</title></g>`).join("")}
  </svg>`;
}

// Cumulative share of money held by the top 10%, 20%, ... of candidacies, against equality.
export function lorenz(conc: number[] | null | undefined, { w = 420, height = 300 }: { w?: number; height?: number } = {}) {
  if (!conc?.length) return "";
  const m = { l: 44, r: 14, t: 14, b: 36 };
  const X = (v: number) => m.l + v * (w - m.l - m.r);
  const Y = (v: number) => height - m.b - v * (height - m.t - m.b);
  const pts = [[0, 0], ...conc.map((v, i) => [(i + 1) / 10, v])];
  const line = pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1];
  return `<svg class="pan-svg" viewBox="0 0 ${w} ${height}" role="img" aria-label="Curva de concentração do dinheiro: os 10% que mais arrecadam ficam com ${pct(conc[0])}">
    ${ticks.map((v) => `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${pct(v)}</text><text class="tick" x="${X(v)}" y="${height - m.b + 16}" text-anchor="middle">${pct(v)}</text>`).join("")}
    <line class="eq" x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}"/>
    <polygon class="area" points="${X(0)},${Y(0)} ${line}"/><polyline class="curve" points="${line}"/>
    ${[0, 4].map((i) => `<circle class="dot" cx="${X(pts[i + 1][0]).toFixed(1)}" cy="${Y(pts[i + 1][1]).toFixed(1)}" r="4"/><text class="mark" x="${(X(pts[i + 1][0]) + 8).toFixed(1)}" y="${(Y(pts[i + 1][1]) + 14).toFixed(1)}">${pct(pts[i + 1][1])}</text>`).join("")}
    <text class="tick" x="${(m.l + w - m.r) / 2}" y="${height - 4}" text-anchor="middle">candidaturas, da que mais arrecada para a que menos arrecada</text>
  </svg>`;
}

// Table heat map. cell(rowKey, colKey) -> { text, v (0..1 or null), title }.
export function heat({ rows, cols, cell, caption }: { rows: (Labelled & { key: string })[]; cols: (Labelled & { key: string })[]; cell: (row: string, col: string) => HeatCell; caption: string }) {
  return `<div class="scroll"><table class="pan-heat"><caption class="sr">${h(caption)}</caption>
    <thead><tr><th scope="col"></th>${cols.map((c) => `<th scope="col">${h(c.label)}${c.sub ? `<small>${h(c.sub)}</small>` : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th scope="row">${h(r.label)}${r.sub ? `<small>${h(r.sub)}</small>` : ""}</th>${cols.map((c) => {
      const x = cell(r.key, c.key);
      return `<td${x.v === null ? ' class="nd"' : ` style="--v:${x.v.toFixed(2)}"`} title="${h(x.title)}">${h(x.text)}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;
}
