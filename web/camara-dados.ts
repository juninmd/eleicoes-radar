// "Câmara" tab: the arithmetic, with no DOM and no network. Roll calls (hemicycle, parties, states, orientation), party affinity (matrix and a
// 2-axis map) and the shapes of the agenda and bill history charts. Everything is a description of how people voted, never a score.
import type { EventoPauta, PainelCamara, Proposicao, VotacaoCamara } from "../src/radar/camara/painel-tipos.js";

export const VOTO_NOME = ["Sim", "Não", "Abstenção", "Obstrução", "Outro"] as const;
export const VOTOS_COM_ORIENTACAO = new Set(["Sim", "Não", "Abstenção", "Obstrução"]); // anything else ("Liberado", empty) is no position
export const norm = (s: string) => s.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); // accents drop out with the other marks
export const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Seg = "seguiu" | "diferente" | "sem";
export interface Linha { dep: number; id: number; nome: string; uf: string; partido: string; voto: number; orient: string | null; seg: Seg }
export interface PartidoVoto { partido: string; n: number; sim: number; nao: number; abs: number; outros: number; seguiu: number; diferente: number; orient: string | null; federacao: boolean }
export interface Preparada { v: VotacaoCamara; linhas: Linha[]; partidos: PartidoVoto[]; contagem: { sim: number; nao: number; abs: number; outros: number } }

export function orientacaoDe(partido: string, orient: VotacaoCamara["orient"]): { voto: string; federacao: boolean } | null {
  const n = norm(partido);
  const p = orient.find((o) => o[0] === "P" && norm(o[1]) === n);
  if (p) return { voto: p[2], federacao: false };
  // A federation entry reads "Fdr PT-PCdoB-PV"; a bloc name is cut by the API ("Bl UniPpPsd...") and cannot be taken apart.
  const f = orient.find((o) => o[0] === "B" && /^Fdr /i.test(o[1]) && o[1].replace(/^Fdr /i, "").split("-").map(norm).includes(n));
  return f ? { voto: f[2], federacao: true } : null;
}

export function preparar(p: PainelCamara, v: VotacaoCamara): Preparada {
  const orientDe = new Map<number, ReturnType<typeof orientacaoDe>>();
  const linhas: Linha[] = v.votos.map(([dep, par, voto]) => {
    const partido = p.partidos[par]!;
    if (!orientDe.has(par)) orientDe.set(par, orientacaoDe(partido, v.orient));
    const o = orientDe.get(par) ?? null;
    const tem = !!o && VOTOS_COM_ORIENTACAO.has(o.voto);
    return { dep, id: p.deputados[dep]![0], nome: p.deputados[dep]![1], uf: p.deputados[dep]![2], partido, voto, orient: o ? o.voto : null, seg: tem ? (VOTO_NOME[voto] === o!.voto ? "seguiu" : "diferente") : "sem" };
  });
  const por = new Map<string, PartidoVoto>();
  const c = { sim: 0, nao: 0, abs: 0, outros: 0 };
  for (const l of linhas) {
    const q = por.get(l.partido) ?? { partido: l.partido, n: 0, sim: 0, nao: 0, abs: 0, outros: 0, seguiu: 0, diferente: 0, orient: null, federacao: false };
    q.n++;
    const k = l.voto === 0 ? "sim" : l.voto === 1 ? "nao" : l.voto === 2 ? "abs" : "outros";
    q[k]++; c[k]++;
    if (l.seg === "seguiu") q.seguiu++;
    if (l.seg === "diferente") q.diferente++;
    const o = orientDe.get(p.partidos.indexOf(l.partido)) ?? null;
    q.orient = o ? o.voto : null; q.federacao = !!o?.federacao;
    por.set(l.partido, q);
  }
  return { v, linhas, partidos: [...por.values()].sort((a, b) => b.n - a.n || a.partido.localeCompare(b.partido, "pt")), contagem: c };
}

