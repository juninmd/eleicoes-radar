// Panorama tabs (Partidos, Dinheiro, Alianças, Perfil): picks the data for the race on the
// open ballot and hands it to one view per tab. Aggregates come from web/data/panorama.json.
import { h } from "./format.js";
import { aliancasView } from "./pan-aliancas.js";
import { dinheiroView } from "./pan-dinheiro.js";
import { agendaView, partidosView } from "./pan-partidos.js";
import { perfilView } from "./pan-perfil.js";

export const PAN_MODES = { partidos: "Partidos", dinheiro: "Dinheiro", aliancas: "Alianças", perfil: "Perfil" };

const seg = (attr, value, items) => items.map(([k, nome]) => `<button type="button" data-${attr}="${k}" aria-pressed="${k === value}">${h(nome)}</button>`).join("");

function body({ modo, pan, cargo, uf, key, label, cands, metrica }) {
  const escopo = pan.escopos[key];
  if (modo === "aliancas") {
    const all = cands.filter((c) => c.uf === uf);
    return aliancasView({ cands: all.filter((c) => c.cargo === cargo), all, cargo, label: uf === "BR" ? "Brasil" : uf });
  }
  const data = escopo?.[cargo];
  if (!data) return `<p class="empty">Sem candidaturas a ${h(cargo)} em ${h(label)} nos dados do panorama.</p>`;
  if (modo === "dinheiro") return dinheiroView({ data, cargo, label, escopo });
  if (modo === "perfil") return perfilView({ data, cargo, label, br: key === "BR" });
  return partidosView({ data, cargo, label, metrica }) + agendaView(pan.agenda);
}

// uf is "BR" for the presidential race. Alliances are built per state, so that tab ignores `escopo`.
export function renderPanorama({ modo, pan, cargo, uf, escopo = "uf", metrica = "total", cands = [] }) {
  const titulo = `<h2 id="pan-t">${h(PAN_MODES[modo] ?? "")} <small>${h(cargo)}</small></h2>`;
  if (!pan) return `<section class="exp-card pan">${titulo}<p class="empty">Os dados do panorama ainda não foram gerados (<code>bun run radar:panorama</code> depois de <code>radar:build</code>).</p></section>`;
  const nacional = uf === "BR";
  const br = nacional || (escopo === "br" && modo !== "aliancas");
  const key = br ? "BR" : uf;
  const barra = nacional || modo === "aliancas" ? "" : `<div class="pan-seg" role="group" aria-label="Abrangência">${seg("pan-escopo", br ? "br" : "uf", [["uf", `Meu estado (${uf})`], ["br", "Brasil todo"]])}</div>`;
  return `<section class="exp-card pan" aria-labelledby="pan-t">${titulo}${barra}${body({ modo, pan, cargo, uf, key, label: key === "BR" ? "Brasil" : key, cands, metrica })}
    <p class="muted small">Totais por partido e por perfil, calculados na geração dos dados com as mesmas fontes do Radar. Não há nota nem recomendação aqui: é um retrato do conjunto de candidaturas.</p></section>`;
}

export function mountPanorama(root) {
  const st = { escopo: "uf", metrica: "total", ctx: null };
  const draw = (focus) => {
    root.innerHTML = renderPanorama({ ...st.ctx, escopo: st.escopo, metrica: st.metrica });
    if (focus) root.querySelector(focus)?.focus(); // a redraw drops focus; keyboard users keep their place
  };
  root.addEventListener("click", (e) => {
    const m = e.target.closest("[data-pan-metrica]"), s = e.target.closest("[data-pan-escopo]");
    if (m) { st.metrica = m.dataset.panMetrica; draw(`[data-pan-metrica="${CSS.escape(st.metrica)}"]`); }
    else if (s) { st.escopo = s.dataset.panEscopo; draw(`[data-pan-escopo="${CSS.escape(st.escopo)}"]`); }
  });
  return { show(ctx) { st.ctx = ctx; draw(); } };
}
