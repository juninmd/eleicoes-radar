// Runoff estimate per municipality: the arithmetic of the "Cidades" view, apart from the page. The formula is
// municipio-modelo.js (the same file the backtest runs); this file chooses the scenario, adds the cities up and filters them.
import { alvoValido, estimate, raceShare, solveAlpha } from "./municipio-modelo.js";
import type { City, Params } from "./municipio-modelo.js";

export interface Finalista { n: string; nome: string; partido: string; sq: string }
// data/municipal/<file>.json: first-round valid votes of A, B and everybody else in each municipality of the race.
export interface MunArquivo {
  cargo: string; uf: string; ano: number; a: Finalista; b: Finalista;
  cidades: [cod: string, nome: string, uf: string, a: number, b: number, o: number][];
}
// What the backtest measured (src/radar/municipal/backtest.ts); every number the page quotes about accuracy comes from here.
export interface Erros {
  cidade: number; // RMSE of a city's share of A in p.p., race level known
  porTamanho: { ate: number | null; rmse: number }[]; // same, by the city's estimated valid votes (upper bound of the class; null = no bound)
  nacionalSemAncora: number; // mean |error| of the race share with alpha = 0, in p.p.
  nacionalSemAncoraRmse: number;
  acertoVencedor: number; // % of the vote that sat in cities whose leader was called right
  erroVotos: number; // mean |relative error| of a city's valid votes, in %
  disputas: number; anos: number[];
}
export interface MunIndice {
  geradoEm: string; modeloEm: string;
  params: Record<"Presidente" | "Governador", Params>; erros: Record<"Presidente" | "Governador", Erros>;
  disputas: { cargo: string; uf: string; arquivo: string; a: Finalista; b: Finalista }[];
}

export type ModoCenario = "neutro" | "pesquisa" | "meu";
export interface Cenario { modo: ModoCenario; alvo: number } // alvo: the share of A among the valid votes of A and B, for "pesquisa" and "meu"
export interface Filtro { uf: string; busca: string }

export interface Cidade {
  cod: string; nome: string; uf: string; votos: number; a: number; b: number; shareA: number; pm: number; // pm: ± p.p. typical error of the share
  a1: number; b1: number; // first-round share of valid votes
}
export interface Analise {
  alpha: number; limitado: boolean; shareA: number; votosA: number; votosB: number; votos: number;
  aFrente: number; bFrente: number; empate: number; // cities where each finalist is ahead in the estimate
  porUf: { uf: string; votos: number; shareA: number; cidades: number }[];
  cidades: Cidade[]; total: number; // `cidades` is filtered and sorted; `total` is how many matched
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// ± in p.p. for a city with `votos` estimated valid votes: the backtest error of its size class, or the overall one.
export function margemDe(votos: number, e: Erros | null | undefined): number {
  if (!e) return NaN;
  for (const t of e.porTamanho) if (votos <= (t.ate ?? Infinity)) return t.rmse;
  return e.cidade;
}

export const toCity = (c: MunArquivo["cidades"][number]): City => ({ a: c[3], b: c[4], o: c[5] });

// The share of A for the whole race that each scenario asks for; null for the neutral one (alpha = 0, whatever it adds up to).
export function alvoDe(c: Cenario): number | null {
  return c.modo === "neutro" ? null : alvoValido(c.alvo);
}

export function analisar(arq: MunArquivo, p: Params, cenario: Cenario, filtro: Filtro, erros?: Erros | null): Analise {
  const cities = arq.cidades.map(toCity);
  const alvo = alvoDe(cenario);
  const { alpha, limitado } = alvo === null ? { alpha: 0, limitado: false } : solveAlpha(cities, alvo, p);
  const est = estimate(cities, alpha, p);
  let votosA = 0, votosB = 0, aFrente = 0, bFrente = 0, empate = 0;
  const uf = new Map<string, { votos: number; a: number; cidades: number }>();
  const todas: Cidade[] = arq.cidades.map((c, i) => {
    const e = est[i]!, city = cities[i]!;
    votosA += e.votesA; votosB += e.votesB;
    if (e.shareA > 0.5) aFrente++; else if (e.shareA < 0.5) bFrente++; else empate++;
    const u = uf.get(c[2]) ?? { votos: 0, a: 0, cidades: 0 };
    u.votos += e.votes; u.a += e.votesA; u.cidades++;
    uf.set(c[2], u);
    const tot = city.a + city.b + city.o;
    return { cod: c[0], nome: c[1], uf: c[2], votos: e.votes, a: e.votesA, b: e.votesB, shareA: e.shareA, pm: margemDe(e.votes, erros), a1: tot > 0 ? city.a / tot : 0, b1: tot > 0 ? city.b / tot : 0 };
  });
  const q = norm(filtro.busca);
  const sel = todas.filter((c) => (!filtro.uf || c.uf === filtro.uf) && (!q || norm(c.nome).includes(q))).sort((x, y) => y.votos - x.votos || x.nome.localeCompare(y.nome, "pt-BR"));
  const votos = votosA + votosB;
  return {
    alpha, limitado, shareA: votos > 0 ? votosA / votos : 0.5, votosA, votosB, votos, aFrente, bFrente, empate,
    porUf: [...uf].map(([u, v]) => ({ uf: u, votos: v.votos, shareA: v.votos > 0 ? v.a / v.votos : 0.5, cidades: v.cidades })).sort((x, y) => y.votos - x.votos),
    cidades: sel, total: sel.length,
  };
}

// The share of A for the whole race that the neutral scenario implies (what the cities add up to with alpha = 0).
export function shareNeutro(arq: MunArquivo, p: Params): number {
  return raceShare(arq.cidades.map(toCity), 0, p);
}

// The poll average for this pair, if the poll summary of the race has one: `confrontos` carries `qa`, the share of `a` among the decided voters.
export interface Confronto { a: string; b: string; qa: number; n?: number }
export function pesquisaDoPar(confrontos: readonly Confronto[] | undefined, a: string, b: string): number | null {
  for (const m of confrontos ?? []) {
    if (m.a === a && m.b === b) return m.qa;
    if (m.a === b && m.b === a) return 1 - m.qa;
  }
  return null;
}
