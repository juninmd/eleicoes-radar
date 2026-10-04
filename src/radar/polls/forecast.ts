// Poll average + Monte Carlo for majoritarian races. Assumptions (stated in the UI):
// latest poll per institute inside a 21-day window, recency half-life of 10 days,
// sqrt(sample) weights, and a systematic error on top of sampling error, because Brazilian polls
// have missed by more than their stated margins. Both error sizes were fitted on the 2014, 2018 and
// 2022 races (126 races, 785 candidate shares; polls as of the day before the vote vs the official result).
import type { Poll, Race } from "./extract";

export interface CandidateForecast {
  sq: string;
  media: number; // share of valid votes, 0-1
  lo: number; // 5th percentile of the share
  hi: number; // 95th percentile of the share
  pVitoria: number; // P(elected)
  p2turno: number | null; // P(reaching a runoff), majoritarian 2-round races only
  tendencia: number | null; // change in the poll average (share of valid votes) vs TREND_DAYS earlier
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
  refTendencia: string | null; // date of the newest poll behind the earlier average
  confrontos: { a: string; b: string; qa: number; n: number }[]; // head-to-head share of `a` among decided voters, from `n` polls
  candidatos: CandidateForecast[];
}

export const WINDOW_DAYS = 21;
const HALF_LIFE = 10;
// Chance of winning: 3.5 p.p. (the first guess) left the 90-100% band winning 78% of the time. Log-loss improves up
// to ~0.14 and the calibration table is flat there; 0.12 keeps some margin for polls we cannot audit.
const SYSTEMATIC = 0.12;
// Share band: maximum likelihood on shares gives 0.085 (0.078-0.09 leaving one election out), which makes the
// 90% band cover about 90% of results. The win chance needs a wider error because the leaders' errors are not
// independent and upsets are fat-tailed, so the two are not the same number.
const SYSTEMATIC_BAND = 0.085;
const RUNOFF_SYSTEMATIC = 0.03;
const DEFF = 1.5;
const SIMS = 20_000;
export const TREND_DAYS = 14;
const TREND_SLACK = 7; // the reference snapshot may end up to a week before the 14-day mark

// Stated in the UI: the numbers shown there come from here, not from copied text.
export const PARAMS = { janelaDias: WINDOW_DAYS, meiaVidaDias: HALF_LIFE, erroSistematico: SYSTEMATIC, erroFaixa: SYSTEMATIC_BAND, simulacoes: SIMS, tendenciaDias: TREND_DAYS };

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

