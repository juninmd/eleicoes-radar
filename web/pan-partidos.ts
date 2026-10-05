// "Partidos" tab: how the parties compare in one cargo and scope, plus how the deputies who
// are candidates voted on the agenda roll calls. Descriptive only: no party ranking of quality.
import { h, int, money, moneyShort, pct } from "./format.js";
import { bubbles, heat, hbars } from "./charts.js";

export const MIN_N = 3; // a share over fewer than three candidacies says nothing about a party
const ONE_SEAT = new Set(["Governador", "Presidente"]);
const share = (a, b) => (b > 0 ? a / b : null);
const dec = (v) => v.toFixed(1).replace(".", ",");

export function metricas(cargo) {
  const unica = ONE_SEAT.has(cargo);
  return {
    total: { nome: "Arrecadado", val: (p) => p.total, fmt: moneyShort },
    n: { nome: "Candidaturas", val: (p) => p.n, fmt: int },
    publico: { nome: "Fundos públicos", val: (p) => (p.n >= MIN_N ? share(p.publico, p.total) : null), fmt: (v) => pct(v) },
    mulheres: { nome: "Mulheres", val: (p) => (p.n >= MIN_N && p.mulheres != null ? share(p.mulheres, p.n) : null), fmt: (v) => pct(v) }, // null: the file withholds it (see womenShown)
    vagas: { nome: unica ? "Chance de eleição" : "Vagas esperadas", val: (p) => p.vagas, fmt: unica ? (v) => pct(v) : dec },
  };
}

export function partidosView({ data, cargo, label, metrica }) {
  const rows = Object.entries(data.partidos).map(([sigla, p]) => ({ sigla, p }));
  const M = metricas(cargo);
  const temVagas = rows.some((r) => r.p.vagas > 0);
  const keys = temVagas ? Object.keys(M) : Object.keys(M).filter((k) => k !== "vagas");
  const ativa = keys.includes(metrica) ? metrica : "total";
  const m = M[ativa];
  const sorted = rows.map((r) => ({ ...r, v: m.val(r.p) })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || b.p.total - a.p.total);
  const bars = hbars(sorted.slice(0, 15).map((r) => ({
    label: r.sigla, sub: `${int(r.p.n)} ${r.p.n === 1 ? "candidatura" : "candidaturas"}`, value: r.v ?? 0, text: r.v === null ? "–" : m.fmt(r.v),
  })));
  const tabela = [...rows].sort((a, b) => b.p.total - a.p.total).map(({ sigla, p }) => `<tr><th scope="row">${h(sigla)}</th><td class="num">${int(p.n)}</td><td class="num">${money(p.total)}</td><td class="num">${money(p.mediana)}</td><td class="num">${p.n >= MIN_N && p.total ? pct(p.publico / p.total) : "–"}</td><td class="num">${M.mulheres.val(p) === null ? "–" : pct(M.mulheres.val(p))}</td>${temVagas ? `<td class="num">${M.vagas.fmt(p.vagas)}</td>` : ""}</tr>`).join("");
  const pontos = rows.map(({ sigla, p }) => ({
    id: sigla, label: sigla, x: p.total, y: temVagas ? p.vagas : share(p.publico, p.total) ?? 0, r: p.n,
    title: `${sigla}: ${int(p.n)} candidaturas, ${moneyShort(p.total)} arrecadados${temVagas ? `, ${M.vagas.nome.toLowerCase()} ${M.vagas.fmt(p.vagas)}` : ""}`,
  }));
  const eixoY = temVagas ? M.vagas.nome.toLowerCase() : "parcela de fundos públicos";
  return `
    <div class="pan-seg" role="group" aria-label="Ordenar por">${keys.map((k) => `<button type="button" data-pan-metrica="${k}" aria-pressed="${k === ativa}">${h(M[k].nome)}</button>`).join("")}</div>
    <h3>${h(m.nome)} por partido <small>${h(cargo)} · ${h(label)}</small></h3>
    ${bars}
    ${rows.length > 15 ? `<p class="muted small">Mostrando os 15 primeiros de ${rows.length} partidos; a tabela abaixo traz todos.</p>` : ""}
    ${(ativa === "publico" || ativa === "mulheres") ? `<p class="muted small">Partidos com menos de ${MIN_N} candidaturas ficam sem percentual: uma ou duas pessoas não descrevem um partido.${ativa === "mulheres" ? " Também fica sem percentual quando a disputa inteira tem menos de 5 mulheres." : ""}</p>` : ""}
    <h3>Dinheiro × ${h(eixoY)}</h3>
    <p class="muted small">Cada bolha é um partido. Para a direita, mais dinheiro arrecadado (escala logarítmica). Para cima, ${h(eixoY)}${temVagas ? " segundo o modelo, que usa arrecadação, força da lista e ocupação declarada" : ""}. O tamanho é o número de candidaturas. Passe o mouse sobre uma bolha para ver os valores.</p>
    ${bubbles(pontos, { xFmt: moneyShort, yFmt: (v) => (temVagas && !ONE_SEAT.has(cargo) ? v.toFixed(v < 10 ? 1 : 0).replace(".", ",") : pct(v)) })}
    <details class="how"><summary>Tabela completa (${rows.length} partidos)</summary>
      <div class="scroll"><table class="agenda pan-table"><thead><tr><th>Partido</th><th class="num">Candidaturas</th><th class="num">Arrecadado</th><th class="num">Mediana por campanha</th><th class="num">Fundos públicos</th><th class="num">Mulheres</th>${temVagas ? `<th class="num">${h(M.vagas.nome)}</th>` : ""}</tr></thead><tbody>${tabela}</tbody></table></div>
      <p class="muted small">Mediana: só campanhas com receita declarada. Candidaturas sem prestação de contas não entram nos valores em dinheiro.</p>
    </details>`;
}

