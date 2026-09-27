// Chance of winning a proportional seat (deputies) from signals present both in 2026
// (seven days out) and in the 2022 training set: campaign money and the declared
// occupation (sitting deputies declare "DEPUTADO"). Money share is scaled by seats so
// a big and a small state share one model.

export interface SeatCand {
  sq: string;
  grupo: string; // `${uf}|${cargo}`
  lista: string; // party, or federation when there is one (seats are shared by the list)
  receita: number;
  ocupacao: string;
}

export const FEATURES = [
  "intercepto", "log(fatia × vagas)", "log(vagas esperadas da lista)", "log(posição na lista / vagas esperadas)", "sem receita",
  "ocupação: deputado", "ocupação: vereador",
];

export function features(cands: SeatCand[], vagas: Map<string, number>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const groups = Map.groupBy(cands, (c) => c.grupo);
  for (const [grupo, cs] of groups) {
    const seats = vagas.get(grupo) ?? 0;
    const total = cs.reduce((a, c) => a + c.receita, 0);
    const lists = Map.groupBy(cs, (c) => c.lista);
    for (const members of lists.values()) {
      const listMoney = members.reduce((a, c) => a + c.receita, 0);
      const expected = total > 0 ? (listMoney / total) * seats : 0;
      const ranked = [...members].sort((a, b) => b.receita - a.receita);
      ranked.forEach((c, i) => {
        const share = total > 0 ? c.receita / total : 0;
        out.set(c.sq, [1, Math.log(share * seats + 0.01), Math.log(expected + 0.05), Math.log((i + 1) / (expected + 1)), c.receita > 0 ? 0 : 1,
          c.ocupacao === "DEPUTADO" ? 1 : 0, c.ocupacao === "VEREADOR" ? 1 : 0]);
      });
    }
  }
  return out;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const dot = (w: number[], x: number[]) => w.reduce((a, wi, i) => a + wi * x[i]!, 0);

// Newton-Raphson (IRLS) with a small ridge penalty; 5 features converge in a few steps.
export function fitLogistic(X: number[][], y: number[], l2 = 1e-3, iters = 30): number[] {
  const k = X[0]!.length;
  let w = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    X.forEach((x, n) => {
      const p = sigmoid(dot(w, x));
      const s = p * (1 - p);
      for (let i = 0; i < k; i++) {
        g[i] += (p - y[n]!) * x[i]!;
        for (let j = 0; j < k; j++) H[i]![j] += s * x[i]! * x[j]!;
      }
    });
    for (let i = 0; i < k; i++) {
      g[i] += l2 * w[i]!;
      H[i]![i] += l2;
    }
    const step = solve(H, g);
    w = w.map((wi, i) => wi - step[i]!);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return w;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]! || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let j = c; j <= n; j++) M[r]![j] -= f * M[c]![j]!;
    }
  }
  return M.map((row, i) => row[n]! / (row[i]! || 1e-12));
}

// Isotonic recalibration fitted on out-of-fold predictions (pool-adjacent-violators):
// knots [x, y] mapping a raw probability to the observed win rate, interpolated.
export type Knots = [number, number][];

export function fitIsotonic(p: number[], y: number[]): Knots {
  const idx = p.map((_, i) => i).sort((a, b) => p[a]! - p[b]!);
  const blocks: { x: number; y: number; n: number }[] = [];
  for (const i of idx) {
    blocks.push({ x: p[i]!, y: y[i]!, n: 1 });
    while (blocks.length > 1 && blocks.at(-2)!.y / blocks.at(-2)!.n >= blocks.at(-1)!.y / blocks.at(-1)!.n) {
      const last = blocks.pop()!;
      const prev = blocks.at(-1)!;
      prev.x = (prev.x * prev.n + last.x * last.n) / (prev.n + last.n);
      prev.y += last.y;
      prev.n += last.n;
    }
  }
  return blocks.map((b) => [b.x, b.y / b.n]);
}

export function recalibrate(p: number, knots: Knots | null): number {
  if (!knots?.length) return p;
  if (p <= knots[0]![0]) return knots[0]![1];
  const last = knots.at(-1)!;
  if (p >= last[0]) return last[1];
  let lo = 0;
  let hi = knots.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (knots[mid]![0] <= p) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = knots[lo]!;
  const [x1, y1] = knots[hi]!;
  return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0 || 1);
}

// Shifts each group's logits so expected winners equal the seats on offer, then
// applies the optional recalibration (which may leave the sum slightly off the seats).
export function predictGroups(cands: SeatCand[], vagas: Map<string, number>, w: number[], knots: Knots | null = null): Map<string, number> {
  const X = features(cands, vagas);
  const out = new Map<string, number>();
  for (const [grupo, cs] of Map.groupBy(cands, (c) => c.grupo)) {
    const seats = Math.min(vagas.get(grupo) ?? 0, cs.length);
    const z = cs.map((c) => dot(w, X.get(c.sq)!));
    let lo = -30;
    let hi = 30;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const sum = z.reduce((a, zi) => a + sigmoid(zi + mid), 0);
      if (sum > seats) hi = mid;
      else lo = mid;
    }
    cs.forEach((c, i) => out.set(c.sq, seats > 0 ? recalibrate(sigmoid(z[i]! + (lo + hi) / 2), knots) : 0));
  }
  return out;
}

export interface Backtest {
  acerto: number; // share of real winners inside each group's top-N (N = seats)
  acertoBaseline: number; // same, ranking by money alone
  brier: number;
  calibracao: { faixa: string; previsto: number; observado: number; n: number }[];
  candidatos: number;
  vagas: number;
}

const topN = (cs: SeatCand[], score: (c: SeatCand) => number, n: number) =>
  new Set([...cs].sort((a, b) => score(b) - score(a)).slice(0, n).map((c) => c.sq));

export function evaluate(cands: SeatCand[], vagas: Map<string, number>, elected: Set<string>, p: Map<string, number>): Backtest {
  let hits = 0;
  let base = 0;
  let seatsTotal = 0;
  for (const [grupo, cs] of Map.groupBy(cands, (c) => c.grupo)) {
    const n = vagas.get(grupo) ?? 0;
    seatsTotal += n;
    for (const sq of topN(cs, (c) => p.get(c.sq)!, n)) if (elected.has(sq)) hits++;
    for (const sq of topN(cs, (c) => c.receita, n)) if (elected.has(sq)) base++;
  }
  const edges = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0001];
  const calibracao = edges.slice(0, -1).map((lo, i) => {
    const bin = cands.filter((c) => p.get(c.sq)! >= lo && p.get(c.sq)! < edges[i + 1]!);
    const mean = (f: (c: SeatCand) => number) => (bin.length ? bin.reduce((a, c) => a + f(c), 0) / bin.length : 0);
    return {
      faixa: `${Math.round(lo * 100)}–${Math.min(100, Math.round(edges[i + 1]! * 100))}%`,
      previsto: mean((c) => p.get(c.sq)!),
      observado: mean((c) => (elected.has(c.sq) ? 1 : 0)),
      n: bin.length,
    };
  });
  const brier = cands.reduce((a, c) => a + (p.get(c.sq)! - (elected.has(c.sq) ? 1 : 0)) ** 2, 0) / cands.length;
  return { acerto: hits / seatsTotal, acertoBaseline: base / seatsTotal, brier, calibracao, candidatos: cands.length, vagas: seatsTotal };
}
