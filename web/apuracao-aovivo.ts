// "Ao vivo": every race of the voter's ballot at once (President, Governor, Senator and the deputies of the chosen state), each one
// with its own TSE file, plus one timeline of who has been elected across all of them. It reads the same files as the Apuração tab and
// adds no arithmetic of its own beyond what apuracao-eleito.js already proves; the TSE's text wins everywhere. In memory only.
import { h, int, pct, titleName } from "./format.js";
import { createFeed } from "./apuracao-feed.js";
import { createBrasilFeed, EXTERIOR, ufsDo } from "./apuracao-uf.js";
import { tseUrl, TSE_BASE, TEM_SEGUNDO_TURNO, turnoDe } from "./apuracao-tse.js";
import { gravarTurno, lerTurno, seletorTurno } from "./apuracao-turno.js";
import { createCores, fixarCores, linhasUf } from "./apuracao-nacional.js";
import { PALETA, RESTO, legenda, mapaSvg } from "./apuracao-mapa.js";
import type { UfMap } from "../src/radar/geo/uf-map";
import { renderDuelo } from "./apuracao-duelo.js";
import { criarSom } from "./apuracao-som.js";
import { evolucao, registrar } from "./apuracao-graficos.js";
import { comparar } from "./apuracao-pesquisa.js";
import { decididos, eleitoTse } from "./apuracao-eleito.js";
import { atualizar, vazio } from "./apuracao-eleitos.js";
import { idadeTxt, pausaDoTse } from "./apuracao-ritmo.js";
import { repaint, relogio, idade, semRelogio } from "./apuracao-dom.js";
import { avancoDe } from "./apuracao-nacional.js";
import { observar, renderNoticias, vazio as vazioNoticias } from "./apuracao-aovivo-noticias.js";
import type { Noticia } from "./apuracao-aovivo-noticias.js";
import { consolidar, renderConsolidado } from "./apuracao-consolidado.js";
import { criarNoite } from "./apuracao-noite.js";
import { criarSocial } from "./social.js";
import { movimentoReduzido } from "./apuracao-fx.js";
import { createProjecao } from "./apuracao-projecao-estado.js";
import { createChance } from "./apuracao-chance.js";
import { chanceProps, criarMunicipais, exteriorProps } from "./apuracao-mount-props.js";
import { deChance, deProjecao, registrarPrev } from "./apuracao-previsao.js";
import { renderPrevisao } from "./apuracao-previsao-view.js";
import { caminho, numeros, onda, ondeFalta, parDe, pesquisas2t } from "./apuracao-aovivo-2t.js";
import { renderCaminho, renderFinalistas, renderNumeros, renderOnda, renderOndeFalta, renderPesquisas2t } from "./apuracao-aovivo-2t-view.js";
import type { Caminho, Numeros, Onda, OndeFalta, Par, Pesquisas2T } from "./apuracao-aovivo-2t.js";
import type { Apuracao, Candidato, Cargo, Fase, Turno } from "./apuracao-tse.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Cores } from "./apuracao-nacional.js";
import type { Esperado, Ponto } from "./apuracao-graficos.js";
import type { Prev } from "../src/radar/expectativa";
import type { FeedSnapshot } from "./apuracao-feed.js";
import type { EstadoEleitos } from "./apuracao-eleitos.js";
import type { Fonte } from "./apuracao-projecao-estado.js";
import type { PrevProps } from "./apuracao-previsao-view.js";
import type { PontoPrev } from "./apuracao-previsao.js";
import type { MundoMap } from "./apuracao-noite.js";
import type { Candidatura } from "./types.js";
import type { RenderProps } from "./apuracao.js";

export interface Corrida { cargo: Cargo; uf: string }
export interface Linha extends Corrida { snap: FeedSnapshot | null; eleitos: EstadoEleitos }

const FASES: Record<Fase, string> = { aguardando: "Aguardando", parcial: "Em andamento", concluida: "Concluída" };
const proporcional = (c: Cargo) => /^Deputado/.test(c);
const MAX_LINHA = 20;

// Fixed texts now live in balloons; the screen itself keeps the live numbers.
const DICA_TURNO = "1º turno em 04/10/2026 · 2º turno em 25/10/2026. Presidente e governador podem ter 2º turno; senador e deputados foram decididos no 1º.";
const DICA_ATUALIZA = "Atualiza sozinho a cada 30 s a 2 min, conforme o ritmo do TSE, enquanto você estiver nesta aba.";
const DICA_MEDIA = "Média das seções totalizadas nas disputas abertas. Cada arquivo do TSE é de um horário.";
const DICA_MAPA = "Clique num estado para filtrar a tela. No Exterior, os votos de fora aparecem somados; as cidades são as do 1º turno. Arraste para mover e use a rolagem, os botões ou a pinça para ampliar. A cor é a do partido de quem está à frente no estado; quanto mais forte, maior a diferença para o segundo. Cinza: ainda sem arquivo. No cartograma todos os estados têm o mesmo tamanho.";
const DICA_FONTE = "Fonte: resultados.tse.jus.br. Nada fica guardado ao fechar a aba. Fotos seguem a opção Mostrar fotos. Só o texto do TSE diz quem foi eleito; “Matematicamente eleito” é uma conta do Radar sobre os números do TSE.";

// The races of one state besides the President's (the hero of the tab). The Federal District has no state deputies: it elects district ones.
export const corridasDe = (uf: string): Corrida[] => [
  { cargo: "Governador", uf }, { cargo: "Senador", uf }, { cargo: "Deputado Federal", uf },
  { cargo: uf === "DF" ? "Deputado Distrital" : "Deputado Estadual", uf },
];

// What the filter can pick: the whole country, every state side by side, one state, or the votes cast abroad.
export const BRASIL = "BR";
export const TODOS = "TODOS";
export const nomeEscopo = (e: string) => (e === BRASIL ? "Brasil" : e === TODOS ? "Todos os estados" : e === EXTERIOR ? "Exterior" : e);

const pctSecoes = ({ totalizadas, total }: Apuracao["secoes"]) => pct(total > 0 ? (totalizadas >= total ? 1 : Math.floor((totalizadas / total) * 1000) / 1000) : 0, 1);

function topo(d: Apuracao, cargo: Cargo, uf: string): string {
  const dec = decididos(d, cargo, uf);
  const lista = d.candidatos.slice(0, 3).map((c, i) => {
    const marca = eleitoTse(c) ? `<span class="rot alta">${h(c.situacao)}</span>` : dec.has(c.id) && !c.situacao ? `<span class="rot alta mat">Matematicamente eleito(a) <small>(conta do Radar)</small></span>` : c.situacao ? `<span class="rot baixa">${h(c.situacao)}</span>` : "";
    return `<li><span class="live-nome"><b>${h(titleName(c.nome))}</b> <small>${h(c.partido)}</small> ${marca}</span>
      <span class="live-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, c.pct * 100))}%;${i === 0 ? "" : "opacity:.65"}"></i></span><b class="live-pct">${pct(c.pct, 1)}</b></li>`;
  });
  return `<ol class="live-top">${lista.join("")}</ol>`;
}

