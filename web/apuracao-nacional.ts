// Pure aggregation for the national views (map, state table, national tally). It only reads what the
// TSE published; it never projects a result.
import { decididos } from "./apuracao-eleito.js";
import type { Apuracao, Candidato, Cargo, Fase } from "./apuracao-tse.js";
import type { UfEstado } from "./apuracao-uf.js";
import type { Lider } from "../src/radar/expectativa";

const TOP = 5;

interface LinhaBase { uf: string; cargo: Cargo; status: UfEstado["status"]; erro: string | null; vagas: number; top: Candidato[]; dec: Set<string> }
// A state that has not answered yet: its status, and no numbers.
export interface LinhaSem extends LinhaBase { defasada: false; fase: null; secoes: null; avanco: null; lider: null; segundo: null; margem: null; dados: null }
export interface LinhaCom extends LinhaBase {
  defasada: boolean; fase: Fase; secoes: Apuracao["secoes"]; avanco: number;
  lider: Candidato | null; segundo: Candidato | null; margem: number | null; dados: Apuracao;
}
export type LinhaUf = LinhaSem | LinhaCom;
// What the map needs of a state that is not even in the feed yet.
export type LinhaVazia = Pick<LinhaSem, "uf" | "status" | "fase" | "lider" | "margem" | "avanco" | "dados"> & Partial<LinhaSem>;
export type LinhaMapa = LinhaUf | LinhaVazia;

// One poll race, as the build writes it to expectativa.json: the best-placed names, for the map.
export interface Corrida { cargo: string; uf: string; vagas?: number; lideres?: Lider[] }
export type Corridas = Corrida[] | null | undefined;
export interface Comparacao { situacao: "sem-pesquisa" | "sem-apuracao" | "igual" | "diverge"; pesquisa: Lider | null; n: number; lista: Lider[] }

// A colour per key, remembered for the session; `resto` is the shared one past the palette (if any).
export interface Cores { (key: string): string; resto: string | undefined }

// Rounded down: 9.996 of 10.000 sections is 99,9%, never a "100%" while the count is open.
export const avancoDe = ({ total, totalizadas }: Apuracao["secoes"]): number => (total <= 0 ? 0 : totalizadas >= total ? 1 : Math.floor((totalizadas / total) * 1000) / 1000);

// One row per state. A state that has not answered yet keeps its status and has no numbers.
export function linhasUf(ufs: Record<string, UfEstado>, cargo: Cargo): LinhaUf[] {
  return Object.entries(ufs).map(([uf, u]): LinhaUf => {
    const d = u.dados;
    if (!d) return { uf, cargo, status: u.status, erro: u.erro ?? null, defasada: false, fase: null, vagas: 1, secoes: null, avanco: null, lider: null, segundo: null, margem: null, top: [], dados: null, dec: new Set() };
    const vagas = Math.max(1, d.cargo.vagas);
    const contou = d.fase !== "aguardando" && (d.candidatos[0]?.votos ?? 0) > 0;
    const ranking = contou ? d.candidatos : [];
    // The margin that matters is at the last seat: 1st vs 2nd for one seat, 2nd vs 3rd for two.
    const ult = ranking[vagas - 1];
    const prox = ranking[vagas];
    return {
      uf, cargo, status: u.status, erro: u.erro ?? null,
      defasada: u.status === "erro" || u.status === "ausente", // the feed keeps the last numbers; the view must not pass them off as current
      fase: d.fase, vagas, secoes: d.secoes, avanco: avancoDe(d.secoes),
      lider: ranking[0] ?? null, segundo: ranking[1] ?? null, margem: ult && prox ? ult.pct - prox.pct : null,
      top: ranking.slice(0, TOP), dados: d,
      // For the presidential race a state file is a slice of the national result: decididos refuses it.
      dec: decididos(d, cargo, uf),
    };
  });
}

// Candidates summed over every state that has numbers (the exterior file included, for president).
export function totalNacional(linhas: LinhaUf[]) {
  const com = linhas.filter((l) => l.dados) as LinhaCom[];
  const soma = new Map<string, Pick<Candidato, "id" | "nome" | "partido" | "num" | "votos">>();
  const secoes = { total: 0, totalizadas: 0 };
  for (const l of com) {
    secoes.total += l.secoes.total;
    secoes.totalizadas += l.secoes.totalizadas;
    for (const c of l.dados.candidatos) {
      const x = soma.get(c.id) ?? { id: c.id, nome: c.nome, partido: c.partido, num: c.num, votos: 0 };
      x.votos += c.votos;
      soma.set(c.id, x);
    }
  }
  const votos = [...soma.values()].reduce((a, c) => a + c.votos, 0);
  const candidatos = votos > 0 ? [...soma.values()].sort((a, b) => b.votos - a.votos).map((c) => ({ ...c, pct: c.votos / votos })) : [];
  const completo = com.length === linhas.length && com.length > 0 && com.every((l) => l.fase === "concluida");
  const fase = !com.length ? null : secoes.totalizadas === 0 ? "aguardando" : completo ? "concluida" : "parcial";
  return { candidatos, secoes, cobertura: { com: com.length, de: linhas.length }, fase };
}

// A colour per key that never changes during the session, so a party does not flip colour on a refresh.
// With a rest colour, keys past the palette share it; without one the palette wraps around.
export function createCores(palette: readonly string[], resto?: string): Cores {
  const usadas = new Map<string, string>();
  const cor = (key: string) => {
    if (!usadas.has(key)) usadas.set(key, resto !== undefined && usadas.size >= palette.length ? resto : palette[usadas.size % palette.length]);
    return usadas.get(key)!;
  };
  cor.resto = resto;
  return cor;
}

// Colours are handed out in order of first use, so whoever led when the tab opened got the first one and a reload with the lead
// flipped swapped the same people's colours. Calling this first (ordered by ballot number) makes the choice the same on every load.
export function fixarCores(cor: Cores, candidatos: readonly Pick<Candidato, "num" | "partido">[]): void {
  const n = (c: Pick<Candidato, "num">) => { const v = parseInt(c.num, 10); return Number.isFinite(v) ? v : Infinity; };
  for (const c of [...candidatos].sort((a, b) => (n(a) < n(b) ? -1 : n(a) > n(b) ? 1 : 0))) cor(c.partido);
}

// Count against the polls of the same race. One seat compares the leader; several seats compare the names
// in the first places, in any order. If the polls name fewer people than there are seats, it compares as
// many as they name. A difference is not an error of either side.
export function contraPesquisa(linha: LinhaMapa, corrida: Corrida | undefined): Comparacao {
  const polls = corrida?.lideres ?? [];
  if (!polls.length) return { situacao: "sem-pesquisa", pesquisa: null, n: 1, lista: [] };
  if (!linha.lider) return { situacao: "sem-apuracao", pesquisa: polls[0], n: 1, lista: [polls[0]] };
  const n = Math.min(linha.vagas, polls.length);
  const contagem = new Set(linha.top.slice(0, n).map((c) => c.id));
  const lista = polls.slice(0, n);
  const igual = contagem.size === n && lista.every((p) => contagem.has(p.sq));
  return { situacao: igual ? "igual" : "diverge", pesquisa: polls[0], n, lista };
}

// The words for a comparison, matching what was compared: never "leader" when it was a set of names.
export const rotulosComp = (n: number) => (n > 1
  ? { igual: "mesmos nomes", dif: "nomes diferentes", onde: ` nos ${n} primeiros lugares` }
  : { igual: "mesmo líder", dif: "líder diferente", onde: "" });
