// Projection of the final valid-vote shares of a one-seat race from the files the TSE has published so far.
// It is the Radar's arithmetic, not a result: the view says so next to every number. Pure of the DOM and of the
// network; the random draws come from a seeded generator so the same input always gives the same screen.
//
// A "part" is the slice of the race one file covers: a state file for the president, the single file of a governor's race.
//   { id, versao, apto, apurado, validos, votos: { [candidateId]: votes } }
import { versaoDe } from "./apuracao-feed.js";
import type { Apuracao } from "./apuracao-tse.js";

export interface Parte {
  id: string; versao: number; apto: number; apurado: number; validos: number;
  secoes?: Apuracao["secoes"]; votos: Record<string, number>;
}
export interface Base { contados: Record<string, number>; validos: number; restante: number; final: Record<string, number>; ordem: string[]; outros: number }
// Drift of one part between two versions of its file; peso = the valid votes that arrived.
export interface Amostra { peso: number; d: number }
export interface Memoria { ultimo: Record<string, Parte>; a: string; b: string; amostras: Amostra[] }
export interface Deriva { mu: number; sigmaUf: number; peso: number; n: number }
export interface Dispersao { mu: number; sigmaComum: number; sigmaUf: number }
export interface OpcoesSimulacao extends Partial<Dispersao> { a: string; b: string; n?: number; semente?: number }
export type Faixa = [baixo: number, mediana: number, alto: number];
export interface Simulacao { p1turno: Record<string, number>; segundoTurno: number; faixa: Record<string, Faixa>; n: number }
export interface Analise {
  base: Base; a: string; b2: string; medida: Deriva | null; params: Dispersao; sim: Simulacao;
  precisa: Record<string, number | null>; segundo: (number | null)[];
}

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const parteDe = (id: string, d: Apuracao): Parte => ({
  id, versao: versaoDe(d), apto: d.eleitorado.apto, apurado: d.eleitorado.apurado, validos: d.votos.validos,
  secoes: d.secoes, votos: Object.fromEntries(d.candidatos.map((c) => [c.id, c.votos])),
});

// Valid votes still to come = valid votes counted x (electorate not yet counted) / (electorate already counted).
// Same turnout and same share of valid votes as the sections already in; the electorate is the TSE's own number.
export function restanteDe(p: Parte): number {
  if (!(p.apurado > 0) || !(p.validos > 0) || p.apurado > p.apto) return 0;
  return (p.validos * (p.apto - p.apurado)) / p.apurado;
}

// Base scenario: in the votes to come, every candidate repeats the share already won in that same part.
export function base(partes: Parte[]): Base {
  const com = partes.filter((p) => p.validos > 0);
  const contados: Record<string, number> = {};
  const resto: Record<string, number> = {};
  let validos = 0;
  let restante = 0;
  for (const p of com) {
    const r = restanteDe(p);
    validos += p.validos;
    restante += r;
    for (const [id, v] of Object.entries(p.votos)) {
      contados[id] = (contados[id] ?? 0) + v;
      resto[id] = (resto[id] ?? 0) + (r * v) / p.validos;
    }
  }
  const total = validos + restante;
  if (!(total > 0)) return { contados, validos: 0, restante: 0, final: {}, ordem: [], outros: 0 };
  const final = Object.fromEntries(Object.keys(contados).map((id) => [id, (contados[id] + resto[id]) / total]));
  const ordem = Object.keys(final).sort((x, y) => final[y] - final[x]);
  return { contados, validos, restante, final, ordem, outros: Math.max(0, 1 - sum(Object.values(final))) };
}

// Share of the valid votes still to come that a candidate needs to end at 50% of the final total:
// (0,5 x (counted + to come) - his votes) / to come. Above 1 it cannot be reached; null when nothing is left to count.
export function necessario(b: Base, id: string): number | null {
  if (!(b.restante > 0)) return null;
  return (0.5 * (b.validos + b.restante) - (b.contados[id] ?? 0)) / b.restante;
}

// How much the margin A-B of the votes that arrived between two versions of one part differs from the margin
// that part already had. Negative: the new votes favour B more than the part did so far.
export function medirDeriva(antes: Parte, depois: Parte, a: string, b: string): Amostra[] {
  const dv = depois.validos - antes.validos;
  if (!(antes.validos > 0) || !(dv > 0)) return [];
  const ja = (antes.votos[a] ?? 0) - (antes.votos[b] ?? 0);
  const novo = ((depois.votos[a] ?? 0) - (antes.votos[a] ?? 0)) - ((depois.votos[b] ?? 0) - (antes.votos[b] ?? 0));
  return [{ peso: dv, d: novo / dv - ja / antes.validos }];
}

const JANELA = 400;

// Keeps the last version of every part and the drift measured each time a newer one arrives. A file older than the one held
// never replaces it (one with no date or time counts as newer, as in the feed's maisRecente). The same two leaders swapping
// places only flips the sign of the margin, so what was measured stays; a different pair means something else: restart.
export function acumular(mem: Memoria | null, partes: Parte[], a: string, b: string): Memoria {
  const mesma = mem && mem.a === a && mem.b === b;
  const trocada = mem && mem.a === b && mem.b === a;
  const ultimo: Record<string, Parte> = { ...(mem?.ultimo ?? {}) };
  const novas: Amostra[] = [];
  for (const p of partes) {
    const prev = ultimo[p.id];
    if (!prev) ultimo[p.id] = p;
    else if (!(p.versao < prev.versao)) { if (mesma || trocada) novas.push(...medirDeriva(prev, p, a, b)); ultimo[p.id] = p; }
  }
  const antigas = mesma ? mem.amostras : trocada ? mem.amostras.map((s) => ({ ...s, d: -s.d })) : [];
  return { ultimo, a, b, amostras: [...antigas, ...novas].slice(-JANELA) };
}

