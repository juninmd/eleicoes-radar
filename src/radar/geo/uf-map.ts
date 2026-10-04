// Turns the IBGE state mesh (GeoJSON, lon/lat) into the SVG paths the Apuração map draws.
// One-off network step: bun run radar:geo. The output (web/mapa-uf.json) is committed, so a
// build or a deploy never depends on the IBGE API.
import { writeFileSync } from "node:fs";

export const UF_BY_IBGE: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

const URL_MESH = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF";
const K = 14; // output units per degree of latitude
const COS = Math.cos((14 * Math.PI) / 180); // Brazil is centred near 14°S: keeps shapes from looking stretched
const PAD = 6;

type Pt = [number, number];
interface Feature { properties: { codarea: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }
export interface UfShape { d: string; c: [number, number]; a: number }
export interface UfMap { fonte: string; viewBox: [number, number, number, number]; ufs: Record<string, UfShape> }

const rings = (g: Feature["geometry"]): number[][][] => (g.type === "Polygon" ? (g.coordinates as number[][][]) : (g.coordinates as number[][][][]).flat());

function area(r: Pt[]): number {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
  return a / 2;
}

function centroid(r: Pt[]): Pt {
  const a = area(r);
  if (Math.abs(a) < 1e-9) return r[0]!;
  let x = 0;
  let y = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const f = r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
    x += (r[i]![0] + r[i + 1]![0]) * f;
    y += (r[i]![1] + r[i + 1]![1]) * f;
  }
  return [x / (6 * a), y / (6 * a)];
}

export function buildMap(geo: { features: Feature[] }): UfMap {
  const all = geo.features.flatMap((f) => rings(f.geometry).flat());
  const lon0 = Math.min(...all.map((p) => p[0]!));
  const lat0 = Math.max(...all.map((p) => p[1]!));
  const project = ([lon, lat]: number[]): Pt => [PAD + (lon! - lon0) * COS * K, PAD + (lat0 - lat!) * K];
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const ufs: Record<string, UfShape> = {};
  let w = 0;
  let h = 0;
  for (const f of geo.features) {
    const uf = UF_BY_IBGE[f.properties.codarea];
    if (!uf) throw new Error(`código IBGE desconhecido: ${f.properties.codarea}`);
    const projected = rings(f.geometry).map((r) => r.map(project));
    for (const [x, y] of projected.flat()) { w = Math.max(w, x); h = Math.max(h, y); }
    const biggest = projected.reduce((m, r) => (Math.abs(area(r)) > Math.abs(area(m)) ? r : m));
    const d = projected
      .map((r) => `M${r.filter((p, i) => i === 0 || p[0] !== r[i - 1]![0] || p[1] !== r[i - 1]![1]).map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}Z`)
      .join("");
    const [cx, cy] = centroid(biggest);
    ufs[uf] = { d, c: [r1(cx), r1(cy)], a: Math.round(projected.reduce((sum, r) => sum + Math.abs(area(r)), 0)) };
  }
  return { fonte: "Malha territorial: IBGE (servicodados.ibge.gov.br, qualidade mínima)", viewBox: [0, 0, Math.ceil(w + PAD), Math.ceil(h + PAD)], ufs };
}

if (import.meta.main) {
  const r = await fetch(URL_MESH, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`IBGE respondeu HTTP ${r.status}`);
  const map = buildMap(await r.json());
  if (Object.keys(map.ufs).length !== 27) throw new Error(`esperava 27 UFs, veio ${Object.keys(map.ufs).length}`);
  writeFileSync("web/mapa-uf.json", JSON.stringify(map));
  console.log(`[geo] 27 UFs, ${map.viewBox.join("x")} -> web/mapa-uf.json`);
}
