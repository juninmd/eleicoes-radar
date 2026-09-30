// "Rede" view: party <-> supplier (CNPJ) network. Overview uses web/data/rede.json (suppliers
// that served the most politicians); focus mode draws one candidate's own suppliers and
// the other politicians they served. Only companies, parties and candidates appear.
import { displayName, h, int, moneyShort, titleName } from "./format.js";
import { egoOf, layout, ringLayout } from "./rede-layout.js";

const W = 900, H = 620;
const KIND = { party: "partido", sup: "fornecedor", cand: "candidato", pol: "político" };
const memo = new Map();

function overview(rede) {
  const max = Math.max(1, ...rede.fornecedores.map((f) => f.total));
  const nodes = [
    ...rede.partidos.map((p) => ({ id: `p:${p.id}`, kind: "party", label: p.id, total: p.total })),
    ...rede.fornecedores.map((f) => ({ id: `s:${f.id}`, kind: "sup", label: titleName(f.nome), total: f.total, f, r: 5 + 8 * Math.sqrt(f.total / max) })),
  ];
  const all = rede.arestas.map((e) => ({ a: `p:${e.p}`, b: `s:${e.f}`, w: Math.log10(e.valor + 10) / 4, valor: e.valor }));
  // Drawing every edge is a hairball: keep each supplier's three biggest payers.
  const bySup = new Map();
  for (const l of all) (bySup.get(l.b) ?? bySup.set(l.b, []).get(l.b)).push(l);
  const links = [...bySup.values()].flatMap((ls) => ls.sort((x, y) => y.valor - x.valor).slice(0, 3));
  return { nodes, links, ring: true, all };
}

function focus(c) {
  const nodes = [{ id: `c:${c.id}`, kind: "cand", label: displayName(c), total: 0 }, { id: `p:${c.partido}`, kind: "party", label: c.partido, total: 0 }];
  const links = [{ a: `c:${c.id}`, b: `p:${c.partido}`, w: 1 }];
  const seen = new Set(nodes.map((n) => n.id));
  const add = (n) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  for (const f of c.fornecedores ?? []) {
    const sid = `s:${f.cnpj}`;
    add({ id: sid, kind: "sup", label: titleName(f.nome), total: f.valor, f: { nome: f.nome, cnpj: f.cnpj, situacao: f.empresa?.situacao ?? "", endereco: f.empresa?.endereco ?? "", politicos: f.outros + 1, total: f.valor, flags: f.flags } });
    links.push({ a: `c:${c.id}`, b: sid, w: 1.2 });
    for (const o of f.outrosTop) {
      add({ id: `o:${o.id}`, kind: "pol", label: titleName(o.nome), total: o.valor, party: o.partido, sub: `${o.cargo} ${o.uf}` });
      links.push({ a: sid, b: `o:${o.id}`, w: 0.8 });
      if (o.partido) {
        add({ id: `p:${o.partido}`, kind: "party", label: o.partido, total: 0 });
        links.push({ a: `o:${o.id}`, b: `p:${o.partido}`, w: 0.5 });
      }
    }
  }
  return { nodes, links };
}

const radius = (n, max) => (n.kind === "cand" ? 15 : n.kind === "party" ? 9 + 9 * Math.sqrt((n.total || 0) / (max || 1)) : 5 + 8 * Math.sqrt((n.total || 0) / (max || 1)));

function detail(n, rede) {
  if (!n) return `<p class="muted">Clique num nó para ver os detalhes. Azul: partidos · laranja: fornecedores (CNPJ) · verde: candidato em foco · rosa: outros políticos atendidos.</p>`;
  if (n.kind === "sup") {
    const f = n.f;
    const partidos = rede ? rede.arestas.filter((e) => `s:${e.f}` === n.id).sort((a, b) => b.valor - a.valor).slice(0, 8) : [];
    return `<h4>${h(titleName(f.nome))}</h4><p class="muted">CNPJ ${h(f.cnpj)}${f.situacao ? ` · situação ${h(titleName(f.situacao))}` : ""}</p>
      ${f.endereco ? `<p class="small">Endereço: ${h(f.endereco)}</p>` : ""}
      <p class="small">${moneyShort(f.total)} recebidos · ${int(f.politicos)} políticos atendidos</p>
      ${partidos.length ? `<p class="small">Partidos que mais pagaram: ${partidos.map((e) => `${h(e.p)} ${moneyShort(e.valor)}`).join(" · ")}</p>` : ""}
      ${f.flags?.length ? `<p class="flag"><b>Para conferir:</b> ${f.flags.map(h).join("; ")}.</p>` : ""}`;
  }
  if (n.kind === "party") {
    const forn = rede ? rede.arestas.filter((e) => `p:${e.p}` === n.id).sort((a, b) => b.valor - a.valor).slice(0, 6) : [];
    const nome = (id) => rede.fornecedores.find((f) => f.id === id)?.nome ?? id;
    return `<h4>${h(n.label)}</h4>${forn.length ? `<p class="small">Fornecedores mais pagos por candidatos do partido (entre os mais compartilhados): ${forn.map((e) => `${h(titleName(nome(e.f)))} ${moneyShort(e.valor)}`).join(" · ")}</p>` : `<p class="muted">Partido.</p>`}`;
  }
  return `<h4>${h(n.label)}</h4><p class="muted">${h(n.sub ?? "Candidato em foco")}${n.party ? ` · ${h(n.party)}` : ""}</p>`;
}

