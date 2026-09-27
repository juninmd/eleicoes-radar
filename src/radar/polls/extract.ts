// Turns Wikipedia poll tables into typed polls tied to TSE candidacies (SQ).
// Only "real" scenarios survive: every name with a value must be a registered
// candidate of that race, which drops hypothetical and pre-registration polls.
import type { Cell, Table } from "./html-table";
import { normalizeName } from "../stats";

export type Race = "Presidente" | "Governador" | "Senador";

export interface Poll {
  cargo: Race;
  uf: string;
  turno: 1 | 2;
  instituto: string;
  fim: string; // ISO date of the last fieldwork day
  amostra: number | null;
  margem: number | null;
  votos: Record<string, number>; // sq -> % of all respondents
  outros: number | null;
  indecisos: number | null;
}

export interface RaceCandidate {
  sq: string;
  nome: string;
  nomeUrna: string;
  partido: string;
}

type Role = "inst" | "date" | "n" | "moe" | "scen" | "outros" | "indec" | "skip" | "cand";

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const STOP = new Set(["da", "de", "do", "das", "dos", "e"]);
const norm = (s: string) => normalizeName(s).toLowerCase();
const EMPTY = /^[\s\-‐–—−]*$|^n\/?a$/i;

export function roleOf(header: string): Role {
  const h = norm(header);
  if (/^data/.test(h)) return "date"; // before "inst": "Datas de pesquisa"
  if (/contratante|pesquisa|instituto|agregador/.test(h)) return "inst";
  if (/amostra/.test(h)) return "n";
  if (/margem/.test(h)) return "moe";
  if (/^cen/.test(h)) return "scen";
  if (/^outros/.test(h)) return "outros";
  if (/indecis|absten|branco|nulo|nenhum|nao sabe/.test(h)) return "indec";
  if (/vant|lideranca|diferenca/.test(h)) return "skip"; // "Vantangem" typos exist
  return h ? "cand" : "skip";
}

// "40%", "40,1%", "<1%" -> 0.5, dashes -> null.
export function parsePct(s: string): number | null {
  const t = s.replace(/\s/g, "");
  if (EMPTY.test(t)) return null;
  if (/^<1%?$/.test(t)) return 0.5;
  const m = /^±?(\d+(?:[.,]\d+)?)%?$/.exec(t);
  return m ? Number(m[1]!.replace(",", ".")) : null;
}

// Last "<day> [de] <month>" in the text; the year comes from the text or the table.
export function parseEndDate(text: string, year: number | null): string | null {
  const all = [...text.matchAll(/(\d{1,2})\s*(?:de\s+)?([a-zç]{3})[a-zç]*\.?(?:\s+(?:de\s+)?((?:19|20)\d\d))?/gi)];
  const last = all.reverse().find((m) => MONTHS[m[2]!.toLowerCase()]);
  if (!last) return null;
  const y = Number(last[3] ?? /(?:19|20)\d\d/.exec(text)?.[0] ?? year ?? 2026);
  const mm = String(MONTHS[last[2]!.toLowerCase()]).padStart(2, "0");
  return `${y}-${mm}-${String(Number(last[1])).padStart(2, "0")}`;
}

const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));

// Best registry match for a header label like "Tarcísio REPUBLICANOS" or "Marçal (PRTB)".
export function matchCandidate(label: string, cands: RaceCandidate[]): RaceCandidate | null {
  const lt = tokens(label);
  let best: RaceCandidate | null = null;
  let bestScore = 0;
  let tie = false;
  for (const c of cands) {
    const names = new Set([...tokens(c.nomeUrna), ...tokens(c.nome)]);
    const party = norm(c.partido).replace(/\s/g, "");
    const hits = lt.filter((t) => names.has(t)).length;
    if (!hits) continue;
    const partyHit = lt.some((t) => t.length >= 2 && (party.startsWith(t) || t.startsWith(party)));
    const score = hits + (partyHit ? 0.5 : 0);
    if (score > bestScore) [best, bestScore, tie] = [c, score, false];
    else if (score === bestScore && norm(c.nome) === norm(best!.nome)) {
      // Same person registered twice (TSE keeps replaced candidacies): newest SQ wins.
      if (c.sq > best!.sq) best = c;
    } else if (score === bestScore) tie = true;
  }
  return tie ? null : best;
}