// ---- hemicycle: seats on concentric arcs, sorted by angle so that a sort key fills the arc in order ----
export interface Assento { x: number; y: number; t: number; r: number }
export function assentos(n: number): { pts: Assento[]; raio: number } {
  const cx = 500, cy = 500, R0 = 190, R1 = 470, L = n > 300 ? 8 : 6;
  const rs = Array.from({ length: L }, (_, i) => R0 + ((R1 - R0) * i) / (L - 1));
  const soma = rs.reduce((a, b) => a + b, 0);
  const q = rs.map((r) => Math.round((n * r) / soma));
  q[L - 1]! += n - q.reduce((a, b) => a + b, 0);
  const pts: Assento[] = [];
  rs.forEach((r, i) => { for (let j = 0; j < q[i]!; j++) { const t = Math.PI * (1 - (q[i] === 1 ? 0.5 : j / (q[i]! - 1))); pts.push({ x: cx + r * Math.cos(t), y: cy - r * Math.sin(t), t, r }); } });
  pts.sort((a, b) => b.t - a.t || a.r - b.r);
  const folga = Math.min((R1 - R0) / (L - 1), ...rs.map((r, i) => (Math.PI * r) / q[i]!));
  return { pts, raio: Math.max(3, Math.min(12, folga * 0.42)) };
}
export type Agrupar = "partido" | "uf" | "voto";
// For each row, the seat it takes. Grouping is alphabetical (party, state) or by vote: the position on the arc says nothing about politics.
export function lugares(linhas: Linha[], agrupar: Agrupar, pts: Assento[]): Assento[] {
  const cmp: Record<Agrupar, (a: Linha, b: Linha) => number> = {
    partido: (a, b) => a.partido.localeCompare(b.partido, "pt") || a.nome.localeCompare(b.nome, "pt"),
    uf: (a, b) => a.uf.localeCompare(b.uf) || a.partido.localeCompare(b.partido, "pt"),
    voto: (a, b) => a.voto - b.voto || a.partido.localeCompare(b.partido, "pt"),
  };
  const ordem = linhas.map((_, i) => i).sort((a, b) => cmp[agrupar](linhas[a]!, linhas[b]!));
  const out: Assento[] = new Array(linhas.length);
  ordem.forEach((li, k) => { out[li] = pts[k]!; });
  return out;
}

// ---- state tile map ----
export const BLOCOS_UF: Record<string, [number, number]> = { RR: [2, 0], AP: [4, 0], AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1], AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2], MS: [2, 3], GO: [3, 3], BA: [4, 3], AL: [5, 3], SE: [6, 3], DF: [3, 4], MG: [4, 4], ES: [5, 4], PR: [2, 5], SP: [3, 5], RJ: [4, 5], RS: [2, 6], SC: [3, 6] };
export interface PorUf { n: number; sim: number; nao: number; outros: number }
export function porUf(linhas: Linha[], partido: string | null): Record<string, PorUf> {
  const out: Record<string, PorUf> = {};
  for (const l of linhas) {
    const u = (out[l.uf] ??= { n: 0, sim: 0, nao: 0, outros: 0 });
    if (partido && l.partido !== partido) continue;
    u.n++;
    if (l.voto === 0) u.sim++; else if (l.voto === 1) u.nao++; else u.outros++;
  }
  return out;
}
/** -1 (all Não) to 1 (all Sim) among those who took a side; 0 with nobody. */
export const saldo = (u: PorUf) => (u.sim + u.nao ? (u.sim - u.nao) / (u.sim + u.nao) : 0);

// ---- affinity between parties over all the roll calls ----
export const MIN_VOTOS_PARTIDO = 5; // a party with fewer Sim/Não votes in a roll call has no position there
export const MIN_BANCADA = 8; // and needs a bench of this size in at least one roll call to appear
export const MIN_EM_COMUM = 3; // a pair needs this many roll calls with both positions
export interface Afinidade { ps: string[]; A: number[][]; comum: number[][]; tamanho: number[]; coesao: number[]; proxima: number[]; X: number[]; Y: number[]; minimo: number; votacoes: number }

export function afinidade(preps: Preparada[]): Afinidade {
  const pos = preps.map((pr) => { const m = new Map<string, { s: number; n: number }>(); for (const q of pr.partidos) { const d = q.sim + q.nao; if (d >= MIN_VOTOS_PARTIDO) m.set(q.partido, { s: q.sim / d, n: q.n }); } return m; });
  const vis = new Map<string, { k: number; n: number }>();
  for (const m of pos) for (const [p, x] of m) { const c = vis.get(p) ?? { k: 0, n: 0 }; c.k++; c.n = Math.max(c.n, x.n); vis.set(p, c); }
  const minimo = Math.min(preps.length, Math.max(2, Math.ceil(preps.length / 4)));
  const ps = [...vis].filter(([, c]) => c.k >= minimo && c.n >= MIN_BANCADA).map(([p]) => p).sort((a, b) => a.localeCompare(b, "pt"));
  const N = ps.length;
  const A = Array.from({ length: N }, () => new Array<number>(N).fill(1));
  const comum = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    let soma = 0, k = 0;
    for (const m of pos) { const a = m.get(ps[i]!), b = m.get(ps[j]!); if (a && b) { soma += Math.abs(a.s - b.s); k++; } }
    comum[i]![j] = comum[j]![i] = k;
    A[i]![j] = A[j]![i] = k >= MIN_EM_COMUM ? 1 - soma / k : NaN; // NaN: too few roll calls together to say anything
  }
  const limpo = A.map((r) => r.map((x) => (Number.isNaN(x) ? 0.5 : x)));
  const tamanho = ps.map((p) => Math.max(...pos.map((m) => m.get(p)?.n ?? 0)));
  const coesao = ps.map((p) => { const xs = pos.map((m) => m.get(p)).filter((x): x is { s: number; n: number } => !!x).map((x) => Math.max(x.s, 1 - x.s)); return xs.reduce((a, b) => a + b, 0) / xs.length; });
  // order by closeness: start at the party closest to all, then always the nearest one not yet placed
  const med = limpo.map((r) => r.reduce((a, b) => a + b, 0) / Math.max(1, N));
  const resta = new Set(ps.map((_, i) => i));
  let atual = med.indexOf(Math.max(...med));
  const proxima: number[] = N ? [atual] : [];
  resta.delete(atual);
  while (resta.size) { let b = -1, bv = -Infinity; for (const j of resta) if (limpo[atual]![j]! > bv) { bv = limpo[atual]![j]!; b = j; } proxima.push(b); resta.delete(b); atual = b; }
  const { X, Y } = mds(limpo.map((r) => r.map((x) => 1 - x)));
  const valores = A.flat().filter((x) => !Number.isNaN(x));
  return { ps, A: limpo, comum, tamanho, coesao, proxima, X, Y, minimo: valores.length ? Math.min(...valores) : 0, votacoes: preps.length };
}

