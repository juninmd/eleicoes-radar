// "Cadeiras" view: who holds each seat today in a proportional race, list by list, and where the last seat of a list is close.
// The TSE decides how many seats each list has; inside a list they go to the most voted. This reads the count, it is not a result.
import { h, int, pct, titleName } from "./format.js";
import { cadeiras } from "./apuracao-cadeiras.js";
import { avancoDe } from "./apuracao-nacional.js";

const aviso = `<p class="apu-aviso"><b>Leitura da contagem de hoje, não é resultado.</b> O TSE define quantas vagas cada partido ou federação tem; dentro de cada lista, as vagas vão para os mais votados. Aqui está quem ocupa cada vaga com os votos de agora e onde a última vaga de uma lista está perto de mudar de mãos. Vale o que o TSE marcar como "Eleito".</p>`;

function pessoa(c, byId, extra = "") {
  const nome = `${h(titleName(c.nome))} <small>${h(c.partido)} · ${h(c.num)}</small>`;
  const chip = c.situacao ? ` <span class="rot ${c.destaque ? "alta" : "baixa"}">${h(c.situacao)}</span>` : "";
  const corpo = byId?.has(c.id) ? `<button type="button" class="linkish" data-open="${h(c.id)}">${nome}</button>` : `<span class="linkish">${nome}</span>`;
  return `<li>${corpo}${chip}<b>${int(c.votos)}</b>${extra}</li>`;
}

function aperto(l) {
  const ultimo = l.dentro.at(-1);
  const primeiro = l.fora[0];
  return `<li><b>${h(l.nome)}</b>: ${h(titleName(ultimo.nome))} (${int(ultimo.votos)}) está dentro e ${h(titleName(primeiro.nome))} (${int(primeiro.votos)}) está fora; diferença de <b>${int(l.margem)} votos</b>, e com as seções que faltam o último de dentro ainda pode receber cerca de <b>${int(Math.round(l.aindaPode))} votos</b>.</li>`;
}

function lista(l, byId) {
  const sobra = l.fora.map((c) => pessoa(c, byId, ` <small class="muted">fora por enquanto, a ${int(Math.max(0, l.dentro.at(-1).votos - c.votos))} votos do último de dentro</small>`));
  const chip = l.apertada ? ` <span class="rot aberta">última vaga apertada</span>` : "";
  return `<details class="apu-cad" data-k="cad-${h(l.nome)}"${l.apertada ? " open" : ""}>
    <summary>${h(l.nome)} <small>${int(l.vagas)} ${l.vagas === 1 ? "vaga" : "vagas"}</small>${chip}</summary>
    <ol class="apu-cad-lista">${l.dentro.map((c) => pessoa(c, byId)).join("")}</ol>
    ${sobra.length ? `<ul class="apu-cad-fora">${sobra.join("")}</ul>` : ""}
  </details>`;
}

const comoLer = `<details class="how" data-k="cad-como"><summary>Como ler as cadeiras</summary><ol class="muted small">
  <li>O número de vagas de cada partido ou federação é o que o TSE já calculou pelo quociente eleitoral. O Radar não refaz essa conta.</li>
  <li>Dentro de cada lista, as vagas vão para os mais votados. A tela mostra os que ocupam as vagas agora e os dois primeiros que ficaram de fora.</li>
  <li><b>Vaga apertada:</b> a diferença de votos entre o último de dentro e o primeiro de fora é menor que o que o último de dentro ainda pode receber, que é votos × (seções que faltam) ÷ (seções já totalizadas), supondo que as seções que faltam se pareçam com as que já entraram.</li>
  <li>As urnas não chegam em ordem aleatória, e as vagas de cada lista também mudam se o total de votos da lista mudar. Por isso é uma leitura, não um resultado.</li>
</ol></details>`;

export function renderCadeiras({ d, byId }) {
  const r = cadeiras(d);
  if (!r.listas.length) return `${aviso}<p class="empty">Aguardando o TSE distribuir as vagas e totalizar seções.</p>`;
  const total = r.listas.reduce((s, l) => s + l.vagas, 0);
  const resumo = r.apertadas.length
    ? `<b>${int(r.apertadas.length)}</b> ${r.apertadas.length === 1 ? "lista tem" : "listas têm"} a última vaga apertada.`
    : "Nenhuma lista tem a última vaga apertada neste momento.";
  return `${aviso}
    <p class="exp-lead"><b>${int(r.total)} de ${int(total)}</b> vagas ocupadas pela contagem de agora, com ${pct(avancoDe(d.secoes), 1)} das seções totalizadas. ${resumo}</p>
    ${r.apertadas.length ? `<h3>Vagas apertadas</h3><ul class="apu-aperto">${r.apertadas.map(aperto).join("")}</ul>` : ""}
    <h3>Vaga por vaga, lista por lista</h3>
    ${r.listas.map((l) => lista(l, byId)).join("")}
    ${comoLer}`;
}
