// Individual budget amendments (Portal da Transparência) matched by author name.
// Names that map to more than one deputy are dropped instead of guessed.
import { parseNumber, type Row } from "../csv";
import { normalizeName } from "../stats";

export interface EmendaStats {
  empenhado: number;
  pago: number;
  areas: { nome: string; valor: number }[];
}

export function computeEmendas(rows: Iterable<Row>, deputies: { id: number; nome: string }[], fromYear = 2023): Map<number, EmendaStats> {
  const byName = new Map<string, number | null>();
  for (const d of deputies) {
    const k = normalizeName(d.nome);
    byName.set(k, byName.has(k) && byName.get(k) !== d.id ? null : d.id);
  }

  const acc = new Map<number, { empenhado: number; pago: number; areas: Map<string, number> }>();
  for (const r of rows) {
    if (Number(r["Ano da Emenda"]) < fromYear) continue;
    const id = byName.get(normalizeName(r["Nome do Autor da Emenda"] ?? ""));
    if (id == null) continue;
    const a = acc.get(id) ?? { empenhado: 0, pago: 0, areas: new Map() };
    const emp = parseNumber(r["Valor Empenhado"]);
    a.empenhado += emp;
    a.pago += parseNumber(r["Valor Pago"]);
    const area = r["Nome Função"] ?? "Outros";
    a.areas.set(area, (a.areas.get(area) ?? 0) + emp);
    acc.set(id, a);
  }

  const out = new Map<number, EmendaStats>();
  for (const [id, a] of acc) {
    const areas = [...a.areas].map(([nome, valor]) => ({ nome, valor })).sort((x, y) => y.valor - x.valor).slice(0, 4);
    out.set(id, { empenhado: a.empenhado, pago: a.pago, areas });
  }
  return out;
}
