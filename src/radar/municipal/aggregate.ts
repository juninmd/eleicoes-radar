// Builds data/hist/mun-<year>.json: President and Governor votes per municipality, both rounds (see sources.ts).
// One-time job per year, a few minutes for 2014-2026 (the zips are 0.4-0.6 GB). Usage: bun run radar:mun-hist 2022
import { mkdirSync, writeFileSync } from "node:fs";
import { readElection, YEARS_MUN } from "./sources";

if (import.meta.main) {
  const year = Number(process.argv[2]);
  if (!(YEARS_MUN as readonly number[]).includes(year)) throw new Error(`ano ${process.argv[2]} sem configuração (use ${YEARS_MUN.join(", ")})`);
  const t0 = Date.now();
  const e = await readElection(year);
  mkdirSync("data/hist", { recursive: true });
  writeFileSync(`data/hist/mun-${year}.json`, JSON.stringify(e));
  const runoffs = e.races.filter((r) => Object.values(r.mun).some((m) => m.v2));
  console.log(`[mun-hist ${year}] ${e.races.length} disputas, ${runoffs.length} com 2º turno (${runoffs.map((r) => (r.cargo === "Presidente" ? "BR" : r.uf)).join(" ")}) em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
