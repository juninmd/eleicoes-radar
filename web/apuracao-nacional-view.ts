// "Mapa" view of the Apuração tab: every state of one office at once. Pure: the feed snapshot, the
// selection and the colour memory come in, an HTML string comes out.
import { h, int, pct, titleName } from "./format.js";
import { avancoDe, contraPesquisa, linhasUf, totalNacional } from "./apuracao-nacional.js";
import { corridaDe, descreve, legenda, mapaSvg, MIN_ROTULO, modosDe, NOMES, pintar } from "./apuracao-mapa.js";
import { painelUf, tabelaUf } from "./apuracao-uf-painel.js";
import { ufsDo } from "./apuracao-uf.js";

const plural = (n, um, varios) => `${int(n)} ${n === 1 ? um : varios}`;

function situacao(linhas, total) {
  const n = (f) => linhas.filter(f).length;
  const atual = (fase) => n((l) => !l.defasada && l.fase === fase); // a state that stopped answering is not "under way": its numbers are old
  const partes = [
    plural(atual("concluida"), "concluído", "concluídos"),
    `${int(atual("parcial"))} em andamento`,
    `${int(atual("aguardando"))} aguardando`,
    `${int(n((l) => !l.dados && (l.status === "erro" || l.status === "ausente")))} sem resposta`,
  ];
  const velhas = n((l) => l.defasada);
  if (velhas) partes.push(`${plural(velhas, "desatualizado", "desatualizados")} (o TSE não respondeu na última consulta)`);
  const consultando = n((l) => !l.dados && l.status === "carregando");
  return `${partes.join(" · ")}${consultando ? ` · consultando ${int(consultando)}` : ""} (de ${int(total)})`;
}

function somaPais(linhas) {
  const t = totalNacional(linhas);
  if (!t.candidatos.length) return "";
  const top = t.candidatos.slice(0, 3).map((c) => `<b>${h(titleName(c.nome))}</b> ${pct(c.pct, 2)}`).join(" · ");
  const prog = t.secoes.total ? pct(avancoDe(t.secoes), 1) : "–";
  const velhas = linhas.filter((l) => l.defasada).length;
  return `<p class="exp-lead">Soma dos arquivos de estado e do exterior: ${top}.</p>
    <p class="exp-meta">${int(t.secoes.totalizadas)} de ${int(t.secoes.total)} seções (${prog}) em ${int(t.cobertura.com)} de ${int(t.cobertura.de)} arquivos lidos.${velhas ? ` ${plural(velhas, "deles está desatualizado", "deles estão desatualizados")}: o TSE não respondeu na última consulta.` : ""} O total oficial do país está na visão Placar.</p>`;
}

const chip = (l, modo, cor, comp, sel) => {
  const { fill, css } = pintar(l, modo, cor, comp);
  // The hatch is an SVG pattern, which a CSS background cannot reference: the swatch has its own class.
  const marca = fill.startsWith("url(") ? `<i class="key dif" aria-hidden="true"></i>` : `<i class="key" style="background:${fill};background:${css}" aria-hidden="true"></i>`;
  return `<button type="button" class="chip" data-uf="${h(l.uf)}" aria-pressed="${l.uf === sel}" aria-label="${h(descreve(l, comp))}">${marca}${h(l.uf === "ZZ" ? NOMES.ZZ : l.uf)}</button>`;
};

export function renderNacional({ nac, cargo, corridas, modo, sel, cor, mapa }) {
  const linhas = linhasUf(nac?.ufs ?? {}, cargo);
  const modos = modosDe(cargo, corridas);
  const ativo = modos.some((m) => m.id === modo) ? modo : modos[0].id;
  const total = ufsDo(cargo).length;
  const carregando = !linhas.length || linhas.every((l) => !l.dados && l.status === "carregando");
  const topo = carregando
    ? `<p class="muted">Consultando os 27 estados${cargo === "Presidente" ? " e o exterior" : ""}…</p>`
    : `${cargo === "Presidente" ? somaPais(linhas) : ""}<p class="exp-meta"><b>Estados:</b> ${situacao(linhas, total)}</p>`;
  const botoes = `<div class="apu-modos" role="group" aria-label="O que o mapa mostra">${modos.map((m) => `<button type="button" data-modo-mapa="${m.id}" aria-pressed="${m.id === ativo}">${h(m.rotulo)}</button>`).join("")}</div>`;
  const compDe = (l) => (ativo === "pesquisa" ? contraPesquisa(l, corridaDe(corridas, cargo, l.uf)) : null);
  // Too small for a label on the map (and the exterior, which has no shape): a button each.
  const pequenos = [...(mapa ? Object.keys(mapa.ufs).filter((u) => mapa.ufs[u].a < MIN_ROTULO) : []), ...(cargo === "Presidente" ? ["ZZ"] : [])];
  const chipsHtml = pequenos.map((u) => {
    const l = linhas.find((x) => x.uf === u) ?? { uf: u, status: "carregando", dados: null, lider: null, margem: null, avanco: null, fase: null };
    return chip(l, ativo, cor, compDe(l), sel);
  });
  const figura = mapa === undefined
    ? `<p class="muted">Carregando o mapa…</p>`
    : mapa
    ? `${mapaSvg({ mapa, linhas, modo: ativo, cor, sel, corridas, cargo })}<div class="apu-chips" aria-label="Estados pequenos${cargo === "Presidente" ? " e exterior" : ""}">${chipsHtml.join("")}</div>${legenda({ modo: ativo, linhas, cor, cargo })}`
    : `<p class="empty">O mapa não carregou. A tabela abaixo mostra os mesmos números; trocar de visão e voltar tenta de novo.</p>`;
  const selecionada = linhas.find((l) => l.uf === sel) ?? null;
  return `${topo}${botoes}
    <div class="apu-nac"><div class="apu-nac-mapa">${figura}</div>
    <div class="apu-nac-painel">${painelUf(selecionada, { cor, cargo, corrida: corridaDe(corridas, cargo, sel) })}</div></div>
    ${tabelaUf(linhas, { cargo, corridas, sel })}`;
}
