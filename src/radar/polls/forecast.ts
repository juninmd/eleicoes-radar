// Poll average + Monte Carlo for majoritarian races. Assumptions (stated in the UI):
// latest poll per institute inside a 21-day window, recency half-life of 10 days,
// sqrt(sample) weights, and a systematic error of 3.5 p.p. on top of sampling error,
// because Brazilian polls have missed by more than their stated margins.
import type { Poll, Race } from "./extract";

export interface CandidateForecast {
  sq: string;
  media: number; // share of valid votes, 0-1
  lo: number; // 5th percentile
  hi: number; // 95th percentile
  pVitoria: number; // P(elected)
  p2turno: number | null; // P(reaching a runoff), majoritarian 2-round races only
}

export interface Forecast {
  cargo: Race;
  uf: string;
  vagas: number;
  pesquisas: number;
  institutos: string[];
  desde: string | null;
  ultima: string | null;
  p1turno: number | null; // P(decided in the first round)
  candidatos: CandidateForecast[];
}

export const WINDOW_DAYS = 21;
const HALF_LIFE = 10;
const SYSTEMATIC = 0.035;
const RUNOFF_SYSTEMATIC = 0.03;
const DEFF = 1.5;
const SIMS = 20_000;

const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

// Labels mix sponsor and pollster in any order ("Apex/Futura", "Futura/Apex", "Futura"):
// labels sharing any "/"-separated part are the same institute.
export function instituteKeys(labels: string[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const l of labels) {
    const parts = l.split("/").map(norm).filter(Boolean);
    for (const p of parts) if (!parent.has(p)) parent.set(p, p);
    for (const p of parts.slice(1)) parent.set(find(p), find(parts[0]!));
  }
  return new Map(labels.map((l) => [l, find(l.split("/").map(norm).find(Boolean) ?? norm(l))]));
}

// Latest poll of each institute within the window ending at the newest poll.
export function selectPolls(polls: Poll[]): Poll[] {
  if (!polls.length) return [];
  const newest = polls.reduce((m, p) => (p.fim > m ? p.fim : m), "");
  const keys = instituteKeys(polls.map((p) => p.instituto));
  const byInst = new Map<string, Poll>();
  for (const p of polls) {
    if (days(newest, p.fim) > WINDOW_DAYS) continue;
    const k = keys.get(p.instituto)!;
    const prev = byInst.get(k);
    if (!prev || p.fim > prev.fim) byInst.set(k, p);
  }
  return [...byInst.values()];
}

const weight = (p: Poll, newest: string) => 0.5 ** (days(newest, p.fim) / HALF_LIFE) * Math.sqrt(Math.min(p.amostra ?? 800, 5000) / 1000);

// Weighted mean of each candidate's share of valid votes (undecided removed).
export function average(polls: Poll[]): { mean: Map<string, number>; nEff: number } {
  const newest = polls.reduce((m, p) => (p.fim > m ? p.fim : m), "");
  const sum = new Map<string, number>();
  const wsum = new Map<string, number>();
  let other = 0;
  let otherW = 0;
  for (const p of polls) {
    const w = weight(p, newest);
    const denom = Object.values(p.votos).reduce((a, b) => a + b, 0) + (p.outros ?? 0);
    if (denom <= 0) continue;
    for (const [sq, v] of Object.entries(p.votos)) {
      sum.set(sq, (sum.get(sq) ?? 0) + (w * v) / denom);
      wsum.set(sq, (wsum.get(sq) ?? 0) + w);
    }
    other += (w * (p.outros ?? 0)) / denom;
    otherW += w;
  }
  const mean = new Map([...sum].map(([sq, s]) => [sq, s / wsum.get(sq)!]));
  const total = [...mean.values()].reduce((a, b) => a + b, 0) + (otherW ? other / otherW : 0);
  for (const [sq, v] of mean) mean.set(sq, total > 0 ? v / total : 0);
  const nEff = Math.min(polls.reduce((a, p) => a + (p.amostra ?? 800), 0), 10_000) / DEFF;
  return { mean, nEff };
}

// Deterministic PRNG so a rebuild with the same polls yields the same numbers.
function rng(seed: string) {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(uniform() || 1e-12)) * Math.cos(2 * Math.PI * uniform());
}

