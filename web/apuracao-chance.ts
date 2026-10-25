// Live chance of each finalist ending a runoff ahead ("Chance ao vivo"). The Radar's estimate, not a result: the view says so.
// Pure of the DOM and of the network; seeded draws, so the same files always give the same screen.
//
// Before any vote, each part of the race (a state file for the president, the single file of a governor's race) has a prior: the
// share of A that the runoff model (municipio-modelo.ts, fitted on the 2002-2022 runoffs) gives its cities from this election's
// 1st round, with alpha from the poll average of the pair when there is one, else alpha = 0. As the count comes in:
//   deviation  = vote-weighted mean of logit(observed share of A) - logit(prior), over the parts that have votes;
//   weight     = C / (C + K x V): C votes counted, V the votes the model expects in the race (K = 5%: half weight at 5% counted);
//   to come    = in each part, the model shifted by weight x deviation, blended with the part's own share by how much of it is in;
//   noise      = a common one (the model's measured race error, shrinking as the deviation is measured, plus a floor for the order in
//                which sections arrive) and one per part.
// The chance is the share of 2,000 draws where A (or B) ends with more valid votes.
import { logit, logistic, raceShare, firstRoundVotes, solveAlpha, alvoValido } from "./municipio-modelo.js";
import { mulberry32, parteDe, restanteDe } from "./apuracao-projecao.js";
import { toCity } from "./apuracao-municipios.js";
import type { Params } from "./municipio-modelo.js";
import type { Erros, MunArquivo } from "./apuracao-municipios.js";
import type { Faixa } from "./apuracao-projecao.js";
import type { Apuracao } from "./apuracao-tse.js";

export interface Prior { prior: number; esperado: number } // share of A, and the valid votes the model expects
export interface ParteChance { id: string; a: number; b: number; restante: number; prior: number; esperado: number }
export interface OpcoesChance { sigmaComum: number; sigmaParte: number; n?: number; semente?: number }
export interface Chance {
  a: number; b: number; empate: number; // chance of each ending ahead (and of an exact tie)
  faixa: Faixa; // 5%, 50%, 95% of A's final share of the valid votes
  previa: number; // A's share in the model before any vote
  desvio: number; // p.p. of A's share the measured deviation moves the parts still to come (already times the weight)
  peso: number; contados: number; // weight of the deviation; share of the expected valid votes already counted
  n: number;
}

const K = 0.05;
// The sections still to come are never a random sample of those counted (capital and interior arrive at different times): even with the
// deviation measured, the votes to come keep about 1,5 p.p. of uncertainty, the common noise the Projeção uses after measuring.
const SIGMA_ORDEM = 0.06;
const LOGIT_POR_PONTO = 4; // d logit / d share at 50%: an error of x p.p. is about 4x in logit
const clampP = (p: number) => Math.min(0.999, Math.max(0.001, p));
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// The model's prior of every part. `porUf`: the president's parts are the states (and ZZ, the exterior) of his cities.
export function priores(arq: MunArquivo, p: Params, alpha: number, porUf: boolean): Record<string, Prior> {
  const grupos = new Map<string, ReturnType<typeof toCity>[]>();
  for (const c of arq.cidades) {
    const id = porUf ? c[2] : arq.uf;
    grupos.set(id, [...(grupos.get(id) ?? []), toCity(c)]);
  }
  return Object.fromEntries([...grupos].map(([id, cs]) => [id, { prior: raceShare(cs, alpha, p), esperado: sum(cs.map(firstRoundVotes)) * p.ratio }]));
}

// alpha of the race: the one that makes the model add up to the poll average of the pair, when there is one.
export const alphaDe = (arq: MunArquivo, p: Params, pesquisa: number | null) => (pesquisa === null ? 0 : solveAlpha(arq.cidades.map(toCity), alvoValido(pesquisa), p).alpha);

// Noise of the draws, in logit, from what the backtest measured. With a poll anchor the race error is the poll's (3 p.p. in the
// calibration of the 2nd-round polls, AGENTS.md); without it, the model's own error with alpha = 0.
export function sigmas(e: Erros | null | undefined, ancorado: boolean, partes: number): Pick<OpcoesChance, "sigmaComum" | "sigmaParte"> {
  const comum = ancorado ? 3 : e?.nacionalSemAncoraRmse ?? 5;
  const parte = partes > 1 ? e?.porTamanho.at(-1)?.rmse ?? 3 : 0;
  return { sigmaComum: (comum / 100) * LOGIT_POR_PONTO, sigmaParte: (parte / 100) * LOGIT_POR_PONTO };
}

