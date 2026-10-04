// Detail panel for the selected state and the state table (the text version of the map).
import { h, int, pct, titleName } from "./format.js";
import { contraPesquisa, rotulosComp } from "./apuracao-nacional.js";
import { NOMES } from "./apuracao-mapa.js";
import { pp } from "./prev.js";

const FASES = { aguardando: "Aguardando início", parcial: "Apuração em andamento", concluida: "Apuração concluída" };
const TOM = { aguardando: "baixa", parcial: "aberta", concluida: "alta" };

const pesquisaTxt = (comp) => {
  if (!comp?.pesquisa) return "";
  const [p, ...outros] = comp.lista?.length ? comp.lista : [comp.pesquisa];
  const quem = `<b>${h(titleName(p.nome))}</b> (${h(p.partido)}) com ${pct(p.media, 1)}, faixa de ${pct(p.lo, 0)}–${pct(p.hi, 0)}`;
  const mais = outros.map((q) => `<b>${h(titleName(q.nome))}</b> (${h(q.partido)}) com ${pct(q.media, 1)}`);
  const r = rotulosComp(comp.n);
  const cmp = comp.situacao === "igual" ? `${r.igual} na apuração${r.onde}` : comp.situacao === "diverge" ? `${r.dif} na apuração${r.onde} por enquanto` : "";
  return `<p class="exp-read">Pesquisas: ${[quem, ...mais].join("; ")}${cmp ? `. ${cmp}` : ""}.</p>`;
};

function candidatos(l, cor) {
  const max = l.top[0]?.pct || 1;
  return `<ol class="apu-top">${l.top.map((c) => `<li><i class="key" style="background:${cor(c.partido)}" aria-hidden="true"></i>
    <span>${h(titleName(c.nome))} <small>${h(c.partido)} · ${h(c.num)}</small></span>
    <span class="bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, (c.pct / max) * 100))}%;background:${cor(c.partido)}"></span></span>
    <b>${pct(c.pct, 2)}</b><small>${int(c.votos)}</small></li>`).join("")}</ol>`;
}

export function painelUf(l, { cor, cargo, corrida }) {
  if (!l) return `<section class="apu-uf"><p class="muted">Toque em um estado, ou em uma linha da tabela, para ver os candidatos dele.</p></section>`;
  const nome = NOMES[l.uf] ?? l.uf;
  const cab = (fase) => `<h3>${h(nome)}${fase ? ` <span class="rot ${TOM[fase]}">${FASES[fase]}</span>` : ""}</h3>`;
  if (!l.dados) {
    const msg = l.status === "erro" ? `Não foi possível consultar o TSE agora: ${h(l.erro)}.` : l.status === "ausente" ? "O TSE ainda não publicou o arquivo de resultados deste estado." : "Consultando o TSE…";
    return `<section class="apu-uf">${cab(null)}<p class="muted">${msg}</p></section>`;
  }
  const d = l.dados;
  const abrir = cargo !== "Presidente" && l.uf !== "ZZ" ? `<button type="button" class="ghost" data-abrir-uf="${h(l.uf)}">Abrir a disputa de ${h(nome)}</button>` : "";
  const comp = corrida ? contraPesquisa(l, corrida) : null;
  const velha = l.defasada ? `<p class="exp-read">Atenção: o TSE não respondeu na última consulta; estes são os números do arquivo de ${h(d.versao.data)} ${h(d.versao.hora)}.</p>` : "";
  const corpo = l.fase === "aguardando"
    ? `<p class="muted">A apuração deste estado ainda não começou.</p>`
    : `${candidatos(l, cor)}${pesquisaTxt(comp)}`;
  return `<section class="apu-uf">${cab(l.fase)}
    <p class="exp-meta"><b>${int(l.secoes.totalizadas)} de ${int(l.secoes.total)} seções totalizadas (${pct(l.avanco, 1)})</b> · arquivo do TSE de ${h(d.versao.data)} ${h(d.versao.hora)}</p>
    ${velha}${corpo}${abrir}</section>`;
}

// Name order, with the exterior last: it is not a state.
const porNome = (a, b) => (a.uf === "ZZ") - (b.uf === "ZZ") || (NOMES[a.uf] ?? a.uf).localeCompare(NOMES[b.uf] ?? b.uf, "pt-BR");

export function tabelaUf(linhas, { cargo, corridas, sel }) {
  const corridaDe = (uf) => corridas?.find((x) => x.cargo === cargo && x.uf === uf);
  const temPesquisa = cargo !== "Presidente" && (corridas ?? []).some((x) => x.cargo === cargo && x.lideres?.length);
  const ultima = linhas.some((l) => l.vagas > 1); // with several seats the margin is measured at the last one
  const linhasHtml = [...linhas].sort(porNome).map((l) => {
    const comp = temPesquisa ? contraPesquisa(l, corridaDe(l.uf)) : null;
    const lider = l.lider ? `${h(titleName(l.lider.nome))} <small>${h(l.lider.partido)} · ${pct(l.lider.pct, 1)}</small>${l.margem === null ? "" : `<small class="mg-inline">margem${ultima ? " na última vaga" : ""} ${pp(l.margem)} p.p.</small>`}${l.defasada ? ` <small class="vel">desatualizado</small>` : ""}` : "–";
    const r = rotulosComp(comp?.n);
    const pesq = !temPesquisa ? "" : comp?.pesquisa
      ? `<td>${h(titleName(comp.pesquisa.nome))} <small>${pct(comp.pesquisa.media, 1)}${comp.situacao === "igual" ? ` · ${r.igual}${r.onde}` : comp.situacao === "diverge" ? ` · ${r.dif}${r.onde}` : ""}</small></td>`
      : `<td>–</td>`;
    const avanco = l.avanco === null ? "–" : `<div class="rangewrap"><div class="apu-bar" aria-hidden="true"><span style="width:${(l.avanco * 100).toFixed(1)}%"></span></div><b class="rv">${pct(l.avanco, 1)}</b></div>`;
    return `<tr data-uf="${h(l.uf)}"${l.uf === sel ? ' aria-current="true"' : ""}>
      <th scope="row"><button type="button" class="linkish" data-uf="${h(l.uf)}">${h(NOMES[l.uf] ?? l.uf)}</button></th>
      <td>${avanco}</td><td>${lider}</td>
      <td class="num mg-col">${l.margem === null ? "–" : `${pp(l.margem)} p.p.`}</td>${pesq}</tr>`;
  });
  return `<div class="scroll"><table class="exp-bars apu-ufs">
    <caption class="sr">Resultado por estado, em ordem alfabética</caption>
    <thead><tr><th scope="col">Estado</th><th scope="col">Seções totalizadas</th><th scope="col">Líder</th><th scope="col" class="num mg-col">${ultima ? "Margem na última vaga" : "Margem"}</th>${temPesquisa ? `<th scope="col">Líder nas pesquisas</th>` : ""}</tr></thead>
    <tbody>${linhasHtml.join("")}</tbody></table></div>`;
}
