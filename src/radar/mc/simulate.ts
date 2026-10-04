// Monte Carlo over the proportional races: every draw invents the votes of every candidate and list from the fitted
// vote model, then hands them to the real seat rules. The chance of winning is the share of draws a candidate got a seat.
import { type ListVotes, type Rules, allocate } from "./allocate";
import { makeRng } from "./rng";
import { binOf, leadParty, predictFit, type TrainCand, type VoteModel } from "./votes";

export interface SimResult {
  p: Map<string, number>; // sq -> chance of being elected
  listSeats: Map<string, number>; // `${grupo}|${lista}` -> expected seats
}

// noise scales every shock at once (1 = as measured on the training elections).
export interface SimOptions { draws: number; seed: string; rules: Rules; partyShock?: boolean; listShock?: boolean; noise?: number }

interface RaceList { id: string; party: string; cands: { sq: string; fit: number; bin: number }[] }
interface Race { grupo: string; seats: number; lists: RaceList[] }

const SCALE = 1e7; // votes are rescaled to a fixed turnout: the rules only care about proportions

export function simulate(cands: TrainCand[], vagas: Map<string, number>, model: VoteModel, opts: SimOptions): SimResult {
  const fit = predictFit(model, cands, vagas);
  const races: Race[] = [...Map.groupBy(cands, (c) => c.grupo)].map(([grupo, cs]) => ({
    grupo,
    seats: vagas.get(grupo) ?? 0,
    lists: [...Map.groupBy(cs, (c) => c.lista)].map(([id, ms]) => ({
      id,
      party: leadParty(ms),
      cands: ms.map((c) => ({ sq: c.sq, fit: fit.get(c.sq)!, bin: binOf(model.edges, fit.get(c.sq)!) })),
    })),
  }));
  const rng = makeRng(opts.seed);
  const k = opts.noise ?? 1;
  const pick = (a: number[]) => a[Math.min(a.length - 1, Math.floor(rng.uniform() * a.length))]!;
  const hits = new Map<string, number>();
  const seatSum = new Map<string, number>();
  for (let d = 0; d < opts.draws; d++) {
    const partyShock = new Map<string, number>();
    const shockOf = (party: string) => {
      if (!opts.partyShock) return 0;
      if (!partyShock.has(party)) partyShock.set(party, k * model.sigmaParty * rng.normal());
      return partyShock.get(party)!;
    };
    for (const race of races) {
      if (race.seats <= 0) continue;
      const raw = race.lists.map((l) => {
        const u = (opts.listShock === false ? 0 : k * model.sigmaList * rng.normal()) + shockOf(l.party);
        const votes = l.cands.map((c) => (rng.uniform() < model.ghost[c.bin]! ? 0 : Math.exp(c.fit + u + k * pick(model.pools[c.bin]!))));
        const nominal = votes.reduce((a, v) => a + v, 0);
        return { l, votes, nominal, legend: nominal * pick(model.legendRatios) };
      });
      const total = raw.reduce((a, r) => a + r.nominal + r.legend, 0) || 1;
      const f = SCALE / total;
      const lists: ListVotes[] = raw.map((r) => ({ id: r.l.id, legenda: r.legend * f, cands: r.l.cands.map((c, i) => ({ id: c.sq, votos: r.votes[i]! * f })) }));
      const out = allocate(lists, race.seats, opts.rules);
      for (const sq of out.elected) hits.set(sq, (hits.get(sq) ?? 0) + 1);
      for (const [id, n] of out.seatsByList) seatSum.set(`${race.grupo}|${id}`, (seatSum.get(`${race.grupo}|${id}`) ?? 0) + n);
    }
  }
  return {
    p: new Map(cands.map((c) => [c.sq, (hits.get(c.sq) ?? 0) / opts.draws])),
    listSeats: new Map([...seatSum].map(([k, v]) => [k, v / opts.draws])),
  };
}