// The parts of the race from the files the tab has, by id. A part with no file or no votes yet waits for what the model expects.
export function partesDe(fontes: [id: string, dados: Apuracao | null][], pri: Record<string, Prior>, idA: string, idB: string): ParteChance[] {
  const vistos = new Set<string>();
  const out: ParteChance[] = [];
  const geral = (() => { const v = sum(Object.values(pri).map((x) => x.esperado)); return v > 0 ? sum(Object.values(pri).map((x) => x.prior * x.esperado)) / v : 0.5; })();
  for (const [id, d] of fontes) {
    vistos.add(id);
    const pr = pri[id] ?? { prior: geral, esperado: 0 };
    const a = d?.candidatos.find((c) => c.id === idA)?.votos ?? 0, b = d?.candidatos.find((c) => c.id === idB)?.votos ?? 0;
    out.push({ id, a, b, prior: pr.prior, esperado: pr.esperado, restante: a + b > 0 && d ? restanteDe(parteDe(id, d)) : pr.esperado });
  }
  for (const [id, pr] of Object.entries(pri)) if (!vistos.has(id)) out.push({ id, a: 0, b: 0, prior: pr.prior, esperado: pr.esperado, restante: pr.esperado });
  return out;
}

export function chance(partes: ParteChance[], { sigmaComum, sigmaParte, n = 2000, semente = 7 }: OpcoesChance): Chance | null {
  const V = sum(partes.map((p) => p.esperado));
  const C = sum(partes.map((p) => p.a + p.b));
  const R = sum(partes.map((p) => p.restante));
  if (!(C + R > 0)) return null;
  const obs = partes.filter((p) => p.a + p.b > 0);
  const bruto = C > 0 ? sum(obs.map((p) => (p.a + p.b) * (logit(clampP(p.a / (p.a + p.b))) - logit(clampP(p.prior))))) / C : 0;
  const peso = C > 0 ? C / (C + K * Math.max(V, C)) : 0;
  const delta = peso * bruto;
  const sigmaNu = Math.sqrt(sigmaComum ** 2 * (1 - peso) + (C > 0 ? SIGMA_ORDEM ** 2 : 0));
  const vivos = partes.filter((p) => p.restante > 0).map((p) => {
    const q = p.a + p.b > 0 ? (p.a + p.b) / (p.a + p.b + p.restante) : 0;
    const proprio = q > 0 ? logit(clampP(p.a / (p.a + p.b))) : 0;
    return { r: p.restante, centro: q * proprio + (1 - q) * (logit(clampP(p.prior)) + delta), sigma: sigmaParte * (1 - q) };
  });
  const contA = sum(partes.map((p) => p.a));
  const rnd = mulberry32(semente);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const shares: number[] = [];
  let ganhaA = 0, ganhaB = 0;
  for (let i = 0; i < n; i++) {
    const nu = sigmaNu * normal();
    const escala = Math.exp(0.03 * normal());
    let A = contA, T = C;
    for (const p of vivos) {
      const r = p.r * escala;
      A += r * logistic(p.centro + nu + p.sigma * normal());
      T += r;
    }
    const s = T > 0 ? A / T : 0.5;
    shares.push(s);
    if (s > 0.5) ganhaA++; else if (s < 0.5) ganhaB++;
  }
  shares.sort((x, y) => x - y);
  const q = (p: number) => shares[Math.floor(p * (shares.length - 1))]!;
  const previa = V > 0 ? sum(partes.map((p) => p.esperado * p.prior)) / V : 0.5;
  const comDesvio = V > 0 ? sum(partes.map((p) => p.esperado * logistic(logit(clampP(p.prior)) + delta))) / V : previa;
  return { a: ganhaA / n, b: ganhaB / n, empate: (n - ganhaA - ganhaB) / n, faixa: [q(0.05), q(0.5), q(0.95)], previa, desvio: comDesvio - previa, peso, contados: C + R > 0 ? C / (C + R) : 0, n };
}

// What the view needs, from the municipal file of the race and the TSE files the tab has. The prior of each part and its alpha are
// kept (they only change with the poll anchor), and the draws only run again when a count changes: a redraw costs nothing.
export interface LeituraChance { chance: Chance | null; partes: ParteChance[]; ancora: number | null; erros: Erros | null }
export interface EntradaChance {
  params: Params; erros: Erros | null; arq: MunArquivo; fontes: [id: string, dados: Apuracao | null][];
  idA: string; idB: string; ancora: number | null; // the poll share of A among the votes of A and B, or null
}
export function createChance() {
  const pri = new Map<string, Record<string, Prior>>();
  let memo: { chave: string; valor: Chance | null } | null = null;
  return {
    ler({ params, erros, arq, fontes, idA, idB, ancora }: EntradaChance): LeituraChance {
      const k = `${arq.cargo}|${arq.uf}|${ancora}`;
      let pr = pri.get(k);
      if (!pr) { pr = priores(arq, params, alphaDe(arq, params, ancora), arq.cargo === "Presidente"); pri.set(k, pr); }
      const partes = partesDe(fontes, pr, idA, idB);
      const s = sigmas(erros, ancora !== null, partes.length);
      const chave = JSON.stringify([s, idA, idB, partes.map((x) => [x.id, x.a, x.b, Math.round(x.restante)])]);
      if (memo?.chave !== chave) memo = { chave, valor: chance(partes, s) };
      return { chance: memo.valor, partes, ancora, erros };
    },
  };
}
