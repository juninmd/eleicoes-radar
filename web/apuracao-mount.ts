// Owns the polling and the view state of the Apuração tab; app.js only says which race is on screen.
// One feed follows the open race (scoreboard and charts); a second one follows every state while the
// map, the Chamber or the president's Projeção is open, so a closed one costs no requests.
import { createFeed } from "./apuracao-feed.js";
import { createBrasilFeed, ufsDo } from "./apuracao-uf.js";
import { tseUrl } from "./apuracao-tse.js";
import { registrar } from "./apuracao-graficos.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA, RESTO } from "./apuracao-mapa.js";
import { idade, relogio, repaint, semRelogio } from "./apuracao-dom.js";
import { createProjecao } from "./apuracao-projecao-estado.js";
import { atualizar, vazio } from "./apuracao-novidades.js";
import { atualizar as atualizarEleitos, vazio as vazioEleitos } from "./apuracao-eleitos.js";
import { renderApuracao, vistasDe } from "./apuracao.js";
import type { RenderProps, Vista } from "./apuracao.js";
import type { FeedSnapshot } from "./apuracao-feed.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Fonte } from "./apuracao-projecao-estado.js";
import type { Ponto } from "./apuracao-graficos.js";
import type { UfMap } from "../src/radar/geo/uf-map";

const PAGE = 40;

// What the page hands over for the race on screen; the rest of the props are the tab's own state.
export type Contexto = Pick<RenderProps, "cargo" | "uf" | "byId" | "avatar" | "exp"> & { abrirUf?: (uf: string) => void };

export function mountApuracao(el: HTMLElement) {
  let ctx: Contexto | null = null;
  let snap: FeedSnapshot | null = null;
  let nac: BrasilSnapshot | null = null;
  let hist: Ponto[] = [];
  let novidades = vazio();
  let eleitos = vazioEleitos();
  let limit = PAGE;
  let vista: Vista = "placar";
  let modoMapa = "lider";
  let selUf: string | null = null;
  let mapa: UfMap | null | undefined; // undefined while loading, null when it failed
  let buscandoMapa = false;
  let painted: string | null = null;
  let raf = 0;
  const cor = createCores(PALETA, RESTO);
  const projecao = createProjecao(); // the drift it measures is only seen while this tab is open
  const corCamara = createCores(PALETA, RESTO); // its own memory: lists are named differently from parties and would eat the map's colours
  // A live region must exist before its text changes, so it lives outside the redrawn area.
  const anuncio = document.createElement("div");
  anuncio.className = "sr";
  anuncio.setAttribute("aria-live", "polite");
  el.after(anuncio);

  const nacional = () => !!ctx && (vista === "mapa" || vista === "camara" || (vista === "projecao" && ctx.cargo === "Presidente"));
  // The president's projection sums the 28 state files, so it waits for every one to answer once: fewer would pass a few
  // states off as the country. A governor's is its one file.
  const projDe = () => {
    if (vista !== "projecao" || !ctx) return null;
    const presidente = ctx.cargo === "Presidente";
    if (presidente && !(nac?.ciclo! >= 1)) return null;
    const velha = (s: string | undefined) => s === "erro" || s === "ausente"; // same rule as linhasUf#defasada: the feed keeps the last numbers
    const fontes: Fonte[] = presidente ? Object.entries(nac!.ufs).map(([id, u]) => [id, u.dados, velha(u.status)]) : [[ctx.uf, snap?.dados ?? null, velha(snap?.status)]];
    return { ...projecao.ler(fontes), esperadas: presidente ? ufsDo(ctx.cargo).length : 1 };
  };

  const paint = () => {
    if (!ctx) return;
    const html = renderApuracao({ ...ctx, snap, nac, proj: projDe(), hist, novidades: novidades.itens, eleitos, limit, vista, modoMapa, selUf, mapa, cor: vista === "camara" ? corCamara : cor });
    const key = semRelogio(html);
    const quando = el.querySelector<HTMLElement>("#apu-quando");
    if (key === painted && quando) {
      quando.textContent = relogio(html) ?? quando.textContent;
      const i = el.querySelector<HTMLElement>("#apu-idade");
      if (i) i.textContent = idade(html) ?? i.textContent;
      return;
    }
    painted = key;
    repaint(el, html);
  };
  // The national feed reports once per state: draw at most once per frame.
  const agendar = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };

  const feed = createFeed({
    onChange: (s) => {
      snap = s;
      if (s.dados && s.status === "ok") { hist = registrar(hist, s.dados); if (ctx) { novidades = atualizar(novidades, s.dados, ctx); eleitos = atualizarEleitos(eleitos, s.dados, ctx); } }
      paint();
    },
  });
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
    if (nacional()) { if (vista === "mapa") carregarMapa(); brasil.follow(ctx!.cargo); } else { brasil.stop(); nac = null; }
  };
  const escolher = (uf: string) => {
    selUf = selUf === uf ? null : uf;
    paint();
    anuncio.textContent = selUf ? el.querySelector(".apu-uf")?.textContent!.replace(/\s+/g, " ").trim() ?? "" : "";
  };

  el.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-vista], [data-modo-mapa], [data-uf], [data-abrir-uf], #apu-mais");
    if (!t) return;
    if (t.id === "apu-mais") { limit += PAGE; paint(); }
    else if (t.dataset.vista) { vista = t.dataset.vista as Vista; seguirMapa(); paint(); }
    else if (t.dataset.modoMapa) { modoMapa = t.dataset.modoMapa; paint(); }
    else if (t.dataset.abrirUf) { vista = "placar"; seguirMapa(); ctx!.abrirUf?.(t.dataset.abrirUf); }
    else if (t.dataset.uf) escolher(t.dataset.uf);
  });
  // The shapes are role="button": Enter and Space must work like a click.
  el.addEventListener("keydown", (e) => {
    const t = (e.target as Element).closest?.<SVGPathElement>("path[data-uf]");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); escolher(t.dataset.uf!); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { feed.refresh(); if (nacional()) brasil.refresh(); } });

  return {
    show(next: Contexto) {
      const outra = !ctx || ctx.cargo !== next.cargo || ctx.uf !== next.uf;
      if (outra) { limit = PAGE; hist = []; novidades = vazio(); eleitos = vazioEleitos(); projecao.reiniciar(); }
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
