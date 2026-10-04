// Replays the seat rules on the real votes of a past election and counts how many elected candidates they reproduce.
// Run before trusting any prediction built on `allocate`. Usage: bun run src/radar/mc/check-engine.ts 2018 [ruleYear]
import { readFileSync } from "node:fs";
import type { HistElection } from "../hist/aggregate";
import { DEPUTIES, isElected } from "../hist/parse";
import { allocate, type ListVotes, RULES } from "./allocate";

export function listsOf(h: HistElection, uf: string, cargo: string): ListVotes[] {
  const by = new Map<string, ListVotes>();
  for (const c of h.cands) {
    if (c.uf !== uf || c.cargo !== cargo) continue;
    const l = by.get(c.lista) ?? { id: c.lista, legenda: h.legenda[`${uf}|${cargo}|${c.lista}`] ?? 0, cands: [] };
    l.cands.push({ id: c.sq, votos: c.votos });
    by.set(c.lista, l);
  }
  return [...by.values()];
}

export function check(h: HistElection, ruleYear: string) {
  const rows: string[] = [];
  let miss = 0;
  let total = 0;
  for (const [key, seats] of Object.entries(h.vagas)) {
    const [uf, cargo] = key.split("|") as [string, string];
    if (!DEPUTIES.has(cargo)) continue;
    const real = new Set(h.cands.filter((c) => c.uf === uf && c.cargo === cargo && isElected(c.sit)).map((c) => c.sq));
    const got = allocate(listsOf(h, uf, cargo), seats, RULES[ruleYear]!).elected;
    const wrong = [...real].filter((id) => !got.has(id)).length;
    total += real.size;
    miss += wrong;
    if (wrong) rows.push(`${key}: vagas ${seats}, eleitos ${real.size}, divergem ${wrong}`);
  }
  return { total, miss, rows };
}

if (import.meta.main) {
  const year = process.argv[2] ?? "2018";
  const h = JSON.parse(readFileSync(`data/hist/${year}.json`, "utf8")) as HistElection;
  for (const ruleYear of process.argv[3] ? [process.argv[3]] : Object.keys(RULES)) {
    const r = check(h, ruleYear);
    console.log(`${year} regras ${ruleYear}: ${r.total - r.miss}/${r.total} eleitos reproduzidos (${r.rows.length} disputas divergem)`);
    if (process.argv[3]) for (const l of r.rows.slice(0, 40)) console.log(`  ${l}`);
  }
}
