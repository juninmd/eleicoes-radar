// A night of count that never happened, for the two animated views to play with: "Ver simulação". Everything here is made up (candidates, parties,
// votes, hours) and the views label it as such; no real candidate appears with invented numbers, so there are no photos, only initials.
// The night is computed from fixed formulas (no randomness), so the same step always gives the same file.
import { registrar } from "./apuracao-graficos.js";
import { TILES } from "./apuracao-noite.js";
import type { Apuracao, Candidato, Fase } from "./apuracao-tse.js";
import type { Ponto } from "./apuracao-graficos.js";
import type { BrasilSnapshot, UfEstado } from "./apuracao-uf.js";

export const PASSOS = 60;
export const PASSO_INICIAL = 26; // the first frame is a readable moment of the night, not the empty start

const hora = (i: number, inicio: number) => { const m = inicio + i * 3; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const logit = (p: number) => Math.log(p / (1 - p));
const logistica = (x: number) => 1 / (1 + Math.exp(-x));
const suave = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
const hash = (s: string, sal: number) => { let h = 2166136261 ^ sal; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

// ---- the race of one office: six fictional candidacies, the early files lean one way and the count settles as the sections come in
const CORRIDA = [
  { nome: "HELENA CARDOSO", partido: "AUR", num: "12", ini: 0.245, fim: 0.382 },
  { nome: "RUI ALMEIDA", partido: "NOR", num: "33", ini: 0.345, fim: 0.369 },
  { nome: "MARTA VIEIRA", partido: "VER", num: "45", ini: 0.290, fim: 0.114 },
  { nome: "TADEU BRANDÃO", partido: "PRA", num: "27", ini: 0.040, fim: 0.079 },
  { nome: "IARA MONTENEGRO", partido: "LIT", num: "18", ini: 0.060, fim: 0.036 },
  { nome: "OTÁVIO PEIXE", partido: "CEN", num: "50", ini: 0.020, fim: 0.020 },
];
const VALIDOS = 6_214_880, SECOES = 94_812;
const PAUSAS = new Set([17, 18, 44]); // the TSE publishes in rounds: these steps repeat the file before
const curva = (i: number) => (i >= PASSOS - 1 ? 1 : 1 - Math.pow(1 - i / (PASSOS - 1), 1.8));
const avancoCorrida = (i: number): number => (PAUSAS.has(i) && i > 0 ? avancoCorrida(i - 1) : curva(i));

function arquivo(cargo: { codigo: string; nome: string }, i: number, cands: Candidato[], secoes: { total: number; totalizadas: number }, apto: number, p: number, inicio: number, validos: number): Apuracao {
  const fase: Fase = secoes.totalizadas === 0 ? "aguardando" : secoes.totalizadas >= secoes.total ? "concluida" : "parcial";
  return {
    versao: { data: "simulação", hora: hora(i, inicio) },
    cargo: { codigo: cargo.codigo, nome: cargo.nome, vagas: 1 },
    fase, secoes,
    eleitorado: { apto, apurado: Math.round(apto * p), comparecimento: Math.round(apto * p * 0.78), abstencao: Math.round(apto * p * 0.22) },
    votos: { total: Math.round(validos * 1.08), validos, brancos: Math.round(validos * 0.03), nulos: Math.round(validos * 0.05) },
    quociente: null, candidatos: cands, partidos: [],
  };
}

const memoCorrida: Apuracao[] = [];
export function quadroCorrida(i: number): Apuracao {
  const k = Math.min(PASSOS - 1, Math.max(0, i));
  if (memoCorrida[k]) return memoCorrida[k]!;
  const p = avancoCorrida(k);
  const validos = Math.round(VALIDOS * p);
  const brutos = CORRIDA.map((c, n) => ({ c, n, votos: Math.round(validos * (c.fim + (c.ini - c.fim) * (1 - p))) }));
  const total = brutos.reduce((s, x) => s + x.votos, 0) || 1;
  const ordem = [...brutos].sort((a, b) => b.votos - a.votos);
  const cands: Candidato[] = ordem.map((x, pos) => {
    const final = k === PASSOS - 1 && pos < 2;
    return { id: `sim-c${x.n}`, num: x.c.num, nome: x.c.nome, partido: x.c.partido, votos: x.votos, pct: x.votos / total, destaque: final, situacao: final ? "2º turno" : "", lista: x.c.partido };
  });
  const quadro = arquivo({ codigo: "3", nome: "Governador" }, k, cands, { total: SECOES, totalizadas: Math.floor(p * SECOES) }, 8_100_000, p, 17 * 60 + 30, validos);
  memoCorrida[k] = quadro;
  return quadro;
}
export const horaCorrida = (i: number) => hora(i, 17 * 60 + 30);

// The history the chart of the Corrida draws: what the tab would have recorded had it been open from the start.
export function histCorrida(i: number): Ponto[] {
  let h: Ponto[] = [];
  for (let k = 1; k <= Math.min(i, PASSOS - 1); k++) h = registrar(h, quadroCorrida(k));
  return h;
}

// ---- the night of a runoff for the President, state by state (the two finalists), made of the same fixed formulas
const ELEITORADO: Record<string, number> = { AC: 0.6, RO: 1.2, AM: 2.7, RR: 0.4, PA: 6.2, AP: 0.6, MA: 5.0, CE: 6.8, RN: 2.6, MT: 2.7, TO: 1.1, PI: 2.5, PE: 7.2, PB: 3.2, MS: 2.0, GO: 5.0, BA: 11.0, AL: 2.3, SE: 1.7, SP: 34.6, DF: 2.2, MG: 16.3, ES: 2.9, PR: 8.5, SC: 5.7, RJ: 12.8, RS: 8.5 };
const FINALISTAS = [
  { id: "sim-a", nome: "HELENA CARDOSO", partido: "AUR", num: "12" },
  { id: "sim-b", nome: "RUI ALMEIDA", partido: "NOR", num: "33" },
];
interface UfSim { uf: string; apto: number; secoes: number; fim: number; vies: number; inicio: number; duracao: number }
let ufsSim: UfSim[] | null = null;
function estados(): UfSim[] {
  if (ufsSim) return ufsSim;
  const base = Object.keys(ELEITORADO).map((uf) => {
    const [col, lin] = TILES[uf]!;
    const cru = 0.5 + 0.10 * Math.sin(col * 0.9 + 0.9) + 0.09 * Math.cos(lin * 1.1 - 0.3) + 0.05 * Math.sin((col + lin) * 0.7) + (hash(uf, 1) - 0.5) * 0.05;
    return { uf, apto: Math.round(ELEITORADO[uf]! * 1e6), secoes: Math.round((ELEITORADO[uf]! * 1e6) / 330), cru };
  });
  // One shift in logit space, so the country ends near 50,6% for the first finalist
  const total = base.reduce((s, u) => s + u.apto, 0);
  let lo = -2, hi = 2;
  for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (base.reduce((s, u) => s + u.apto * logistica(logit(u.cru) + m), 0) / total < 0.506) lo = m; else hi = m; }
  const m = (lo + hi) / 2;
  // The states where the second finalist is ahead report first, the others later: that order is what makes the lead change hands in the second half of the night.
  // States that end close start leaning the other way, so a few of them turn while the count goes on.
  ufsSim = base.map((u) => {
    const fim = logistica(logit(u.cru) + m);
    const inicio = fim > 0.5 ? Math.round(10 + hash(u.uf, 2) * 16) : Math.round(hash(u.uf, 2) * 14);
    return { uf: u.uf, apto: u.apto, secoes: u.secoes, fim, vies: Math.abs(fim - 0.5) < 0.09 ? (fim > 0.5 ? -0.14 : 0.14) : (hash(u.uf, 4) - 0.5) * 0.1, inicio, duracao: Math.min(62 - inicio, 16 + Math.floor(hash(u.uf, 3) * 22)) };
  });
  return ufsSim;
}

const memoNoite: BrasilSnapshot[] = [];
export function quadroNoite(i: number): BrasilSnapshot {
  const k = Math.min(PASSOS - 1, Math.max(0, i));
  if (memoNoite[k]) return memoNoite[k]!;
  const agora = new Date();
  const ufs: Record<string, UfEstado> = {};
  for (const u of estados()) {
    const q = k >= PASSOS - 1 ? 1 : suave((k - u.inicio) / u.duracao);
    const a = Math.min(0.97, Math.max(0.03, u.fim + u.vies * (1 - q)));
    const validos = Math.round(u.apto * 0.76 * q);
    const votosA = Math.round(validos * a), votosB = validos - votosA;
    const cands: Candidato[] = q > 0 ? [
      { id: FINALISTAS[0]!.id, num: FINALISTAS[0]!.num, nome: FINALISTAS[0]!.nome, partido: FINALISTAS[0]!.partido, votos: votosA, pct: validos ? votosA / validos : 0, destaque: false, situacao: "", lista: "" },
      { id: FINALISTAS[1]!.id, num: FINALISTAS[1]!.num, nome: FINALISTAS[1]!.nome, partido: FINALISTAS[1]!.partido, votos: votosB, pct: validos ? votosB / validos : 0, destaque: false, situacao: "", lista: "" },
    ].sort((x, y) => y.votos - x.votos) : [];
    const totalizadas = Math.floor(u.secoes * q);
    const dados = arquivo({ codigo: "1", nome: "Presidente" }, k, cands, { total: u.secoes, totalizadas }, u.apto, q, 18 * 60, validos);
    ufs[u.uf] = { status: "ok", dados, erro: null, buscadoEm: agora };
  }
  const quadro: BrasilSnapshot = { cargo: "Presidente", ciclo: k + 1, buscadoEm: agora, ufs };
  memoNoite[k] = quadro;
  return quadro;
}
export const horaNoite = (i: number) => hora(i, 18 * 60);