function resumo(d: Apuracao, cargo: Cargo): string {
  const [a, b] = d.candidatos;
  if (proporcional(cargo)) {
    const n = d.candidatos.filter(eleitoTse).length;
    return `<b>${int(n)}</b> de ${int(d.cargo.vagas)} ${d.cargo.vagas === 1 ? "vaga" : "vagas"} com situação de eleito no TSE.`;
  }
  if (!a?.votos) return "";
  if (d.cargo.vagas > 1) return `${int(d.cargo.vagas)} vagas: os mais votados até agora.`;
  return b ? `Diferença de <b>${((a.pct - b.pct) * 100).toFixed(1).replace(".", ",")} p.p.</b> entre os dois primeiros${a.pct < 0.5 ? `; faltam ${((0.5 - a.pct) * 100).toFixed(1).replace(".", ",")} p.p. para o 1º chegar a 50%` : ""}.` : "";
}

// `segundos` = "cargo|uf" of the runoffs that exist (the municipal index), null while it is not loaded: only then is a missing file known to
// mean "decided in the 1st round" instead of "not published yet".
function card({ cargo, uf, snap, eleitos }: Linha, turno: Turno = 1, segundos: ReadonlySet<string> | null = null): string {
  const t = turnoDe(cargo, turno);
  const d = snap?.dados;
  const local = uf === "BR" ? "Brasil" : uf;
  const chave = `${cargo}|${uf}`;
  const abrir = `<button type="button" class="ghost live-abrir" data-abrir-corrida="${h(chave)}">Abrir a apuração</button>`;
  if (!d) {
    const semSegundo = t === 2 && !!segundos && !segundos.has(chave);
    const msg = snap?.status === "ausente" && semSegundo ? "Não houve 2º turno nesta disputa: ela foi decidida no 1º turno." : snap?.status === "ausente" ? `O TSE ainda não publicou o arquivo desta disputa.${t === 2 ? " Se não houve 2º turno nela, o arquivo não existe." : ""}` : snap?.status === "erro" ? `Não foi possível consultar o TSE: ${h(snap.erro)}.` : "Consultando o TSE…";
    return `<article class="live-card" aria-label="${h(cargo)} ${h(local)}"><header><h3>${h(cargo)} <small>${h(local)}${t === 2 ? " · 2º turno" : ""}</small></h3></header><p class="muted small">${msg}</p>${abrir}</article>`;
  }
  const velha = snap!.status === "erro" || snap!.status === "ausente";
  const tse = eleitos.itens.filter((e) => e.tipo === "tse").length;
  return `<article class="live-card" aria-label="${h(cargo)} ${h(local)}">
    <header><h3>${h(cargo)} <small>${h(local)}${t === 2 ? " · 2º turno" : ""}</small></h3><span class="rot ${d.fase === "parcial" ? "aberta" : d.fase === "concluida" ? "alta" : "baixa"}">${FASES[d.fase]}</span></header>
    ${velha ? `<p class="apu-aviso small"><b>Números desatualizados:</b> o TSE não entregou o arquivo agora; vale o último recebido.</p>` : ""}
    <progress class="apu-prog" max="${d.secoes.total || 1}" value="${d.secoes.totalizadas}" aria-label="Seções totalizadas">${pctSecoes(d.secoes)}</progress>
    <p class="exp-meta"><b>${pctSecoes(d.secoes)}</b> das seções · arquivo de ${h(d.versao.hora.slice(0, 5))}</p>
    ${d.fase === "aguardando" ? `<p class="muted small">A apuração ainda não começou nesta disputa.</p>` : `${topo(d, cargo, uf)}<p class="live-res">${resumo(d, cargo)}</p>`}
    ${tse ? `<p class="small"><b>${int(tse)}</b> ${tse === 1 ? "candidato marcado" : "candidatos marcados"} "Eleito" pelo TSE.</p>` : ""}
    ${abrir}</article>`;
}

// One timeline across the races: newest first, by the file's epoch (an "HH:MM" text sort breaks after midnight).
function linhaGeral(linhas: Linha[]): string {
  const itens = linhas.flatMap((l) => l.eleitos.itens.map((e) => ({ ...e, onde: `${l.cargo}${l.uf === "BR" ? "" : ` · ${l.uf}`}` })));
  itens.sort((a, b) => (b.t || 0) - (a.t || 0));
  if (!itens.length) return `<p class="empty">Ninguém tem situação de eleito ainda em nenhuma disputa. Esta linha preenche sozinha a cada arquivo novo do TSE.</p>`;
  return `<ol class="apu-linha" aria-label="Quem foi eleito, do mais recente ao mais antigo">${itens.slice(0, MAX_LINHA).map((e) => `<li class="${e.tipo}"><time>${h(e.hora)}</time>
    <span><b>${h(titleName(e.nome))}</b> <small>${h(e.partido)} · ${h(e.onde)}</small>
    <em>${e.tipo === "tse" ? 'O TSE marcou "Eleito"' : "Matematicamente eleito (conta do Radar, não é a marcação do TSE)"}${e.ja ? " · já constava quando você abriu a aba" : ""} · com ${pct(Math.floor(e.avanco * 1000) / 1000, 1)} das seções</em></span></li>`).join("")}</ol>
    ${itens.length > MAX_LINHA ? `<p class="muted small">Mostrando as ${MAX_LINHA} mais recentes de ${int(itens.length)}.</p>` : ""}`;
}

// Visual effects of the head-to-head (lightning, entrance, K.O.). `intro`: the first drawing after the tab opens, the only one that plays
// the entrance; `ko`: the one drawing that plays the K.O. (later drawings show its end state, so a redraw never replays it).
export interface Efeitos { ligado: boolean; intro: boolean; ko: boolean; som?: boolean }
export const EFEITOS_PADRAO: Efeitos = { ligado: true, intro: false, ko: false, som: true };

// The K.O. is the TSE's own word turned into a show: only when the TSE marks one of the two leaders "Eleito" and not the other.
export function disputaDecidida(d: Apuracao | null | undefined): { eleito: Candidato; derrotado: Candidato } | null {
  const [a, b] = d?.candidatos ?? [];
  if (!a || !b) return null;
  const e = [a, b].find(eleitoTse);
  const o = e === a ? b : a;
  return e && !eleitoTse(o) ? { eleito: e, derrotado: o } : null;
}

export type Avatar = (c: { id: string; nome: string }, size: string) => string;
export interface Hero { uf: string; snap: FeedSnapshot | null; hist: Ponto[]; eleitos: EstadoEleitos }
const CARGOS_TODOS = ["Presidente", "Governador", "Senador"] as const;
const cargosDe = (turno: Turno) => CARGOS_TODOS.filter((c) => turno === 1 || TEM_SEGUNDO_TURNO.has(c));
const curto = (nome: string) => titleName(nome).split(" ").slice(0, 2).join(" ");

