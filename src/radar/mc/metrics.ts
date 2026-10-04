// Scores one method's predictions on one held-out election: the same numbers for the logistic and the Monte Carlo.
import { evaluate, type SeatCand } from "../model/seats";

export interface Score {
  acerto: number; // real winners found inside each race's top-N by probability
  brier: number;
  logloss: number;
  seatErr: number; // mean |sum of probabilities - seats| per race
  listMae: number; // mean |expected - real seats| per list with money or seats
  calibracao: { faixa: string; previsto: number; observado: number; n: number }[];
}

export function score(cands: SeatCand[], vagas: Map<string, number>, elected: Set<string>, p: Map<string, number>, listSeats: Map<string, number>): Score {
  const ev = evaluate(cands, vagas, elected, p);
  const logloss = cands.reduce((a, c) => {
    const q = Math.min(1 - 1e-4, Math.max(1e-4, p.get(c.sq)!));
    return a - (elected.has(c.sq) ? Math.log(q) : Math.log(1 - q));
  }, 0) / (cands.length || 1);
  let seatErr = 0;
  let races = 0;
  const real = new Map<string, number>();
  for (const [grupo, cs] of Map.groupBy(cands, (c) => c.grupo)) {
    const seats = vagas.get(grupo) ?? 0;
    seatErr += Math.abs(cs.reduce((a, c) => a + p.get(c.sq)!, 0) - seats);
    races++;
    for (const c of cs) if (elected.has(c.sq)) real.set(`${grupo}|${c.lista}`, (real.get(`${grupo}|${c.lista}`) ?? 0) + 1);
  }
  const keys = new Set([...listSeats.keys(), ...real.keys()]);
  const listMae = [...keys].reduce((a, k) => a + Math.abs((listSeats.get(k) ?? 0) - (real.get(k) ?? 0)), 0) / (keys.size || 1);
  return { acerto: ev.acerto, brier: ev.brier, logloss, seatErr: seatErr / (races || 1), listMae, calibracao: ev.calibracao };
}

// Expected seats of a list from per-candidate probabilities (what the logistic offers in place of a seat count).
export function listSeatsFrom(cands: SeatCand[], p: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of cands) out.set(`${c.grupo}|${c.lista}`, (out.get(`${c.grupo}|${c.lista}`) ?? 0) + p.get(c.sq)!);
  return out;
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function line(name: string, s: Score): string {
  return `  ${name.padEnd(28)} acerto ${pct(s.acerto).padStart(6)}  brier ${s.brier.toFixed(4)}  logloss ${s.logloss.toFixed(4)}  |Σp−vagas| ${s.seatErr.toFixed(2)}  MAE cadeiras/lista ${s.listMae.toFixed(3)}`;
}
