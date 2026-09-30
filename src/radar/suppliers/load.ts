// Streams campaign expenses and CEAP once and returns every supplier with the
// politicians it served, plus a directory to name them.
import { existsSync } from "node:fs";
import { forEachZipRow } from "../zip-csv";
import { ceapRows } from "../mandate";
import type { Candidate } from "../tse";
import { addCampaign, addCeap, type Directory, type Suppliers } from "./collect";

const DESPESAS = "data/tse/prestacao_de_contas_eleitorais_candidatos_2026.zip";

export async function loadSuppliers(cands: Candidate[], deputyOf: (c: Candidate) => number | null) {
  const dir: Directory = new Map(cands.map((c) => [c.sq, { id: c.sq, nome: c.nomeUrna || c.nome, cargo: c.cargo, uf: c.uf, partido: c.partido }]));
  const deputyToSq = new Map<number, string>();
  for (const c of cands) {
    const d = deputyOf(c);
    if (d !== null) deputyToSq.set(d, c.sq);
  }
  const all: Suppliers = new Map();
  if (existsSync(DESPESAS)) await forEachZipRow(DESPESAS, "despesas_contratadas_candidatos_2026_BRASIL.csv", (r) => addCampaign(all, r));
  for (const r of ceapRows()) addCeap(all, dir, deputyToSq, r);
  return { all, dir };
}