// The President's race as a head-to-head: the two leaders side by side with their photos (when the reader keeps photos on), the
// 50% bar and the curve of the count. Everything is the TSE's own numbers; a "Eleito" mark is the TSE's text, shown as it is.
// How far the count is from the poll average, in points: above or below, in words as well as in sign (colour alone says nothing to everyone).
export function difPesquisa(atual: number, media: number): string {
  const d = (atual - media) * 100;
  if (!Number.isFinite(d) || Math.abs(d) < 0.05) return ` <span class="live-dif">igual à pesquisa</span>`;
  return ` <span class="live-dif ${d > 0 ? "acima" : "abaixo"}"><b>${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1).replace(".", ",")} p.p.</b> ${d > 0 ? "acima" : "abaixo"} da pesquisa</span>`;
}
function lado(c: Candidato, cls: string, avatar: Avatar, cor: Cores, esp?: Esperado, fase?: Fase, derrotado = false): string {
  const marca = eleitoTse(c) ? `<span class="rot alta">${h(c.situacao)}</span>` : c.situacao ? `<span class="rot baixa">${h(c.situacao)}</span>` : "";
  return `<div class="live-side ${cls}${eleitoTse(c) ? " eleito" : ""}${derrotado ? " derrotado" : ""}" style="--lado:${cor(c.partido)}"><div class="live-foto">${avatar({ id: c.id, nome: c.nome }, "lg")}${derrotado ? `<span class="live-selo-ko" aria-hidden="true">K.O.</span>` : ""}${cls.includes("lead") ? `<span class="live-lead">${fase === "concluida" ? "mais votado" : "à frente agora"}</span>` : ""}</div>
    <b class="live-side-nome">${h(titleName(c.nome))}</b><small>${h(c.partido)} · ${h(c.num)}</small>
    <span class="live-big">${pct(c.pct, 1)}</span><span class="live-side-votos">${int(c.votos)} votos</span>${esp ? `<span class="live-side-esp">expectativa (pesquisas): <b>${pct(esp.media, 1)}</b>${difPesquisa(c.pct, esp.media)}</span>` : ""}${marca}</div>`;
}

// The TSE's own mark: the text is the TSE's, the Radar only puts it where it is seen first.
const faixaEleito = (d: Apuracao) => {
  const e = d.candidatos.filter(eleitoTse);
  return e.length ? `<p class="live-eleito" role="status"><b>O TSE marcou "${h(e[0].situacao)}":</b> ${e.map((c) => `${h(titleName(c.nome))} (${h(c.partido)})`).join(" e ")}.</p>` : "";
};

// Same cut as the "turn" events of the map (AVANCO_MINIMO): the first urns come from a few places and the board still swings.
export const contagemInicial = ({ totalizadas, total }: Apuracao["secoes"]): boolean => total > 0 && totalizadas / total < 0.1;

export function renderHero({ hero, avatar, cor, esperado = {}, fx = EFEITOS_PADRAO, turno = 1 }: { hero: Hero; avatar: Avatar; cor: Cores; esperado?: Record<string, Esperado>; fx?: Efeitos; turno?: Turno }): string {
  const d = hero.snap?.dados;
  const onde = hero.uf === BRASIL ? "Brasil" : hero.uf === EXTERIOR ? "Exterior" : hero.uf;
  const topo = (fase: string) => `<header><h3>Presidente <small>${h(onde)}${turno === 2 ? " · 2º turno" : ""}</small></h3>${fase}</header>`;
  if (!d) {
    const msg = hero.snap?.status === "ausente" ? `O TSE ainda não publicou o arquivo desta disputa${turno === 2 ? " (o 2º turno só existe se ninguém passou de 50% no 1º)" : ""}.` : hero.snap?.status === "erro" ? `Não foi possível consultar o TSE: ${h(hero.snap.erro)}.` : "Consultando o TSE…";
    return `<section class="live-hero" aria-label="Presidente ${h(onde)}">${topo("")}<p class="muted small">${msg}</p></section>`;
  }
  const fase = `<span class="rot ${d.fase === "parcial" ? "aberta" : d.fase === "concluida" ? "alta" : "baixa"}">${FASES[d.fase]}</span>`;
  const velha = hero.snap!.status === "erro" || hero.snap!.status === "ausente";
  const [a, b] = d.candidatos;
  const base = `${velha ? `<p class="apu-aviso small"><b>Números desatualizados:</b> o TSE não entregou o arquivo agora; vale o último recebido.</p>` : ""}
    <progress class="apu-prog" max="${d.secoes.total || 1}" value="${d.secoes.totalizadas}" aria-label="Seções totalizadas">${pctSecoes(d.secoes)}</progress>
    <p class="exp-meta"><b>${int(d.secoes.totalizadas)} de ${int(d.secoes.total)} seções (${pctSecoes(d.secoes)})</b> · arquivo de ${h(d.versao.hora.slice(0, 5))}</p>`;
  if (d.fase === "aguardando" || !(d.secoes.totalizadas > 0) || !a || !b || !(a.votos > 0)) return `<section class="live-hero" aria-label="Presidente ${h(onde)}">${topo(fase)}${base}<p class="muted small">A apuração ainda não começou nesta disputa.</p></section>`;
  const dif = (a.pct - b.pct) * 100;
  const quem = Object.fromEntries([a, b].map((c) => [c.id, { nome: c.nome, partido: c.partido }]));
  // Both curves, even when the leader changes: the chart follows the two first of the last file.
  const hist2 = hero.hist.map((p) => ({ ...p, pcts: Object.fromEntries(Object.entries(p.pcts).filter(([id]) => id in quem)) }));
  const fim = disputaDecidida(d);
  const classe = ["live-hero", fx.ligado ? "" : "sem-fx", fx.intro ? "intro" : "", fim ? "decidida" : "", fim && fx.ko ? "ko-toca" : ""].filter(Boolean).join(" ");
  // Lightning between the two portraits; the closer the count, the faster they strike.
  const ritmo = (0.7 + Math.min(Math.abs(dif), 20) * 0.12).toFixed(2);
  const raios = `<div class="live-raios" aria-hidden="true" style="--raio-dur:${ritmo}s"><svg viewBox="0 0 300 120" preserveAspectRatio="none">
      <defs><linearGradient id="raio-g" x1="0" x2="1"><stop offset="0" stop-color="${cor(a.partido)}"/><stop offset="0.5" stop-color="#fff"/><stop offset="1" stop-color="${cor(b.partido)}"/></linearGradient></defs>
      <polyline class="raio r1" points="0,62 34,34 58,78 92,26 120,84 154,30 186,80 220,36 250,72 300,58"/>
      <polyline class="raio r2" points="0,48 28,70 64,38 96,88 130,44 166,82 198,34 232,76 264,40 300,64"/>
      <polyline class="raio r3" points="0,70 40,50 70,92 108,40 140,70 176,28 208,66 244,44 300,52"/></svg></div>`;
  // Compact strip (sticky on phones): both leaders, their shares and the split bar stay in view while the page scrolls.
  const pa = Math.max(0, Math.min(100, (a.pct / ((a.pct + b.pct) || 1)) * 100));
  const mini = (c: Candidato, cls: string) => `<span class="live-mini ${cls}" style="--lado:${cor(c.partido)}">${avatar({ id: c.id, nome: c.nome }, "sm")}<span class="live-mini-t"><b>${h(curto(c.nome))}</b><span>${pct(c.pct, 1)}</span></span></span>`;
  const barra = `<div class="live-barra" aria-hidden="true">${mini(a, "a")}<span class="live-barra-bar"><i style="width:${pa.toFixed(1)}%;background:${cor(a.partido)}"></i><i style="width:${(100 - pa).toFixed(1)}%;background:${cor(b.partido)}"></i></span>${mini(b, "b")}</div>`;
  const inicio = contagemInicial(d.secoes) ? `<p class="apu-aviso small"><b>Começo da contagem:</b> com ${pctSecoes(d.secoes)} das seções o placar ainda não representa o país (as urnas chegam fora de ordem) e deve mudar bastante.</p>` : "";
  return `<section class="${classe}" aria-label="Presidente ${h(onde)}">${topo(fase)}${base}
    ${barra}
    ${inicio}
    ${faixaEleito(d)}
    <div class="live-duel" style="--ca:${cor(a.partido)};--cb:${cor(b.partido)}">${raios}${lado(a, a.pct > b.pct ? "a lead" : "a", avatar, cor, esperado[a.id], d.fase, fim?.derrotado === a)}
      <div class="live-vs" aria-hidden="true"><span class="live-vs-x">VS</span><b>${dif.toFixed(1).replace(".", ",")}</b><small>p.p. de diferença</small></div>
      ${lado(b, "b", avatar, cor, esperado[b.id], d.fase, fim?.derrotado === b)}</div>
    <p class="sr">Diferença de ${dif.toFixed(1).replace(".", ",")} pontos percentuais entre os dois primeiros.</p>
    ${renderDuelo({ d, cargo: "Presidente", uf: hero.uf, cor, rotulos: true, pesquisa: Object.fromEntries(Object.entries(esperado).map(([id, e]) => [id, e.media])) })}
    <h4>Curva da apuração <small>os dois primeiros, desde que você abriu a aba</small></h4>
    ${evolucao(hist2, quem, cor, esperado, { tendencia: true, largo: true })}</section>`;
}

