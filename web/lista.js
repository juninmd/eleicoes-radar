// Filtering and ordering of the candidate list. Pure, so the rules are testable without a page.

// Lower case without accents: "jose" finds "JOSÉ".
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const squash = (s) => fold(s).replace(/\s+/g, "");

// Name, ballot name, a number from its first digit, or a whole party ("PC do B" = "PCdoB").
export function matches(c, query) {
  const q = fold(query).trim();
  if (!q) return true;
  return fold(c.nome).includes(q) || fold(c.urna).includes(q) || c.num.startsWith(q) || squash(c.partido) === squash(q);
}

// Ties fall back to campaign money, so a list where nobody has a score still has a stable, explainable order.
const byMoney = (a, b) => b.c.fin.total - a.c.fin.total;
export const SORTS = {
  nota: (a, b) => (b.s.nota ?? -1) - (a.s.nota ?? -1) || b.s.cobertura - a.s.cobertura || byMoney(a, b),
  evidencia: (a, b) => b.s.cobertura - a.s.cobertura || (b.s.nota ?? -1) - (a.s.nota ?? -1) || byMoney(a, b),
  dinheiro: byMoney,
  numero: (a, b) => a.c.num.localeCompare(b.c.num),
};

// True when the chosen weights give nobody on this ballot any evidence (e.g. votes in the Chamber for governors).
export const semEvidencia = (list) => list.length > 0 && list.every(({ s }) => s.cobertura === 0);
