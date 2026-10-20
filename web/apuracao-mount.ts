// Owns the polling and the view state of the Apuração tab; app.js only says which race is on screen.
// One feed follows the open race (scoreboard and charts); a second one follows every state while the
// map, the Chamber or the president's Projeção is open, so a closed one costs no requests.
import { createFeed } from "./apuracao-feed.js";
import { createBrasilFeed, ufsDo } from "./apuracao-uf.js";
import { tseUrl, TSE_BASE, turnoDe } from "./apuracao-tse.js";
import { gravarTurno, lerTurno } from "./apuracao-turno.js";
import { registrar } from "./apuracao-graficos.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA, RESTO } from "./apuracao-mapa.js";
import { idade, relogio, repaint, semRelogio } from "./apuracao-dom.js";
import { createProjecao } from "./apuracao-projecao-estado.js";
import { atualizar, vazio } from "./apuracao-novidades.js";
import { atualizar as atualizarEleitos, vazio as vazioEleitos } from "./apuracao-eleitos.js";
import { renderApuracao, vistasDe } from "./apuracao.js";
import { PAGE_MUN } from "./apuracao-municipios-view.js";
import { criarFx } from "./apuracao-fx-mount.js";
import type { RenderProps, Vista } from "./apuracao.js";
import type { FeedSnapshot } from "./apuracao-feed.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Turno } from "./apuracao-tse.js";
import type { Cenario, MunArquivo, MunIndice } from "./apuracao-municipios.js";
import type { Disputa } from "./apuracao-municipios-view.js";
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
  let turno: Turno = lerTurno();
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

  // The runoff estimate per municipality (Cidades view): an index of the races that have one, then the file of the open race.
  let munIndice: MunIndice | null | undefined; // undefined: not asked yet; null: it failed (asked again on the next visit)
  let buscandoIndice = false;
  const munArqs = new Map<string, MunArquivo | null | undefined>(); // by file name; undefined while loading
  let munCenario: Cenario = { modo: "pesquisa", alvo: 0.5 };
  let munFiltro = { uf: "", busca: "" };
  let munLimit = PAGE_MUN;
  const getJson = <T>(url: string): Promise<T> => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`HTTP ${r.status}`))));
  const disputaDe = (): Disputa | null => (ctx && munIndice ? munIndice.disputas.find((d) => d.cargo === ctx!.cargo && d.uf === (ctx!.cargo === "Presidente" ? "BR" : ctx!.uf)) ?? null : null);
  const carregarMun = () => {
    if (!munIndice && !buscandoIndice) {
      buscandoIndice = true;
      getJson<MunIndice>("data/municipal/index.json")
        .then((i) => { munIndice = i; })
        .catch((e) => { console.error("apuração: municípios", e); munIndice = null; })
        .then(() => { buscandoIndice = false; carregarMun(); paint(); });
      return;
    }
    const d = disputaDe();
    if (d && !munArqs.has(d.arquivo)) {
      munArqs.set(d.arquivo, undefined);
      getJson<MunArquivo>(`data/municipal/${d.arquivo}`)
        .then((a) => { munArqs.set(d.arquivo, a); })
        .catch((e) => { console.error("apuração: municípios", e); munArqs.delete(d.arquivo); munArqs.set(d.arquivo, null); })
        .then(paint);
    }
  };
  const munProps = (): RenderProps["mun"] => {
    if (vista !== "municipios" || !ctx) return null;
    const disputa = disputaDe();
    const arquivo = disputa ? munArqs.get(disputa.arquivo) : undefined;
    const corrida = ctx.exp?.corridas?.find((x) => x.cargo === ctx!.cargo && x.uf === ctx!.uf);
    // The TSE's count so far, only to put beside the estimate; the estimate never reads it.
    const d = snap?.dados;
    const ca = d?.candidatos.find((c) => c.id === arquivo?.a.sq), cb = d?.candidatos.find((c) => c.id === arquivo?.b.sq);
    const oficial = d && d.fase !== "aguardando" && ca && cb && d.secoes.total > 0 ? { a: ca.pct, b: cb.pct, secoes: Math.floor((d.secoes.totalizadas / d.secoes.total) * 1000) / 1000 } : null;
    return { indice: munIndice, arquivo, disputa, cenario: munCenario, filtro: munFiltro, limit: munLimit, confrontos: corrida?.confrontos, ultimaPesquisa: corrida?.ultima, oficial };
  };
  // The two animated views (Corrida, Noite no mapa) keep their own DOM and are updated in place after every paint; see apuracao-fx-mount.js.
  const fx = criarFx({ el, anunciar: (txt) => { anuncio.textContent = txt; }, estado: () => ({ ctx, vista, snap, nac, hist, mapa, cor }) });
  const nacional = () => !!ctx && (vista === "mapa" || vista === "camara" || vista === "noite" || (vista === "projecao" && ctx.cargo === "Presidente"));
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
    const html = renderApuracao({ ...ctx, turno, snap, nac, proj: projDe(), mun: munProps(), hist, novidades: novidades.itens, eleitos, limit, vista, modoMapa, selUf, mapa, cor: vista === "camara" ? corCamara : cor });
    const key = semRelogio(html);
    const quando = el.querySelector<HTMLElement>("#apu-quando");
    if (key === painted && quando) {
      quando.textContent = relogio(html) ?? quando.textContent;
      const i = el.querySelector<HTMLElement>("#apu-idade");
      if (i) i.textContent = idade(html) ?? i.textContent;
      fx.sync();
      return;
    }
    painted = key;
    repaint(el, html);
    fx.sync();
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
  const brasil = createBrasilFeed({ url: (c, uf) => tseUrl(c, uf, TSE_BASE, turnoDe(c, turno)), onChange: (s) => { nac = s; agendar(); } });

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
    if (nacional()) { if (vista === "mapa" || vista === "noite") carregarMapa(); brasil.follow(ctx!.cargo); } else { brasil.stop(); nac = null; }
  };
  const escolher = (uf: string) => {
    selUf = selUf === uf ? null : uf;
    paint();
    anuncio.textContent = selUf ? el.querySelector(".apu-uf")?.textContent!.replace(/\s+/g, " ").trim() ?? "" : "";
  };

  el.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-vista], [data-turno], [data-modo-mapa], [data-uf], [data-abrir-uf], [data-mun-modo], [data-mun-uf], [data-fx-pref], [data-demo-toggle], [data-demo], #apu-mais, #mun-mais");
    if (!t) return;
    if (fx.clique(t)) return;
    if (t.id === "apu-mais") { limit += PAGE; paint(); }
    else if (t.id === "mun-mais") { munLimit += PAGE_MUN; paint(); }
    else if (t.dataset.munModo) { munCenario = { modo: t.dataset.munModo as Cenario["modo"], alvo: t.dataset.alvo ? Number(t.dataset.alvo) : munCenario.alvo }; munLimit = PAGE_MUN; paint(); }
    else if (t.dataset.munUf) { munFiltro = { ...munFiltro, uf: munFiltro.uf === t.dataset.munUf ? "" : t.dataset.munUf }; munLimit = PAGE_MUN; paint(); }
    else if (t.dataset.turno) {
      const novo: Turno = t.dataset.turno === "2" ? 2 : 1;
      if (novo === turno) return;
      turno = novo;
      gravarTurno(turno);
      limit = PAGE; hist = []; novidades = vazio(); eleitos = vazioEleitos(); projecao.reiniciar(); selUf = null; fx.reiniciar();
      const ef = turnoDe(ctx!.cargo, turno);
      if (!vistasDe(ctx!.cargo, ef).includes(vista)) vista = "placar";
      feed.follow(tseUrl(ctx!.cargo, ctx!.uf, TSE_BASE, ef));
      brasil.stop(); nac = null; seguirMapa(); if (vista === "municipios") carregarMun(); paint();
    }
    else if (t.dataset.vista) { vista = t.dataset.vista as Vista; seguirMapa(); if (vista === "municipios") carregarMun(); paint(); }
    else if (t.dataset.modoMapa) { modoMapa = t.dataset.modoMapa; paint(); }
    else if (t.dataset.abrirUf) { vista = "placar"; seguirMapa(); ctx!.abrirUf?.(t.dataset.abrirUf); }
    else if (t.dataset.uf) escolher(t.dataset.uf);
  });
  // Controls of the Cidades view. The text box and the slider act on "change" (Enter, blur, release), not on every keystroke or drag:
  // redrawing the page under a caret or a thumb the reader is still moving would break both.
  // Redrawing removes the focused box, and the browser may fire a second "change" while it does (blur with an uncommitted value): that one is ignored.
  let mudando = false;
  el.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (mudando) return;
    if (t.id === "mun-uf") munFiltro = { ...munFiltro, uf: t.value };
    else if (t.id === "mun-busca") munFiltro = { ...munFiltro, busca: t.value.trim() };
    else if (t.id === "mun-alvo") munCenario = { modo: "meu", alvo: Number(t.value) / 100 };
    else return;
    munLimit = PAGE_MUN;
    mudando = true;
    try { paint(); } finally { mudando = false; }
  });
  el.addEventListener("input", (e) => {
    if (fx.entrada(e)) return;
    const t = e.target as HTMLInputElement;
    if (t.id === "mun-alvo") { const o = el.querySelector("#mun-alvo-txt"); if (o) o.textContent = `${Number(t.value).toFixed(1).replace(".", ",")}%`; }
  });
  // The shapes are role="button": Enter and Space must work like a click.
  el.addEventListener("keydown", (e) => {
    const t = (e.target as Element).closest?.<SVGPathElement>("path[data-uf]");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); escolher(t.dataset.uf!); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { feed.refresh(); if (nacional()) brasil.refresh(); } });

  return {
    show(next: Contexto) {
      const lido = lerTurno(); // the Ao vivo tab may have changed it
      const mudou = lido !== turno;
      turno = lido;
      if (mudou) { brasil.stop(); nac = null; }
      const outra = mudou || !ctx || ctx.cargo !== next.cargo || ctx.uf !== next.uf;
      if (outra) { limit = PAGE; hist = []; novidades = vazio(); eleitos = vazioEleitos(); projecao.reiniciar(); munFiltro = { uf: "", busca: "" }; munLimit = PAGE_MUN; fx.reiniciar(); }
      if (!ctx || ctx.cargo !== next.cargo) selUf = null; // the national map keeps its selection when only the state of the ballot changes
      ctx = next;
      const ef = turnoDe(next.cargo, turno);
      if (!vistasDe(next.cargo, ef).includes(vista)) vista = "placar";
      feed.follow(tseUrl(next.cargo, next.uf, TSE_BASE, ef));
      seguirMapa();
      if (vista === "municipios") carregarMun();
      paint();
    },
    hide() { fx.parar(); feed.stop(); brasil.stop(); ctx = null; snap = null; nac = null; painted = null; anuncio.textContent = ""; },
  };
}