/** Classical multidimensional scaling on a distance matrix, 2 axes by power iteration. The axes have no meaning; only distances do. */
export function mds(D: number[][]): { X: number[]; Y: number[] } {
  const N = D.length;
  if (N < 3) return { X: D.map((_, i) => 50 + i), Y: D.map(() => 50) };
  const D2 = D.map((r) => r.map((x) => x * x));
  const rm = D2.map((r) => r.reduce((a, b) => a + b, 0) / N), tm = rm.reduce((a, b) => a + b, 0) / N;
  let M = D2.map((r, i) => r.map((x, j) => -0.5 * (x - rm[i]! - rm[j]! + tm)));
  const eixos: number[][] = [];
  for (let k = 0; k < 2; k++) {
    let v = Array.from({ length: N }, (_, i) => Math.sin(i * 1.7 + k * 3 + 1));
    for (let it = 0; it < 300; it++) { const w = M.map((r) => r.reduce((a, x, j) => a + x * v[j]!, 0)); const nr = Math.hypot(...w) || 1; v = w.map((x) => x / nr); }
    const lam = M.map((r) => r.reduce((a, x, j) => a + x * v[j]!, 0)).reduce((a, x, i) => a + x * v[i]!, 0);
    eixos.push(v.map((x) => x * Math.sqrt(Math.max(lam, 0))));
    M = M.map((r, i) => r.map((x, j) => x - lam * v[i]! * v[j]!));
  }
  const caixa = (a: number[], lo: number, hi: number) => { const mn = Math.min(...a), mx = Math.max(...a); return a.map((x) => lo + ((x - mn) / (mx - mn || 1)) * (hi - lo)); };
  return { X: caixa(eixos[0]!, 7, 93), Y: caixa(eixos[1]!, 9, 91) };
}

// ---- agenda: bars on a shared hour axis, packed in rows ----
export const horas = (s: string) => Number(s.slice(11, 13)) + Number(s.slice(14, 16)) / 60;
export const DURACAO_PADRAO = 1.5; // when the Câmara gives no end time
export interface BarraDia { e: EventoPauta; ini: number; fim: number; linha: number }
export function empacotarDia(eventos: EventoPauta[]): { barras: BarraDia[]; linhas: number } {
  const ordenados = [...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const fimDe: number[] = [];
  const barras = ordenados.map((e) => {
    const ini = horas(e.inicio), fim = Math.max(e.fim ? horas(e.fim) : ini + DURACAO_PADRAO, ini + 0.75);
    let linha = fimDe.findIndex((f) => f <= ini);
    if (linha < 0) { fimDe.push(0); linha = fimDe.length - 1; }
    fimDe[linha] = fim;
    return { e, ini, fim, linha };
  });
  return { barras, linhas: fimDe.length };
}
export const emUrgencia = (regime: string) => /urg[eê]ncia/i.test(regime);

// ---- bill history ----
export const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export interface Passo { data: string; fim: string; orgao: string; tipo: string; situacao: string; regime: string; despacho: string; dias: number }
export function passos(p: Proposicao, hoje: string): { passos: Passo[]; porOrgao: Record<string, number> } {
  const porOrgao: Record<string, number> = {};
  const out = p.tram.map(([data, orgao, tipo, situacao, regime, despacho], k) => {
    const fim = p.tram[k + 1]?.[0] ?? hoje;
    const d = Math.max(0, dias(data, fim));
    porOrgao[orgao] = (porOrgao[orgao] ?? 0) + d;
    return { data, fim, orgao, tipo, situacao, regime, despacho, dias: d };
  });
  return { passos: out, porOrgao };
}