export function renderRede({ rede, cand, sel }) {
  if (!rede) return `<p class="empty">Os dados da rede ainda não foram gerados (<code>bun run radar:suppliers</code> e <code>radar:build</code>).</p>`;
  const key = cand ? `f:${cand.id}` : "geral";
  if (!memo.has(key)) {
    const g = cand ? focus(cand) : overview(rede);
    const pos = g.ring
      ? ringLayout(g.nodes.filter((n) => n.kind === "party"), g.nodes.filter((n) => n.kind === "sup"), g.all, { width: W, height: H })
      : layout(g.nodes, g.links, { width: W, height: H });
    memo.set(key, { g, pos });
  }
  const { g, pos } = memo.get(key);
  const byId = new Map(pos.map((n) => [n.id, n]));
  const max = Math.max(1, ...pos.map((n) => n.total || 0));
  const selNode = sel ? byId.get(sel) : null;
  const shown = selNode && g.all ? g.all.filter((l) => l.a === sel || l.b === sel) : g.links; // overview draws all edges of the selected node only
  const lit = selNode ? new Set(egoOf(selNode.id, pos, g.all ?? g.links).nodes.map((n) => n.id)) : null;
  const labelIds = new Set(pos.filter((n) => n.kind === "party" || n.kind === "cand").map((n) => n.id));
  const sups = pos.filter((n) => n.kind === "sup").sort((a, b) => (b.f?.politicos ?? 0) - (a.f?.politicos ?? 0));
  for (const n of sups.slice(0, cand ? 8 : 14)) labelIds.add(n.id);
  if (selNode) labelIds.add(selNode.id);
  const edges = (selNode && g.all ? [...g.links, ...shown] : g.links).map((l) => {
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b) return "";
    const on = !lit || (lit.has(l.a) && lit.has(l.b));
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="rede-edge${on ? "" : " dim"}" stroke-width="${(0.6 + (l.w ?? 1) * 1.4).toFixed(1)}"/>`;
  }).join("");
  const dots = pos.map((n) => {
    const on = !lit || lit.has(n.id);
    const flag = n.kind === "sup" && n.f?.flags?.length;
    const r = radius(n, max);
    return `<g class="rede-node ${n.kind}${on ? "" : " dim"}${n.id === sel ? " sel" : ""}${flag ? " flagged" : ""}" data-rede="${h(n.id)}" tabindex="0" role="button" aria-label="${h(KIND[n.kind])}: ${h(n.label)}">
      <circle cx="${n.x}" cy="${n.y}" r="${r.toFixed(1)}"/>${labelIds.has(n.id) ? `<text x="${n.x}" y="${(n.y - r - 4).toFixed(1)}" text-anchor="middle">${h(n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label)}</text>` : ""}
      <title>${h(n.label)}${n.total ? ` · ${moneyShort(n.total)}` : ""}</title></g>`;
  }).join("");
  const top = rede.fornecedores.slice(0, 10).map((f) => `<tr><td>${h(titleName(f.nome))}<br><small class="muted">${h(f.cnpj)}</small></td><td>${int(f.politicos)}</td><td>${moneyShort(f.total)}</td><td>${f.flags.length ? `<span class="pill no">${f.flags.length} sinal(is)</span>` : ""}</td></tr>`).join("");
  return `<section class="exp-card rede">
    <h2>${cand ? `Rede de ${h(displayName(cand))}` : "Rede de fornecedores"}</h2>
    <p class="muted">${cand ? "Fornecedores (CNPJ) deste candidato e os outros políticos que eles atenderam." : `Os ${rede.fornecedores.length} fornecedores que atenderam mais políticos e os partidos que os pagaram. Tamanho = dinheiro.`}
      ${cand ? `<button type="button" class="btn-confirma" data-rede-geral>Voltar à visão geral</button>` : ""}</p>
    <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Grafo de partidos, fornecedores e políticos">${edges}${dots}</svg>
    <div class="rede-detail" aria-live="polite">${detail(selNode, rede)}</div>
    ${cand ? "" : `<h3>Fornecedores mais compartilhados</h3><div class="scroll"><table class="agenda"><thead><tr><th>Empresa</th><th>Políticos</th><th>Recebido</th><th></th></tr></thead><tbody>${top}</tbody></table></div>`}
    <p class="muted small">Dados do TSE, da cota parlamentar e da Receita Federal. Uma empresa atender vários políticos, ou aparecer com sinal, não indica irregularidade por si só.</p>
  </section>`;
}
