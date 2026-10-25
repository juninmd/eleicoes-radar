// Ao vivo, 2º turno do Presidente: the numbers behind four panels (poll values, the count in figures, the path to the lead, where the
// votes still to come are). Pure of the DOM and of the network. Everything is arithmetic on the TSE files and on the poll summary the
// build wrote; none of it names a winner. The model's chance and the Previsão stay in apuracao-chance.js and apuracao-previsao.js.
import { pesquisaDoPar } from "./apuracao-municipios.js";
import { parteDe, restanteDe } from "./apuracao-projecao.js";
import { avancoDe } from "./apuracao-nacional.js";
import type { Confronto } from "./apuracao-municipios.js";
import type { Apuracao, Candidato } from "./apuracao-tse.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { LadoPrev, Previsao } from "./apuracao-previsao.js";

// One registered poll of the runoff as expectativa.json carries it: percentages of all the people interviewed, undecided apart.
export interface PesquisaBruta { instituto: string; fim: string; amostra?: number | null; margem?: number | null; votos: Record<string, number>; indecisos?: number | null }
export interface Finalista { id: string; nome: string; partido: string }
export interface Par { a: Finalista; b: Finalista }

const finalista = (c: Candidato): Finalista => ({ id: c.id, nome: c.nome, partido: c.partido });
const fin = (x: number) => Number.isFinite(x);

// The two names of the runoff in a fixed order for the whole night: the one ahead in the poll average first (the order of two leaders
// flips with the count and a chart that flips with it cannot be read), else by id.
export function parDe(d: Apuracao | null | undefined, confrontos?: readonly Confronto[]): Par | null {
  const [x, y] = d?.candidatos ?? [];
  if (!x || !y || !x.id || !y.id || x.id === y.id) return null;
  const qa = pesquisaDoPar(confrontos, x.id, y.id);
  const troca = qa !== null ? qa < 0.5 : x.id > y.id;
  return troca ? { a: finalista(y), b: finalista(x) } : { a: finalista(x), b: finalista(y) };
}

export interface LinhaPesquisa { instituto: string; fim: string; amostra: number | null; margem: number | null; a: number; b: number; indecisos: number | null; qa: number }
export interface Pesquisas2T { linhas: LinhaPesquisa[]; media: number | null; nMedia: number | null; atual: number | null; dif: number | null; concluida: boolean }

// Poll values of the pair, newest first, one per institute. `qa` is the share of A among the valid votes of the two, the same base the
// count and the average use, so the dots, the line of the count and the average sit on one axis.
export function pesquisas2t(corrida: { segundoTurno?: readonly PesquisaBruta[]; confrontos?: readonly Confronto[] } | undefined, par: Par, d?: Apuracao | null): Pesquisas2T | null {
  const vistos = new Set<string>();
  const linhas: LinhaPesquisa[] = [];
  const ordem = [...(corrida?.segundoTurno ?? [])].sort((x, y) => (y.fim ?? "").localeCompare(x.fim ?? ""));
  for (const p of ordem) {
    const a = p.votos?.[par.a.id], b = p.votos?.[par.b.id];
    if (typeof a !== "number" || typeof b !== "number" || !fin(a) || !fin(b) || a + b <= 0 || vistos.has(p.instituto)) continue;
    vistos.add(p.instituto);
    linhas.push({ instituto: p.instituto, fim: p.fim, amostra: p.amostra ?? null, margem: p.margem ?? null, a, b, indecisos: p.indecisos ?? null, qa: a / (a + b) });
  }
  const media = pesquisaDoPar(corrida?.confrontos, par.a.id, par.b.id);
  const conf = corrida?.confrontos?.find((m) => (m.a === par.a.id && m.b === par.b.id) || (m.a === par.b.id && m.b === par.a.id));
  if (!linhas.length && media === null) return null;
  const va = d?.candidatos.find((c) => c.id === par.a.id)?.votos ?? 0, vb = d?.candidatos.find((c) => c.id === par.b.id)?.votos ?? 0;
  const atual = va + vb > 0 ? va / (va + vb) : null;
  return { linhas, media, nMedia: conf?.n ?? null, atual, dif: atual !== null && media !== null ? atual - media : null, concluida: d?.fase === "concluida" };
}

// The axis of the poll chart: centred on 50%, wide enough for every dot and for the count, never narrower than ±4 p.p.
export function dominio2t(p: Pesquisas2T): [number, number] {
  const v = [...p.linhas.map((l) => l.qa), p.media, p.atual].filter((x): x is number => typeof x === "number" && fin(x));
  const meia = Math.min(0.5, Math.max(0.04, Math.ceil((Math.max(0, ...v.map((x) => Math.abs(x - 0.5))) + 0.01) / 0.01) * 0.01));
  return [0.5 - meia, 0.5 + meia];
}

