// Aggregates for the Partidos / Dinheiro / Perfil tabs, built from the public UF files.
// Only parties, cargos and counts leave this file: no names, ids or donors.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { round } from "./stats";

const IN = "web/data/uf";
const AGENDA = "web/data/agenda.json";
const OUT = "web/data/panorama.json";
const ELEICAO = new Date("2026-10-04T00:00:00");
// Below this a gender/race split would point at individuals, not at a group.
export const MIN_PERFIL = 30;
export const MIN_CELL = 5; // a category with fewer people than this is folded into OUTRAS before it is published
export const OUTRAS = "Outras categorias";
export const MIN_CONC = 10;

interface Cand {
  cargo: string;
  partido: string;
  genero?: string;
  corRaca?: string;
  ficha?: { instrucao?: string; nascimento?: string };
  fin?: { total?: number; publico?: number; partido?: number; pf?: number; proprio?: number };
  prev?: { p?: number };
  mandato?: { agenda?: { votos?: Record<string, string> } };
}
type Counts = Record<string, number>;
export interface PartyAgg {
  n: number; comReceita: number; total: number; publico: number; partido: number; pf: number; proprio: number;
  outros: number; mediana: number; mulheres: number | null; vagas: number;
}
const FACETS = ["genero", "cor", "instrucao", "idade"] as const;
type Facet = (typeof FACETS)[number];
export type Perfil = Record<Facet, Counts> & { esperado: Record<Facet, Counts> | null };
export interface CargoAgg {
  n: number; comReceita: number;
  fontes: { publico: number; partido: number; pf: number; proprio: number; outros: number };
  partidos: Record<string, PartyAgg>;
  conc: number[]; // share of all money held by the top 10%, 20%, ... 100% of candidacies
  perfil: Perfil | null;
}
export interface AgendaAgg {
  votacoes: { id: string; tema: string; proposicao: string; resumo: string; posicao: string }[];
  partidos: Record<string, { n: number; votos: Record<string, [number, number, number]> }>; // [sim, nao, outro]
}

const NI = "Não informado";
const upper = (s?: string) => (s ?? "").trim().toUpperCase();
export const genero = (c: Cand) => ({ FEMININO: "Feminino", MASCULINO: "Masculino" })[upper(c.genero)] ?? NI;
export const cor = (c: Cand) =>
  ({ BRANCA: "Branca", PARDA: "Parda", PRETA: "Preta", AMARELA: "Amarela", "INDÍGENA": "Indígena", INDIGENA: "Indígena" })[upper(c.corRaca)] ?? NI;