export function agendaView(ag) {
  if (!ag?.votacoes?.length) return "";
  const parts = Object.entries(ag.partidos).filter(([, p]) => p.n >= MIN_N).sort((a, b) => b[1].n - a[1].n);
  if (!parts.length) return "";
  const vot = new Map(ag.votacoes.map((v) => [v.id, v]));
  const tabela = heat({
    caption: "Parcela de votos Sim entre os votos Sim e Não de cada partido, por votação",
    rows: parts.map(([k, p]) => ({ key: k, label: k, sub: `${int(p.n)} deputados` })),
    cols: ag.votacoes.map((v) => ({ key: v.id, label: v.proposicao, sub: `${v.tema} · agenda: ${v.posicao}` })),
    cell: (partido, id) => {
      const [sim, nao, outro] = ag.partidos[partido].votos[id];
      const v = vot.get(id);
      if (sim + nao === 0) return { text: "–", v: null, title: `${partido}: nenhum voto Sim ou Não registrado em ${v.proposicao}` };
      return { text: pct(sim / (sim + nao)), v: sim / (sim + nao), title: `${partido} em ${v.proposicao}: ${sim} Sim, ${nao} Não${outro ? `, ${outro} outros` : ""}, de ${ag.partidos[partido].n} deputados` };
    },
  });
  return `<h3>Como os deputados candidatos votaram <small>${ag.votacoes.length} votações da agenda · todo o Brasil</small></h3>
    <p class="muted small">Cada célula é a parcela de votos <b>Sim</b> entre os votos Sim e Não dos deputados do partido que são candidatos em 2026. Quanto mais azul, mais votos Sim. A coluna diz qual voto a agenda do Radar considera alinhado: isso não torna o voto certo nem errado, só mostra de que lado cada partido ficou. Faltas não contam a favor nem contra. Partidos com menos de ${MIN_N} deputados candidatos ficam de fora.</p>
    ${tabela}
    <details class="how"><summary>Quais são as votações</summary><ul class="muted small">${ag.votacoes.map((v) => `<li><b>${h(v.proposicao)}</b> (${h(v.tema)}): ${h(v.resumo)}. Voto alinhado à agenda: <b>${h(v.posicao)}</b>.</li>`).join("")}</ul></details>`;
}
