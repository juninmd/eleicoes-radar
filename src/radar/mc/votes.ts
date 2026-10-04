// Vote model for proportional races: log(share of nominal votes) regressed on the same signals the logistic model
// uses (money, list strength, occupation, repeated number), plus the noise the simulation has to reproduce:
// a shock shared by the whole list, one shared by a party across states, and a candidate-level one drawn from the
// empirical residuals (so the heavy tails are real, not assumed normal).
import { features, type SeatCand, solve } from "../model/seats";

export interface TrainCand extends SeatCand { partido: string; votos: number }
export interface Training {
  cands: TrainCand[];
  vagas: Map<string, number>; // `${uf}|${cargo}` -> seats
  legenda: Map<string, number>; // `${grupo}|${lista}` -> legend votes
}

export interface VoteModel {
  coef: number[];
  stage1: number[] | null; // logistic weights when the mean is a calibrated logistic score instead of raw features
  edges: number[]; // bin edges on the fitted log-share
  pools: number[][]; // candidate-level residuals per bin
  ghost: number[]; // per bin: chance of ending with no votes at all (withdrawn, rejected)
  sigmaList: number;
  sigmaParty: number;
  legendRatios: number[]; // legend votes / the list's nominal votes
}

const BINS = 8;
const RIDGE = 1e-6;

export function leadParty(members: { partido: string; receita: number }[]): string {
  const by = new Map<string, number>();
  for (const m of members) by.set(m.partido, (by.get(m.partido) ?? 0) + m.receita + 1);
  return [...by].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? RIDGE : 0)));
  const b = new Array(k).fill(0);
  X.forEach((x, n) => {
    for (let i = 0; i < k; i++) {
      b[i] += x[i]! * y[n]!;
      for (let j = 0; j < k; j++) A[i]![j] += x[i]! * x[j]!;
    }
  });
  return solve(A, b);
}

const dotp = (w: number[], x: number[]) => w.reduce((a, wi, i) => a + wi * x[i]!, 0);
// Two-stage mean: [1, logistic score] ranks winners exactly like the logistic and only learns the vote scale.
const design = (stage1: number[] | null, x: number[]) => (stage1 ? [1, dotp(stage1, x)] : x);

export function binOf(edges: number[], z: number): number {
  let b = 0;
  while (b < edges.length && z >= edges[b]!) b++;
  return b;
}

interface Row { x: number[]; y: number; cand: TrainCand; fit: number }

export function fitVoteModel(trainings: Training[], stage1: number[] | null = null): VoteModel {
  const feats = trainings.map((t) => features(t.cands, t.vagas));
  const rows: Row[][] = trainings.map((t, i) => {
    const tot = new Map<string, number>();
    for (const c of t.cands) tot.set(c.grupo, (tot.get(c.grupo) ?? 0) + c.votos);
    return t.cands.filter((c) => c.votos > 0).map((c) => ({ x: design(stage1, feats[i]!.get(c.sq)!), y: Math.log(c.votos / tot.get(c.grupo)!), cand: c, fit: 0 }));
  });
  const flat = rows.flat();
  if (!flat.length) throw new Error("fitVoteModel: nenhum candidato com votos para ajustar");
  const coef = ols(flat.map((r) => r.x), flat.map((r) => r.y));
  for (const r of flat) r.fit = dotp(coef, r.x);

  const everyone = trainings.flatMap((t, i) => t.cands.map((c) => ({ fit: dotp(coef, design(stage1, feats[i]!.get(c.sq)!)), zero: c.votos <= 0 })));
  const sorted = everyone.map((a) => a.fit).sort((a, b) => a - b);
  const edges = Array.from({ length: BINS - 1 }, (_, i) => sorted[Math.floor(((i + 1) * sorted.length) / BINS)]!);
  const ghost = Array.from({ length: BINS }, (_, b) => {
    const inBin = everyone.filter((a) => binOf(edges, a.fit) === b);
    return inBin.length ? inBin.filter((a) => a.zero).length / inBin.length : 0;
  });

  // Residuals grouped by (election, race, list): the list mean is the list shock, the deviation the candidate shock.
  const lists: { rs: Row[]; year: number }[] = [];
  for (const [year, rs] of rows.entries()) {
    for (const members of Map.groupBy(rs, (r) => `${r.cand.grupo}|${r.cand.lista}`).values()) lists.push({ rs: members, year });
  }
  const pools: number[][] = Array.from({ length: BINS }, () => []);
  let ss = 0;
  let dof = 0;
  const means = lists.map(({ rs, year }) => {
    const m = rs.reduce((a, r) => a + (r.y - r.fit), 0) / rs.length;
    if (rs.length >= 2) {
      const scale = Math.sqrt(rs.length / (rs.length - 1));
      for (const r of rs) {
        const d = r.y - r.fit - m;
        ss += d * d;
        pools[binOf(edges, r.fit)]!.push(d * scale);
      }
      dof += rs.length - 1;
    }
    return { m, n: rs.length, year, party: leadParty(rs.map((r) => r.cand)) };
  });
  const s2e = dof > 0 ? ss / dof : 0;
  const s2u = Math.max(0, means.reduce((a, l) => a + l.m * l.m - s2e / l.n, 0) / Math.max(1, means.length));
  // Party shock: how far a party's average list residual in one election strays from zero, net of the list noise.
  const parties = [...Map.groupBy(means, (l) => `${l.year}|${l.party}`).values()].filter((v) => v.length >= 5);
  const s2p = Math.max(0, parties.reduce((a, v) => a + (v.reduce((s, l) => s + l.m, 0) / v.length) ** 2 - (s2u + s2e / 3) / v.length, 0) / Math.max(1, parties.length));

  const legendRatios = trainings.flatMap((t) => {
    const nominal = new Map<string, number>();
    for (const c of t.cands) nominal.set(`${c.grupo}|${c.lista}`, (nominal.get(`${c.grupo}|${c.lista}`) ?? 0) + c.votos);
    return [...nominal].filter(([, v]) => v > 0).map(([k, v]) => (t.legenda.get(k) ?? 0) / v);
  });
  return { coef, stage1, edges, pools: pools.map((p) => (p.length ? p : [0])), ghost, sigmaList: Math.sqrt(s2u), sigmaParty: Math.sqrt(s2p), legendRatios: legendRatios.length ? legendRatios : [0] };
}

export function predictFit(model: VoteModel, cands: SeatCand[], vagas: Map<string, number>): Map<string, number> {
  const X = features(cands, vagas);
  return new Map(cands.map((c) => [c.sq, dotp(model.coef, design(model.stage1, X.get(c.sq)!))]));
}
