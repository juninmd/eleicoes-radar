// Network step: looks up the registry record of every supplier that shows up in a
// candidate's top payees. Resumable (JSONL cache); Ctrl-C or --max-min stops cleanly.
//   bun run radar:suppliers [--max-min=60] [--concurrency=6]
import { readFileSync } from "node:fs";
import { loadCandidates } from "../candidates";
import { loadMandates } from "../mandate";
import { linkMandate } from "../build";
import { isValidCnpj } from "./cnpj";
import { loadSuppliers } from "./load";
import { byPolitician, TOP_SUPPLIERS } from "./view";
import { loadCache, lookup, remember } from "./receita";

const arg = (k: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
const deadline = Date.now() + arg("max-min", 60) * 60_000;
const workers = arg("concurrency", 6);

const cands = await loadCandidates();
const mandates = await loadMandates(JSON.parse(readFileSync("src/radar/agenda.json", "utf8")));
const { all } = await loadSuppliers(cands, (c) => linkMandate(c, mandates)?.deputadoId ?? null);

// Incumbents first, then by how much money the supplier moved.
const withSeat = new Set(cands.filter((c) => linkMandate(c, mandates)).map((c) => c.sq));
const wanted = new Map<string, number>();
for (const [id, list] of byPolitician(all)) {
  for (const s of list.slice(0, TOP_SUPPLIERS)) {
    if (!isValidCnpj(s.cnpj)) continue;
    wanted.set(s.cnpj, Math.max(wanted.get(s.cnpj) ?? 0, s.total * (withSeat.has(id) ? 1000 : 1)));
  }
}
const cache = loadCache();
const queue = [...wanted].filter(([c]) => !cache.has(c)).sort((a, b) => b[1] - a[1]).map(([c]) => c);
console.log(`[fornecedores] ${all.size} fornecedores PJ, ${wanted.size} prioritários, ${cache.size} já em cache, ${queue.length} a consultar`);

let done = 0, failed = 0;
await Promise.all(Array.from({ length: workers }, async (_, w) => {
  while (queue.length && Date.now() < deadline) {
    const cnpj = queue.shift()!;
    const e = await lookup(cnpj, w);
    if (e) remember(e);
    else failed++;
    if (++done % 500 === 0) console.log(`[fornecedores] ${done} consultados (${failed} falhas), restam ${queue.length}`);
  }
}));
console.log(`[fornecedores] fim: ${done} consultados, ${failed} falhas, restam ${queue.length}`);
