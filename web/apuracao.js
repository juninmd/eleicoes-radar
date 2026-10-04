// "Apuração" view: the live count, read from the TSE results files. It shows the TSE's numbers and its own
// status text; the Radar never projects a winner. The one thing it adds is a proof, not a projection:
// "Matematicamente eleito" (apuracao-eleito.js), only where no split of the votes still to come can change the result.
import { h, int, pct, titleName } from "./format.js";
import { POLL_MS } from "./apuracao-feed.js";
import { composicao, evolucao, faixaVsApuracao } from "./apuracao-graficos.js";
import { decididos, eleitoTse } from "./apuracao-eleito.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";
import { renderCamara } from "./apuracao-camara.js";
import { renderNacional } from "./apuracao-nacional-view.js";
import { comparar, delta, resumoFaixa } from "./apuracao-pesquisa.js";
import { fmtDate, pp } from "./prev.js";

const FASES = { aguardando: "Aguardando início", parcial: "Apuração em andamento", concluida: "Apuração concluída" };
const ratio = (a, b) => (b > 0 ? a / b : 0);

// Rounds down: 9.996 of 10.000 sections is 99,9%, never "100,0%" while the count is still open.
const pctSecoes = ({ totalizadas, total }) => pct(totalizadas >= total ? ratio(totalizadas, total) : Math.floor(ratio(totalizadas, total) * 1000) / 1000, 1);

const stat = (valor, rotulo) => `<div><b>${valor}</b><span>${rotulo}</span></div>`;

function status(d) {
  const { secoes: s, votos: v, eleitorado: e } = d;
  return `<progress class="apu-prog" max="${s.total || 1}" value="${s.totalizadas}" aria-label="Seções totalizadas">${pctSecoes(s)}</progress>
    <p class="exp-meta"><b>${int(s.totalizadas)} de ${int(s.total)} seções totalizadas (${pctSecoes(s)})</b> · arquivo do TSE de ${h(d.versao.data)} ${h(d.versao.hora)}</p>
    ${v.total ? `<div class="apu-stats">
      ${stat(pct(ratio(e.comparecimento, e.apurado), 1), "comparecimento nas seções totalizadas")}
      ${stat(int(v.validos), "votos válidos")}
      ${stat(`${int(v.brancos)} <small>${pct(ratio(v.brancos, v.total), 1)}</small>`, "brancos")}
      ${stat(`${int(v.nulos)} <small>${pct(ratio(v.nulos, v.total), 1)}</small>`, "nulos")}
    </div>` : ""}`;
}

const proporcional = (cargo) => /^Deputado/.test(cargo);

// "eleito", "eleita" or "eleito(a)" when we do not know who they are (or the TSE record has no usable gender).
const eleitoDe = (own) => (/^fem/i.test(own?.genero ?? "") ? "eleita" : /^masc/i.test(own?.genero ?? "") ? "eleito" : "eleito(a)");
const chipMat = (own) => `<span class="rot alta mat">Matematicamente ${eleitoDe(own)}</span>`;

// Said once, above the table, with the rule in words: the label is the Radar's arithmetic, not the TSE's call.
function decididoTxt(d, ids) {
  const nomes = d.candidatos.filter((c) => ids.has(c.id)).map((c) => `<b>${h(titleName(c.nome))}</b> (${h(c.partido)})`);
  if (!nomes.length) return "";
  return `<p class="apu-decidido"><b>Matematicamente ${nomes.length > 1 ? "eleitos" : "eleito(a)"}:</b> ${nomes.join(" e ")}. Mesmo que todos os eleitores das seções ainda não totalizadas votassem em outro candidato, o resultado não mudaria. É uma conta do Radar sobre os números do TSE: não é a marcação do TSE nem a diplomação.</p>`;
}

function lead(d, cargo) {
  const [a, b] = d.candidatos;
  if (!a || !a.votos) return "";
  if (proporcional(cargo)) {
    const eleitos = d.candidatos.filter(eleitoTse).length;
    return `${int(d.cargo.vagas)} vagas em disputa. Segundo o TSE, ${int(eleitos)} já ${eleitos === 1 ? "tem" : "têm"} situação de eleito${d.quociente ? `. Quociente eleitoral: <b>${int(d.quociente)}</b> votos` : ""}.`;
  }
  if (d.cargo.vagas > 1 && b) {
    return `${int(d.cargo.vagas)} vagas. Mais votados até agora: <b>${h(titleName(a.nome))}</b> (${pct(a.pct, 2)}) e <b>${h(titleName(b.nome))}</b> (${pct(b.pct, 2)}).`;
  }
  return `<b>${h(titleName(a.nome))}</b> lidera com <b>${pct(a.pct, 2)}</b> dos votos válidos (${int(a.votos)} votos)${b ? `, <b>${pp(a.pct - b.pct)} p.p.</b> à frente de ${h(titleName(b.nome))}` : ""}.`;
}