const quantile = (xs: Float64Array, q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;

export function forecast(cargo: Race, uf: string, polls: Poll[], vagas: number): Forecast | null {
  const first = selectPolls(polls.filter((p) => p.turno === 1));
  if (!first.length) return null;
  const { mean, nEff } = average(first);
  const sqs = [...mean.keys()];
  const sd = sqs.map((sq) => {
    const p = mean.get(sq)!;
    return Math.sqrt((p * (1 - p)) / nEff + SYSTEMATIC ** 2 * (p / (p + 0.15)));
  });
  const runoff = runoffAverages(selectRunoffs(polls.filter((p) => p.turno === 2)));
  const twoRounds = cargo !== "Senador";
  const gauss = rng(`${cargo}|${uf}`);
  const draws = sqs.map(() => new Float64Array(SIMS));
  const wins = new Float64Array(sqs.length);
  const inRunoff = new Float64Array(sqs.length);
  let decided = 0;

  for (let s = 0; s < SIMS; s++) {
    const x = sqs.map((sq, i) => Math.max(0, mean.get(sq)! + sd[i]! * gauss()));
    const total = x.reduce((a, b) => a + b, 0) + Math.max(0, 1 - sqs.reduce((a, sq) => a + mean.get(sq)!, 0));
    x.forEach((v, i) => (draws[i]![s] = v / total));
    const order = sqs.map((_, i) => i).sort((a, b) => draws[b]![s]! - draws[a]![s]!);
    if (!twoRounds) {
      for (const i of order.slice(0, vagas)) wins[i]!++;
    } else if (draws[order[0]!]![s]! > 0.5) {
      wins[order[0]!]!++;
      decided++;
    } else {
      const [a, b] = [order[0]!, order[1]!];
      inRunoff[a]!++;
      inRunoff[b]!++;
      const h2h = runoff.get(pairKey(sqs[a]!, sqs[b]!));
      const qA = h2h ? (h2h.a === sqs[a] ? h2h.q : 1 - h2h.q) : draws[a]![s]! / (draws[a]![s]! + draws[b]![s]!);
      const sdA = h2h ? Math.sqrt((qA * (1 - qA)) / h2h.nEff + RUNOFF_SYSTEMATIC ** 2) : 0.05;
      wins[qA + sdA * gauss() >= 0.5 ? a : b]!++;
    }
  }

  const candidatos = sqs
    .map((sq, i) => {
      const d = draws[i]!.slice().sort();
      return {
        sq,
        media: mean.get(sq)!,
        lo: quantile(d, 0.05),
        hi: quantile(d, 0.95),
        pVitoria: wins[i]! / SIMS,
        p2turno: twoRounds ? inRunoff[i]! / SIMS : null,
      };
    })
    .sort((a, b) => b.pVitoria - a.pVitoria || b.media - a.media);
  const dates = first.map((p) => p.fim).sort();
  return {
    cargo, uf, vagas: twoRounds ? 1 : vagas, pesquisas: first.length,
    institutos: [...new Set(first.map((p) => p.instituto))].sort(),
    desde: dates[0] ?? null, ultima: dates.at(-1) ?? null,
    p1turno: twoRounds ? decided / SIMS : null,
    candidatos,
  };
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

function selectRunoffs(polls: Poll[]): Poll[] {
  const byPair = new Map<string, Poll[]>();
  for (const p of polls) {
    const k = pairKey(...(Object.keys(p.votos) as [string, string]));
    byPair.set(k, [...(byPair.get(k) ?? []), p]);
  }
  return [...byPair.values()].flatMap(selectPolls);
}

// Head-to-head share of the first SQ (sorted) per pair, among decided voters.
export function runoffAverages(polls: Poll[]): Map<string, { a: string; q: number; nEff: number }> {
  const out = new Map<string, { a: string; q: number; nEff: number }>();
  const groups = new Map<string, Poll[]>();
  for (const p of polls) {
    const k = pairKey(...(Object.keys(p.votos) as [string, string]));
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const [k, ps] of groups) {
    const a = k.split("|")[0]!;
    const newest = ps.reduce((m, p) => (p.fim > m ? p.fim : m), "");
    let num = 0;
    let den = 0;
    for (const p of ps) {
      const [va, vb] = [p.votos[a] ?? 0, Object.entries(p.votos).find(([sq]) => sq !== a)?.[1] ?? 0];
      if (va + vb <= 0) continue;
      const w = weight(p, newest);
      num += (w * va) / (va + vb);
      den += w;
    }
    if (den > 0) out.set(k, { a, q: num / den, nEff: Math.min(ps.reduce((s, p) => s + (p.amostra ?? 800), 0), 10_000) / DEFF });
  }
  return out;
}
