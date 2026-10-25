// Pure geometry of the one map of the Noite view: the world, with Brazil's states in their place. "Brasil" and "Exterior" are only two views
// of it (a zoom and what is highlighted), and the reader can zoom and pan on top of them. World units are the ones of mapa-mundo.json
// (equirectangular, 3 per degree, the top edge at 84°N); a view is {k, x, y}: px = k * world + (x, y), in the viewport's own pixels.
import type { UfProj } from "../src/radar/geo/uf-map";

export type Caixa4 = readonly [number, number, number, number];
export interface Retangulo { x: number; y: number; w: number; h: number }
export interface Vista { k: number; x: number; y: number }
export interface Pos { l: number; t: number; w: number; h: number }
export interface Afim { sx: number; sy: number; tx: number; ty: number }

export const LAT_TOPO = 84;
// The size of the world map the generator writes (360° * 3 by (84° + 58°) * 3): the stage has it before the file arrives, so the states do not wait.
export const MUNDO_VB: Caixa4 = [0, 0, 1080, 426];
// The projection of web/mapa-uf.json as generated; used when an older cached copy of the file has no `proj` yet.
export const PROJ_PADRAO: UfProj = { lon0: -73.9833, lat0: 5.2718, pad: 6, grauX: 13.58414016786395, grauY: 14 };
export const K_MAX = 40; // px per world unit: a small state fills the viewport and the 1:110m coastline is not pretended to be finer than it is

// uf units -> world units: invert the state map's projection (lon/lat from x/y) and apply the world's.
export function afimUfNoMundo(p: UfProj, vb: Caixa4 = MUNDO_VB): Afim {
  const kw = vb[2] / 360;
  return { sx: kw / p.grauX, sy: kw / p.grauY, tx: (p.lon0 + 180) * kw - (p.pad * kw) / p.grauX, ty: (LAT_TOPO - p.lat0) * kw - (p.pad * kw) / p.grauY };
}

// The state map's whole canvas, in world units.
export function caixaBrasil(vbUf: Caixa4, a: Afim): Retangulo {
  return { x: a.tx + vbUf[0] * a.sx, y: a.ty + vbUf[1] * a.sy, w: vbUf[2] * a.sx, h: vbUf[3] * a.sy };
}

// A position in % of Brazil's box (what `posicoes` gives) -> % of the world stage.
export function naCena(p: Pos, caixa: Retangulo, vb: Caixa4 = MUNDO_VB): Pos {
  return {
    l: ((caixa.x + (p.l / 100) * caixa.w) / vb[2]) * 100, t: ((caixa.y + (p.t / 100) * caixa.h) / vb[3]) * 100,
    w: ((p.w / 100) * caixa.w / vb[2]) * 100, h: ((p.h / 100) * caixa.h / vb[3]) * 100,
  };
}

interface Tamanho { w: number; h: number }
const kMin = (vp: Tamanho, vb: Caixa4 = MUNDO_VB) => Math.min(vp.w / vb[2], vp.h / vb[3]);

// The view that shows `r` as large as the viewport allows, with `folga` of margin on each side (a fraction of the rectangle), centred.
export function enquadrar(r: Retangulo, vp: Tamanho, folga = 0.06): Vista {
  const k = Math.min(vp.w / (r.w * (1 + 2 * folga)), vp.h / (r.h * (1 + 2 * folga)));
  return { k, x: vp.w / 2 - (r.x + r.w / 2) * k, y: vp.h / 2 - (r.y + r.h / 2) * k };
}

// Keeps a view legal: not zoomed out past the whole world, not past K_MAX, and the world never leaves a gap that the viewport can avoid
// (a side the world does not fill is centred).
export function limitar(v: Vista, vp: Tamanho, vb: Caixa4 = MUNDO_VB): Vista {
  const k = Math.min(Math.max(v.k, kMin(vp, vb)), K_MAX);
  const eixo = (pos: number, tamanhoMundo: number, tamanhoVp: number) => {
    const total = tamanhoMundo * k;
    return total <= tamanhoVp ? (tamanhoVp - total) / 2 : Math.min(0, Math.max(tamanhoVp - total, pos));
  };
  return { k, x: eixo(v.x, vb[2], vp.w), y: eixo(v.y, vb[3], vp.h) };
}

// Zoom by a factor around a point of the viewport: the world under it stays under it.
export function zoomEm(v: Vista, fator: number, ponto: { x: number; y: number }, vp: Tamanho, vb: Caixa4 = MUNDO_VB): Vista {
  const k = Math.min(Math.max(v.k * fator, kMin(vp, vb)), K_MAX);
  const f = k / v.k;
  return limitar({ k, x: ponto.x - (ponto.x - v.x) * f, y: ponto.y - (ponto.y - v.y) * f }, vp, vb);
}

// Pan (never zoom) so that a rectangle of the world, say a focused state, is inside the viewport with `margem` px around it.
export function trazerParaVista(v: Vista, r: Retangulo, vp: Tamanho, margem = 12, vb: Caixa4 = MUNDO_VB): Vista {
  const ajusta = (pos: number, ini: number, tam: number, total: number) => {
    const a = ini * v.k + pos, b = (ini + tam) * v.k + pos;
    if (b - a > total - 2 * margem) return total / 2 - ((ini + tam / 2) * v.k); // bigger than the viewport: centre it
    if (a < margem) return pos + (margem - a);
    if (b > total - margem) return pos - (b - (total - margem));
    return pos;
  };
  const x = ajusta(v.x, r.x, r.w, vp.w), y = ajusta(v.y, r.y, r.h, vp.h);
  return x === v.x && y === v.y ? v : limitar({ k: v.k, x, y }, vp, vb);
}
