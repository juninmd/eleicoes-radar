import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { afimUfNoMundo, caixaBrasil, enquadrar, limitar, MUNDO_VB, naCena, trazerParaVista, zoomEm } from "./apuracao-cena.js";
import type { UfMap } from "../src/radar/geo/uf-map";

const uf = JSON.parse(readFileSync("web/mapa-uf.json", "utf8")) as UfMap;
const afim = afimUfNoMundo(uf.proj, MUNDO_VB);
// The world map is equirectangular from 180°W, 84°N: the inverse of what world-map.ts does.
const lonLat = (x: number, y: number): [number, number] => [(x / MUNDO_VB[2]) * 360 - 180, 84 - (y / MUNDO_VB[2]) * 360];
const VP = { w: 1000, h: 500 };

describe("the states on the world map", () => {
  test("São Paulo lands at São Paulo's own longitude and latitude", () => {
    const [cx, cy] = uf.ufs.SP!.c;
    const [lon, lat] = lonLat(afim.sx * cx + afim.tx, afim.sy * cy + afim.ty);
    expect(lon).toBeGreaterThan(-50.5);
    expect(lon).toBeLessThan(-46.5);
    expect(lat).toBeGreaterThan(-24.5);
    expect(lat).toBeLessThan(-20.5);
  });

  test("Brazil's box sits inside the world, in the west and the south, around 75°W to 33°W and 6°N to 34°S", () => {
    const b = caixaBrasil(uf.viewBox, afim);
    const [lonO, latN] = lonLat(b.x, b.y), [lonL, latS] = lonLat(b.x + b.w, b.y + b.h);
    expect(lonO).toBeGreaterThan(-78);
    expect(lonO).toBeLessThan(-70);
    expect(lonL).toBeGreaterThan(-36);
    expect(lonL).toBeLessThan(-28);
    expect(latN).toBeGreaterThan(4);
    expect(latN).toBeLessThan(10);
    expect(latS).toBeGreaterThan(-38);
    expect(latS).toBeLessThan(-32);
  });
});

describe("naCena: a position given in % of Brazil's box becomes % of the whole world", () => {
  test("the whole box maps to the box's own place and size", () => {
    const caixa = { x: 270, y: 80, w: 150, h: 150 };
    const r = naCena({ l: 0, t: 0, w: 100, h: 100 }, caixa, MUNDO_VB);
    expect(r.l).toBeCloseTo((270 / MUNDO_VB[2]) * 100, 6);
    expect(r.t).toBeCloseTo((80 / MUNDO_VB[3]) * 100, 6);
    expect(r.w).toBeCloseTo((150 / MUNDO_VB[2]) * 100, 6);
    expect(r.h).toBeCloseTo((150 / MUNDO_VB[3]) * 100, 6);
  });

  test("a quarter of the way in is a quarter of the way in", () => {
    const caixa = { x: 100, y: 100, w: 200, h: 100 };
    const r = naCena({ l: 25, t: 50, w: 10, h: 10 }, caixa, [0, 0, 1000, 500]);
    expect(r).toEqual({ l: 15, t: 30, w: 2, h: 2 });
  });
});

describe("enquadrar: the view that shows a rectangle of the world", () => {
  test("the limiting side fits with the margin and the other is centred", () => {
    const v = enquadrar({ x: 100, y: 100, w: 100, h: 100 }, VP, 0.1); // tall viewport side limits: 500 / 120
    expect(v.k).toBeCloseTo(500 / 120, 6);
    const centro = [(150 * v.k) + v.x, (150 * v.k) + v.y];
    expect(centro[0]).toBeCloseTo(VP.w / 2, 6);
    expect(centro[1]).toBeCloseTo(VP.h / 2, 6);
  });

  test("a rectangle wider than the viewport is limited by width", () => {
    const v = enquadrar({ x: 0, y: 0, w: 1000, h: 100 }, VP, 0);
    expect(v.k).toBeCloseTo(1, 6);
  });
});