// Every state at once for one office: leader, runner-up and how much of the count is in.
function todosOsEstados(nac: BrasilSnapshot | null, cargo: Cargo, mapa?: UfMap | null, cor?: Cores, semMapa = false, turno: Turno = 1): string {
  const abas = `<div class="apu-vistas" role="group" aria-label="Cargo">${cargosDe(turno).map((c) => `<button type="button" data-live-cargo="${c}" aria-pressed="${c === cargo}">${c}</button>`).join("")}</div>`;
  if (!nac || nac.cargo !== cargo) return `${abas}<p class="muted small">Consultando os arquivos de todos os estados…</p>`;
  const linhas = linhasUf(nac.ufs, cargo);
  const mapaHtml = !semMapa && mapa && cor ? `<div class="live-mapa">${mapaSvg({ mapa, linhas, modo: "lider", cor, sel: null, corridas: null, cargo })}${legenda({ modo: "lider", linhas, cor, cargo })}</div>` : "";
  const fila = new Map(linhas.map((l) => [l.uf, l]));
  const tiles = ufsDo(cargo).map((uf) => {
    const l = fila.get(uf);
    const nomeUf = uf === EXTERIOR ? "Exterior" : uf;
    const sem = !l || !l.dados || l.fase === "aguardando";
    const corpo = sem ? `<small class="muted">${l?.status === "ausente" ? "sem arquivo" : l?.status === "erro" ? "erro" : l?.fase === "aguardando" ? "aguardando" : "consultando"}</small>`
      : `<span class="live-uf-l"><b>${h(curto(l.lider?.nome ?? ""))}</b> <small>${h(l.lider?.partido ?? "")}</small> <b>${l.lider ? pct(l.lider.pct, 1) : ""}</b></span>
         ${l.segundo ? `<span class="live-uf-l muted"><span>${h(curto(l.segundo.nome))}</span> <span>${pct(l.segundo.pct, 1)}</span></span>` : ""}
         <span class="live-bar" aria-hidden="true"><i style="width:${((l.avanco ?? 0) * 100).toFixed(1)}%"></i></span>
         <small>${pct(l.avanco ?? 0, 1)} das seções${l.defasada ? " · desatualizado" : ""}</small>`;
    return `<li><button type="button" class="live-uf" data-live-escopo="${uf}" aria-label="Ver ${h(nomeUf)}"><b class="live-uf-n">${h(nomeUf)}</b>${corpo}</button></li>`;
  });
  return `${abas}${mapaHtml}<h4>Quem está vencendo onde</h4><ul class="live-ufs">${tiles.join("")}</ul>
    <p class="muted small">Cada quadro é o arquivo do TSE do estado: o líder e o segundo de agora, não o resultado. Toque num estado para filtrar a tela.${cargo === "Presidente" ? " O exterior tem arquivo próprio." : ""}</p>`;
}

// What the TSE itself says about each candidate: only the published situation is used, never an inference from the count.
export interface ResultadoTse { id: string; nome: string; partido: string; votos: number; pct: number; situacao: string; tipo: "eleito" | "nao" | "turno" }
export function resultadoDe(hero: Hero, linhas: Linha[]): ResultadoTse[] {
  const dados = [hero.snap?.dados, ...linhas.map((l) => l.snap?.dados)].filter((d): d is Apuracao => !!d);
  const out = new Map<string, ResultadoTse>();
  for (const d of dados) for (const c of d.candidatos) {
    const s = c.situacao?.trim() ?? "";
    if (!/^(Eleito|Não eleito|2º turno)/i.test(s)) continue;
    const tipo = /^Eleito/i.test(s) ? "eleito" as const : /^Não eleito/i.test(s) ? "nao" as const : "turno" as const;
    out.set(c.id, { id: c.id, nome: c.nome, partido: c.partido, votos: c.votos, pct: c.pct, situacao: s, tipo });
  }
  const peso = { eleito: 0, turno: 1, nao: 2 };
  return [...out.values()].sort((a, b) => peso[a.tipo] - peso[b.tipo] || b.votos - a.votos).slice(0, 6);
}

const dica = (texto: string, rotulo = "Mais informação") => `<button type="button" class="dica info" data-dica="${h(texto)}" aria-label="${h(rotulo)}"><span aria-hidden="true">i</span></button>`;