// While the count is open, "outside the band" only says where the count stands today.
const faixaTxt = (cmp, fase) => (cmp.dentro === null ? "" : `${cmp.dentro ? "dentro" : "fora"} da faixa${fase === "concluida" ? "" : " por enquanto"}`);
const difTxt = (cmp) => {
  const d = delta(cmp.diff);
  return `<span class="dif"><span aria-hidden="true">${d.seta}</span> ${d.txt}</span><span class="sr"> (${h(d.sr)})</span>`;
};

// Poll columns exist only where the race has polls; "rows" carries the comparison of every candidate.
function tabela(fase, rows, avatar, limit) {
  const polls = rows.some((r) => r.cmp);
  const temStatus = rows.some((r) => r.c.situacao); // the TSE's own column: empty until the TSE marks someone
  const body = rows.slice(0, limit).map(({ c, own, cmp, mat, ele }) => {
    // Status and poll comparison are printed twice: under the name for phones, in their own columns for wider screens (CSS shows one).
    const chip = c.situacao ? `<span class="rot ${c.destaque ? "alta" : "baixa"}">${h(c.situacao)}</span>` : "";
    const inline = chip || cmp ? `<span class="row-inline">${chip}${cmp ? `<span class="cmp-inline">pesquisa <b>${pct(cmp.media, 1)}</b> · ${difTxt(cmp)}${faixaTxt(cmp, fase) ? ` · ${faixaTxt(cmp, fase)}` : ""}</span>` : ""}</span>` : "";
    // The Radar's label sits under the name at every width: the TSE column is for the TSE's text only and may be scrolled out of view.
    const nome = `${own ? avatar(own, "xs") : ""}<span>${h(titleName(c.nome))} <small>${h(c.partido)} · ${h(c.num)}</small>${mat ? `<span class="mat-nome">${chipMat(own)}</span>` : ""}${inline}</span>`;
    const band = cmp && Number.isFinite(cmp.lo) && Number.isFinite(cmp.hi) ? `<small>faixa ${pct(cmp.lo, 0)}–${pct(cmp.hi, 0)}</small>` : "";
    return `<tr${ele ? ' class="eleito"' : ""}>
      <th scope="row">${own ? `<button type="button" class="linkish" data-open="${h(own.id)}">${nome}</button>` : `<span class="linkish">${nome}</span>`}</th>
      <td class="num">${int(c.votos)}</td>
      <td><div class="rangewrap"><div class="apu-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, c.pct * 100))}%"></span></div><b class="rv">${pct(c.pct, 2)}</b></div></td>
      ${polls ? `<td class="num pq-col">${cmp ? `${pct(cmp.media, 1)}${band}` : "–"}</td><td class="num pq-col">${cmp ? `${difTxt(cmp)}<small>${faixaTxt(cmp, fase)}</small>` : ""}</td>` : ""}
      ${temStatus ? `<td class="st-col">${chip}</td>` : ""}</tr>`;
  });
  return `<div class="scroll"><table class="exp-bars">
    <caption class="sr">Votos apurados por candidato, em ordem decrescente${polls ? ", com a média das pesquisas ao lado" : ""}</caption>
    <thead><tr><th scope="col">Candidato</th><th scope="col" class="num">Votos</th><th scope="col">% dos votos válidos</th>${polls ? `<th scope="col" class="pq-col">Pesquisa (média)</th><th scope="col" class="pq-col">Diferença</th>` : ""}${temStatus ? `<th scope="col" class="st-col">Situação (TSE)</th>` : ""}</tr></thead>
    <tbody>${body.join("")}</tbody></table></div>
    ${rows.length > limit ? `<button type="button" id="apu-mais" class="ghost">Mostrar mais</button>` : ""}`;
}