describe("limitar: the view never leaves the world nor zooms past the limits", () => {
  test("zoom out stops at the whole world in view", () => {
    const v = limitar({ k: 0.01, x: 0, y: 0 }, VP);
    expect(v.k).toBeCloseTo(Math.min(VP.w / MUNDO_VB[2], VP.h / MUNDO_VB[3]), 6);
  });

  test("zoom in stops at the ceiling", () => {
    expect(limitar({ k: 1000, x: 0, y: 0 }, VP).k).toBeLessThanOrEqual(80);
  });

  test("a zoomed view cannot show past the edge of the map", () => {
    const v = limitar({ k: 4, x: 500, y: 500 }, VP); // the top-left corner of the world would sit inside the viewport
    expect(v.x).toBeLessThanOrEqual(0);
    expect(v.y).toBeLessThanOrEqual(0);
    const w = limitar({ k: 4, x: -99999, y: -99999 }, VP);
    expect(w.x + MUNDO_VB[2] * 4).toBeGreaterThanOrEqual(VP.w - 1e-6);
    expect(w.y + MUNDO_VB[3] * 4).toBeGreaterThanOrEqual(VP.h - 1e-6);
  });

  test("a world smaller than the viewport on one side is centred on that side", () => {
    const v = limitar({ k: 0.5, x: 0, y: 0 }, VP); // 540 x 213 inside 1000 x 500
    expect(v.x).toBeCloseTo((VP.w - MUNDO_VB[2] * v.k) / 2, 6);
    expect(v.y).toBeCloseTo((VP.h - MUNDO_VB[3] * v.k) / 2, 6);
  });
});

describe("zoomEm: the point under the cursor stays under the cursor", () => {
  test("zooming in at a point keeps that world point in place", () => {
    const antes = limitar({ k: 2, x: -300, y: -100 }, VP);
    const cursor = { x: 400, y: 250 };
    const mundoX = (cursor.x - antes.x) / antes.k, mundoY = (cursor.y - antes.y) / antes.k;
    const depois = zoomEm(antes, 1.5, cursor, VP);
    expect(depois.k).toBeCloseTo(3, 6);
    expect(mundoX * depois.k + depois.x).toBeCloseTo(cursor.x, 6);
    expect(mundoY * depois.k + depois.y).toBeCloseTo(cursor.y, 6);
  });

  test("a factor that would pass the ceiling is held at the ceiling", () => {
    const v = zoomEm({ k: 70, x: -30000, y: -10000 }, 5, { x: 0, y: 0 }, VP);
    expect(v.k).toBeLessThanOrEqual(80);
  });
});

describe("trazerParaVista: a focused state is panned into view, never zoomed", () => {
  test("a rectangle already in view leaves the view alone", () => {
    const v = limitar({ k: 4, x: -400, y: -200 }, VP);
    expect(trazerParaVista(v, { x: 200, y: 100, w: 20, h: 20 }, VP, 10)).toEqual(v);
  });

  test("a rectangle bigger than the viewport is centred instead of pushed off one side", () => {
    const v = limitar({ k: 10, x: -2000, y: -800 }, VP);
    const grande = { x: 300, y: 100, w: 150, h: 40 }; // 1500 px wide in a 1000 px viewport
    const w = trazerParaVista(v, grande, VP, 10);
    expect((300 + 75) * w.k + w.x).toBeCloseTo(VP.w / 2, 6);
  });

  test("a rectangle out of view is brought in with the margin", () => {
    const v = limitar({ k: 4, x: -400, y: -200 }, VP);
    const fora = { x: 700, y: 300, w: 20, h: 20 };
    const w = trazerParaVista(v, fora, VP, 10);
    expect(w.k).toBe(v.k);
    const px = fora.x * w.k + w.x, py = fora.y * w.k + w.y;
    expect(px).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(px + fora.w * w.k).toBeLessThanOrEqual(VP.w - 10 + 1e-6);
    expect(py).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(py + fora.h * w.k).toBeLessThanOrEqual(VP.h - 10 + 1e-6);
  });
});
