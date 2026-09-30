// Declared assets (bem_candidato): 2026 total and composition per candidacy, plus the
// same person's 2022 declaration. Values are nominal (not inflation-adjusted).
import { existsSync } from "node:fs";
import { forEachZipRow } from "../zip-csv";
import { parseNumber } from "../csv";
import { normalizeName, onlyDigits } from "../stats";

export interface Bens {
  total: number;
  n: number;
  tipos: { tipo: string; valor: number }[]; // top 3 by value
  total2022: number | null;
}

const bensZip = (year: number) => `data/tse/bem_candidato_${year}.zip`;
const CAND_2022 = "data/tse/consulta_cand_2022.zip";

// Person identity across elections: real CPF when unmasked, else civil name + birth date.
export function personKey(cpf: string | undefined, nome: string, nascimento: string | null | undefined): string | null {
  const d = onlyDigits(cpf);
  if (d.length === 11) return `cpf:${d}`;
  return nome && nascimento ? `nome:${normalizeName(nome)}|${nascimento}` : null;
}

const isoDate = (s: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : null);

export function addBem(out: Map<string, { total: number; n: number; tipos: Map<string, number> }>, r: Record<string, string>) {
  const sq = r.SQ_CANDIDATO;
  if (!sq || !r.VR_BEM_CANDIDATO) return;
  const v = parseNumber(r.VR_BEM_CANDIDATO);
  const e = out.get(sq) ?? { total: 0, n: 0, tipos: new Map() };
  e.total += v;
  e.n++;
  const t = (r.DS_TIPO_BEM_CANDIDATO ?? "").replace(/:.*$/, "").trim() || "Outros";
  e.tipos.set(t, (e.tipos.get(t) ?? 0) + v);
  out.set(sq, e);
}

async function sumBySq(year: number) {
  const out = new Map<string, { total: number; n: number; tipos: Map<string, number> }>();
  if (existsSync(bensZip(year))) await forEachZipRow(bensZip(year), `bem_candidato_${year}_BRASIL.csv`, (r) => addBem(out, r));
  return out;
}

async function personByPrevSq(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!existsSync(CAND_2022)) return out;
  await forEachZipRow(CAND_2022, "consulta_cand_2022_BRASIL.csv", (r) => {
    if (r.ANO_ELEICAO !== "2022") return; // the file also carries 2026 by-elections
    const k = personKey(r.NR_CPF_CANDIDATO, r.NM_CANDIDATO, isoDate(r.DT_NASCIMENTO ?? ""));
    if (k && r.SQ_CANDIDATO) out.set(r.SQ_CANDIDATO, k);
  });
  return out;
}

// people: sq2026 -> personKey, so the 2022 declaration can be attached to the same person.
export async function loadBens(people: Map<string, string | null>): Promise<Map<string, Bens>> {
  const cur = await sumBySq(2026);
  const prevByPerson = new Map<string, number>();
  const prevSq = await sumBySq(2022);
  if (prevSq.size) {
    for (const [sq, key] of await personByPrevSq()) {
      const p = prevSq.get(sq);
      if (p) prevByPerson.set(key, Math.max(prevByPerson.get(key) ?? 0, p.total));
    }
  }
  const out = new Map<string, Bens>();
  for (const [sq, e] of cur) {
    const key = people.get(sq);
    const prev = key ? prevByPerson.get(key) : undefined;
    out.set(sq, {
      total: Math.round(e.total),
      n: e.n,
      tipos: [...e.tipos].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tipo, valor]) => ({ tipo, valor: Math.round(valor) })),
      total2022: prev === undefined ? null : Math.round(prev),
    });
  }
  return out;
}