// The path to the lead: what the one behind needs from the votes still to come, set next to what he has so far and to what the model
// expects. `precisa` above 100% is not shown as a number (`alcancavel`): the count would have to be impossible.
export interface Caminho { atras: LadoPrev; frente: LadoPrev; tem: number; precisa: number; alcancavel: boolean; esperado: number | null; faltam: number; apurados: number }
export function caminho(p: Previsao | null | undefined): Caminho | null {
  if (!p || p.turno !== 2 || !(p.faltam > 0) || !(p.apurados > 0)) return null;
  const { favorito: f, outro: o } = p;
  if (f.apuracao === null || o.apuracao === null || f.apuracao === o.apuracao) return null;
  const [frente, atras] = f.apuracao > o.apuracao ? [f, o] : [o, f];
  const V = p.apurados, F = p.faltam, tem = atras.apuracao!;
  const precisa = (0.5 * (V + F) - V * tem) / F;
  // The model's median of the final share, turned back into the share of the votes to come: (V + F) x final = V x tem + F x resto.
  const resto = ((V + F) * atras.mc[1] - V * tem) / F;
  return { atras, frente, tem, precisa, alcancavel: precisa <= 1, esperado: fin(resto) ? Math.min(1, Math.max(0, resto)) : null, faltam: F, apurados: V };
}

// The count in figures, from the file of the race.
export interface Numeros {
  diferenca: number; lider: Candidato | null; validos: number; brancos: number; nulos: number; // votes; brancos and nulos as a share of the votes cast
  brancosPct: number; nulosPct: number; abstencaoPct: number; comparecimentoPct: number; secoesFaltam: number; avanco: number; concluida: boolean;
  candidatos: number; // 2 in a runoff; more in a 1st round, where the valid votes are not "of the two"
}
export function numeros(d: Apuracao | null | undefined): Numeros | null {
  if (!d || d.fase === "aguardando" || !(d.votos.total > 0)) return null;
  const [x, y] = d.candidatos;
  const ap = d.eleitorado.apurado;
  return {
    diferenca: x && y ? x.votos - y.votos : 0, lider: x && x.votos > (y?.votos ?? 0) ? x : null,
    validos: d.votos.validos, brancos: d.votos.brancos, nulos: d.votos.nulos,
    brancosPct: d.votos.brancos / d.votos.total, nulosPct: d.votos.nulos / d.votos.total,
    abstencaoPct: ap > 0 ? d.eleitorado.abstencao / ap : 0, comparecimentoPct: ap > 0 ? d.eleitorado.comparecimento / ap : 0,
    secoesFaltam: Math.max(0, d.secoes.total - d.secoes.totalizadas), avanco: avancoDe(d.secoes), concluida: d.fase === "concluida",
    candidatos: d.candidatos.length,
  };
}

// Where the valid votes still to come are, by state. A state with votes has its own estimate (same turnout and same share of valid
// votes as its sections already in, the Projeção's formula); one without votes yet falls back to what the model expects, when given.
// `situacao` says why a place has no leader: its file has no votes yet, has not been read yet, does not exist, or failed.
export type SituacaoFalta = "contando" | "aguardando" | "carregando" | "sem-arquivo" | "erro";
export interface LinhaFalta { uf: string; faltam: number; avanco: number | null; lider: Candidato | null; segundo: Candidato | null; margem: number | null; defasada: boolean; estimado: boolean; situacao: SituacaoFalta }
// `pronto`: the feed has finished a first cycle, so a place without a file is a fact and not just a request still in flight.
export interface OndeFalta { linhas: LinhaFalta[]; total: number; aguardando: number; defasadas: string[]; pronto: boolean; placar: { id: string; n: number }[] }
const semVotos = (s: BrasilSnapshot["ufs"][string]): SituacaoFalta => (s.dados ? "aguardando" : s.status === "ausente" ? "sem-arquivo" : s.status === "erro" ? "erro" : s.status === "carregando" ? "carregando" : "aguardando");
export function ondeFalta(nac: BrasilSnapshot | null | undefined, esperado: Readonly<Record<string, number>> = {}): OndeFalta | null {
  const ufs = Object.entries(nac?.ufs ?? {});
  if (!nac || !ufs.length) return null;
  const linhas = ufs.map(([uf, u]): LinhaFalta => {
    const d = u.dados;
    const contou = !!d && d.fase !== "aguardando" && (d.candidatos[0]?.votos ?? 0) > 0;
    const defasada = u.status === "erro" || u.status === "ausente";
    if (!d || !contou) return { uf, faltam: Math.max(0, esperado[uf] ?? 0), avanco: d ? avancoDe(d.secoes) : null, lider: null, segundo: null, margem: null, defasada, estimado: true, situacao: semVotos(u) };
    const [x, y] = d.candidatos;
    return { uf, faltam: restanteDe(parteDe(uf, d)), avanco: avancoDe(d.secoes), lider: x ?? null, segundo: y ?? null, margem: x && y ? x.pct - y.pct : null, defasada, estimado: false, situacao: "contando" };
  }).sort((x, y) => y.faltam - x.faltam || x.uf.localeCompare(y.uf));
  const por = new Map<string, number>();
  for (const l of linhas) if (l.lider) por.set(l.lider.id, (por.get(l.lider.id) ?? 0) + 1);
  return {
    linhas, total: linhas.reduce((s, l) => s + l.faltam, 0), aguardando: linhas.filter((l) => !l.lider).length,
    defasadas: linhas.filter((l) => l.defasada).map((l) => l.uf), pronto: nac.ciclo >= 1,
    placar: [...por].map(([id, n]) => ({ id, n })).sort((x, y) => y.n - x.n || x.id.localeCompare(y.id)),
  };
}