// What the gap means depends on the phase: a partial count says which ballots are in, not how wrong the polls were.
function comparacao(rows, corrida, fase, vagas) {
  const cmps = rows.flatMap((r) => (r.cmp ? [r.cmp] : []));
  if (!cmps.length) return "";
  const base = corrida
    ? `Média de ${int(corrida.pesquisas)} ${corrida.pesquisas === 1 ? "pesquisa" : "pesquisas"}${corrida.ultima ? ` (a última, de ${fmtDate(corrida.ultima)})` : ""}, em votos válidos como a apuração.`
    : "Média das pesquisas, em votos válidos como a apuração.";
  const concluida = fase === "concluida";
  const leitura = concluida
    ? "A apuração terminou: a diferença é o quanto o resultado ficou acima ou abaixo da média das pesquisas."
    : "Enquanto as seções não chegam a 100%, a diferença pode refletir quais urnas já entraram, além do erro das pesquisas.";
  const r = resumoFaixa(cmps);
  const faixa = r ? ` ${int(r.dentro)} de ${int(r.total)} candidatos com 3% ou mais nas pesquisas ${r.dentro === 1 ? "está" : "estão"} dentro da faixa de 90% das pesquisas ${concluida ? "na apuração concluída" : "neste momento"}.` : "";
  const voto = vagas > 1 ? ` Cada eleitor vota em até ${int(vagas)} nomes: a % do TSE e a média das pesquisas são parcelas do total de votos dados, não de eleitores.` : "";
  return `<h3>Comparação com as pesquisas</h3><p class="exp-read">${base} ${leitura}${faixa}${voto}</p>`;
}

function vagasPorLista(d) {
  const top = d.partidos.filter((p) => p.vagas > 0).sort((a, b) => b.vagas - a.vagas).slice(0, 12);
  if (!top.length) return `<p class="muted small">O TSE ainda não publicou vagas por partido ou federação.</p>`;
  return `<h3>Vagas por partido ou federação <small>calculadas pelo TSE</small></h3>
    <ul class="bancadas">${top.map((p) => `<li><span>${h(p.nome)}</span><span class="bar"><span class="fill" style="width:${(p.vagas / top[0].vagas) * 100}%"></span></span><b>${int(p.vagas)}</b></li>`).join("")}</ul>`;
}

const comoLer = (proporcional) => `<details class="how"><summary>Como ler a apuração parcial</summary><ol class="muted small">
  <li>Parcial não é resultado. Os números mudam a cada arquivo novo do TSE. O TSE pode marcar um candidato como "Eleito" antes de 100% das seções: vale o que a coluna Situação mostra, não a posição na lista.</li>
  <li>As urnas não chegam em ordem aleatória: cada região e cada seção entra em um momento, e quem lidera agora pode ser ultrapassado.</li>
  <li>A % de cada candidato é a calculada pelo TSE sobre os votos válidos. Brancos e nulos ficam de fora dela e aparecem à parte.</li>
  <li>A coluna Situação é o texto que o próprio TSE publica (por exemplo "Eleito" ou "2º turno"). O Radar não projeta vencedor.</li>
  ${!proporcional ? `<li>"Matematicamente eleito" é uma conta do Radar, não do TSE, e é rígida: vale quando o candidato fica à frente mesmo que todos os eleitores das seções que faltam votassem no adversário e nenhum votasse nele (Presidente e Governador: mais da metade dos votos válidos que ainda podem existir; Senado: o último eleito segue à frente do primeiro que ficou de fora). Quem está apertado, ou ainda longe, não ganha a etiqueta. A marcação do TSE vale à parte.</li>` : ""}
  ${proporcional ? `<li>Nos cargos proporcionais as vagas são divididas primeiro entre partidos e federações, pelo quociente eleitoral, e só depois entre os candidatos de cada lista. Por isso um candidato pode ter mais votos que outro e não se eleger.</li>` : ""}
</ol></details>`;

const aviso = (txt) => `<p class="empty">${txt}</p>`;

const MAPA_CARGOS = new Set(["Presidente", "Governador", "Senador"]);
const ROTULOS = { placar: "Placar", mapa: "Mapa", camara: "Câmara", graficos: "Gráficos" };
export const vistasDe = (cargo) => (MAPA_CARGOS.has(cargo) ? ["placar", "mapa", "graficos"] : cargo === "Deputado Federal" ? ["placar", "camara", "graficos"] : ["placar", "graficos"]);

const quemDe = (d) => Object.fromEntries(d.candidatos.map((c) => [c.id, { nome: c.nome, partido: c.partido }]));

function graficos(d, rows, hist, cor) {
  if (!d || d.fase === "aguardando") return aviso("Os gráficos aparecem quando o TSE começar a totalizar seções.");
  const faixa = faixaVsApuracao(rows, d.fase);
  return `<h3>Quem votou, e quem não</h3>${composicao(d)}
    ${faixa ? `<h3>Apuração e faixa das pesquisas</h3>${faixa}` : ""}
    <h3>Evolução desde que você abriu a aba</h3>${evolucao(hist, quemDe(d), cor)}`;
}

