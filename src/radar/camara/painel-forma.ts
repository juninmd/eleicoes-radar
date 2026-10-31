// Pure shaping of the Câmara API answers into the compact painel.json. No network here: painel.ts fetches, this file only reshapes (and is tested).
import { VOTOS } from "./painel-tipos.js";
import type { EventoPauta, ItemPauta, PropRef, Proposicao, VotacaoCamara } from "./painel-tipos.js";

export const NOMINAL = /Sim: \d+/; // a roll call lists its totals in the description; a symbolic vote has none and `votos` is empty
export const ARTIGO_17 = "Artigo 17"; // the presiding deputy's vote: not counted as a position
const TIPOS_PROJETO = new Set(["PL", "PLP", "PEC", "PDL", "MPV", "PLN", "PLV"]);

export function indiceVoto(tipo: string): number {
  const i = VOTOS.findIndex((v) => v === tipo);
  return i >= 0 && i < 4 ? i : 4;
}

export interface Dicionario {
  deputados: Map<number, number>;
  lista: [number, string, string][];
  partidos: Map<string, number>;
  siglas: string[];
}
export const novoDicionario = (): Dicionario => ({ deputados: new Map(), lista: [], partidos: new Map(), siglas: [] });
export function idxDeputado(d: Dicionario, id: number, nome: string, uf: string): number {
  let i = d.deputados.get(id);
  if (i === undefined) { i = d.lista.length; d.deputados.set(id, i); d.lista.push([id, nome, uf]); }
  return i;
}
export function idxPartido(d: Dicionario, sigla: string): number {
  let i = d.partidos.get(sigla);
  if (i === undefined) { i = d.siglas.length; d.partidos.set(sigla, i); d.siglas.push(sigla); }
  return i;
}

export interface VotoApi { tipoVoto: string; deputado_: { id: number; nome: string; siglaPartido: string; siglaUf: string } }
export interface OrientApi { codTipoLideranca: string; siglaPartidoBloco: string; orientacaoVoto: string }
export interface AfetadaApi { id: number; siglaTipo: string; numero: number | string; ano: number | string; ementa: string }
export interface VotacaoApi { id: string; data: string; descricao: string; aprovacao?: number | string | null; proposicoesAfetadas?: AfetadaApi[] | null }

const um = (s: string) => s.replace(/\s+/g, " ").trim();

// The proposition a roll call is about: the first "project" among those it affects, otherwise the first of any kind.
export function propDaVotacao(afetadas: AfetadaApi[] | null | undefined): PropRef | null {
  const l = afetadas ?? [];
  const p = l.find((a) => TIPOS_PROJETO.has(a.siglaTipo)) ?? l[0];
  return p ? { sigla: p.siglaTipo, numero: String(p.numero), ano: String(p.ano), ementa: um(p.ementa ?? ""), id: p.id } : null;
}

export function formarVotacao(det: VotacaoApi, votos: VotoApi[], orient: OrientApi[], dic: Dicionario): VotacaoCamara | null {
  const validos = votos.filter((v) => v.tipoVoto !== ARTIGO_17);
  if (!validos.length) return null;
  return {
    id: det.id,
    data: det.data,
    descricao: um(det.descricao),
    aprovada: det.aprovacao === undefined || det.aprovacao === null ? null : String(det.aprovacao) === "1",
    prop: propDaVotacao(det.proposicoesAfetadas),
    orient: orient.map((o) => [o.codTipoLideranca, o.siglaPartidoBloco, o.orientacaoVoto ?? ""]),
    votos: validos.map((v) => [idxDeputado(dic, v.deputado_.id, v.deputado_.nome, v.deputado_.siglaUf), idxPartido(dic, v.deputado_.siglaPartido), indiceVoto(v.tipoVoto)]),
  };
}

export interface EventoApi {
  id: number; dataHoraInicio: string; dataHoraFim?: string | null; situacao?: string | null; descricaoTipo?: string | null; descricao?: string | null;
  localExterno?: string | null; localCamara?: { nome?: string | null } | null; orgaos?: { sigla: string; nome: string }[] | null;
}
export interface PautaApi {
  ordem: number; topico?: string | null; regime?: string | null; titulo?: string | null; textoParecer?: string | null;
  proposicao_?: { ementa?: string | null } | null; relator?: { nome: string; siglaPartido?: string | null; siglaUf?: string | null } | null;
}
export function formarEvento(e: EventoApi, pauta: PautaApi[]): EventoPauta {
  const itens: ItemPauta[] = pauta.map((i) => ({
    ordem: i.ordem, topico: i.topico ?? "", regime: i.regime ?? "", titulo: i.titulo ?? "",
    ementa: um(i.proposicao_?.ementa ?? "").slice(0, 400), parecer: um(i.textoParecer ?? "").slice(0, 300),
    relator: i.relator ? { nome: i.relator.nome, partido: i.relator.siglaPartido ?? "", uf: i.relator.siglaUf ?? "" } : null,
  }));
  return {
    id: e.id, inicio: e.dataHoraInicio, fim: e.dataHoraFim ?? null, situacao: e.situacao ?? "", tipo: e.descricaoTipo ?? "",
    descricao: um(e.descricao ?? ""), local: e.localExterno ?? e.localCamara?.nome ?? "",
    orgaos: (e.orgaos ?? []).map((o) => ({ sigla: o.sigla, nome: o.nome })), pauta: itens,
  };
}

export interface ProposicaoApi { id: number | string; siglaTipo: string; numero: number | string; ano: number | string; descricaoTipo: string; ementa: string; dataApresentacao: string; urlInteiroTeor?: string | null }
export interface TramApi { dataHora: string; siglaOrgao: string; descricaoTramitacao: string; descricaoSituacao?: string | null; regime?: string | null; despacho?: string | null }
export function formarProposicao(p: ProposicaoApi, tram: TramApi[], autores: { nome: string; tipo?: string | null }[], temas: { tema: string }[]): Proposicao {
  return {
    id: Number(p.id), titulo: `${p.siglaTipo} ${p.numero}/${p.ano}`, tipo: p.descricaoTipo, ementa: um(p.ementa ?? ""), apresentacao: p.dataApresentacao.slice(0, 10),
    inteiroTeor: p.urlInteiroTeor && /^https:\/\/www\.camara\.leg\.br\//.test(p.urlInteiroTeor) ? p.urlInteiroTeor : null, // only the Câmara's own host becomes a link
    autores: autores.map((a) => ({ nome: a.nome, tipo: a.tipo ?? "" })),
    temas: temas.map((t) => t.tema),
    tram: tram.map((t) => [t.dataHora.slice(0, 10), t.siglaOrgao, t.descricaoTramitacao, t.descricaoSituacao ?? "", t.regime ?? "", um(t.despacho ?? "").slice(0, 240)]),
  };
}