export interface TableContext {
  cargo: Race;
  uf: string;
  turno: 1 | 2;
  asOf: string; // rows dated after this are misdated and dropped
}

export function classifyTable(t: Table, page: "presidente" | "estado"): { cargo: Race; turno: 1 | 2 } | null {
  const path = norm(t.section.join(" / "));
  if (/agrega|rejeica|avalia|aprova|espontanea|potencial/.test(path)) return null;
  const turno = /segundo turno/.test(path) ? 2 : 1;
  if (page === "presidente") return { cargo: "Presidente", turno };
  if (/senad/.test(norm(t.section[0] ?? ""))) return { cargo: "Senador", turno: 1 };
  return { cargo: "Governador", turno };
}

export function extractPolls(t: Table, ctx: TableContext, cands: RaceCandidate[]): Poll[] {
  const firstData = t.rows.findIndex((r) => !r[0]?.header);
  if (firstData <= 0) return [];
  const width = Math.max(...t.rows.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, i) => {
    const labels = t.rows.slice(0, firstData).map((r) => r[i]?.text ?? "").filter(Boolean);
    const label = labels.sort((a, b) => b.length - a.length)[0] ?? "";
    const role = labels.map(roleOf).find((r) => r !== "cand" && r !== "skip") ?? roleOf(label);
    return { role, label, cand: role === "cand" ? matchCandidate(label, cands) : null };
  });
  const col = (r: Role) => cols.findIndex((c) => c.role === r);
  const [ci, cd, cn, cm, co, cu] = (["inst", "date", "n", "moe", "outros", "indec"] as Role[]).map(col);
  if (ci < 0 || cd < 0) return [];
  const used = new Map<string, number>();
  cols.forEach((c, i) => c.cand && used.set(c.cand.sq, (used.get(c.cand.sq) ?? 0) + 1));

  const out: Poll[] = [];
  for (const row of t.rows.slice(firstData)) {
    const cell = (i: number): Cell | undefined => (i >= 0 ? row[i] : undefined);
    const inst = cell(ci)?.text ?? "";
    if (!inst || row[0]?.header || inst === cell(cd)?.text) continue; // annotation rows span every column
    const fim = parseEndDate(cell(cd)?.text ?? "", t.year);
    if (!fim || fim > ctx.asOf) continue;
    const votos: Record<string, number> = {};
    let foreign = false;
    cols.forEach((c, i) => {
      if (c.role !== "cand") return;
      const v = parsePct(row[i]?.text ?? "");
      if (v === null) return;
      if (!c.cand || used.get(c.cand.sq)! > 1) foreign ||= v > 0;
      else votos[c.cand.sq] = v;
    });
    const n = Object.keys(votos).length;
    if (foreign || n < 2 || (ctx.turno === 2 && n !== 2)) continue;
    const amostra = Number((cell(cn)?.text ?? "").replace(/\D/g, "")) || null;
    out.push({
      cargo: ctx.cargo, uf: ctx.uf, turno: ctx.turno, instituto: inst.replace(/\s*\(.*\)$/, ""), fim,
      amostra: amostra && amostra >= 100 && amostra <= 100_000 ? amostra : null,
      margem: parsePct(cell(cm)?.text ?? ""),
      votos, outros: parsePct(cell(co)?.text ?? ""), indecisos: parsePct(cell(cu)?.text ?? ""),
    });
  }
  return out;
}

// One poll per institute/date/turn/candidate set; scenarios with more candidates win.
export function dedupe(polls: Poll[]): Poll[] {
  const byKey = new Map<string, Poll>();
  for (const p of polls) {
    const key = [p.cargo, p.uf, p.turno, norm(p.instituto), p.fim, p.turno === 2 ? Object.keys(p.votos).sort().join(",") : ""].join("|");
    const prev = byKey.get(key);
    if (!prev || Object.keys(p.votos).length > Object.keys(prev.votos).length) byKey.set(key, p);
  }
  return [...byKey.values()];
}
