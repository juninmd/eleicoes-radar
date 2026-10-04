// "Dinheiro" tab: where the campaign money of one cargo comes from and who holds it.
import { h, int, money, moneyShort, pct } from "./format.js";
import { legendSources, lorenz, SOURCES, stackRow } from "./charts.js";
import { sankey } from "./sankey.js";

const ORDEM = ["Deputado Federal", "Deputado Estadual", "Deputado Distrital", "Senador", "Governador", "Presidente"];
const TOP_ROWS = 12;
const TOP_FLOW = 10;
const sum = (o) => SOURCES.reduce((a, s) => a + (o[s.key] ?? 0), 0);

function composicao(fontes, total) {
  const parts = SOURCES.filter((s) => fontes[s.key] > 0);
  return `<div class="stack" role="img" aria-label="Composição da receita">${parts.map((s) => `<span class="seg ${s.cls}" style="flex-grow:${fontes[s.key]}" title="${h(s.nome)}: ${money(fontes[s.key])} (${pct(fontes[s.key] / total)})"></span>`).join("")}</div>
    <table class="kv">${parts.map((s) => `<tr><th><i class="key ${s.cls}"></i>${h(s.nome)}</th><td>${money(fontes[s.key])}</td><td class="muted">${pct(fontes[s.key] / total)}</td></tr>`).join("")}</table>`;
}

// Sources on the left, the biggest parties on the right, everyone else folded into one node.
function fluxo(partidos, fontes) {
  const ranked = Object.entries(partidos).map(([sigla, p]) => ({ sigla, p, total: sum(p) })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const top = ranked.slice(0, TOP_FLOW);
  const rest = ranked.slice(TOP_FLOW);
  const dest = [...top.map((r) => ({ id: r.sigla, label: r.sigla, p: r.p })), ...(rest.length ? [{ id: "_resto", label: `Demais (${rest.length})`, p: Object.fromEntries(SOURCES.map((s) => [s.key, rest.reduce((a, r) => a + r.p[s.key], 0)])) }] : [])];
  return sankey({
    left: SOURCES.filter((s) => fontes[s.key] > 0).map((s) => ({ id: s.key, label: s.nome, value: dest.reduce((a, d) => a + d.p[s.key], 0), cls: s.cls })),
    right: dest.map((d) => ({ id: d.id, label: d.label, value: sum(d.p) })),
    links: dest.flatMap((d) => SOURCES.map((s) => ({ from: s.key, to: d.id, value: d.p[s.key] }))),
    fmt: moneyShort,
    ariaLabel: `Fluxo do dinheiro das ${SOURCES.length} fontes para os ${dest.length} maiores destinos`,
  });
}

export function dinheiroView({ data, cargo, label, escopo }) {
  const total = sum(data.fontes);
  if (!(total > 0)) return `<p class="empty">Ainda sem receita declarada para ${h(cargo)} em ${h(label)} no retrato do TSE.</p>`;
  const ranked = Object.entries(data.partidos).map(([sigla, p]) => ({ sigla, p, total: sum(p) })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const rows = ranked.slice(0, TOP_ROWS).map((r) => stackRow({ label: r.sigla, sub: `${int(r.p.n)} ${r.p.n === 1 ? "candidatura" : "candidaturas"}`, vals: r.p, total: r.total, max: ranked[0].total, text: moneyShort(r.total) })).join("");
  const conc = data.conc ?? [];
  const cargos = ORDEM.filter((c) => escopo[c] && sum(escopo[c].fontes) > 0).map((c) => {
    const e = escopo[c];
    return stackRow({ label: c, sub: `${int(e.n)} candidaturas`, vals: e.fontes, total: sum(e.fontes), max: sum(e.fontes), text: moneyShort(sum(e.fontes)) });
  }).join("");
  const flow = fluxo(data.partidos, data.fontes);
  return `
    <p class="exp-lead">${int(data.comReceita)} de ${int(data.n)} candidaturas a ${h(cargo)} em ${h(label)} declararam receita, somando <b>${money(total)}</b>;<b>${pct(data.fontes.publico / total)}</b> veio de fundos públicos e <b>${pct(data.fontes.pf / total)}</b> de pessoas físicas.</p>
    ${legendSources()}
    <h3>De onde vem o dinheiro <small>${h(cargo)} · ${h(label)}</small></h3>
    ${composicao(data.fontes, total)}
    <h3>Cada partido por fonte <small>o comprimento da barra é o total arrecadado</small></h3>
    <ul class="pan-bars">${rows}</ul>
    ${ranked.length > TOP_ROWS ? `<p class="muted small">Os ${TOP_ROWS} maiores de ${ranked.length} partidos com receita.</p>` : ""}
    ${flow ? `<h3>Do dinheiro ao partido <small>fonte → partido, espessura proporcional ao valor</small></h3><div class="sankey-wrap">${flow}</div><p class="muted small">Cada faixa liga uma fonte a um partido. Passe o mouse para ver o valor.</p>` : ""}
    <h3>Quem fica com o dinheiro <small>concentração entre candidaturas</small></h3>
    ${conc.length ? `<div class="pan-cols"><div>${lorenz(conc)}</div><div><p class="exp-read">Os 10% que mais arrecadam ficam com <b>${pct(conc[0])}</b> do dinheiro; os 50% que menos arrecadam, com <b>${pct(1 - conc[4])}</b>.</p><p class="muted small">A linha tracejada seria a divisão igual. Quanto mais a curva se afasta dela para cima, mais concentrado. Entram todas as candidaturas do cargo, inclusive as sem receita.</p></div></div>` : `<p class="muted">Candidaturas demais pequenas ou sem receita para medir concentração.</p>`}
    <h3>Compare os cargos <small>${h(label)} · parcela de cada fonte</small></h3>
    <ul class="pan-bars">${cargos}</ul>
    <p class="muted small">Valores declarados ao TSE até o retrato dos dados. Prestação parcial: o total ainda pode subir.</p>`;
}
