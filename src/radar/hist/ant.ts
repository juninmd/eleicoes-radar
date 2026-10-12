// What the previous election says about each candidacy: the person's own result and the party's weight in the race.
// Joined by person key (civil name + birth date) because CPF is masked in the older files.
import { type Ant, partyNumber } from "../model/seats";
import type { HistElection } from "./aggregate";
import { DEPUTIES, isElected } from "./parse";
import { inherited } from "./succession";

export interface AntQuery { sq: string; uf: string; cargo: string; pk: string; numero: string }

const cleanPk = (pk: string) => {
  const [nome, iso] = pk.split("|");
  return nome && iso ? `${nome.replace(/\b(DE|DA|DO|DOS|DAS|E)\b/g, " ").replace(/\s+/g, " ").trim()}|${iso}` : pk;
};

export const CROSS_OFFICE_FACTOR = 0.85;

export function buildAnt(prev: HistElection, cands: AntQuery[]): Map<string, Ant> {
  const race = new Map<string, number>(); // `${uf}|${cargo}` -> nominal votes
  const party = new Map<string, number>(); // `${uf}|${cargo}|${party}` -> nominal votes
  const person = new Map<string, { share: Map<string, number>; shareByUf: Map<string, number>; elected: boolean }>();
  for (const c of prev.cands) {
    if (!DEPUTIES.has(c.cargo)) continue;
    race.set(`${c.uf}|${c.cargo}`, (race.get(`${c.uf}|${c.cargo}`) ?? 0) + c.votos);
    const pk = `${c.uf}|${c.cargo}|${partyNumber(c.numero)}`;
    party.set(pk, (party.get(pk) ?? 0) + c.votos);
  }
  for (const c of prev.cands) {
    if (!DEPUTIES.has(c.cargo) || !c.pk) continue;
    const p = person.get(c.pk) ?? { share: new Map(), shareByUf: new Map(), elected: false };
    // The same person can appear twice in one race (a re-filed or substituted registration, one row with no votes).
    const g = `${c.uf}|${c.cargo}`;
    const s = c.votos / (race.get(g) || 1);
    p.share.set(g, Math.max(p.share.get(g) ?? 0, s));
    p.shareByUf.set(c.uf, Math.max(p.shareByUf.get(c.uf) ?? 0, s));
    p.elected ||= isElected(c.sit);
    person.set(c.pk, p);
    const ck = cleanPk(c.pk);
    if (ck !== c.pk && !person.has(ck)) person.set(ck, p);
  }
  return new Map(cands.map((c) => {
    const p = c.pk ? (person.get(c.pk) ?? person.get(cleanPk(c.pk))) : undefined;
    const g = `${c.uf}|${c.cargo}`;
    const exact = p?.share.get(g);
    const cross = p?.shareByUf.get(c.uf);
    const ran = exact !== undefined || cross !== undefined;
    const share = exact ?? (cross !== undefined ? cross * CROSS_OFFICE_FACTOR : 0);
    return [c.sq, {
      ran,
      share,
      elected: p?.elected ?? false,
      partido: inherited(prev.year, partyNumber(c.numero)).reduce((a, n) => a + (party.get(`${g}|${n}`) ?? 0), 0) / (race.get(g) || 1),
    }];
  }));
}