function resultadoVisual(itens: ResultadoTse[]): string {
  const conta = { eleito: 0, turno: 0, nao: 0 };
  for (const x of itens) conta[x.tipo]++;
  const resumo = [conta.eleito ? `${int(conta.eleito)} eleito${conta.eleito === 1 ? "" : "s"}` : "", conta.turno ? `${int(conta.turno)} no 2º turno` : "", conta.nao ? `${int(conta.nao)} não eleito${conta.nao === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  const lista = itens.map((x) => `<li class="res ${x.tipo}">
    <span class="res-selo">${x.tipo === "eleito" ? "Eleito" : x.tipo === "turno" ? "2º turno" : "Não eleito"}<small>TSE</small></span>
    <span class="res-nome"><b>${h(titleName(x.nome))}</b><small>${h(x.partido)} · ${int(x.votos)} votos</small></span>
    <b class="res-pct">${pct(x.pct, 1)}</b></li>`).join("");
  return `<section class="live-resultado" aria-label="Resultado do TSE">
    <h3>Resultado do TSE <small>${resumo || "sem marcação"}</small></h3>
    ${itens.length ? `<ul>${lista}</ul>` : `<p class="muted small">O TSE ainda não marcou eleito nem não eleito nesta disputa. A etiqueta aparece quando ele publicar.</p>`}
  </section>`;
}

// The panels of the night: the count in figures (any round), and, for the national runoff, the polls of the pair, the path to the lead
// and where the votes to come are.
export interface Dois { numeros: Numeros | null; par?: Par | null; pesquisas?: Pesquisas2T | null; caminho?: Caminho | null; falta?: OndeFalta | null; onda?: Onda | null }

export interface AoVivoProps { noticias?: Noticia[]; prev?: PrevProps | null; dois?: Dois | null; nacPrev?: BrasilSnapshot | null; hero: Hero; linhas: Linha[]; escopo: string; ufCartoes: string; nac: BrasilSnapshot | null; cargoTodos: Cargo; segundos?: ReadonlySet<string> | null; mapa?: UfMap | null; agora: Date; avatar: Avatar; cor: Cores; esperado?: Record<string, Esperado>; fx?: Efeitos; turno?: Turno }

export function renderAoVivo(p: AoVivoProps): string {
  const { hero, linhas, escopo, nac, agora, dois } = p;
  const turno = p.turno ?? 1;
  const todas: Linha[] = [{ cargo: "Presidente", uf: hero.uf, snap: hero.snap, eleitos: hero.eleitos }, ...linhas];
  const ativos = todas.map((l) => l.snap?.dados).filter((d): d is Apuracao => !!d && d.fase !== "aguardando");
  const media = ativos.length ? ativos.reduce((s, d) => s + avancoDe(d.secoes), 0) / ativos.length : 0;
  const pausa = ativos.some((d) => d.fase === "parcial") ? pausaDoTse(ativos, agora) : null;
  const consultas = todas.map((l) => l.snap?.buscadoEm).filter((x): x is Date => !!x);
  const quando = consultas.length ? new Date(Math.max(...consultas.map((x) => x.getTime()))) : null;
  const onde = escopo === BRASIL ? "Brasil (total)" : escopo === TODOS ? "Todos os estados" : escopo === EXTERIOR ? "Exterior" : escopo;
  const voltar = escopo === BRASIL ? "" : `<button type="button" class="ghost live-voltar" data-live-total>Voltar ao Brasil (total)</button>`;
  // The live map is the way to pick a state or the exterior: it stays on every scope.
  const cargoMapa: Cargo = escopo === TODOS ? p.cargoTodos : "Presidente";
  const nacPres = escopo === BRASIL ? p.nacPrev ?? null : escopo === TODOS && p.cargoTodos === "Presidente" ? nac : null;
  const consolidado = escopo === BRASIL || escopo === TODOS ? renderConsolidado(consolidar(nacPres, hero.snap?.dados), (partido) => p.cor(partido)) : "";
  const mapaTempoReal = `<section class="live-noite" aria-labelledby="live-noite-t"><h3 id="live-noite-t">Mapa em tempo real <small>${h(cargoMapa)}${turno === 2 && cargoMapa !== "Senador" ? " · 2º turno" : ""}</small> ${dica(DICA_MAPA, "Como filtrar pelo mapa")}</h3>
    <div class="fx-host" data-fx-host></div></section>`;
  const cartoes = escopo === BRASIL || escopo === EXTERIOR ? "" : `<h3>Disputas de ${h(p.ufCartoes)}</h3><div class="live-grid">${linhas.map((l) => card(l, turno, p.segundos)).join("")}</div>`;
  const fxLigado = (p.fx ?? EFEITOS_PADRAO).ligado;
  const somLigado = (p.fx ?? EFEITOS_PADRAO).som !== false;
  const hora = quando?.toLocaleTimeString("pt-BR") ?? "";
  // Before the first vote the polls are the only figures there are: they take the column the count's panels will fill.
  const pesquisas = dois?.par && dois.pesquisas ? renderPesquisas2t(dois.pesquisas, dois.par, p.cor) : "";
  const antes = false; // the polls are collapsed and live in the third column, so no empty block waits for the count
  // The third column exists only where there is a Previsão or polls to put in it (not in a state's scope): without it the other two share the width.
  const colPrev = `${renderCaminho(dois?.caminho ?? null, p.cor)}${p.prev ? renderPrevisao({ ...p.prev, compacto: true }) : ""}${antes ? "" : pesquisas}`;
  const pctSecoes = pct(Math.floor(media * 1000) / 1000, 1);
  return `<section class="exp-card apu live" aria-labelledby="live-t">
    <header class="live-cabeca">
      <div class="live-titulo">
        <h2 id="live-t">Ao vivo</h2>
        <span class="live-onde">Mostrando <b>${h(onde)}</b></span>
        ${voltar}
      </div>
      <div class="live-acoes">
        <span class="rot ${ativos.length ? "aberta" : "baixa"}">${ativos.length} de ${todas.length} ${todas.length === 1 ? "disputa" : "disputas"}</span>
        ${seletorTurno("Presidente", turno)}${dica(DICA_TURNO, "Datas e regras do turno")}
        <button type="button" class="ghost" data-live-fx aria-pressed="${fxLigado}" data-dica="Liga ou desliga as animações do duelo, do carimbo e do K.O.">${fxLigado ? "Efeitos" : "Efeitos off"}</button>
        <button type="button" class="ghost" data-live-som aria-pressed="${somLigado}" data-dica="Liga ou desliga os sons do duelo e do K.O.">${somLigado ? "Som" : "Som off"}</button>
        ${dica(DICA_FONTE, "Sobre esta tela")}
      </div>
    </header>
    <div class="live-status">
      ${quando ? `<span class="live-chip dica" tabindex="0" data-dica="${h(DICA_ATUALIZA)}" aria-label="${h(`${hora}. ${DICA_ATUALIZA}`)}">⏱ <span id="apu-quando">${h(hora)}</span></span>` : ""}
      <span class="live-chip dica" tabindex="0" data-dica="${h(DICA_MEDIA)}" aria-label="${h(`${pctSecoes} das seções. ${DICA_MEDIA}`)}">${pctSecoes} das seções</span>
      ${pausa ? `<span class="live-chip">arquivo de <span id="apu-idade">${idadeTxt(pausa.idadeMs)}</span></span>` : ""}
    </div>
    ${pausa?.parado ? `<p class="apu-aviso apu-pausa"><b>Sem arquivo novo do TSE há mais de 10 minutos.</b> A pausa é do TSE, que publica em rodadas.</p>` : ""}
    <div class="live-corpo">
    ${renderNoticias(p.noticias ?? [])}
    <div class="live-palco${colPrev ? "" : " sem-prev"}">
      <div class="live-col live-col-hero">
        ${renderHero({ hero, avatar: p.avatar, cor: p.cor, esperado: p.esperado, fx: p.fx, turno })}
        ${turno === 2 && dois?.par && !dois.numeros ? renderFinalistas(dois.par, p.avatar, p.cor, dois.pesquisas?.media ?? null) : ""}
        ${renderNumeros(dois?.numeros ?? null)}
      </div>
      <div class="live-col live-col-mapa">
        ${mapaTempoReal}
        ${dois?.par ? renderOndeFalta(dois.falta ?? null, dois.par, p.cor) : ""}
        ${dois?.par ? renderOnda(dois.onda ?? null, dois.par, p.cor) : ""}
        ${consolidado ? `<details class="live-detalhe"><summary>Total consolidado <small>27 estados + exterior</small></summary>${consolidado}</details>` : ""}
      </div>
      ${colPrev ? `<div class="live-col live-col-prev">${colPrev}</div>` : ""}
      <div class="live-rodape">
        ${resultadoVisual(resultadoDe(hero, linhas))}
        <section class="live-noite-eleitos" aria-label="Quem foi eleito">
          <h3>Quem foi eleito <small>desde que você abriu</small></h3>
          ${linhaGeral(todas)}
        </section>
      </div>
    </div>
    </div>
    ${escopo === TODOS ? `<h3>Todos os estados</h3>${todosOsEstados(nac, p.cargoTodos, p.mapa, p.cor, true, turno)}` : ""}
    ${cartoes}
  </section>`;
}

export interface Contexto { uf: string; abrir: (cargo: Cargo, uf: string) => void; avatar: Avatar; prev?: (id: string) => Prev | null | undefined; exp?: RenderProps["exp"] }

export function mountAoVivo(el: HTMLElement) {
  let ctx: Contexto | null = null;
  let escopo = BRASIL; // the total of the country by default; the map narrows it to a state or the exterior
  let cargoTodos: Cargo = "Presidente";
  let hero: Hero = { uf: BRASIL, snap: null, hist: [], eleitos: vazio() };
  let linhas: Linha[] = [];
  let nac: BrasilSnapshot | null = null;
  let mapa: UfMap | null = null;
  let mapaFalhou = false;
  fetch("mapa-uf.json").then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) mapa = m as UfMap; else mapaFalhou = true; agendar(); }).catch(() => { mapaFalhou = true; agendar(); }); // no map: the tiles below still say it
  let mundo: MundoMap | null | undefined; // the world map of the live map's "Exterior" choice: undefined until asked, null when it failed
  let pedindoMundo = false;
  let feeds: ReturnType<typeof createFeed>[] = [];
  let brasil: ReturnType<typeof createBrasilFeed> | null = null;
  let painted: string | null = null;
  let raf = 0;
  let turno: Turno = lerTurno();
  let intro = true; // the entrance plays once per opening of the tab (and per change of scope)
  let koTocou = false; // the K.O. plays once per scope; redraws show its end state
  let efeitos = (() => { try { return localStorage.getItem("radar:fx") !== "off"; } catch { return true; } })();
  let somLigado = (() => { try { return localStorage.getItem("radar:som") !== "off"; } catch { return true; } })();
  const som = criarSom(() => somLigado);
  const cor = createCores(PALETA, RESTO);
  // The Previsão (Brasil scope only) sums the 28 files of the President, so it has a national feed of its own, like the Apuração tab's.
  let nacPrev: BrasilSnapshot | null = null;
  let nacFeed: ReturnType<typeof createBrasilFeed> | null = null;
  let histPrev: PontoPrev[] = [];
  let noticias = vazioNoticias();
  const projecao = createProjecao();
  const leitorChance = createChance();
  const getJson = <T,>(url: string): Promise<T> => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`HTTP ${r.status}`))));
  const munis = criarMunicipais(getJson, () => agendar());
  const ctxPres = () => ({ cargo: "Presidente" as Cargo, uf: BRASIL, exp: ctx?.exp });
  const velha = (s: string | undefined) => s === "erro" || s === "ausente";
  // The live map is the Noite view of the Apuração tab. It keeps its own DOM across the string redraws of this tab (see `sincronizarMapa`).
  const noite = criarNoite();
  const social = criarSocial(); // the online chip: fixed on <body>, outside everything this tab redraws
  // The screen-reader region lives outside the redrawn area, or nothing would be announced (same as the Apuração tab).
  const anuncio = document.createElement("div");
  anuncio.className = "sr";
  anuncio.setAttribute("role", "status");
  anuncio.setAttribute("aria-live", "polite");
  el.after(anuncio);
  let munPedido = false; // the municipal index/file (cities abroad) is asked once per (re)start, never from paint: a failure would loop
  const pedirMun = () => { if (!munPedido) { munPedido = true; munis.carregar(ctxPres()); } };
  const carregarMundo = () => {
    if (mundo !== undefined || pedindoMundo) return;
    pedindoMundo = true;
    getJson<MundoMap>("mapa-mundo.json").then((m) => { mundo = m; }).catch((e) => { console.error("ao vivo: mapa-múndi", e); mundo = null; }).then(() => { pedindoMundo = false; agendar(); });
  };
  const fonteMapa = (): { nac: BrasilSnapshot | null; cargo: Cargo } | null => {
    if (escopo === TODOS) return cargoTodos === "Senador" ? null : { nac: nac && nac.cargo === cargoTodos ? nac : null, cargo: cargoTodos };
    // The map is the picker: it stays on the national President race even when a state or the exterior is open.
    return { nac: nacPrev, cargo: "Presidente" };
  };
  let byIdDe: { nac: BrasilSnapshot | null; mapa: Map<string, Candidatura> } = { nac: null, mapa: new Map() };
  const byId = (n: BrasilSnapshot | null) => {
    if (byIdDe.nac === n) return byIdDe.mapa;
    const m = new Map<string, Candidatura>();
    for (const u of Object.values(n?.ufs ?? {})) for (const c of u.dados?.candidatos ?? []) if (!m.has(c.id)) m.set(c.id, { id: c.id, nome: c.nome } as unknown as Candidatura);
    byIdDe = { nac: n, mapa: m };
    return m;
  };
  const sincronizarMapa = () => {
    const alvo = el.querySelector<HTMLElement>("[data-fx-host]");
    const f = fonteMapa();
    if (!ctx || !alvo || !f) { noite.parar(); return; }
    if (noite.raiz) noite.adotar(alvo); else noite.montar(alvo);
    carregarMundo();
    const exterior = f.cargo === "Presidente" && turno === 1 ? exteriorProps({ ctx: ctxPres(), turno, snap: hero.snap, nac: f.nac, indice: munis.indice(), disputa: munis.disputa(ctxPres()), arquivo: munis.arquivo(ctxPres()), simulado: false, idSim: () => null }) : null;
    noite.atualizar({
      nac: f.nac, cargo: f.cargo, mapa: mapa ?? (mapaFalhou ? null : undefined), mundo, exterior, semCidades: turno === 2,
      byId: byId(f.nac), avatar: ctx.avatar, cor, efeitos: efeitos && !movimentoReduzido(), som,
      lugar: escopo === EXTERIOR ? "exterior" : "brasil",
      semAbrir: true,
      onUf: (uf) => { if (escopo !== uf) { escopo = uf; ligar(); } },
      onLugar: (l) => { const novo = l === "exterior" ? EXTERIOR : BRASIL; if (escopo !== novo) { escopo = novo; ligar(); } },
      salto: !(f.nac && f.nac.ciclo >= 1), // the 28 files arrive one by one: until each has answered once, that is loading, not news
      anunciar: (txt) => { anuncio.textContent = txt; },
    });
  };

  // The big K.O. and its flash live outside the redrawn area: a redraw (any of the five feeds can trigger one) must not cut them off.
  const tocarKo = () => {
    som.ko();
    if (!efeitos || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const fim = disputaDecidida(hero.snap?.dados);
    const o = document.createElement("div");
    o.className = "live-ko-overlay";
    o.setAttribute("aria-hidden", "true");
    if (fim) o.style.setProperty("--cor-eleito", cor(fim.eleito.partido));
    // Sparks fly out from the centre in random directions (CSS custom properties carry each one's vector).
    const fagulhas = Array.from({ length: 28 }, () => { const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 380; return `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--dl:${(Math.random() * 0.25).toFixed(2)}s"></i>`; }).join("");
    o.innerHTML = `<div class="ko-barra ko-barra-c"></div><div class="ko-barra ko-barra-b"></div><div class="ko-raios"></div><div class="ko-onda"></div><div class="ko-onda ko-onda2"></div>
      <div class="live-ko-flash"></div><div class="live-ko">K.O.</div>
      ${fim ? `<div class="ko-nome">${h(titleName(fim.eleito.nome))}<small>${h(fim.eleito.partido)} · TSE: ${h(fim.eleito.situacao)}</small></div>` : ""}<div class="ko-fagulhas">${fagulhas}</div>`;
    document.body.append(o);
    el.classList.add("ko-treme");
    setTimeout(() => { o.remove(); el.classList.remove("ko-treme"); }, 5600);
  };
  // What the model expects still to come in each state of the runoff: the fallback of "Onde está o que falta" for a state with no votes yet.
  let restantesModelo: Record<string, number> = {};
  // The Previsão of the President, national scope: a 1st round from the Projeção's reading of the 28 files, a runoff from the Chance ao vivo.
  const previsaoProps = (): PrevProps | null => {
    restantesModelo = {};
    if (!ctx || escopo !== BRASIL) return null;
    const d = hero.snap?.dados;
    const base = { avatar: ctx.avatar, cor };
    if (d?.fase === "concluida") return { ...base, estado: "concluida" };
    const esperados = ufsDo("Presidente").length;
    const chegaram = Object.values(nacPrev?.ufs ?? {}).filter((u) => u.dados).length;
    if (turnoDe("Presidente", turno) === 2) {
      const r = chanceProps({ ctx: ctxPres(), turno, snap: hero.snap, nac: nacPrev, indice: munis.indice(), disputa: munis.disputa(ctxPres()), arquivo: munis.arquivo(ctxPres()), simulado: false, idSim: () => null }, leitorChance);
      if (!r || r.estado === "carregando") return { ...base, estado: "carregando", arquivos: { chegaram, esperados } };
      if (r.estado === "sem-disputa") return { ...base, estado: "sem-disputa" };
      if (r.concluida) return { ...base, estado: "concluida" };
      const p = deChance(r.leitura, r.a!, r.b!);
      if (p && d) histPrev = registrarPrev(histPrev, p, d);
      restantesModelo = Object.fromEntries((r.leitura?.partes ?? []).map((x) => [x.id, x.restante]));
      return { ...base, estado: "ok", previsao: p, hist: histPrev };
    }
    if (!(nacPrev && nacPrev.ciclo >= 1)) return { ...base, estado: "carregando", arquivos: { chegaram, esperados } };
    const fontes: Fonte[] = Object.entries(nacPrev.ufs).map(([id, u]) => [id, u.dados, velha(u.status)]);
    const p = deProjecao(projecao.ler(fontes), (id) => ctx?.prev?.(id));
    if (p && d) histPrev = registrarPrev(histPrev, p, d);
    return { ...base, estado: "ok", previsao: p, hist: histPrev };
  };
  const ufCartoes = () => (escopo === BRASIL || escopo === TODOS ? ctx!.uf : escopo);
  // The panels of the night. The count in figures is for any scope; the poll values of the pair, the path to the lead and the map of what
  // is still to come are the national runoff's (the same scope as the Previsão).
  const doisProps = (prev: PrevProps | null): Dois | null => {
    const d = hero.snap?.dados;
    const n = numeros(d);
    if (!ctx || escopo !== BRASIL || turnoDe("Presidente", turno) !== 2) return { numeros: n };
    const corrida = ctx.exp?.corridas?.find((x) => x.cargo === "Presidente" && x.uf === BRASIL);
    const par = parDe(d, corrida?.confrontos);
    return { numeros: n, par, pesquisas: par ? pesquisas2t(corrida, par, d) : null, caminho: caminho(prev?.previsao), falta: ondeFalta(nacPrev, restantesModelo), onda: par ? onda(nacPrev, par) : null };
  };
  const paint = () => {
    if (hero.snap?.dados) fixarCores(cor, hero.snap.dados.candidatos);
    if (!ctx) return;
    const prev = previsaoProps();
    const dois = doisProps(prev);
    // The polls are national: only the national file of the President has an expectation to draw.
    const esperado: Record<string, Esperado> = {};
    if (hero.uf === BRASIL && turno === 1) for (const c of hero.snap?.dados?.candidatos.slice(0, 2) ?? []) { const x = comparar(c, ctx.prev?.(c.id)); if (x) esperado[c.id] = { media: x.media, lo: x.lo, hi: x.hi }; }
    // Runoff: the average of the pair, as the share of each among the votes of the two (what the count draws too).
    const media2t = dois?.pesquisas?.media;
    if (dois?.par && typeof media2t === "number") { esperado[dois.par.a.id] = { media: media2t }; esperado[dois.par.b.id] = { media: 1 - media2t }; }
    const decidida = !!disputaDecidida(hero.snap?.dados);
    const fx: Efeitos = { ligado: efeitos, intro: intro && !!hero.snap?.dados, ko: decidida && !koTocou, som: somLigado };
    if (fx.intro && efeitos) som.intro();
    noticias = observar(noticias, [
      { cargo: "Presidente", uf: hero.uf, dados: hero.snap?.dados },
      ...linhas.map((l) => ({ cargo: l.cargo, uf: l.uf, dados: l.snap?.dados })),
      ...Object.entries(nacPrev?.ufs ?? {}).map(([uf, u]) => ({ cargo: "Presidente" as Cargo, uf, dados: u.dados })),
      ...(nac?.cargo ? Object.entries(nac.ufs).map(([uf, u]) => ({ cargo: nac!.cargo as Cargo, uf, dados: u.dados })) : []),
    ]);
    const indice = munis.indice();
    const segundos = indice ? new Set(indice.disputas.map((d) => `${d.cargo}|${d.uf}`)) : null;
    const html = renderAoVivo({ noticias: noticias.itens, hero, linhas, escopo, ufCartoes: ufCartoes(), nac, nacPrev, cargoTodos, segundos, mapa, agora: new Date(), avatar: ctx.avatar, cor, esperado, fx, turno, prev, dois });
    if (hero.snap?.dados) intro = false;
    if (decidida && !koTocou) { koTocou = true; tocarKo(); }
    const key = semRelogio(html);
    const quando = el.querySelector<HTMLElement>("#apu-quando");
    if (key === painted && quando) {
      quando.textContent = relogio(html) ?? quando.textContent;
      const i = el.querySelector<HTMLElement>("#apu-idade");
      if (i) i.textContent = idade(html) ?? i.textContent;
      sincronizarMapa();
      return;
    }
    painted = key;
    repaint(el, html);
    sincronizarMapa();
  };
  const agendar = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };

  const parar = () => { noite.parar(); munPedido = false; feeds.forEach((f) => f.stop()); feeds = []; brasil?.stop(); brasil = null; nacFeed?.stop(); nacFeed = null; nacPrev = null; linhas = []; nac = null; painted = null; };

  // (Re)starts every feed for the chosen scope: the President's file of that scope, the other races of one state, and the 28 files when
  // every state is shown at once.
  const ligar = () => {
    parar();
    intro = true;
    koTocou = false;
    const heroUf = escopo === TODOS ? BRASIL : escopo;
    hero = { uf: heroUf, snap: null, hist: [], eleitos: vazio() };
    const fHero = createFeed({
      onChange: (s) => {
        const eleitos = s.dados && s.status === "ok" ? atualizar(hero.eleitos, s.dados, { cargo: "Presidente", uf: heroUf }) : hero.eleitos;
        hero = { ...hero, snap: s, eleitos, hist: s.dados && s.status === "ok" ? registrar(hero.hist, s.dados) : hero.hist };
        paint();
      },
    });
    feeds.push(fHero);
    fHero.follow(tseUrl("Presidente", heroUf, TSE_BASE, turnoDe("Presidente", turno)));
    if (escopo !== BRASIL && escopo !== EXTERIOR) {
      linhas = corridasDe(ufCartoes()).filter((c) => turno === 1 || TEM_SEGUNDO_TURNO.has(c.cargo)).map((c) => ({ ...c, snap: null, eleitos: vazio() }));
      linhas.forEach((l, i) => {
        const f = createFeed({
          onChange: (s) => {
            const novo = { ...linhas[i], snap: s };
            if (s.dados && s.status === "ok") novo.eleitos = atualizar(novo.eleitos, s.dados, { cargo: l.cargo, uf: l.uf });
            linhas = linhas.map((x, k) => (k === i ? novo : x));
            paint();
          },
        });
        feeds.push(f);
        f.follow(tseUrl(l.cargo, l.uf, TSE_BASE, turnoDe(l.cargo, turno)));
      });
    }
    if (escopo === TODOS) {
      brasil = createBrasilFeed({ url: (c, uf) => tseUrl(c, uf, TSE_BASE, turnoDe(c, turno)), onChange: (s) => { nac = s; agendar(); } });
      brasil.follow(cargoTodos);
    }
    histPrev = [];
    noticias = vazioNoticias();
    projecao.reiniciar();
    // The 28 files of the President feed both the total (Brasil) and the map, which stays on every scope.
    nacFeed = createBrasilFeed({ url: (c, uf) => tseUrl(c, uf, TSE_BASE, turnoDe(c, turno)), onChange: (s) => { nacPrev = s; agendar(); } });
    nacFeed.follow("Presidente");
    pedirMun();
    paint();
  };

  el.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-abrir-corrida], [data-abrir-uf], [data-uf], [data-live-total], [data-live-escopo], [data-live-cargo], [data-live-fx], [data-live-som], [data-turno]");
    if (!t || !ctx) return;
    if ("liveTotal" in t.dataset) { escopo = BRASIL; ligar(); return; }
    if (t.dataset.turno) { const novo: Turno = t.dataset.turno === "2" ? 2 : 1; if (novo !== turno) { turno = novo; if (turno === 2 && !TEM_SEGUNDO_TURNO.has(cargoTodos)) cargoTodos = "Presidente"; gravarTurno(turno); ligar(); } return; }
    if ("liveSom" in t.dataset) { somLigado = !somLigado; try { localStorage.setItem("radar:som", somLigado ? "on" : "off"); } catch { /* private window */ } som.desbloquear(); paint(); return; }
    if ("liveFx" in t.dataset) { efeitos = !efeitos; try { localStorage.setItem("radar:fx", efeitos ? "on" : "off"); } catch { /* private window: the choice lasts until the tab closes */ } paint(); return; }
    if (t.dataset.abrirUf) { escopo = t.dataset.abrirUf; ligar(); return; } // "Abrir X" of the live map: the Ao vivo of that state
    if (t.dataset.uf && !t.dataset.liveEscopo) { escopo = t.dataset.uf; ligar(); return; }
    if (t.dataset.liveEscopo) { escopo = t.dataset.liveEscopo; ligar(); return; }
    if (t.dataset.liveCargo) { cargoTodos = t.dataset.liveCargo as Cargo; nac = null; brasil?.follow(cargoTodos); if (cargoTodos === "Presidente") pedirMun(); paint(); return; }
    const [cargo, uf] = t.dataset.abrirCorrida!.split("|");
    ctx.abrir(cargo as Cargo, uf);
  });
  document.addEventListener("pointerdown", () => som.desbloquear());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { feeds.forEach((f) => f.refresh()); brasil?.refresh(); nacFeed?.refresh(); } });
  window.addEventListener("online", () => { feeds.forEach((f) => f.refresh()); brasil?.refresh(); nacFeed?.refresh(); }); // back online: skip the wait the backoff set

  return {
    show(next: Contexto) {
      som.desbloquear(); // called from the tab click: the only moment a browser lets sound start
      const lido = lerTurno(); // the Apuração tab may have changed it
      const mudou = lido !== turno;
      turno = lido;
      const outro = mudou || !ctx || ctx.uf !== next.uf;
      ctx = next;
      social.montar(next.uf);
      if (outro || !feeds.length) ligar(); else paint();
    },
    hide() { parar(); social.desmontar(); ctx = null; el.innerHTML = ""; },
  };
}

