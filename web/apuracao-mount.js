// Owns the polling and the view state of the Apuração tab; app.js only says which race is on screen.
// One feed follows the open race (scoreboard and charts); a second one follows every state while the
// map is open, so a closed map costs no requests.
import { createFeed } from "./apuracao-feed.js";
import { createBrasilFeed } from "./apuracao-uf.js";
import { tseUrl } from "./apuracao-tse.js";
import { registrar } from "./apuracao-graficos.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA, RESTO } from "./apuracao-mapa.js";
import { relogio, repaint, semRelogio } from "./apuracao-dom.js";
import { renderApuracao, vistasDe } from "./apuracao.js";

const PAGE = 40;

export function mountApuracao(el) {
  let ctx = null;
  let snap = null;
  let nac = null;
  let hist = [];
  let limit = PAGE;
  let vista = "placar";
  let modoMapa = "lider";
  let selUf = null;
  let mapa; // undefined while loading, null when it failed
  let buscandoMapa = false;
  let painted = null;
  let raf = 0;
  const cor = createCores(PALETA, RESTO);
  const corCamara = createCores(PALETA, RESTO); // its own memory: lists are named differently from parties and would eat the map's colours
  // A live region must exist before its text changes, so it lives outside the redrawn area.
  const anuncio = document.createElement("div");
  anuncio.className = "sr";
  anuncio.setAttribute("aria-live", "polite");
  el.after(anuncio);

  const paint = () => {
    if (!ctx) return;
    const html = renderApuracao({ ...ctx, snap, nac, hist, limit, vista, modoMapa, selUf, mapa, cor: vista === "camara" ? corCamara : cor });
    const key = semRelogio(html);
    const quando = el.querySelector("#apu-quando");
    if (key === painted && quando) { quando.textContent = relogio(html) ?? quando.textContent; return; }
    painted = key;
    repaint(el, html);
  };
  // The national feed reports once per state: draw at most once per frame.
  const agendar = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };

  const feed = createFeed({ onChange: (s) => { snap = s; if (s.dados && s.status === "ok") hist = registrar(hist, s.dados); paint(); } });
  const brasil = createBrasilFeed({ onChange: (s) => { nac = s; agendar(); } });

  const carregarMapa = () => {
    if (mapa || buscandoMapa) return; // after a failure (null) the next visit to the Mapa view tries again
    buscandoMapa = true;
    mapa = undefined;
    fetch("mapa-uf.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m) => { mapa = m; })
      .catch((e) => { console.error("apuração: mapa", e); mapa = null; })
      .then(() => { buscandoMapa = false; paint(); });
  };
  const seguirMapa = () => {
    if ((vista === "mapa" || vista === "camara") && ctx) { if (vista === "mapa") carregarMapa(); brasil.follow(ctx.cargo); } else { brasil.stop(); nac = null; }
  };
  const escolher = (uf) => {
    selUf = selUf === uf ? null : uf;
    paint();
    anuncio.textContent = selUf ? el.querySelector(".apu-uf")?.textContent.replace(/\s+/g, " ").trim() ?? "" : "";
  };

  el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-vista], [data-modo-mapa], [data-uf], [data-abrir-uf], #apu-mais");
    if (!t) return;
    if (t.id === "apu-mais") { limit += PAGE; paint(); }
    else if (t.dataset.vista) { vista = t.dataset.vista; seguirMapa(); paint(); }
    else if (t.dataset.modoMapa) { modoMapa = t.dataset.modoMapa; paint(); }
    else if (t.dataset.abrirUf) { vista = "placar"; seguirMapa(); ctx.abrirUf?.(t.dataset.abrirUf); }
    else if (t.dataset.uf) escolher(t.dataset.uf);
  });
  // The shapes are role="button": Enter and Space must work like a click.
  el.addEventListener("keydown", (e) => {
    const t = e.target.closest?.("path[data-uf]");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); escolher(t.dataset.uf); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { feed.refresh(); if (vista === "mapa" || vista === "camara") brasil.refresh(); } });

  return {
    show(next) {
      const outra = !ctx || ctx.cargo !== next.cargo || ctx.uf !== next.uf;
      if (outra) { limit = PAGE; hist = []; }
      if (!ctx || ctx.cargo !== next.cargo) selUf = null; // the national map keeps its selection when only the state of the ballot changes
      ctx = next;
      if (!vistasDe(next.cargo).includes(vista)) vista = "placar";
      feed.follow(tseUrl(next.cargo, next.uf));
      seguirMapa();
      paint();
    },
    hide() { feed.stop(); brasil.stop(); ctx = null; snap = null; nac = null; painted = null; anuncio.textContent = ""; },
  };
}
