// Parliamentary quota (CEAP) spending for the 57th legislature.
// The quota ceiling differs by UF, so spending is only compared within the same UF.
import { parseNumber, type Row } from "../csv";
import { onlyDigits, topShare } from "../stats";

export interface CeapStats {
  total: number;
  meses: number;
  mediaMensal: number;
  maiorFornecedorShare: number;
  maiorFornecedor: string;
  uf: string;
  ultimoMes: string; // "YYYY-MM"
  cpf: string; // join key only
}

export function computeCeap(rows: Iterable<Row>): Map<number, CeapStats> {
  const acc = new Map<number, { total: number; months: Set<string>; sup: Map<string, number>; names: Map<string, string>; uf: string; last: string; cpf: string }>();
  for (const r of rows) {
    if (r.codLegislatura !== "57" || !r.ideCadastro) continue;
    const id = Number(r.ideCadastro);
    const v = parseNumber(r.vlrLiquido);
    let a = acc.get(id);
    if (!a) {
      a = { total: 0, months: new Set(), sup: new Map(), names: new Map(), uf: r.sgUF ?? "", last: "", cpf: onlyDigits(r.cpf) };
      acc.set(id, a);
    }
    a.total += v;
    const month = `${r.numAno}-${String(r.numMes).padStart(2, "0")}`;
    a.months.add(month);
    if (month > a.last) a.last = month;
    const k = onlyDigits(r.txtCNPJCPF) || r.txtFornecedor || "?";
    a.sup.set(k, (a.sup.get(k) ?? 0) + v);
    if (!a.names.has(k)) a.names.set(k, r.txtFornecedor ?? "");
  }

  const out = new Map<number, CeapStats>();
  for (const [id, a] of acc) {
    let topKey = "";
    let topVal = -Infinity;
    for (const [k, v] of a.sup) if (v > topVal) { topVal = v; topKey = k; }
    const meses = a.months.size;
    out.set(id, {
      total: a.total,
      meses,
      mediaMensal: meses ? a.total / meses : 0,
      maiorFornecedorShare: topShare(a.sup.values()),
      maiorFornecedor: a.names.get(topKey) ?? "",
      uf: a.uf,
      ultimoMes: a.last,
      cpf: a.cpf,
    });
  }
  return out;
}

// Months ("YYYY-MM") touched by any exercise interval, capped at the last month with
// published CEAP data. Months with zero spending must count, or frugality is invisible.
export function monthsInExercise(intervals: [string, string][], lastMonth: string): number {
  const months = new Set<string>();
  for (const [start, end] of intervals) {
    const stop = end.slice(0, 7) < lastMonth ? end.slice(0, 7) : lastMonth;
    let [y, m] = start.slice(0, 7).split("-").map(Number) as [number, number];
    for (let cur = start.slice(0, 7); cur <= stop; cur = `${y}-${String(m).padStart(2, "0")}`) {
      months.add(cur);
      if (++m > 12) { m = 1; y++; }
    }
  }
  return months.size;
}
