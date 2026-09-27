// Single candidate list: the TSE registry (everyone registered) merged with campaign
// finance (only those who filed). Either source alone still works.
import { existsSync } from "node:fs";
import { emptyFinance, loadTse, type Candidate } from "./tse";
import { loadRegistry, type Registry } from "./tse-cand";

const FINANCE_ZIPS = ["data/tse/prestacao_de_contas_eleitorais_candidatos_2026.zip", "data/prestacao_de_contas_eleitorais_candidatos_2026.zip"];

export function merge(finance: Map<string, Candidate>, registry: Map<string, Registry>): Candidate[] {
  const out: Candidate[] = [];
  for (const r of registry.values()) {
    const { sq, nome, numero, cargo, uf, partido, genero, corRaca, ...profile } = r;
    const f = finance.get(sq);
    out.push({
      sq, nome, numero, uf, partido,
      cargo: f?.cargo || cargo,
      genero: f?.genero || genero,
      corRaca: f?.corRaca || corRaca,
      finance: f?.finance ?? emptyFinance(),
      ...profile,
    });
  }
  for (const f of finance.values()) if (!registry.has(f.sq)) out.push(f);
  return out.filter((c) => !/^vice|suplente/i.test(c.cargo));
}

export async function loadCandidates(): Promise<Candidate[]> {
  const zip = process.env.TSE_ZIP ?? FINANCE_ZIPS.find((z) => existsSync(z));
  const finance = zip ? await loadTse(zip) : new Map<string, Candidate>();
  const registry = loadRegistry();
  const all = merge(finance, registry);
  console.log(`[tse] ${registry.size} no cadastro, ${finance.size} com prestação de contas (${zip ?? "nenhum zip"}) → ${all.length} candidaturas`);
  return all;
}