// Weighted mean of the drift (by the votes that arrived) and its spread across parts; null while too few votes were measured.
export function deriva(mem: Memoria | null | undefined, { minimo = 50_000 }: { minimo?: number } = {}): Deriva | null {
  const peso = sum(mem?.amostras?.map((s) => s.peso) ?? []);
  if (!(peso > 0) || peso < minimo) return null;
  const mu = sum(mem!.amostras.map((s) => s.peso * s.d)) / peso;
  const sigmaUf = Math.sqrt(sum(mem!.amostras.map((s) => s.peso * (s.d - mu) ** 2)) / peso);
  return { mu, sigmaUf, peso, n: mem!.amostras.length };
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantil = (xs: number[], p: number) => xs[Math.floor(p * (xs.length - 1))];

// Monte Carlo over the votes still to come. One draw shifts the margin A-B of what is left by mu + common noise in every
// part, plus noise of each part, and scales the size of what is left; the shares of the others stay as they are.
// The 1st-round chance counts the draws where a candidate ends above 50% of the valid votes.
export function simular(partes: Parte[], { a, b, mu = 0, sigmaComum = 0.04, sigmaUf = 0.04, n = 2000, semente = 1 }: OpcoesSimulacao): Simulacao {
  const com = partes.filter((p) => p.validos > 0).map((p) => ({ pa: (p.votos[a] ?? 0) / p.validos, pb: (p.votos[b] ?? 0) / p.validos, r: restanteDe(p) }));
  const contA = sum(partes.map((p) => p.votos[a] ?? 0));
  const contB = sum(partes.map((p) => p.votos[b] ?? 0));
  const contV = sum(partes.map((p) => p.validos));
  const rnd = mulberry32(semente);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const sa: number[] = [];
  const sb: number[] = [];
  let ganhaA = 0;
  let ganhaB = 0;
  for (let i = 0; i < n; i++) {
    const comum = mu + sigmaComum * normal();
    const escala = Math.exp(0.03 * normal());
    let A = contA;
    let B = contB;
    let T = contV;
    for (const p of com) {
      const d = comum + sigmaUf * normal();
      const r = p.r * escala * Math.exp(0.03 * normal());
      A += r * clamp(p.pa + d / 2, 0, 1);
      B += r * clamp(p.pb - d / 2, 0, 1);
      T += r;
    }
    sa.push(A / T);
    sb.push(B / T);
    if (A / T > 0.5) ganhaA++;
    else if (B / T > 0.5) ganhaB++;
  }
  const faixa = (xs: number[]): Faixa => { xs.sort((x, y) => x - y); return [quantil(xs, 0.05), quantil(xs, 0.5), quantil(xs, 0.95)]; };
  return { p1turno: { [a]: ganhaA / n, [b]: ganhaB / n }, segundoTurno: (n - ganhaA - ganhaB) / n, faixa: { [a]: faixa(sa), [b]: faixa(sb) }, n };
}

// Keeps the drift memory up to date for the two candidates ahead in the base scenario.
export function medir(mem: Memoria | null, partes: Parte[]): Memoria | null {
  const [a, b] = base(partes).ordem;
  return a && b ? acumular(mem, partes, a, b) : mem;
}

// Drift measured over less than 0,2% of the valid votes is noise: until then the simulation runs with a wide, neutral spread.
const MEDIDA_MINIMA = 0.002;
const SEM_MEDIDA: Dispersao = { mu: 0, sigmaComum: 0.04, sigmaUf: 0.04 };
const ABSTENCAO = [0.25, 0.5];

// Everything the Projeção view prints, from the parts the TSE has published and the drift memory.
export function analise(partes: Parte[], mem: Memoria | null): Analise | null {
  const b = base(partes);
  const [a, c] = b.ordem;
  if (!a || !c || !(b.validos > 0)) return null;
  const medida = mem && mem.a === a && mem.b === c ? deriva(mem, { minimo: MEDIDA_MINIMA * b.validos }) : null;
  const params = medida ? { mu: medida.mu, sigmaComum: 0.015, sigmaUf: Math.max(0.02, medida.sigmaUf) } : SEM_MEDIDA;
  const final = { a: b.final[a], b: b.final[c] };
  return {
    base: b, a, b2: c, medida, params,
    sim: simular(partes, { a, b: c, ...params }),
    precisa: { [a]: necessario(b, a), [c]: necessario(b, c) },
    segundo: ABSTENCAO.map((ab) => transferencia(final, ab)),
  };
}

// 2nd round, as arithmetic and not as a forecast: both finalists keep their 1st-round voters, the others' voters
// that still show up split between them. Returns the share of those voters the runner-up needs: 1/2 + (a - b) / (2 O'),
// with O' = others x (1 - abstention). Above 1 it cannot be done by them alone; null when nobody else is in the race.
export function transferencia({ a, b }: { a: number; b: number }, abstencao: number): number | null {
  const outros = (1 - a - b) * (1 - abstencao);
  if (!(outros > 1e-9)) return null;
  return 0.5 + (a - b) / (2 * outros);
}
