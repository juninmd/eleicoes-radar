// "Previsão do Radar" of the Ao vivo tab: who the Radar's simulation has finishing ahead in the President's race, set next to the polls
// and to the count. It is the Radar's estimate, not a result, and says so wherever it shows. Pure of the DOM and of the network: it
// only reshapes what the two engines already compute (the Projeção for a 1st round, the Chance ao vivo for a runoff).
//
// Three readings of every candidate, always the same three, so they can be compared at a glance:
//   pesquisa   the poll average before the count (the Expectativa's own number);
//   apuração   what the TSE has counted so far (a fact, but only of the sections that came in);
//   Monte Carlo the simulation of the final share, conditioned on the partial count (5%, 50% and 95% of the draws).
import type { Faixa } from "./apuracao-projecao.js";
import type { Leitura } from "./apuracao-projecao-estado.js";
import type { LeituraChance } from "./apuracao-chance.js";
import type { Quem } from "./apuracao-chance-view.js";
import type { Turno } from "./apuracao-tse.js";
import type { Prev } from "../src/radar/expectativa";
import { epochDe } from "./apuracao-ritmo.js";
import type { Versionado } from "./apuracao-feed.js";

export interface Leit { media: number; lo?: number; hi?: number }
export interface LadoPrev { id: string; nome: string; partido: string; chance: number; pesquisa: Leit | null; apuracao: number | null; mc: Faixa }
export type Nivel = "aberta" | "leve" | "clara" | "ampla";
export interface Previsao {
  turno: Turno;
  favorito: LadoPrev; outro: LadoPrev; // favorito: the one with the larger chance of ending ahead of the other
  nivel: Nivel;
  n: number; // draws behind the chances
  contados: number; // share of the valid votes expected that the count already has
  apurados: number; // valid votes counted so far (of the two finalists in a runoff)
  faltam: number; // valid votes still to come (estimate)
  decideNoPrimeiro: number | null; segundoTurno: number | null; // 1st round only: the chance of it ending there, and of going to a runoff
  defasadas: string[]; // files the feed kept after the TSE failed to answer
}

// How lopsided the chance is. Words, not numbers, because a simulation that was never calibrated during a count has no business
// sounding precise: the thresholds only name the zone the chance falls in.
export const nivelDe = (p: number): Nivel => (p < 0.6 ? "aberta" : p < 0.8 ? "leve" : p < 0.95 ? "clara" : "ampla");
export const NIVEL_TXT: Record<Nivel, string> = { aberta: "Disputa aberta", leve: "Leve vantagem", clara: "Vantagem clara", ampla: "Vantagem ampla" };

const pesquisaDe = (p: Pick<Prev, "fonte" | "media" | "lo" | "hi"> | null | undefined): Leit | null =>
  p && p.fonte === "pesquisas" && typeof p.media === "number" && Number.isFinite(p.media)
    ? { media: p.media, ...(Number.isFinite(p.lo) && Number.isFinite(p.hi) ? { lo: p.lo, hi: p.hi } : {}) }
    : null;

// Favourite first. A tie in the draws leaves the order as given.
function montar(base: Omit<Previsao, "favorito" | "outro" | "nivel">, x: LadoPrev, y: LadoPrev): Previsao {
  const [favorito, outro] = y.chance > x.chance ? [y, x] : [x, y];
  return { ...base, favorito, outro, nivel: nivelDe(favorito.chance) };
}

