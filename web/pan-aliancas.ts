// "Alianças" tab: who runs with whom, read from the coalition and federation text of the
// registry. Majoritarian races show coalitions; deputies only have federations.
import { h, int } from "./format.js";
import { grafoAliancas, MAJORITARIAN } from "./aliancas.js";
import type { AlCand, Grafo, Lista } from "./aliancas.js";
import { packLayout } from "./al-layout.js";

const W = 900;
const radius = (n: number, max: number) => 6 + 12 * Math.sqrt(n / Math.max(1, max));
const lista = (xs: string[]) => xs.map(h).join(", ");

function svg(g: Grafo) {
  const max = Math.max(1, ...g.nodes.map((n) => n.n));
  const { nodes: pos, height } = packLayout(g.nodes, g.links.map((l) => ({ ...l, w: l.kind === "federacao" ? 1.4 : 0.5 })), { width: W, radius: (n) => radius(n.n, max) });
  const at = new Map(pos.map((n) => [n.id, n]));
  const edges = g.links.map((l) => {
    const a = at.get(l.a)!, b = at.get(l.b)!;
    return `<line class="al-edge ${l.kind}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join("");
  const dots = pos.map((n) => `<g class="al-node"><circle cx="${n.x}" cy="${n.y}" r="${radius(n.n, max).toFixed(1)}"/><text x="${n.x}" y="${(n.y - radius(n.n, max) - 4).toFixed(1)}" text-anchor="middle">${h(n.label)}</text><title>${h(n.label)}: ${int(n.n)} ${n.n === 1 ? "candidatura" : "candidaturas"} no escopo</title></g>`).join("");
  return `<svg class="pan-svg al-svg" viewBox="0 0 ${W} ${height}" role="img" aria-label="Grafo de alianças: ${g.nodes.length} partidos e ${g.links.length} ligações">${edges}${dots}</svg>`;
}

function card(l: Lista, deputado: boolean) {
  const quem = l.candidatos.map((c) => `${h(c.nome)} <span class="muted">(${h(c.partido)})</span>`).join(" · ");
  const fed = l.tipo === "coligacao" ? l.federacoes.map((f) => `<li>${h(f.nome)}: ${lista(f.partidos)}</li>`).join("") : "";
  return `<li class="al-card"><b>${h(l.nome ?? (l.tipo === "federacao" ? "Federação" : "Coligação sem nome"))}</b>
    <span class="muted small">${l.tipo === "federacao" ? "federação" : "coligação"} · ${int(l.partidos.length)} ${l.partidos.length === 1 ? "partido" : "partidos"}</span>
    <span class="small">${lista(l.partidos)}</span>
    ${fed ? `<ul class="small muted">${fed}</ul>` : ""}
    ${deputado ? `<span class="muted small">${int(l.candidatos.length)} candidaturas</span>` : `<span class="small">${quem}</span>`}</li>`;
}

// cands: candidacies of the race on screen. all: every candidacy of the same scope (sizes the parties).
export function aliancasView({ cands, all, cargo, label }: { cands: AlCand[]; all: AlCand[]; cargo: string; label: string }) {
  if (!cands.length) return `<p class="empty">Sem candidaturas a ${h(cargo)} em ${h(label)} nos dados carregados.</p>`;
  const g = grafoAliancas(cands, all);
  const deputado = !MAJORITARIAN.has(cargo);
  const regra = deputado
    ? "Para deputado só existe federação: partidos que atuam como um só durante quatro anos. Coligação para deputado deixou de existir."
    : "Para governador, senador e presidente os partidos podem se coligar só para esta eleição, e uma coligação pode incluir federações inteiras.";
  const solos = g.solos.length ? `<p class="small"><b>Sem aliança registrada:</b> ${g.solos.map((s) => `${h(s.partido)}${s.n > 1 ? ` (${int(s.n)})` : ""}`).join(", ")}.</p>` : "";
  if (!g.listas.length) return `<p class="exp-lead">Nenhuma aliança registrada para ${h(cargo)} em ${h(label)}: todos os partidos concorrem sozinhos.</p><p class="muted small">${h(regra)}</p>${solos}`;
  return `
    <p class="exp-lead"><b>${int(g.listas.length)}</b> ${g.listas.length === 1 ? "aliança reúne" : "alianças reúnem"} <b>${int(g.nodes.length)}</b> partidos na disputa por ${h(cargo)} em ${h(label)}.</p>
    <p class="muted small">${h(regra)}</p>
    <ul class="legenda" aria-label="Como ler o grafo">
      <li><i class="k al-k fed"></i><span><b>Linha grossa:</b> mesma federação.</span></li>
      ${deputado ? "" : `<li><i class="k al-k col"></i><span><b>Linha fina:</b> mesma coligação, sem federação em comum.</span></li>`}
      <li><i class="k al-k dot"></i><span><b>Círculo:</b> quanto maior, mais candidaturas do partido neste escopo, somando todos os cargos.</span></li>
    </ul>
    ${svg(g)}
    <h3>Quem está com quem <small>${int(g.listas.length)} ${g.listas.length === 1 ? "lista" : "listas"}</small></h3>
    <ul class="al-cards">${g.listas.map((l) => card(l, deputado)).join("")}</ul>
    ${solos}
    <p class="muted small">Texto de coligação e federação como registrado no TSE. Aliança é acordo formal entre partidos: não diz nada sobre o candidato.</p>`;
}