export function renderApuracao({ snap, cargo, uf, byId, avatar, limit, exp, vista = "placar", hist = [], nac = null, mapa, modoMapa = "lider", selUf = null, cor = createCores(PALETA) }) {
  const d = snap?.dados;
  const vistas = vistasDe(cargo);
  const aberta = vistas.includes(vista) ? vista : "placar";
  // Deputies have no polls: only the other offices are compared. The id used to look up a candidate comes from our data, never from the file.
  const dec = decididos(d, cargo, uf);
  const rows = (d?.candidatos ?? []).map((c) => {
    const own = byId.get(c.id);
    // The TSE's own text always wins; the proof only labels whoever the TSE has not marked yet.
    const mat = dec.has(c.id) && !c.situacao;
    return { c, own, cmp: proporcional(cargo) ? null : comparar(c, own?.prev), ele: eleitoTse(c) || mat, mat };
  });
  const corrida = exp?.corridas?.find((x) => x.cargo === cargo && x.uf === uf);
  const local = uf === "BR" ? "" : ` · ${h(uf)}`;
  let corpo;
  if (aberta === "camara") {
    corpo = renderCamara({ nac, cor });
  } else if (aberta === "mapa") {
    corpo = renderNacional({ nac, cargo, corridas: exp?.corridas, modo: modoMapa, sel: selUf, cor, mapa });
  } else if (!d) {
    corpo = snap?.status === "ausente" ? aviso("O TSE ainda não publicou o arquivo de resultados desta disputa. A página continua consultando.")
      : snap?.status === "erro" ? aviso(`Não foi possível consultar o TSE agora: ${h(snap.erro)}. Nova tentativa em ${POLL_MS / 1000} s.`)
      : aviso("Consultando o TSE…");
  } else {
    const aguardando = d.fase === "aguardando";
    const desde = `Mostrando os números de ${h(snap.buscadoEm.toLocaleTimeString("pt-BR"))}.`;
    const avisos = snap.status === "erro" ? aviso(`Falha ao atualizar (${h(snap.erro)}). ${desde}`) : snap.status === "ausente" ? aviso(`O TSE não está entregando este arquivo agora. ${desde}`) : "";
    corpo = aberta === "graficos" ? `${avisos}${status(d)}${graficos(d, rows, hist, cor)}`
      : `${avisos}
      ${status(d)}
      ${aguardando ? aviso("A apuração ainda não começou: o TSE não totalizou nenhuma seção. Os números aparecem aqui assim que ele começar a publicar.")
        : `<p class="exp-lead">${lead(d, cargo)}</p>
           ${decididoTxt(d, new Set(rows.filter((r) => r.mat).map((r) => r.c.id)))}
           ${d.fase === "parcial" ? `<p class="exp-read">Resultado parcial: com ${pctSecoes(d.secoes)} das seções totalizadas, os números ainda mudam e a ordem pode se inverter.</p>` : ""}
           ${proporcional(cargo) ? `${vagasPorLista(d)}<p class="muted small">Não há pesquisa por candidato a deputado, então esta lista não tem comparação com pesquisas.</p>` : comparacao(rows, corrida, d.fase, d.cargo.vagas)}
           ${tabela(d.fase, rows, avatar, limit)}`}`;
  }
  const quando = aberta === "mapa" || aberta === "camara" ? nac?.buscadoEm : snap?.buscadoEm;
  const nav = `<div class="apu-vistas" role="group" aria-label="Visão da apuração">${vistas.map((v) => `<button type="button" data-vista="${v}" aria-pressed="${v === aberta}">${ROTULOS[v]}</button>`).join("")}</div>`;
  return `<section class="exp-card apu" aria-labelledby="apu-t">
    <h2 id="apu-t">${h(cargo)}${local} <span class="rot ${d?.fase === "parcial" ? "aberta" : d?.fase === "concluida" ? "alta" : "baixa"}">${h(FASES[d?.fase] ?? "Consultando")}</span></h2>
    ${nav}
    <p class="muted exp-meta">${quando ? `Consultado às <span id="apu-quando">${h(quando.toLocaleTimeString("pt-BR"))}</span> · ` : ""}atualiza sozinho a cada ${POLL_MS / 1000} s enquanto você estiver nesta aba.</p>
    ${corpo}
    ${comoLer(proporcional(cargo))}
    <p class="muted small">Fonte: Tribunal Superior Eleitoral, <a href="https://resultados.tse.jus.br/" rel="noopener" target="_blank">resultados.tse.jus.br</a>${aberta === "mapa" ? ". Malha dos estados: IBGE" : ""}. O Radar só exibe o que o TSE publica.</p>
  </section>`;
}

export { semRelogio } from "./apuracao-dom.js";
