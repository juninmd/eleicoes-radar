// Past runoffs as training data for web/municipio-modelo.ts, and the fit of its two shape parameters (kappa, eta) and the runoff/first-round
// vote ratio. Only the shape is learned from the past: the level of each election (alpha) is solved per race, never fitted.
import { existsSync, readFileSync } from "node:fs";
import { firstRoundVotes, leanOf, logit, othersShare, type City, type Params } from "../../../web/municipio-modelo";
import type { Cargo, MunElection } from "./sources";

export interface RunoffCity { cod: string; nome: string; uf: string; city: City; a2: number; b2: number }
export interface Runoff {
  year: number; cargo: Cargo; uf: string;
  a: { n: string; nome: string; partido: string }; b: { n: string; nome: string; partido: string }; // A = the finalist ahead in the first round
  cities: RunoffCity[];
}

// Every race of an election that had a runoff, with the finalists oriented (A = more first-round votes in the whole race).
export function runoffsOf(e: MunElection): Runoff[] {
  const out: Runoff[] = [];
  for (const race of e.races) {
    const rows = Object.entries(race.mun);
    const n = race.cands.length;
    const t2 = new Array<number>(n).fill(0), t1 = new Array<number>(n).fill(0);
    for (const [, m] of rows) for (let i = 0; i < n; i++) { t1[i]! += m.v1[i] ?? 0; t2[i]! += m.v2?.[i] ?? 0; }
    const fin = t2.map((v, i) => [v, i] as const).filter(([v]) => v > 0).sort((x, y) => y[0] - x[0]).slice(0, 2).map(([, i]) => i);
    if (fin.length < 2) continue;
    const [a, b] = t1[fin[0]!]! >= t1[fin[1]!]! ? [fin[0]!, fin[1]!] : [fin[1]!, fin[0]!];
    const cities: RunoffCity[] = [];
    for (const [cod, m] of rows) {
      if (!m.v2) continue;
      const a1 = m.v1[a] ?? 0, b1 = m.v1[b] ?? 0;
      const o = m.v1.reduce((s, v) => s + v, 0) - a1 - b1;
      const a2 = m.v2[a] ?? 0, b2 = m.v2[b] ?? 0;
      if (a2 + b2 <= 0 || a1 + b1 + o <= 0) continue;
      cities.push({ cod, nome: m.nome, uf: m.uf, city: { a: a1, b: b1, o }, a2, b2 });
    }
    const id = (i: number) => ({ n: race.cands[i]!.n, nome: race.cands[i]!.nome, partido: race.cands[i]!.partido });
    out.push({ year: e.year, cargo: race.cargo, uf: race.uf, a: id(a), b: id(b), cities });
  }
  return out;
}

export function loadRunoffs(years: readonly number[], dir = "data/hist"): Runoff[] {
  const out: Runoff[] = [];
  for (const y of years) {
    const f = `${dir}/mun-${y}.json`;
    if (!existsSync(f)) throw new Error(`falta ${f} (bun run radar:mun-hist ${y})`);
    out.push(...runoffsOf(JSON.parse(readFileSync(f, "utf8"))));
  }
  return out;
}

export const actualShare = (r: Runoff) => {
  let a = 0, t = 0;
  for (const c of r.cities) { a += c.a2; t += c.a2 + c.b2; }
  return t > 0 ? a / t : 0.5;
};

// Valid votes of the runoff over valid votes of the first round, over the whole race.
export function ratioOf(rs: readonly Runoff[]): number {
  let v2 = 0, v1 = 0;
  for (const r of rs) for (const c of r.cities) { v2 += c.a2 + c.b2; v1 += firstRoundVotes(c.city); }
  return v1 > 0 ? v2 / v1 : 1;
}

// The shape of the model, by weighted least squares on logit(share of A) with a free level per race: each race counts the same,
// each city by its real runoff votes. No search, no tuning knob: the two coefficients are the regression's.
export function fitShape(rs: readonly Runoff[], ratio = ratioOf(rs)): Params {
  // normal equations of  y = alpha_race + kappa * lean + eta * (so * lean), after centring inside each race
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (const r of rs) {
    const rows = r.cities.map((c) => {
      const lean = leanOf(c.city), y = logit(Math.min(0.99, Math.max(0.01, c.a2 / (c.a2 + c.b2))));
      return { x1: lean, x2: othersShare(c.city) * lean, y, w: c.a2 + c.b2 };
    });
    const W = rows.reduce((s, q) => s + q.w, 0);
    const m = (f: (q: (typeof rows)[number]) => number) => rows.reduce((s, q) => s + q.w * f(q), 0) / W;
    const m1 = m((q) => q.x1), m2 = m((q) => q.x2), my = m((q) => q.y);
    for (const q of rows) {
      const w = q.w / W, x1 = q.x1 - m1, x2 = q.x2 - m2, y = q.y - my;
      s11 += w * x1 * x1; s12 += w * x1 * x2; s22 += w * x2 * x2; t1 += w * x1 * y; t2 += w * x2 * y;
    }
  }
  const det = s11 * s22 - s12 * s12;
  const kappa = (t1 * s22 - t2 * s12) / det, eta = (t2 * s11 - t1 * s12) / det;
  return { kappa: Math.round(kappa * 1000) / 1000, eta: Math.round(eta * 1000) / 1000, ratio };
}
