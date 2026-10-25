// Supplier lists live in <UF>-forn.json, not in <UF>.json: they are ~61% of the bytes and only the open dossier and the network read them.
import type { FornecedorView } from "./view";

// Only candidates with suppliers are written: a missing id reads as "no suppliers".
export function sidecarOf(entries: Iterable<readonly [string, FornecedorView[]]>): Record<string, FornecedorView[]> {
  const out: Record<string, FornecedorView[]> = {};
  for (const [id, list] of entries) if (list.length) out[id] = list;
  return out;
}
