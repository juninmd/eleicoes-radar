// Network step: pulls Wikipedia poll tables, keeps real scenarios of registered
// candidacies and writes data/pesquisas.json. Usage: bun run radar:polls [--force]
import { writeFileSync } from "node:fs";
import { loadRegistry } from "../tse-cand";
import { parseTables } from "./html-table";
import { classifyTable, dedupe, extractPolls, type Poll, type RaceCandidate } from "./extract";
import { fetchPage, pageUrl, PRESIDENTIAL, statePage } from "./wikipedia";

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

const force = process.argv.includes("--force");
const asOf = new Date().toISOString().slice(0, 10);

const races = new Map<string, RaceCandidate[]>();
for (const r of loadRegistry().values()) {
  const key = `${r.cargo}|${r.uf}`;
  races.set(key, [...(races.get(key) ?? []), { sq: r.sq, nome: r.nome, nomeUrna: r.nomeUrna, partido: r.partido }]);
}

const polls: Poll[] = [];
const fontes: { uf: string; titulo: string; url: string; revid: number }[] = [];
for (const [uf, title, kind] of [["BR", PRESIDENTIAL, "presidente"] as const, ...UFS.map((u) => [u, statePage(u), "estado"] as const)]) {
  const page = await fetchPage(title, asOf, force);
  if (!page) continue;
  fontes.push({ uf, titulo: page.title, url: pageUrl(page.title), revid: page.revid });
  let n = 0;
  for (const t of parseTables(page.html)) {
    const race = classifyTable(t, kind);
    const cands = race && races.get(`${race.cargo}|${uf}`);
    if (!race || !cands) continue;
    const found = extractPolls(t, { ...race, uf, asOf }, cands);
    polls.push(...found);
    n += found.length;
  }
  console.log(`[pesquisas] ${uf}: ${n} linhas`);
}

const unique = dedupe(polls).sort((a, b) => b.fim.localeCompare(a.fim));
writeFileSync("data/pesquisas.json", JSON.stringify({ geradoEm: asOf, fontes, pesquisas: unique }));
console.log(`[pesquisas] ${unique.length} pesquisas de ${fontes.length} páginas → data/pesquisas.json`);
