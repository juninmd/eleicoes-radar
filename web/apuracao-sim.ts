// The simulated count night of the Apuração tab ("Simulação"). Each file ends at a real TSE result (the final 1st-round file of that race,
// or a runoff derived from it), so every office, state and view has its true shape: number of candidates, lists, seats, quotient, turnout.
// What is invented is everything a reader could take for a fact: every name, party and list is swapped for a fictional one, and the path
// of the night (when each file starts, how the early sections lean) comes from fixed formulas. No real candidate ever appears with an
// invented number, so there are no photos and no poll comparison (the ids are fictional too). Pure: no DOM, no network.
import { logit, logistic } from "./municipio-modelo.js";
import type { Params } from "./municipio-modelo.js";
import type { Apuracao, Candidato, Turno } from "./apuracao-tse.js";

export const PASSOS = 72; // one file every 3 simulated minutes, from 17:00
export const PASSO_INICIAL = 24; // the first frame is a readable moment of the night, not the empty start
const INICIO = 17 * 60;
// The day of each round: the simulated files carry it, so the age of a file and the order of versions work as on count night.
export const DIA: Record<Turno, string> = { 1: "04/10/2026", 2: "25/10/2026" };

const p2 = (n: number) => String(n).padStart(2, "0");
export const horaSim = (k: number) => { const m = INICIO + Math.max(0, k) * 3; return `${p2(Math.floor(m / 60) % 24)}:${p2(m % 60)}:00`; };
// The moment the tab "read" step k: 20 s after the file, in Brasília time (UTC-3).
export function agoraSim(k: number, turno: Turno): Date {
  const [d, m, a] = DIA[turno].split("/").map(Number) as [number, number, number];
  const [hh, mm] = horaSim(k).split(":").map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1, d, hh + 3, mm, 20));
}

