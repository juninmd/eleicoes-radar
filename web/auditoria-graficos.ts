// SVG charts of the Auditoria tab: pure functions that return strings, no dependency. Every number a chart draws is also
// printed as text in the page (a table or a sentence next to it); the <title> of each mark is the hover text.
import { h, int } from "./format.js";
import { dec } from "./auditoria-dados.js";

type Linear = (v: number) => number;
const lin = (d0: number, d1: number, r0: number, r1: number): Linear => (v) => (d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
const f1 = (v: number) => v.toFixed(1);

/** Round tick values inside [lo, hi], about `n` of them. */
export function ticks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) out.push(Number(t.toPrecision(12)));
  return out;
}

const open = (w: number, ht: number, label: string) => `<svg class="au-svg" viewBox="0 0 ${w} ${ht}" role="img" aria-label="${h(label)}">`;
const txt = (x: number, y: number, s: string, cls = "", anchor = "") => `<text${cls ? ` class="${cls}"` : ""} x="${f1(x)}" y="${f1(y)}"${anchor ? ` text-anchor="${anchor}"` : ""}>${h(s)}</text>`;

// ---- turnout x share of the leader, one cell per 2.5 points
export function heat2d(cells: [number, number, number][], label = "Seções por comparecimento e fatia do 1º colocado"): string {
  const W = 360, H = 366, m = { l: 42, r: 10, t: 22, b: 40 }, n = 40, cs = (W - m.l - m.r) / n, ph = cs * n;
  let max = 1;
  for (const c of cells) if (c[2] > max) max = c[2];
  const op = (v: number) => 0.1 + 0.9 * Math.sqrt(Math.log1p(v) / Math.log1p(max));
  const rects = cells.map(([x, y, v]) => `<rect class="au-hc" x="${f1(m.l + x * cs)}" y="${f1(m.t + (n - 1 - y) * cs)}" width="${f1(cs - 0.4)}" height="${f1(cs - 0.4)}" style="fill-opacity:${op(v).toFixed(2)}"><title>Comparecimento ${x * 2.5}–${(x + 1) * 2.5}%, fatia do 1º ${y * 2.5}–${(y + 1) * 2.5}%: ${int(v)} seções</title></rect>`).join("");
  const axis = [0, 0.25, 0.5, 0.75, 1];
  return `${open(W, H, label)}<rect class="au-frame" x="${m.l}" y="${m.t}" width="${f1(ph)}" height="${f1(ph)}"/>${rects}
    <rect class="au-corner" x="${f1(m.l + 36 * cs)}" y="${m.t}" width="${f1(4 * cs)}" height="${f1(4 * cs)}"/>
    ${txt(m.l + ph, m.t - 7, "tracejado: canto com comparecimento e fatia ≥ 90%", "", "end")}
    ${axis.map((a) => `${txt(m.l + a * ph, m.t + ph + 14, `${a * 100}%`, "tick", "middle")}${txt(m.l - 6, m.t + (1 - a) * ph + 3, `${a * 100}%`, "tick", "end")}`).join("")}
    ${txt(m.l + ph / 2, H - 4, "comparecimento da seção", "", "middle")}
    <text transform="translate(11 ${f1(m.t + ph / 2)}) rotate(-90)" text-anchor="middle">fatia do 1º colocado</text></svg>`;
}

