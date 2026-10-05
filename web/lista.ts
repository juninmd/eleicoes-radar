// Filtering and ordering of the candidate list. Pure, so the rules are testable without a page.

import type { score } from "./score.js";
import type { Candidatura } from "./types.js";

export interface Row { c: Pick<Candidatura, "num" | "fin">; s: ReturnType<typeof score> }

// Lower case without accents: "jose" finds "JOSÉ".
export const fold = (s: unknown) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const squash = (s: unknown) => fold(s).replace(/\s+/g, "");

// Name, ballot name, a number from its first digit, or a whole party ("PC do B" = "PCdoB").
export function matches(c: Pick<Candidatura, "nome" | "urna" | "num" | "partido">, query: string) {
  const q = fold(query).trim();
  if (!q) return true;
  return fold(c.nome).includes(q) || fold(c.urna).includes(q) || c.num.startsWith(q) || squash(c.partido) === squash(q);
}

// Ties fall back to campaign money, so a list where nobody has a score still has a stable, explainable order.
const byMoney = (a: Row, b: Row) => b.c.fin.total - a.c.fin.total;
export const SORTS: Record<string, (a: Row, b: Row) => number> = {
  nota: (a: Row, b: Row) => (b.s.nota ?? -1) - (a.s.nota ?? -1) || b.s.cobertura - a.s.cobertura || byMoney(a, b),
  evidencia: (a: Row, b: Row) => b.s.cobertura - a.s.cobertura || (b.s.nota ?? -1) - (a.s.nota ?? -1) || byMoney(a, b),
  dinheiro: byMoney,
  numero: (a: Row, b: Row) => a.c.num.localeCompare(b.c.num),
};

// True when the chosen weights give nobody on this ballot any evidence (e.g. votes in the Chamber for governors).
export const semEvidencia = (list: Row[]) => list.length > 0 && list.every(({ s }) => s.cobertura === 0);