// `systematic` is a parameter only so the backtest can compare values; the build always uses SYSTEMATIC.
export function forecast(cargo: Race, uf: string, polls: Poll[], vagas: number, systematic = SYSTEMATIC): Forecast | null {
  const first = selectPolls(polls.filter((p) => p.turno === 1));
  if (!first.length) return null;
  const { mean, nEff } = average(first);
  const sqs = [...mean.keys()];
  const sdOf = (p: number, sys: number) => Math.sqrt((p * (1 - p)) / nEff + sys ** 2 * (p / (p + 0.15)));
  const sd = sqs.map((sq) => sdOf(mean.get(sq)!, systematic));
  const newest = newestOf(first);
  const earlier = selectPolls(polls.filter((p) => p.turno === 1 && days(newest, p.fim) >= TREND_DAYS));
  // A reference much older than the fortnight would still be labelled "2 weeks ago": better no trend.
  const before = earlier.length && days(newest, newestOf(earlier)) <= TREND_DAYS + TREND_SLACK ? earlier : [];
  const prior = before.length ? average(before).mean : null;
  const runoff = runoffAverages(selectRunoffs(polls.filter((p) => p.turno === 2)));
  const twoRounds = cargo !== "Senador";
  const gauss = rng(`${cargo}|${uf}`);
  const wins = new Float64Array(sqs.length);
  const inRunoff = new Float64Array(sqs.length);
  let decided = 0;

  for (let s = 0; s < SIMS; s++) {
    const x = sqs.map((sq, i) => Math.max(0, mean.get(sq)! + sd[i]! * gauss()));
    const total = x.reduce((a, b) => a + b, 0) + Math.max(0, 1 - sqs.reduce((a, sq) => a + mean.get(sq)!, 0));
    const share = x.map((v) => v / total);
    const order = sqs.map((_, i) => i).sort((a, b) => share[b]! - share[a]!);
    if (!twoRounds) {
      for (const i of order.slice(0, vagas)) wins[i]!++;
    } else if (share[order[0]!]! > 0.5) {
      wins[order[0]!]!++;
      decided++;
    } else {
      const [a, b] = [order[0]!, order[1]!];
      inRunoff[a]!++;
      inRunoff[b]!++;
      const h2h = runoff.get(pairKey(sqs[a]!, sqs[b]!));
      const qA = h2h ? (h2h.a === sqs[a] ? h2h.q : 1 - h2h.q) : share[a]! / (share[a]! + share[b]!);
      const sdA = h2h ? Math.sqrt((qA * (1 - qA)) / h2h.nEff + RUNOFF_SYSTEMATIC ** 2) : 0.05;
      wins[qA + sdA * gauss() >= 0.5 ? a : b]!++;
    }
  }

  const candidatos = sqs
    .map((sq, i) => {
      const m = mean.get(sq)!;
      const half = 1.645 * sdOf(m, SYSTEMATIC_BAND);
      return {
        sq,
        media: m,
        lo: Math.max(0, m - half),
        hi: Math.min(1, m + half),
        pVitoria: wins[i]! / SIMS,
        p2turno: twoRounds ? inRunoff[i]! / SIMS : null,
        tendencia: prior?.has(sq) ? mean.get(sq)! - prior.get(sq)! : null,
      };
    })
    .sort((a, b) => b.pVitoria - a.pVitoria || b.media - a.media);
  const dates = first.map((p) => p.fim).sort();
  return {
    cargo, uf, vagas: twoRounds ? 1 : vagas, pesquisas: first.length,
    institutos: [...new Set(first.map((p) => p.instituto))].sort(),
    desde: dates[0] ?? null, ultima: dates.at(-1) ?? null,
    p1turno: twoRounds ? decided / SIMS : null,
    refTendencia: before.length ? newestOf(before) : null,
    confrontos: twoRounds ? matchups(runoff, candidatos) : [],
    candidatos,
  };
}

const MATCHUP_MIN = 0.05; // both must reach a runoff in at least 5% of simulations to matter

// The head-to-head averages that actually feed the simulations, for the pairs that can happen.
function matchups(runoff: ReturnType<typeof runoffAverages>, cs: CandidateForecast[]) {
  const p2 = new Map(cs.map((c) => [c.sq, c.p2turno ?? 0]));
  const rank = new Map(cs.map((c, i) => [c.sq, i])); // cs is sorted by chance of winning
  return [...runoff]
    .flatMap(([k, v]) => {
      const [x, y] = k.split("|") as [string, string];
      if ((p2.get(x) ?? 0) < MATCHUP_MIN || (p2.get(y) ?? 0) < MATCHUP_MIN) return [];
      const [a, b] = rank.get(x)! < rank.get(y)! ? [x, y] : [y, x]; // the likelier winner first
      return [{ a, b, qa: v.a === a ? v.q : 1 - v.q, n: v.n }];
    })
    .sort((m, n) => (p2.get(n.a)! + p2.get(n.b)!) - (p2.get(m.a)! + p2.get(m.b)!))
    .slice(0, 3);
}

const newestOf = (polls: Poll[]) => polls.reduce((m, p) => (p.fim > m ? p.fim : m), "");

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
export function runoffAverages(polls: Poll[]): Map<string, { a: string; q: number; nEff: number; n: number }> {
  const out = new Map<string, { a: string; q: number; nEff: number; n: number }>();
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
    if (den > 0) out.set(k, { a, q: num / den, nEff: Math.min(ps.reduce((s, p) => s + (p.amostra ?? 800), 0), 10_000) / DEFF, n: ps.length });
  }
  return out;
}
