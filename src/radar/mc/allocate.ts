// Proportional seat allocation for one state and cargo (Código Eleitoral arts. 106-111 as amended).
// Pure: the Monte Carlo draws votes and calls this once per draw; the backtest calls it with the real votes
// to prove the rules reproduce who was actually elected before any prediction is trusted.

export interface ListVotes {
  id: string; // party, federation or (2014/2018) coalition: the unit that owns the seats
  legenda: number; // votes cast for the list itself, not for a candidate
  cands: { id: string; votos: number }[];
}

export interface Rules {
  candMin: number; // share of the electoral quotient (QE) a candidate needs to take a quotient seat
  sobrasListMin: number; // share of QE a list needs to compete in the first leftover phase
  sobrasCandMin: number; // share of QE a candidate needs there
}

// Named by the election they describe. "2022" is the law as enacted (80% / 20% in the first leftover phase).
export const RULES: Record<string, Rules> = {
  "2014": { candMin: 0, sobrasListMin: 0, sobrasCandMin: 0 },
  "2018": { candMin: 0.1, sobrasListMin: 0, sobrasCandMin: 0.1 },
  "2022": { candMin: 0.1, sobrasListMin: 0.8, sobrasCandMin: 0.2 },
};

export interface Allocation {
  elected: Set<string>;
  seatsByList: Map<string, number>;
  qe: number;
}

// Fractions up to one half are dropped, above it round up to one (art. 106).
export function quotient(valid: number, seats: number): number {
  const q = valid / seats;
  const whole = Math.floor(q);
  return q - whole > 0.5 ? whole + 1 : whole;
}

interface Row { id: string; total: number; cands: { id: string; votos: number }[]; taken: number }

export function allocate(lists: ListVotes[], seats: number, rules: Rules): Allocation {
  const rows: Row[] = lists.map((l) => ({
    id: l.id,
    total: l.legenda + l.cands.reduce((a, c) => a + c.votos, 0),
    cands: [...l.cands].sort((a, b) => b.votos - a.votos || (a.id < b.id ? -1 : 1)),
    taken: 0,
  }));
  const valid = rows.reduce((a, r) => a + r.total, 0);
  const qe = seats > 0 && valid > 0 ? quotient(valid, seats) || 1 : 0;
  if (!qe) return { elected: new Set(), seatsByList: new Map(rows.map((r) => [r.id, 0])), qe: 0 };

  // Candidates are taken in vote order, so the next one is the only one that needs the threshold check.
  const nextOk = (r: Row, min: number) => {
    const c = r.cands[r.taken];
    return !!c && c.votos > 0 && c.votos >= min * qe;
  };

  // 1) Quotient seats, limited by how many of the list's candidates clear the individual minimum.
  for (const r of rows) {
    const eligible = r.cands.filter((c) => c.votos > 0 && c.votos >= rules.candMin * qe).length;
    r.taken = Math.min(Math.floor(r.total / qe), eligible, seats);
  }
  let left = seats - rows.reduce((a, r) => a + r.taken, 0);
  while (left < 0) { // rounding the quotient down can over-allocate by one: the weakest average gives it back
    const weakest = rows.filter((r) => r.taken > 0).sort((a, b) => a.total / a.taken - b.total / b.taken)[0]!;
    weakest.taken--;
    left++;
  }

  // 2) Leftovers by highest average (D'Hondt). Phase one honours the thresholds; if it cannot fill every seat,
  // phase two lets every list and any candidate with votes compete.
  for (const [listMin, candMin] of [[rules.sobrasListMin, rules.sobrasCandMin], [0, 0]] as const) {
    while (left > 0) {
      let best: Row | null = null;
      for (const r of rows) {
        if (r.total < listMin * qe || !nextOk(r, candMin)) continue;
        if (!best || r.total / (r.taken + 1) > best.total / (best.taken + 1) || (r.total / (r.taken + 1) === best.total / (best.taken + 1) && r.total > best.total)) best = r;
      }
      if (!best) break;
      best.taken++;
      left--;
    }
  }

  const elected = new Set<string>();
  for (const r of rows) for (const c of r.cands.slice(0, r.taken)) elected.add(c.id);
  return { elected, seatsByList: new Map(rows.map((r) => [r.id, r.taken])), qe };
}