// ---- turnout histogram, 50 bins of 2 points; the last three bins (94% and up) are marked
export function histograma(bins: number[]): string {
  const W = 360, H = 200, m = { l: 44, r: 8, t: 8, b: 32 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const top = Math.max(1, ...bins), ys = ticks(0, top, 4), ymax = ys[ys.length - 1] || top;
  const y = lin(0, ymax, m.t + ph, m.t), bw = pw / bins.length;
  const compact = (v: number) => (v >= 1000 ? `${dec(v / 1000, 0)} mil` : String(v));
  return `${open(W, H, "Distribuição do comparecimento das seções")}
    ${ys.map((t) => `<line class="grid" x1="${m.l}" x2="${m.l + pw}" y1="${f1(y(t))}" y2="${f1(y(t))}"/>${txt(m.l - 6, y(t) + 3, compact(t), "tick", "end")}`).join("")}
    ${bins.map((n, i) => `<rect class="au-bar${i >= 47 ? " warn" : ""}" x="${f1(m.l + i * bw + 0.5)}" y="${f1(y(n))}" width="${f1(bw - 1)}" height="${f1(Math.max(0, m.t + ph - y(n)))}"><title>Comparecimento ${i * 2}–${(i + 1) * 2}%: ${int(n)} seções</title></rect>`).join("")}
    ${[0, 20, 40, 60, 80, 100].map((t) => txt(m.l + (t / 100) * pw, m.t + ph + 14, `${t}%`, "tick", "middle")).join("")}
    ${txt(m.l + pw / 2, H - 3, "comparecimento da seção (faixas de 2 pontos)", "", "middle")}
    ${txt(m.l + 6, m.t + 10, "âmbar: comparecimento ≥ 94%")}</svg>`;
}

// ---- last digit: how far each digit sits from the ideal 10%, with a ±2 standard-error band
export function ultimoDigito(freq: number[], n: number): string {
  const W = 360, H = 190, m = { l: 44, r: 8, t: 10, b: 30 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const dev = freq.map((f) => (f - 0.1) * 100);
  const se = Math.sqrt((0.1 * 0.9) / Math.max(n, 1)) * 100;
  const lim = Math.max(0.6, Math.max(0, ...dev.map(Math.abs)) * 1.3, 2.4 * se);
  const y = lin(-lim, lim, m.t + ph, m.t), bw = pw / 10;
  const ys = ticks(-lim, lim, 5);
  return `${open(W, H, "Desvio de cada último dígito em relação a 10%")}
    <rect class="au-band" x="${m.l}" width="${f1(pw)}" y="${f1(y(2 * se))}" height="${f1(y(-2 * se) - y(2 * se))}"/>
    ${ys.map((t) => txt(m.l - 6, y(t) + 3, dec(t, 1), "tick", "end")).join("")}
    <line class="zero" x1="${m.l}" x2="${m.l + pw}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>
    ${dev.map((v, d) => `<rect class="au-bar" x="${f1(m.l + d * bw + bw * 0.12)}" width="${f1(bw * 0.76)}" y="${f1(v >= 0 ? y(v) : y(0))}" height="${f1(Math.abs(y(v) - y(0)))}"><title>Dígito ${d}: ${dec(freq[d] * 100, 2)}% (esperado 10%)</title></rect>${txt(m.l + d * bw + bw / 2, m.t + ph + 14, String(d), "tick", "middle")}`).join("")}
    ${txt(m.l + pw / 2, H - 3, "último dígito dos votos do 1º colocado (seções com 50+ votos)", "", "middle")}
    <text transform="translate(11 ${f1(m.t + ph / 2)}) rotate(-90)" text-anchor="middle">pontos acima/abaixo de 10%</text>
    ${txt(m.l + pw - 2, m.t + 10, "faixa cinza: ±2 erros-padrão", "", "end")}</svg>`;
}

// ---- horizontal bars by category, with an optional reference line; a bar past `max` is clipped and marked
export interface Barra { k: string; v: number; tip?: string; flag?: boolean }
export function barrasH(rows: Barra[], o: { max: number; min?: number; ref?: number; fmt?: (v: number) => string; label: string }): string {
  const rowH = 15, W = 360, m = { l: 40, r: 44, t: 8, b: 26 }, pw = W - m.l - m.r, ht = m.t + m.b + rows.length * rowH;
  const lo = o.min ?? 0, x = lin(lo, o.max, m.l, m.l + pw), fmt = o.fmt ?? ((v: number) => dec(v, 2));
  const bars = rows.map((r, i) => {
    const y = m.t + i * rowH + 2, w = Math.max(0, x(Math.min(r.v, o.max)) - x(lo));
    return `<rect class="au-bar${r.flag ? " warn" : ""}" x="${f1(x(lo))}" y="${f1(y)}" width="${f1(w)}" height="${rowH - 4}"><title>${h(r.tip ?? `${r.k}: ${fmt(r.v)}`)}</title></rect>${txt(m.l - 6, y + 9, r.k, "", "end")}${txt(x(Math.min(r.v, o.max)) + 4, y + 9, fmt(r.v) + (r.v > o.max ? " ›" : ""))}`;
  }).join("");
  const base = m.t + rows.length * rowH;
  return `${open(W, ht, o.label)}${ticks(lo, o.max, 4).map((t) => `<line class="grid" x1="${f1(x(t))}" x2="${f1(x(t))}" y1="${m.t}" y2="${base}"/>${txt(x(t), base + 14, dec(t, t % 1 ? 1 : 0), "tick", "middle")}`).join("")}${bars}
    ${o.ref != null ? `<line class="ref" x1="${f1(x(o.ref))}" x2="${f1(x(o.ref))}" y1="${m.t - 2}" y2="${base}"/>` : ""}</svg>`;
}

// ---- observed (dot) against expected (tick), one row per contest
export interface ObsEsp { rotulo: string; obs: number; esp: number; flag?: boolean }
export function obsEsp(rows: ObsEsp[], o: { fmt: (v: number) => string; axis?: (v: number) => string; label: string }): string {
  const rowH = 17, W = 360, m = { l: 74, r: 14, t: 6, b: 24 }, pw = W - m.l - m.r, ht = m.t + m.b + rows.length * rowH;
  const top = Math.max(1e-9, ...rows.flatMap((r) => [r.obs, r.esp])) * 1.12;
  const ts = ticks(0, top, 4), x = lin(0, ts[ts.length - 1] || top, m.l, m.l + pw), base = m.t + rows.length * rowH;
  const axis = o.axis ?? ((v: number) => dec(v, v % 1 ? 1 : 0));
  return `${open(W, ht, o.label)}${ts.map((t) => `<line class="grid" x1="${f1(x(t))}" x2="${f1(x(t))}" y1="${m.t}" y2="${base}"/>${txt(x(t), base + 14, axis(t), "tick", "middle")}`).join("")}
    ${rows.map((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      return `<line class="au-link" x1="${f1(x(Math.min(r.obs, r.esp)))}" x2="${f1(x(Math.max(r.obs, r.esp)))}" y1="${f1(cy)}" y2="${f1(cy)}"/>
        <rect class="au-exp" x="${f1(x(r.esp) - 1.5)}" y="${f1(cy - 6)}" width="3" height="12"/>
        <circle class="au-dot${r.flag ? " warn" : ""}" cx="${f1(x(r.obs))}" cy="${f1(cy)}" r="4.2"><title>${h(r.rotulo)}: observado ${h(o.fmt(r.obs))}, esperado ${h(o.fmt(r.esp))}</title></circle>
        ${txt(m.l - 6, cy + 3.5, r.rotulo, "lab", "end")}`;
    }).join("")}</svg>`;
}

// ---- dot map of the municipalities; the points arrive already projected like web/mapa-uf.json
export interface UfForma { d: string }
const BUCKETS = 20;
/** 0..9 below 1.00 (darker blue the lower), 10..19 above 1.00 (stronger amber the higher). */
export function balde(r: number): number {
  if (r <= 1) return Math.min(9, Math.floor(((1 - r) / 0.25) * 10));
  return 10 + Math.min(9, Math.floor(((r - 1) / 0.5) * 10));
}
export const baldeCss = (b: number) => (b < 10 ? { cls: "lo", p: Math.round(14 + 76 * (b / 9)) } : { cls: "hi", p: Math.round(24 + 76 * ((b - 10) / 9)) });
export const BALDES = BUCKETS;
export function mapaPontos(ufs: Record<string, UfForma>, viewBox: number[], pts: { uf: string; mun: string; x: number; y: number; aptos: number; pop16: number; v: number }[]): string {
  const raio = (a: number) => 0.9 + Math.min(1, Math.sqrt(a / 1.5e6)) * 8.1;
  const paths = Object.entries(ufs).map(([uf, s]) => `<path class="au-uf" d="${h(s.d)}"><title>${h(uf)}</title></path>`).join("");
  const dots = [...pts].sort((a, b) => b.aptos - a.aptos).map((p) => {
    const c = baldeCss(balde(p.v));
    return `<circle class="au-pt ${c.cls}" style="--p:${c.p}%" cx="${p.x}" cy="${p.y}" r="${raio(p.aptos).toFixed(1)}"><title>${h(p.mun)} (${h(p.uf)}): ${int(p.aptos)} eleitores aptos, ${int(p.pop16)} residentes com 16+ anos, razão ${dec(p.v, 2)}</title></circle>`;
  }).join("");
  return `<svg class="au-svg au-mapa" viewBox="${viewBox.join(" ")}" role="img" aria-label="Mapa de municípios por razão entre eleitores e residentes com 16 anos ou mais">${paths}${dots}</svg>`;
}

// ---- municipalities coloured by the most voted candidate (one dot per municipality, area = voters; strength = lead over the 2nd)
export const forcaVoto = (margemPp: number) => Math.round(Math.max(28, Math.min(100, 28 + margemPp * 1.8)));
export function mapaVoto(ufs: Record<string, UfForma>, viewBox: number[], pts: { uf: string; mun: string; x: number; y: number; aptos: number }[], rows: (number[] | null)[], nomes: string[]): string {
  const raio = (a: number) => 0.9 + Math.min(1, Math.sqrt(a / 1.5e6)) * 8.1;
  const paths = Object.entries(ufs).map(([uf, s]) => `<path class="au-uf" d="${h(s.d)}"><title>${h(uf)}</title></path>`).join("");
  const dots = pts.map((p, i) => ({ p, r: rows[i] })).filter((x) => x.r).sort((a, b) => b.p.aptos - a.p.aptos).map(({ p, r }) => {
    const [a, sa, sb, b] = r as number[], nm = (k: number) => nomes[k] ?? "outros";
    return `<circle class="au-vt c${Math.min(a, 6)}" style="--p:${forcaVoto((sa - sb) / 10)}%" cx="${p.x}" cy="${p.y}" r="${raio(p.aptos).toFixed(1)}"><title>${h(p.mun)} (${h(p.uf)}): ${h(nm(a))} ${dec(sa / 10, 1)}% · ${h(nm(b))} ${dec(sb / 10, 1)}%</title></circle>`;
  }).join("");
  return `<svg class="au-svg au-mapa" viewBox="${viewBox.join(" ")}" role="img" aria-label="Mapa de municípios pintados pelo candidato mais votado">${paths}${dots}</svg>`;
}

// ---- one-colour map by value classes (income, Bolsa Família, vote share): dots in the same places, strength = class
export const ESCALA_FATIA = [20, 30, 40, 50, 60, 70, 80, 90];
export const classeDe = (v: number, cortes: number[]) => cortes.filter((c) => v >= c).length; // 0..cortes.length
export const forcaClasse = (k: number, n: number) => Math.round(32 + 68 * (k / n));
export function mapaEscala(ufs: Record<string, UfForma>, viewBox: number[], pts: { uf: string; mun: string; x: number; y: number; aptos: number }[], vals: (number | null)[], cortes: number[], o: { cor: "b" | "v" | "p"; fmt: (v: number) => string; label: string }): string {
  const raio = (a: number) => 0.9 + Math.min(1, Math.sqrt(a / 1.5e6)) * 8.1;
  const paths = Object.entries(ufs).map(([uf, s]) => `<path class="au-uf" d="${h(s.d)}"><title>${h(uf)}</title></path>`).join("");
  const dots = pts.map((p, i) => ({ p, v: vals[i] })).filter((x) => x.v != null).sort((a, b) => b.p.aptos - a.p.aptos).map(({ p, v }) =>
    `<circle class="au-rd ${o.cor}" style="--p:${forcaClasse(classeDe(v as number, cortes), cortes.length)}%" cx="${p.x}" cy="${p.y}" r="${raio(p.aptos).toFixed(1)}"><title>${h(p.mun)} (${h(p.uf)}): ${h(o.fmt(v as number))}</title></circle>`).join("");
  return `<svg class="au-svg au-mapa" viewBox="${viewBox.join(" ")}" role="img" aria-label="${h(o.label)}">${paths}${dots}</svg>`;
}

// ---- coefficient plot with 95% intervals (rows grouped by model; `spec` picks the colour)
export interface Coef { modelo: string; spec: number; v: number; lo: number; hi: number; primeiro: boolean }
export const SPECS = ["mesmo município", "mesma zona", "mesmo local"];
export function coeficientes(rows: Coef[]): string {
  const rowH = 14, W = 360, m = { l: 74, r: 10, t: 26, b: 30 }, pw = W - m.l - m.r, ht = m.t + m.b + rows.length * rowH;
  const lim = Math.max(1.5, ...rows.map((r) => Math.max(Math.abs(r.lo), Math.abs(r.hi))) ) * 1.1;
  const ts = ticks(-lim, lim, 6), x = lin(ts[0], ts[ts.length - 1], m.l, m.l + pw), base = m.t + rows.length * rowH;
  return `${open(W, ht, "Diferença na fatia do 1º colocado por modelo de urna, com intervalo de 95%")}
    ${SPECS.map((s, i) => `<circle class="au-dot sp${i}" cx="${m.l + 4 + i * 102}" cy="10" r="4"/>${txt(m.l + 12 + i * 102, 13, s)}`).join("")}
    ${ts.map((t) => `<line class="grid" x1="${f1(x(t))}" x2="${f1(x(t))}" y1="${m.t}" y2="${base}"/>${txt(x(t), base + 14, dec(t, 1), "tick", "middle")}`).join("")}
    <line class="zero" x1="${f1(x(0))}" x2="${f1(x(0))}" y1="${m.t}" y2="${base}"/>
    ${rows.map((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      return `<line class="au-ci sp${r.spec}" x1="${f1(x(r.lo))}" x2="${f1(x(r.hi))}" y1="${f1(cy)}" y2="${f1(cy)}"/><circle class="au-dot sp${r.spec}" cx="${f1(x(r.v))}" cy="${f1(cy)}" r="3.4"><title>${h(r.modelo)}, ${SPECS[r.spec]}: ${dec(r.v, 2)} p.p. (IC 95%: ${dec(r.lo, 2)} a ${dec(r.hi, 2)})</title></circle>${r.primeiro ? txt(m.l - 6, cy + 3.5, r.modelo, "lab", "end") : ""}`;
    }).join("")}
    ${txt(m.l + pw / 2, ht - 3, "diferença na fatia do 1º colocado frente à urna UE 2020 (pontos percentuais)", "", "middle")}</svg>`;
}

// ---- before/after dumbbells
export interface Haltere { rotulo: string; a: number; b: number }
export function halteres(rows: Haltere[], o: { a: string; b: string; label: string }): string {
  const rowH = 22, W = 360, m = { l: 74, r: 16, t: 28, b: 26 }, pw = W - m.l - m.r, ht = m.t + m.b + rows.length * rowH;
  const top = Math.max(1, ...rows.flatMap((r) => [r.a, r.b])) * 1.1, ts = ticks(0, top, 5), x = lin(0, ts[ts.length - 1] || top, m.l, m.l + pw), base = m.t + rows.length * rowH;
  return `${open(W, ht, o.label)}<circle class="au-dot muted" cx="${m.l + 4}" cy="10" r="4"/>${txt(m.l + 12, 13, o.a)}<circle class="au-dot" cx="${m.l + 100}" cy="10" r="4"/>${txt(m.l + 108, 13, o.b)}
    ${ts.map((t) => `<line class="grid" x1="${f1(x(t))}" x2="${f1(x(t))}" y1="${m.t}" y2="${base}"/>${txt(x(t), base + 14, String(t), "tick", "middle")}`).join("")}
    ${rows.map((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      return `<line class="au-link thick" x1="${f1(x(r.a))}" x2="${f1(x(r.b))}" y1="${f1(cy)}" y2="${f1(cy)}"/><circle class="au-dot muted" cx="${f1(x(r.a))}" cy="${f1(cy)}" r="5"><title>${h(r.rotulo)}: ${h(o.a)} ${int(r.a)}</title></circle><circle class="au-dot" cx="${f1(x(r.b))}" cy="${f1(cy)}" r="5"><title>${h(r.rotulo)}: ${h(o.b)} ${int(r.b)}</title></circle>${txt(m.l - 6, cy + 3.5, r.rotulo, "lab", "end")}`;
    }).join("")}</svg>`;
}

// ---- vertical columns (a handful of bars)
export interface Coluna { k: string; v: number; tip?: string; flag?: boolean }
export function colunas(rows: Coluna[], o: { min?: number; max: number; ref?: number; fmt: (v: number) => string; axis?: (v: number) => string; xlabel?: string; label: string; alt?: number }): string {
  const W = 360, H = o.alt ?? 200, m = { l: 40, r: 8, t: 16, b: 38 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const lo = o.min ?? 0, ts = ticks(lo, o.max, 4), y = lin(lo, ts[ts.length - 1] || o.max, m.t + ph, m.t), bw = pw / rows.length;
  const axis = o.axis ?? ((v: number) => dec(v, v % 1 ? 1 : 0));
  return `${open(W, H, o.label)}${ts.map((t) => `<line class="grid" x1="${m.l}" x2="${m.l + pw}" y1="${f1(y(t))}" y2="${f1(y(t))}"/>${txt(m.l - 6, y(t) + 3, axis(t), "tick", "end")}`).join("")}
    ${rows.map((r, i) => `<rect class="au-bar${r.flag ? " warn" : ""}" x="${f1(m.l + i * bw + bw * 0.14)}" y="${f1(y(r.v))}" width="${f1(bw * 0.72)}" height="${f1(Math.max(0, m.t + ph - y(r.v)))}"><title>${h(r.tip ?? `${r.k}: ${o.fmt(r.v)}`)}</title></rect>${txt(m.l + i * bw + bw / 2, y(r.v) - 4, o.fmt(r.v), "", "middle")}${txt(m.l + i * bw + bw / 2, m.t + ph + 14, r.k, "tick", "middle")}`).join("")}
    ${o.ref != null ? `<line class="ref" x1="${m.l}" x2="${m.l + pw}" y1="${f1(y(o.ref))}" y2="${f1(y(o.ref))}"/>` : ""}
    ${o.xlabel ? txt(m.l + pw / 2, H - 4, o.xlabel, "", "middle") : ""}</svg>`;
}
