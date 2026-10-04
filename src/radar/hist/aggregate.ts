// Builds data/hist/<year>.json for a past general election (2014, 2018 or 2022): who ran, what they raised until
// seven days before the vote, what they got, who won, how many seats each state had. One-time job (~10 min per year,
// the vote files are huge); everything after reads the compact JSON.
// Usage: bun run radar:hist 2018
import { mkdirSync, writeFileSync } from "node:fs";
import { addMoney, addVotes, type HistCand, readCands, readLegenda, readVagas, YEARS } from "./sources";

export interface HistElection {
  year: number;
  cutoff: string;
  vagas: Record<string, number>; // `${uf}|${CARGO}`
  legenda: Record<string, number>; // `${uf}|${CARGO}|${list}`
  cands: HistCand[];
}

if (import.meta.main) {
  const year = Number(process.argv[2]);
  if (!YEARS[year]) throw new Error(`ano ${process.argv[2]} sem configuração (use ${Object.keys(YEARS).join(", ")})`);
  const t0 = Date.now();
  const cands = await readCands(year);
  console.log(`[hist ${year}] ${cands.size} candidaturas no cadastro`);
  const money = await addMoney(year, cands);
  console.log(`[hist ${year}] ${money} receitas somadas até ${YEARS[year]!.cutoff}`);
  const rows = await addVotes(year, cands);
  console.log(`[hist ${year}] ${rows} linhas de votos`);
  const legenda = await readLegenda(year);
  const vagas = readVagas(year);
  const out: HistElection = { year, cutoff: YEARS[year]!.cutoff, vagas, legenda, cands: [...cands.values()] };
  mkdirSync("data/hist", { recursive: true });
  writeFileSync(`data/hist/${year}.json`, JSON.stringify(out));
  const withVotes = out.cands.filter((c) => c.votos > 0).length;
  console.log(`[hist ${year}] ${withVotes} com votos, ${Object.keys(vagas).length} disputas com vagas, ${Object.keys(legenda).length} listas com voto de legenda (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