// FNV-1a: a stable number in [0, 1) for a text, so the same race always plays the same night.
export function hash(s: string, sal = 0): number {
  let h = 2166136261 ^ sal;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const suave = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

// ---- fictional names. One memory per simulation: the same real candidate, party or list gets the same fictional one in every file.
const NOMES = ["ANA", "BRUNO", "CARLA", "DANIEL", "ELISA", "FÁBIO", "GABRIELA", "HEITOR", "INÊS", "JONAS", "KARINA", "LEONEL", "MÁRCIA", "NELSON", "OLGA", "PAULO", "QUITÉRIA", "RAFAEL", "SÍLVIA", "TEODORO", "ÚRSULA", "VALTER", "WANDA", "XAVIER", "YARA", "ZECA", "BEATRIZ", "CAIO", "DORA", "ÉRICO"];
const SOBRENOMES = ["ALVORADA", "BRISAMAR", "CAMPOLIM", "DORNELAS", "ESTRELA", "FONSECA", "GIRASSOL", "HORIZONTE", "IPÊ", "JACARANDÁ", "LUAR", "MIRANTE", "NASCENTE", "ORVALHO", "PALMEIRA", "QUARESMA", "RIBEIRA", "SERENO", "TAQUARA", "URUCUM", "VERTENTE", "XISTO", "ZIMBRO", "AROEIRA", "BURITI", "CEDRO", "DUNAS", "ENSEADA", "FAROL", "GRAÚNA"];
const SIGLAS = ["AUR", "NOR", "VER", "PRA", "LIT", "CEN", "SOL", "MAR", "RIO", "SUL", "LUZ", "PAZ", "ELO", "FAR", "VIA", "ARO", "ONDA", "RAIZ", "TERRA", "LUME", "BRISA", "SERRA", "VALE", "PONTE", "RUMO", "NOVA", "ALVA", "CORAL", "CAMPO", "UNO", "PLENO", "FORTE", "LIVRE", "VIVA", "ÂMBAR", "ÍRIS", "ATLAS", "ALTO", "MAIS", "FIO"];

export interface Nomeador {
  candidato(chave: string): { id: string; nome: string };
  buscar(chave: string): string | null; // the fictional id already given to that key, without creating one
  partido(sigla: string): string;
  lista(nome: string): string;
}

export function criarNomeador(): Nomeador {
  const cands = new Map<string, { id: string; nome: string }>();
  const usados = new Set<string>();
  const siglas = new Map<string, string>();
  const tomadas = new Set<string>();
  const listas = new Map<string, string>();
  const partido = (sigla: string): string => {
    if (!sigla) return "";
    const ja = siglas.get(sigla);
    if (ja) return ja;
    let i = Math.floor(hash(sigla, 7) * SIGLAS.length), novo = "";
    for (let n = 0; n < SIGLAS.length && !novo; n++, i = (i + 1) % SIGLAS.length) if (!tomadas.has(SIGLAS[i]!)) novo = SIGLAS[i]!;
    novo ||= `P${siglas.size + 1}`;
    tomadas.add(novo);
    siglas.set(sigla, novo);
    return novo;
  };
  return {
    candidato(chave) {
      const ja = cands.get(chave);
      if (ja) return ja;
      let a = Math.floor(hash(chave, 1) * NOMES.length), b = Math.floor(hash(chave, 2) * SOBRENOMES.length), nome = "";
      for (let n = 0; n < NOMES.length * SOBRENOMES.length && !nome; n++) {
        const t = `${NOMES[a]} ${SOBRENOMES[b]}`;
        if (!usados.has(t)) nome = t;
        else { b = (b + 1) % SOBRENOMES.length; if (b === 0) a = (a + 1) % NOMES.length; }
      }
      nome ||= `CANDIDATURA ${cands.size + 1}`;
      usados.add(nome);
      const c = { id: `sim-${Math.floor(hash(chave, 3) * 1e9).toString(36)}-${cands.size}`, nome };
      cands.set(chave, c);
      return c;
    },
    buscar: (chave) => cands.get(chave)?.id ?? null,
    partido,
    // A list is a party alone ("PSD"), a composition ("PCDOB / PT / PV") or a named federation: each piece maps the same way everywhere,
    // so the national Chamber still adds a list up across the states.
    lista(nome) {
      if (!nome) return "";
      const ja = listas.get(nome);
      if (ja) return ja;
      const novo = nome.includes("/") ? nome.split("/").map((s) => partido(s.trim())).join(" / ")
        : /\s/.test(nome.trim()) ? `FEDERAÇÃO ${partido(`${nome}#a`)} ${partido(`${nome}#b`)}` : partido(nome);
      listas.set(nome, novo);
      return novo;
    },
  };
}

// The key of a candidate across files: the president's number is the same in every state, every other race is its own file.
export const chaveCand = (cargo: string, uf: string, num: string) => `${cargo}|${cargo === "Presidente" ? "BR" : uf}|${num}`;

// The final file with every name swapped. Situation texts stay (they are the TSE's words, now about fictional people).
export function anonimizar(d: Apuracao, cargo: string, uf: string, nomes: Nomeador): Apuracao {
  return {
    ...d,
    candidatos: d.candidatos.map((c) => {
      const f = nomes.candidato(chaveCand(cargo, uf, c.num));
      return { ...c, id: f.id, nome: f.nome, partido: nomes.partido(c.partido), lista: nomes.lista(c.lista) };
    }),
    partidos: d.partidos.map((p) => ({ ...p, nome: nomes.lista(p.nome) })),
  };
}

// How much of a file is in at step k: each file starts and ends at its own moment; the last step closes them all.
export function progresso(chave: string, k: number): number {
  if (k >= PASSOS - 1) return 1;
  const ini = Math.floor(hash(chave, 11) * 12), dur = 30 + Math.floor(hash(chave, 12) * 28); // ends by step 70 at the latest
  return suave((k - ini) / dur);
}

const faseDe = (s: Apuracao["secoes"], total: number): Apuracao["fase"] => (s.totalizadas === 0 && total === 0 ? "aguardando" : s.total > 0 && s.totalizadas >= s.total ? "concluida" : "parcial");

// The file at step k of the night. The early sections lean: each candidate's share is bent by a fixed factor that fades as the count
// advances, so an early leader can be passed. `situacao`: whether this file may carry the TSE's status texts once it is complete
// (a state slice of the presidential race never does; see the national sum).
export function parcial(final: Apuracao, chave: string, k: number, { situacao = true }: { situacao?: boolean } = {}): Apuracao {
  const q = progresso(chave, k);
  const sc = (x: number) => Math.round(x * q);
  const totalCand = final.candidatos.reduce((s, c) => s + c.votos, 0);
  const pesos = final.candidatos.map((c) => (totalCand > 0 ? c.votos / totalCand : 0) * Math.exp((hash(`${chave}|${c.num}`, 13) - 0.5) * 0.5 * (1 - q)));
  const somaPesos = pesos.reduce((s, x) => s + x, 0) || 1;
  const contados = Math.round(totalCand * q);
  const validos = sc(final.votos.validos);
  const fim = q >= 1;
  const candidatos: Candidato[] = final.candidatos.map((c, i) => {
    const votos = fim ? c.votos : Math.round((contados * pesos[i]!) / somaPesos);
    return { ...c, votos, pct: validos > 0 ? votos / validos : 0, destaque: fim && situacao ? c.destaque : false, situacao: fim && situacao ? c.situacao : "" };
  }).sort((a, b) => b.votos - a.votos);
  const secoes = { total: final.secoes.total, totalizadas: fim ? final.secoes.totalizadas : Math.floor(final.secoes.total * q) };
  const votos = { total: sc(final.votos.total), validos, brancos: sc(final.votos.brancos), nulos: sc(final.votos.nulos) };
  const e = final.eleitorado;
  return {
    ...final, candidatos, secoes, votos,
    eleitorado: { apto: e.apto, apurado: sc(e.apurado), comparecimento: sc(e.comparecimento), abstencao: sc(e.abstencao) },
    partidos: final.partidos.map((p) => ({ ...p, vagas: q > 0 ? p.vagas : 0 })),
    quociente: q > 0 ? final.quociente : null,
    fase: faseDe(secoes, votos.total),
  };
}

// A runoff file built from the 1st-round file of the same place: the two finalists' votes become the shares the runoff model gives
// (municipio-modelo.ts, the same kappa, eta and vote ratio as the Cidades view), the electorate and sections stay. `alpha` is the
// invented part: which way the eliminated voters lean in this simulated night, so the count has a deviation to reveal.
export function segundoTurno(t1: Apuracao, finalistas: readonly [string, string], p: Params, alpha = 0): Apuracao {
  const [ca, cb] = finalistas.map((id) => t1.candidatos.find((c) => c.id === id));
  const a = ca?.votos ?? 0, b = cb?.votos ?? 0;
  const v1 = t1.votos.validos;
  const so = v1 > 0 ? Math.max(0, v1 - a - b) / v1 : 0;
  const share = logistic(alpha + (p.kappa + p.eta * so) * logit((a + 0.5) / (a + b + 1)));
  const validos = Math.round(v1 * p.ratio);
  const va = Math.round(validos * share);
  const cands = [ca && { ...ca, votos: va }, cb && { ...cb, votos: validos - va }].filter((c): c is Candidato => !!c)
    .map((c) => ({ ...c, pct: validos > 0 ? c.votos / validos : 0, destaque: false, situacao: "" }))
    .sort((x, y) => y.votos - x.votos);
  const total = validos + t1.votos.brancos + t1.votos.nulos;
  return { ...t1, candidatos: cands, partidos: [], quociente: null, votos: { total, validos, brancos: t1.votos.brancos, nulos: t1.votos.nulos }, eleitorado: { ...t1.eleitorado, comparecimento: total, abstencao: Math.max(0, t1.eleitorado.apurado - total) } };
}

// The national presidential file as the sum of the state files (exterior included): the scoreboard and the map then agree at every step.
// Once every file is complete, the national status texts: above 50% of the valid votes is "Eleito", otherwise the two first go to a runoff.
export function somar(arquivos: Apuracao[], turno: Turno): Apuracao | null {
  const com = arquivos.filter(Boolean);
  if (!com.length) return null;
  const soma = new Map<string, Candidato>();
  const z = { secoes: { total: 0, totalizadas: 0 }, el: { apto: 0, apurado: 0, comparecimento: 0, abstencao: 0 }, v: { total: 0, validos: 0, brancos: 0, nulos: 0 } };
  for (const d of com) {
    z.secoes.total += d.secoes.total; z.secoes.totalizadas += d.secoes.totalizadas;
    z.el.apto += d.eleitorado.apto; z.el.apurado += d.eleitorado.apurado; z.el.comparecimento += d.eleitorado.comparecimento; z.el.abstencao += d.eleitorado.abstencao;
    z.v.total += d.votos.total; z.v.validos += d.votos.validos; z.v.brancos += d.votos.brancos; z.v.nulos += d.votos.nulos;
    for (const c of d.candidatos) { const x = soma.get(c.id); soma.set(c.id, x ? { ...x, votos: x.votos + c.votos } : { ...c, destaque: false, situacao: "" }); }
  }
  const fase = faseDe(z.secoes, z.v.total);
  const cands = [...soma.values()].map((c) => ({ ...c, pct: z.v.validos > 0 ? c.votos / z.v.validos : 0 })).sort((a, b) => b.votos - a.votos);
  if (fase === "concluida" && cands.length) {
    const eleito = cands[0]!.pct > 0.5 || turno === 2;
    cands.forEach((c, i) => { const s = eleito ? (i === 0 ? "Eleito" : "Não eleito") : i < 2 ? "2º turno" : "Não eleito"; c.situacao = s; c.destaque = s !== "Não eleito"; });
  }
  return { ...com[0]!, versao: com[0]!.versao, secoes: z.secoes, eleitorado: z.el, votos: z.v, candidatos: cands, partidos: [], quociente: null, fase };
}

// The lean of the eliminated voters in a simulated runoff: fixed per race (the president's is one for the whole country), up to
// about 6 p.p. of a close race either way.
export const alphaSim = (cargo: string, uf: string) => (hash(`${cargo}|${cargo === "Presidente" ? "BR" : uf}`, 21) - 0.5) * 0.5;

// Status texts of a complete runoff file that is a whole race (a governor's): the TSE marks the one ahead "Eleito".
export function marcarEleito(d: Apuracao): Apuracao {
  if (d.fase !== "concluida") return d;
  return { ...d, candidatos: d.candidatos.map((c, i) => ({ ...c, situacao: i === 0 ? "Eleito" : "Não eleito", destaque: i === 0 })) };
}

// Version stamp of step k, so the age of a file, the order of versions and the times in the list of updates read as on count night.
export const versionar = (d: Apuracao, k: number, turno: Turno): Apuracao => ({ ...d, versao: { data: DIA[turno], hora: horaSim(k) } });