// 1st round: the two leaders of the base scenario, from the Projeção's reading of the 28 files.
export function deProjecao(l: Leitura | null | undefined, prev: (id: string) => Pick<Prev, "fonte" | "media" | "lo" | "hi"> | null | undefined): Previsao | null {
  const a = l?.analise;
  if (!l || !a || !(a.base.validos > 0)) return null;
  const lado = (id: string): LadoPrev => ({
    id, nome: l.nomes[id]?.nome ?? id, partido: l.nomes[id]?.partido ?? "",
    chance: a.sim.frente[id] ?? 0, pesquisa: pesquisaDe(prev(id)),
    apuracao: a.base.validos > 0 ? (a.base.contados[id] ?? 0) / a.base.validos : null, mc: a.sim.faixa[id] ?? [0, 0, 0],
  });
  const total = a.base.validos + a.base.restante;
  return montar({
    turno: 1, n: a.sim.n, contados: total > 0 ? a.base.validos / total : 0, apurados: a.base.validos, faltam: a.base.restante,
    decideNoPrimeiro: (a.sim.p1turno[a.a] ?? 0) + (a.sim.p1turno[a.b2] ?? 0), segundoTurno: a.sim.segundoTurno, defasadas: l.defasadas,
  }, lado(a.a), lado(a.b2));
}

// Runoff: the pair is the one the municipal model was fitted for, and the shares are of the votes of one or the other.
export function deChance(l: LeituraChance | null | undefined, a: Quem, b: Quem): Previsao | null {
  const c = l?.chance;
  if (!l || !c) return null;
  const nA = l.partes.reduce((s, p) => s + p.a, 0), nB = l.partes.reduce((s, p) => s + p.b, 0);
  const ap = nA + nB > 0 ? nA / (nA + nB) : null;
  const [lo, med, hi] = c.faixa;
  const ancora = l.ancora;
  return montar({
    turno: 2, n: c.n, contados: c.contados, apurados: nA + nB, faltam: l.partes.reduce((s, p) => s + p.restante, 0), decideNoPrimeiro: null, segundoTurno: null, defasadas: [],
  },
  { id: a.id, nome: a.nome, partido: a.partido, chance: c.a, pesquisa: ancora === null ? null : { media: ancora }, apuracao: ap, mc: [lo, med, hi] },
  { id: b.id, nome: b.nome, partido: b.partido, chance: c.b, pesquisa: ancora === null ? null : { media: 1 - ancora }, apuracao: ap === null ? null : 1 - ap, mc: [1 - hi, 1 - med, 1 - lo] });
}

// The chance of the leader over the night, kept in memory while the tab is open. A point per version of the file; the pair is kept
// because a different pair of leaders is another curve (the chance is of one finishing ahead of the other).
export interface PontoPrev { hora: string; t: number; a: string; b: string; pa: number }
const MAX_PONTOS = 240;
// Ordered by the file's date and time (epoch), not by the "HH:MM:SS" text: 00:05 of the next day is newer than 23:58.
export function registrarPrev(hist: PontoPrev[], p: Previsao, arquivo: Versionado): PontoPrev[] {
  const f = p.favorito, o = p.outro, ult = hist.at(-1);
  const t = epochDe(arquivo), hora = arquivo?.versao?.hora ?? "";
  // Without a usable date (NaN epoch) the hour text decides: otherwise every poll would add a copy of the same point.
  const datado = Number.isFinite(t) && !!ult && Number.isFinite(ult.t);
  const igual = ult && (Number.isFinite(t) ? ult.t === t : ult.hora === hora);
  const velho = ult && (datado ? t < ult.t : hora < ult.hora);
  if (igual && ult.a === f.id && ult.b === o.id) return hist;
  if (velho) return hist; // the TSE sometimes answers with an older file: it never rewinds the curve
  return [...hist, { hora, t, a: f.id, b: o.id, pa: f.chance }].slice(-MAX_PONTOS);
}
// The chance of the current favourite, over the points of the same pair.
export const curva = (hist: PontoPrev[], p: Previsao): { hora: string; p: number }[] =>
  hist.filter((x) => (x.a === p.favorito.id && x.b === p.outro.id) || (x.a === p.outro.id && x.b === p.favorito.id))
    .map((x) => ({ hora: x.hora, p: x.a === p.favorito.id ? x.pa : 1 - x.pa }));
