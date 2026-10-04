// What the previous election says about each candidacy: the person's own result and the party's weight in the race.
// Joined by person key (civil name + birth date) because CPF is masked in the older files.
import { type Ant, partyNumber } from "../model/seats";
import type { HistElection } from "./aggregate";
import { DEPUTIES, isElected } from "./parse";

export interface AntQuery { sq: string; uf: string; cargo: string; pk: string; numero: string }

export function buildAnt(prev: HistElection, cands: AntQuery[]): Map<string, Ant> {
  const race = new Map<string, number>(); // `${uf}|${cargo}` -> nominal votes
  const party = new Map<string, number>(); // `${uf}|${cargo}|${party}` -> nominal votes
  const person = new Map<string, { share: Map<string, number>; elected: boolean }>();
  for (const c of prev.cands) {
    if (!DEPUTIES.has(c.cargo)) continue;
    race.set(`${c.uf}|${c.cargo}`, (race.get(`${c.uf}|${c.cargo}`) ?? 0) + c.votos);
    const pk = `${c.uf}|${c.cargo}|${partyNumber(c.numero)}`;
    party.set(pk, (party.get(pk) ?? 0) + c.votos);
  }
  for (const c of prev.cands) {
    if (!DEPUTIES.has(c.cargo) || !c.pk) continue;
    const p = person.get(c.pk) ?? { share: new Map(), elected: false };
    p.share.set(`${c.uf}|${c.cargo}`, c.votos / (race.get(`${c.uf}|${c.cargo}`) || 1));
    p.elected ||= isElected(c.sit);
    person.set(c.pk, p);
  }
  return new Map(cands.map((c) => {
    const p = c.pk ? person.get(c.pk) : undefined;
    const g = `${c.uf}|${c.cargo}`;
    const share = p?.share.get(g);
    return [c.sq, {
      ran: share !== undefined,
      share: share ?? 0,
      elected: p?.elected ?? false,
      partido: (party.get(`${g}|${partyNumber(c.numero)}`) ?? 0) / (race.get(g) || 1),
    }];
  }));
}