export function instrucao(c: Cand) {
  const s = upper(c.ficha?.instrucao);
  if (s.includes("SUPERIOR COMPLETO")) return "Superior completo";
  if (s.includes("SUPERIOR INCOMPLETO")) return "Superior incompleto";
  if (/M[ÉE]DIO/.test(s)) return "Ensino médio";
  if (/FUNDAMENTAL|L[ÊE] E ESCREVE|ANALFABETO/.test(s)) return "Fundamental ou menos";
  return NI;
}
export function idade(c: Cand) {
  const d = new Date(`${c.ficha?.nascimento}T00:00:00`);
  if (isNaN(d.getTime())) return NI;
  let a = ELEICAO.getFullYear() - d.getFullYear();
  if (ELEICAO < new Date(ELEICAO.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a < 18 ? NI : a < 25 ? "18–24" : a < 35 ? "25–34" : a < 45 ? "35–44" : a < 55 ? "45–54" : a < 65 ? "55–64" : "65 ou mais";
}
const FACET_OF: Record<Facet, (c: Cand) => string> = { genero, cor, instrucao, idade };

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const outros = (c: Cand) => Math.max(0, (c.fin?.total ?? 0) - (c.fin?.publico ?? 0) - (c.fin?.partido ?? 0) - (c.fin?.pf ?? 0) - (c.fin?.proprio ?? 0));
const bump = (m: Counts, k: string, by = 1) => { m[k] = (m[k] ?? 0) + by; };

function fontes(list: Cand[]) {
  const sum = (f: (c: Cand) => number) => Math.round(list.reduce((a, c) => a + f(c), 0));
  return { publico: sum((c) => c.fin?.publico ?? 0), partido: sum((c) => c.fin?.partido ?? 0), pf: sum((c) => c.fin?.pf ?? 0), proprio: sum((c) => c.fin?.proprio ?? 0), outros: sum(outros) };
}

function party(list: Cand[], showWomen: boolean): PartyAgg {
  const totals = list.map((c) => c.fin?.total ?? 0);
  return {
    n: list.length, comReceita: totals.filter((t) => t > 0).length,
    total: Math.round(totals.reduce((a, b) => a + b, 0)), ...fontes(list),
    mediana: Math.round(median(totals.filter((t) => t > 0))),
    mulheres: showWomen ? list.filter((c) => genero(c) === "Feminino").length : null,
    vagas: round(list.reduce((a, c) => a + (c.prev?.p ?? 0), 0), 2),
  };
}

// The per-party women counts add up to the Feminino cell of the profile, so they are published only when that cell is.
function womenShown(list: Cand[]): boolean {
  const counts: Counts = {};
  for (const c of list) bump(counts, genero(c));
  return foldMap(counts).Feminino === "Feminino";
}

// Which label each category is published under: its own, or OUTRAS when it is too small to stand alone.
// The total is public, so a lone small category could be read off as total minus the others: the bucket
// therefore takes the next smallest neighbours until it reaches the minimum itself.
export function foldMap(counts: Counts, min = MIN_CELL): Record<string, string> {
  const asc = Object.entries(counts).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const folded = new Set(asc.filter(([, n]) => n < min).map(([k]) => k));
  if (!folded.size) return Object.fromEntries(asc.map(([k]) => [k, k]));
  let sum = asc.filter(([k]) => folded.has(k)).reduce((a, [, n]) => a + n, 0);
  for (const [k, n] of asc) {
    if (sum >= min) break;
    if (!folded.has(k)) { folded.add(k); sum += n; }
  }
  return Object.fromEntries(asc.map(([k]) => [k, folded.has(k) ? OUTRAS : k]));
}

function perfil(list: Cand[]): Perfil | null {
  if (list.length < MIN_PERFIL) return null;
  const raw = { genero: {}, cor: {}, instrucao: {}, idade: {} } as Record<Facet, Counts>;
  const exp = { genero: {}, cor: {}, instrucao: {}, idade: {} } as Record<Facet, Counts>;
  let hasPrev = false;
  for (const c of list) {
    const p = c.prev?.p;
    if (typeof p === "number") hasPrev = true;
    for (const f of FACETS) {
      const k = FACET_OF[f](c);
      bump(raw[f], k);
      if (typeof p === "number") bump(exp[f], k, p);
    }
  }
  const out = { genero: {}, cor: {}, instrucao: {}, idade: {}, esperado: hasPrev ? { genero: {}, cor: {}, instrucao: {}, idade: {} } : null } as Perfil;
  for (const f of FACETS) {
    const to = foldMap(raw[f]);
    for (const [k, n] of Object.entries(raw[f])) bump(out[f], to[k]!, n);
    if (out.esperado) for (const [k, v] of Object.entries(exp[f])) bump(out.esperado[f], to[k]!, v);
    if (out.esperado) for (const k of Object.keys(out.esperado[f])) out.esperado[f][k] = round(out.esperado[f][k]!, 2);
  }
  return out;
}

function concentration(list: Cand[]): number[] {
  const v = list.map((c) => c.fin?.total ?? 0).sort((a, b) => b - a);
  const total = v.reduce((a, b) => a + b, 0);
  if (v.length < MIN_CONC || total <= 0) return [];
  // Top (i+1)/10 of the candidacies; when that is not a whole number the next one counts in proportion, so n=11 still splits at 10%.
  return Array.from({ length: 10 }, (_, i) => {
    const whole = Math.floor(((i + 1) * v.length) / 10), tenths = ((i + 1) * v.length) % 10;
    const head = v.slice(0, whole).reduce((a, b) => a + b, 0);
    return round((head + (tenths / 10) * (v[whole] ?? 0)) / total, 3);
  });
}

export function aggregate(cands: Cand[]): Record<string, CargoAgg> {
  const byCargo = new Map<string, Cand[]>();
  for (const c of cands) (byCargo.get(c.cargo) ?? byCargo.set(c.cargo, []).get(c.cargo)!).push(c);
  return Object.fromEntries([...byCargo].map(([cargo, list]) => {
    const byParty = new Map<string, Cand[]>();
    for (const c of list) (byParty.get(c.partido) ?? byParty.set(c.partido, []).get(c.partido)!).push(c);
    const showWomen = womenShown(list);
    const agg: CargoAgg = {
      n: list.length, comReceita: list.filter((c) => (c.fin?.total ?? 0) > 0).length,
      fontes: fontes(list),
      partidos: Object.fromEntries([...byParty].map(([p, l]) => [p, party(l, showWomen)])),
      conc: concentration(list), perfil: perfil(list),
    };
    return [cargo, agg];
  }));
}

interface AgendaFile { temas: Record<string, { nome: string; votos: { id: string; proposicao: string; resumo: string; posicao: string }[] }> }
// Only deputies with a mandate carry votes; absent votes are not counted for or against anyone.
export function aggregateAgenda(cands: Cand[], agenda: AgendaFile): AgendaAgg {
  const votacoes = Object.values(agenda.temas).flatMap((t) => t.votos.map((v) => ({ id: v.id, tema: t.nome, proposicao: v.proposicao, resumo: v.resumo, posicao: v.posicao })));
  const partidos: AgendaAgg["partidos"] = {};
  for (const c of cands) {
    const votos = c.mandato?.agenda?.votos;
    if (!votos) continue;
    const p = (partidos[c.partido] ??= { n: 0, votos: Object.fromEntries(votacoes.map((v) => [v.id, [0, 0, 0] as [number, number, number]])) });
    p.n++;
    for (const v of votacoes) {
      const voto = votos[v.id];
      if (voto === undefined) continue;
      p.votos[v.id]![voto === "Sim" ? 0 : voto === "Não" ? 1 : 2]++;
    }
  }
  return { votacoes, partidos };
}

export function build(dir = IN, agendaPath = AGENDA) {
  const escopos: Record<string, Record<string, CargoAgg>> = {};
  const all: Cand[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const list: Cand[] = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    escopos[f.replace(/\.json$/, "")] = aggregate(list);
    all.push(...list);
  }
  escopos.BR = aggregate(all); // national view: every UF file plus the presidential race
  const agenda = aggregateAgenda(all, JSON.parse(readFileSync(agendaPath, "utf8")));
  return { geradoEm: new Date().toISOString(), escopos, agenda };
}

if (import.meta.main) {
  const out = build();
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`[panorama] ${Object.keys(out.escopos).length} escopos, ${Object.keys(out.agenda.partidos).length} partidos com votos na agenda -> ${OUT}`);
}
