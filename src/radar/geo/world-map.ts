// Turns Natural Earth's countries (world-atlas, TopoJSON, 1:110m) into one SVG path of land, equirectangular, for the "Exterior" map of the Apuração.
// One-off network step: bun run radar:geo-mundo. The output (web/mapa-mundo.json) is committed, so a build or a deploy never depends on the CDN.
import { writeFileSync } from "node:fs";

const URL_WORLD = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
export const K = 3; // output units per degree
export const LAT_MAX = 84, LAT_MIN = -58; // Antarctica and the polar cap stay out: no Brazilian votes there
export interface MundoMap { fonte: string; viewBox: [number, number, number, number]; d: string }
interface Topo { arcs: number[][][]; transform: { scale: [number, number]; translate: [number, number] }; objects: { countries: { geometries: { type: string; arcs: number[][] | number[][][] }[] } } }

type Pt = [number, number];
function decodeArcs(t: Topo): Pt[][] {
  const { scale, translate } = t.transform;
  return t.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx!; y += dy!; return [x * scale[0] + translate[0], y * scale[1] + translate[1]] as Pt; }); });
}
const anel = (idx: number[], arcos: Pt[][]): Pt[] => idx.flatMap((i, k) => { const a = i >= 0 ? arcos[i]! : [...arcos[~i]!].reverse(); return k ? a.slice(1) : a; });

export const projetar = ([lon, lat]: Pt): Pt => [(lon + 180) * K, (LAT_MAX - lat) * K];

export function buildMundo(t: Topo): MundoMap {
  const arcos = decodeArcs(t);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  let d = "";
  for (const g of t.objects.countries.geometries) {
    const poligonos = (g.type === "Polygon" ? [g.arcs as number[][]] : g.type === "MultiPolygon" ? (g.arcs as number[][][]) : []);
    for (const p of poligonos) for (const idx of p) {
      const pts = anel(idx, arcos);
      if (pts.some(([, lat]) => lat < -60)) continue; // Antarctica
      // A ring that crosses the antimeridian is made continuous (longitudes past 180) and drawn once more shifted by a turn, so both edges of the map get their half
      const cont = pts.map(([lon, lat], i): Pt => { const prev = i ? pts[i - 1]![0] : lon; return [lon - Math.round((lon - prev) / 360) * 360, lat]; });
      for (let i = 1; i < cont.length; i++) { const ant = cont[i - 1]![0]; cont[i]![0] = cont[i]![0] - Math.round((cont[i]![0] - ant) / 360) * 360; }
      const cruza = cont.some(([lon]) => lon > 180 || lon < -180);
      for (const desloca of cruza ? [0, 360, -360] : [0]) d += `M${cont.map(([lon, lat]) => projetar([lon + desloca, lat]).map(r1).join(" ")).join("L")}Z`;
    }
  }
  return { fonte: "Contornos: Natural Earth via world-atlas (1:110m)", viewBox: [0, 0, 360 * K, (LAT_MAX - LAT_MIN) * K], d };
}

if (import.meta.main) {
  const r = await fetch(URL_WORLD, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`CDN respondeu HTTP ${r.status}`);
  const m = buildMundo(await r.json());
  writeFileSync("web/mapa-mundo.json", JSON.stringify(m));
  console.log(`[geo] mundo ${m.viewBox.join("x")} -> web/mapa-mundo.json`);
}
