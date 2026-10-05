// The cola maps cargo -> picks (array), capped at the ballot's seats (Senador: 2 in 2026).
export const seatsOf = (b) => b.seats ?? 1;

// Saved colas predate multi-seat ballots: a cargo held one pick object, not an array.
export function normalizeCola(saved) {
  if (!saved || typeof saved !== "object") return {};
  const out = {};
  for (const [cargo, v] of Object.entries(saved)) {
    const picks = [].concat(v).filter((p) => p && typeof p === "object");
    if (picks.length) out[cargo] = picks;
  }
  return out;
}

export const picksOf = (cola, b) => cola[b.cargo] ?? (b.alt && cola[b.alt]) ?? [];

export const isPicked = (cola, c) => (cola[c.cargo] ?? []).some((p) => p.id === c.id);

// Full cargo: the oldest pick makes room, like the old single-slot replace.
export function togglePick(cola, c, pick, seats) {
  const cur = cola[c.cargo] ?? [];
  const rest = cur.filter((p) => p.id !== c.id);
  const next = rest.length < cur.length ? rest : [...cur, pick].slice(-seats);
  const out = { ...cola };
  if (next.length) out[c.cargo] = next; else delete out[c.cargo];
  return out;
}

// One row per vote on the urna, in ballot order.
export function colaRows(cola, ballots) {
  return ballots.flatMap((b) => {
    const picks = picksOf(cola, b);
    const seats = seatsOf(b);
    return Array.from({ length: seats }, (_, i) => ({ b, label: seats > 1 ? `${b.cargo} · ${i + 1}º voto` : b.cargo, pick: picks[i] }));
  });
}
