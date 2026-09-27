// Turns raw facts into 0-1 indicators (1 = better on that axis) inside comparison groups.
// Finance is compared within the same ballot (cargo + UF); Chamber track record is
// compared across all incumbents, except quota spending (ceiling varies by UF).
import type { Candidate } from "./tse";
import type { Mandate } from "./mandate";
import type { Incumbency } from "./incumbency";
import { percentileRanks, round } from "./stats";

export type IndicatorKey = "presenca" | "producao" | "economia" | "apoio" | "diversificacao" | "independencia" | "renovacao" | "experiencia" | AgendaKey;
export const AGENDA_KEYS = ["impostos", "liberdadeEconomica", "expressao"] as const;
type AgendaKey = (typeof AGENDA_KEYS)[number];

export interface Scored {
  c: Candidate;
  m: Mandate | null;
  ind: Partial<Record<IndicatorKey, number>>;
  perfil?: Incumbency;
}

function assign(items: Scored[], k: IndicatorKey, value: (s: Scored) => number | null, invert = false) {
  const ranks = percentileRanks(items.map(value));
  items.forEach((s, i) => {
    const r = ranks[i];
    if (r !== null && r !== undefined) s.ind[k] = round(invert ? 1 - r : r);
  });
}

function groupBy<T>(xs: T[], key: (x: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return [...m.values()];
}

export function computeIndicators(items: Scored[]): void {
  for (const ballot of groupBy(items, (s) => `${s.c.cargo}|${s.c.uf}`)) {
    // No accounts filed yet is unknown, not "zero donors".
    assign(ballot, "apoio", (s) => (s.c.finance.dataRetrato ? s.c.finance.doadoresPF : null));
    assign(ballot, "diversificacao", (s) => (s.c.finance.total > 0 ? s.c.finance.maiorDoadorShare : null), true);
  }

  const incumbents = items.filter((s) => s.m);
  assign(incumbents, "presenca", (s) => (s.m!.votos && s.m!.votos.possiveis >= 20 ? s.m!.votos.votou / s.m!.votos.possiveis : null));
  assign(incumbents, "producao", (s) => s.m!.bills?.aprovadasCamara ?? 0);
  assign(incumbents, "independencia", (s) => {
    const v = s.m!.votos;
    return v && v.comparaveisPartido >= 30 ? v.alinhadoPartido / v.comparaveisPartido : null;
  }, true);
  // Agenda alignment is an absolute share of aligned votes, not a rank: it answers
  // "how often did this deputy vote my way", which a percentile would blur.
  for (const s of incumbents) {
    for (const k of AGENDA_KEYS) {
      const t = s.m!.agenda?.temas[k];
      if (t && t.total > 0) s.ind[k] = round(t.alinhado / t.total);
    }
  }
  for (const uf of groupBy(incumbents.filter((s) => s.m!.ceap), (s) => s.m!.ceap!.uf)) {
    assign(uf, "economia", (s) => s.m!.ceap!.mediaMensal, true);
  }
}
