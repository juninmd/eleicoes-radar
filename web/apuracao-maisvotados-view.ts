// "Mais votados" view for Deputado Federal: the top candidates of the country, drawn from the 27 state files.
// Same table pattern as the Placar. The ranking is marked partial until every state is in and closed.
import { h, int, pct } from "./format.js";
import { linhasUf } from "./apuracao-nacional.js";
import { LIMITE_MAXIMO, maisVotados, resumoArquivos } from "./apuracao-maisvotados.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";

export function renderMaisVotados({ nac, limite }: { nac: BrasilSnapshot | null | undefined; limite: number }): string {
  const linhas = linhasUf(nac?.ufs ?? {}, "Deputado Federal");
  if (!linhas.length || linhas.every((l) => !l.dados && l.status === "carregando")) return `<p class="muted">Consultando os 27 estados…</p>`;
  const r = resumoArquivos(linhas);
  const todos = maisVotados(linhas, LIMITE_MAXIMO);
  const lista = todos.slice(0, limite);
  const aviso = r.definitivo ? "" : `<p class="apu-aviso"><b>Ranking parcial.</b> ${int(r.lidos)} de ${int(r.de)} arquivos de estado responderam${r.desatualizados ? `; ${int(r.desatualizados)} ${r.desatualizados === 1 ? "deles está" : "deles estão"} com números de uma consulta anterior` : ""}. Quem está num estado sem número não entra, e a ordem pode mudar até a última seção.</p>`;
  if (!lista.length) return `${aviso}<p class="empty">Nenhum candidato a deputado federal tem votos apurados ainda.</p>`;
  const temStatus = lista.some((c) => c.situacao);
  const maior = lista[0].votos || 1;
  const linhasTab = lista.map((c, i) => {
    const chip = c.situacao ? `<span class="rot ${c.destaque ? "alta" : "baixa"}">${h(c.situacao)}</span>` : "";
    return `<tr>
      <th scope="row"><span class="mv-pos">${i + 1}º</span> ${h(c.nome)} <small>${h(c.partido)} · ${h(c.uf)}</small>${chip ? `<span class="row-inline">${chip}</span>` : ""}</th>
      <td class="num">${int(c.votos)}</td>
      <td><div class="rangewrap"><div class="apu-bar" aria-hidden="true"><span style="width:${((c.votos / maior) * 100).toFixed(2)}%"></span></div><b class="rv">${pct(c.pct, 2)}</b></div></td>
      ${temStatus ? `<td class="st-col">${chip}</td>` : ""}</tr>`;
  }).join("");
  return `${aviso}
    <p class="exp-lead"><b>${int(lista.length)} ${lista.length === 1 ? "candidato mais votado" : "candidatos mais votados"}</b> a deputado federal no país, somando os arquivos dos estados. Ordem pelos votos apurados até agora.</p>
    <div class="scroll"><table class="exp-bars apu-maisvotados">
    <caption class="sr">Candidatos a deputado federal com mais votos no país, em ordem decrescente</caption>
    <thead><tr><th scope="col">Candidato</th><th scope="col" class="num">Votos</th><th scope="col">% dos válidos da UF</th>${temStatus ? `<th scope="col" class="st-col">Situação (TSE)</th>` : ""}</tr></thead>
    <tbody>${linhasTab}</tbody></table></div>
    ${todos.length > limite && limite < LIMITE_MAXIMO ? `<button type="button" id="mv-mais" class="ghost">Ver mais</button>` : ""}`;
}
