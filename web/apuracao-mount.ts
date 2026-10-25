// Owns the polling and the view state of the Apuração tab; app.js only says which race is on screen.
// One feed follows the open race (scoreboard and charts); a second one follows every state while the
// map, the Chamber or the president's Projeção is open, so a closed one costs no requests.
// With "Simulação" on (apuracao-sim-mount.js) both feeds stop and every view reads the simulated night instead (apuracao-sim-fonte.js).
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
import { renderPainel } from "./apuracao-painel.js";
import { PAGE_MUN } from "./apuracao-municipios-view.js";
import { criarFx } from "./apuracao-fx-mount.js";
import { criarFonteSim } from "./apuracao-sim-fonte.js";
import { agoraSim } from "./apuracao-sim.js";
import { criarTopo } from "./apuracao-sim-mount.js";
import { createChance } from "./apuracao-chance.js";
import { chanceProps, criarMunicipais, exteriorProps } from "./apuracao-mount-props.js";
import { criarTelaCheia } from "./apuracao-tela-cheia.js";
import type { RenderProps, Vista } from "./apuracao.js";
import type { FeedSnapshot } from "./apuracao-feed.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Turno } from "./apuracao-tse.js";
import type { Cenario, MunIndice } from "./apuracao-municipios.js";
import type { Fonte } from "./apuracao-projecao-estado.js";
import type { Ponto } from "./apuracao-graficos.js";
import type { EstadoMun } from "./apuracao-mount-props.js";
import type { UfMap } from "../src/radar/geo/uf-map";
import type { MundoMap } from "./apuracao-noite.js";

const PAGE = 40;
const UMA_VAGA: ReadonlySet<string> = new Set(["Presidente", "Governador"]);

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
  let mundo: MundoMap | null | undefined; // the world map of the Noite view's "Exterior" choice
  let buscandoMundo = false;
  let painted: string | null = null;
  let raf = 0;
  const cor = createCores(PALETA, RESTO);
  const projecao = createProjecao(); // the drift it measures is only seen while this tab is open
  const leitorChance = createChance();
  // Fullscreen panel (apuracao-painel.js): what the tab follows changes with it (the president's panel shows the map and the exterior).
  const tela = criarTelaCheia(el, () => { painted = null; seguir(); paint(); });
  const cheia = () => tela.ativa();
  const corCamara = createCores(PALETA, RESTO); // its own memory: lists are named differently from parties and would eat the map's colours
  // The controls above the views are never redrawn; the views go in `corpo`.
  const topo = document.createElement("div");
  const corpo = document.createElement("div");
  el.replaceChildren(topo, corpo);
  // A live region must exist before its text changes, so it lives outside the redrawn area.
  const anuncio = document.createElement("div");
  anuncio.className = "sr";
  anuncio.setAttribute("aria-live", "polite");
  el.after(anuncio);

  const getJson = <T>(url: string): Promise<T> => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`HTTP ${r.status}`))));
  // The runoff estimate per municipality: an index of the races that have one, then the file of the open race.
  const munis = criarMunicipais(getJson, () => paint());
  let munCenario: Cenario = { modo: "pesquisa", alvo: 0.5 };
  let munFiltro = { uf: "", busca: "" };
  let munLimit = PAGE_MUN;
  // Cidades, Chance ao vivo, Exterior and the runoff panel read the municipal files.
  const precisaMun = () => !!ctx && (vista === "municipios" || vista === "chance" || vista === "exterior" || (vista === "noite" && ctx.cargo === "Presidente") || (cheia() && UMA_VAGA.has(ctx.cargo) && turnoDe(ctx.cargo, turno) === 2));
  const munProps = (): RenderProps["mun"] => {
    if (vista !== "municipios" || !ctx || simAtivo()) return null;
    const disputa = munis.disputa(ctx);
    const arquivo = munis.arquivo(ctx);
    const corrida = ctx.exp?.corridas?.find((x) => x.cargo === ctx!.cargo && x.uf === ctx!.uf);
    // The TSE's count so far, only to put beside the estimate; the estimate never reads it.
    const d = snap?.dados;
    const ca = d?.candidatos.find((c) => c.id === arquivo?.a.sq), cb = d?.candidatos.find((c) => c.id === arquivo?.b.sq);
    const oficial = d && d.fase !== "aguardando" && ca && cb && d.secoes.total > 0 ? { a: ca.pct, b: cb.pct, secoes: Math.floor((d.secoes.totalizadas / d.secoes.total) * 1000) / 1000 } : null;
    return { indice: munis.indice(), arquivo, disputa, cenario: munCenario, filtro: munFiltro, limit: munLimit, confrontos: corrida?.confrontos, ultimaPesquisa: corrida?.ultima, oficial };
  };
  const estadoMun = (): EstadoMun => ({ ctx: ctx!, turno, snap, nac, indice: munis.indice(), disputa: munis.disputa(ctx!), arquivo: munis.arquivo(ctx!), simulado: simAtivo(), idSim: sim.idDe });
  const chanceDe = () => (ctx && (vista === "chance" || cheia()) && UMA_VAGA.has(ctx.cargo) ? chanceProps(estadoMun(), leitorChance) : null);
  const exteriorDe = () => (ctx && (vista === "exterior" || cheia()) ? exteriorProps(estadoMun()) : null);

  // The simulated night: the files come from apuracao-sim-fonte.js, the moment from the player above the views.
  const sim = criarFonteSim({
    params: () => getJson<MunIndice>("data/municipal/index.json").then((i) => i.params),
    onPronto: () => { if (simAtivo()) aplicarSim(true); },
  });
  const simAtivo = () => ui.fonte() === "sim";
  // In the simulation no real candidacy may appear: no photos or dossiers (byId), no poll averages (exp) next to fictional names.
  const ctxVista = (): Contexto => (simAtivo() ? { ...ctx!, byId: new Map(), exp: undefined } : ctx!);

  // The two animated views (Corrida, Noite no mapa) keep their own DOM and are updated in place after every paint; see apuracao-fx-mount.js.
  const fx = criarFx({ el: corpo, anunciar: (txt) => { anuncio.textContent = txt; }, estado: () => ({ ctx: ctx && ctxVista(), vista, snap, nac, hist, mapa, mundo, exterior: ctx && vista === "noite" ? exteriorProps(estadoMun()) : null, cor, simulado: simAtivo() }) });
  const nacional = () => !!ctx && (vista === "mapa" || vista === "camara" || vista === "noite"
    || (ctx.cargo === "Presidente" && (vista === "projecao" || vista === "chance" || vista === "exterior" || cheia())));
  const velha = (s: string | undefined) => s === "erro" || s === "ausente"; // same rule as linhasUf#defasada: the feed keeps the last numbers
  const fontesProj = (s: FeedSnapshot | null, n: BrasilSnapshot | null): Fonte[] =>
    (ctx!.cargo === "Presidente" ? Object.entries(n?.ufs ?? {}).map(([id, u]) => [id, u.dados, velha(u.status)]) : [[ctx!.uf, s?.dados ?? null, velha(s?.status)]]);
  // The president's projection sums the 28 state files, so it waits for every one to answer once: fewer would pass a few
  // states off as the country. A governor's is its one file. The fullscreen panel of a 1st round shows its summary.
  const comProjecao = () => !!ctx && (vista === "projecao" || (cheia() && UMA_VAGA.has(ctx.cargo) && turnoDe(ctx.cargo, turno) === 1));
  const projDe = () => {
    if (!comProjecao()) return null;
    const presidente = ctx!.cargo === "Presidente";
    if (presidente && !(nac?.ciclo! >= 1)) return null;
    return { ...projecao.ler(fontesProj(snap, nac)), esperadas: presidente ? ufsDo(ctx!.cargo).length : 1 };
  };

  const paint = () => {
    if (!ctx) return;
    const simulado = simAtivo();
    const c = vista === "camara" ? corCamara : cor;
    const ch = cheia() ? chanceDe() : null, ex = cheia() ? exteriorDe() : null;
    const html = cheia()
      ? renderPainel({ cargo: ctx.cargo, uf: ctx.uf, turno, snap, nac, mapa, cor, novidades: novidades.itens, simulado, chance: ch ? { ...ch, cargo: ctx.cargo, cor, simulado } : null, proj: projDe(), exterior: ex ? { ...ex, cor, turno: turnoDe(ctx.cargo, turno) } : null })
      : renderApuracao({ ...ctxVista(), turno, snap, nac, proj: projDe(), mun: munProps(), chance: chanceDe(), exterior: exteriorDe(), simulado, hist, novidades: novidades.itens, eleitos, limit, vista, modoMapa, selUf, mapa, cor: c });
    const key = semRelogio(html);
    const quando = corpo.querySelector<HTMLElement>("#apu-quando");
    if (key === painted && quando) {
      quando.textContent = relogio(html) ?? quando.textContent;
      const i = corpo.querySelector<HTMLElement>("#apu-idade");
      if (i) i.textContent = idade(html) ?? i.textContent;
      fx.sync();
      ui.sync();
      return;
    }
    painted = key;
    repaint(corpo, html);
    fx.sync();
    ui.sync();
  };
  // The national feed reports once per state: draw at most once per frame.
  const agendar = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };

  // What a new file of the open race adds to the session: a point of the charts, the lines of the updates, the elected so far.
  const registrarSnap = (s: FeedSnapshot) => {
    if (s.dados && s.status === "ok") { hist = registrar(hist, s.dados); if (ctx) { novidades = atualizar(novidades, s.dados, ctx); eleitos = atualizarEleitos(eleitos, s.dados, ctx); } }
  };
  const zerarSessao = () => { limit = PAGE; hist = []; novidades = vazio(); eleitos = vazioEleitos(); projecao.reiniciar(); };
  const feed = createFeed({ onChange: (s) => { if (simAtivo()) return; snap = s; registrarSnap(s); paint(); } });
  const brasil = createBrasilFeed({ url: (c, uf) => tseUrl(c, uf, TSE_BASE, turnoDe(c, turno)), onChange: (s) => { if (simAtivo()) return; nac = s; agendar(); } });

  // Step k of the simulated night. A jump (salto) rebuilds what the session has seen up to k, as if the tab had been open all night.
  const aplicarSim = (salto: boolean) => {
    if (!ctx) return;
    const k = ui.passo();
    const t = turnoDe(ctx.cargo, turno);
    const p = { cargo: ctx.cargo, uf: ctx.uf, turno: t };
    const comNac = nacional();
    sim.preparar(p, comNac);
    const snapEm = (i: number): FeedSnapshot => ({ url: null, ...sim.quadro(p, i), buscadoEm: agoraSim(i, t) });
    const nacEm = (i: number): BrasilSnapshot => ({
      cargo: ctx!.cargo, ciclo: sim.pronto(p, true) ? i + 1 : 0, buscadoEm: agoraSim(i, t),
      ufs: Object.fromEntries(ufsDo(ctx!.cargo).map((uf) => [uf, { ...sim.quadro({ ...p, uf }, i), buscadoEm: agoraSim(i, t) }])),
    });
    if (salto) {
      zerarSessao(); fx.reiniciar();
      if (sim.pronto(p, comNac)) for (let i = 0; i < k; i++) { const s = snapEm(i); registrarSnap(s); if (comProjecao()) projecao.ler(fontesProj(s, comNac ? nacEm(i) : null)); }
    }
    snap = snapEm(k);
    nac = comNac ? nacEm(k) : null;
    registrarSnap(snap);
    paint();
  };
  const ui = criarTopo({
    topo,
    mudarFonte: (f) => {
      painted = null; selUf = null; snap = null; nac = null;
      zerarSessao(); fx.reiniciar();
      if (f === "sim") { feed.stop(); brasil.stop(); } else sim.parar();
      seguir();
      paint();
    },
    irPara: (_k, salto) => aplicarSim(salto),
    pronto: () => !ctx || sim.pronto({ cargo: ctx.cargo, uf: ctx.uf, turno: turnoDe(ctx.cargo, turno) }, nacional()),
    telaCheia: () => tela.alternar(),
    cheia: () => tela.ativa(),
  });

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
  const carregarMundo = () => {
    if (mundo || buscandoMundo) return;
    buscandoMundo = true;
    mundo = undefined;
    getJson<MundoMap>("mapa-mundo.json")
      .then((m) => { mundo = m; })
      .catch((e) => { console.error("apuração: mapa-múndi", e); mundo = null; })
      .then(() => { buscandoMundo = false; paint(); });
  };
  const seguirMapa = () => {
    if (vista === "noite" && ctx?.cargo === "Presidente") carregarMundo();
    if (vista === "mapa" || vista === "noite" || (cheia() && ctx?.cargo === "Presidente")) carregarMapa();
    if (simAtivo()) return;
    if (nacional()) brasil.follow(ctx!.cargo); else { brasil.stop(); nac = null; }
  };
  // Follows the open race: the TSE files, or the simulated night.
  const seguir = () => {
    if (!ctx) return;
    if (precisaMun()) munis.carregar(ctx);
    if (simAtivo()) { seguirMapa(); aplicarSim(true); return; }
    feed.follow(tseUrl(ctx.cargo, ctx.uf, TSE_BASE, turnoDe(ctx.cargo, turno)));
    seguirMapa();
  };
  const escolher = (uf: string) => {
    selUf = selUf === uf ? null : uf;
    paint();
    anuncio.textContent = selUf ? corpo.querySelector(".apu-uf")?.textContent!.replace(/\s+/g, " ").trim() ?? "" : "";
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
      zerarSessao(); selUf = null; fx.reiniciar();
      const ef = turnoDe(ctx!.cargo, turno);
      if (!vistasDe(ctx!.cargo, ef).includes(vista)) vista = "placar";
      brasil.stop(); nac = null; seguir(); paint();
    }
    else if (t.dataset.vista) { vista = t.dataset.vista as Vista; seguir(); paint(); }
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
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !simAtivo()) { feed.refresh(); if (nacional()) brasil.refresh(); } });

  return {
    show(next: Contexto) {
      const lido = lerTurno(); // the Ao vivo tab may have changed it
      const mudou = lido !== turno;
      turno = lido;
      if (mudou) { brasil.stop(); nac = null; }
      const outra = mudou || !ctx || ctx.cargo !== next.cargo || ctx.uf !== next.uf;
      if (outra) { zerarSessao(); munFiltro = { uf: "", busca: "" }; munLimit = PAGE_MUN; fx.reiniciar(); }
      if (!ctx || ctx.cargo !== next.cargo) selUf = null; // the national map keeps its selection when only the state of the ballot changes
      ctx = next;
      const ef = turnoDe(next.cargo, turno);
      if (!vistasDe(next.cargo, ef).includes(vista)) vista = "placar";
      seguir();
      paint();
    },
    hide() { tela.sair(false); ui.pausar(); fx.parar(); feed.stop(); brasil.stop(); sim.parar(); ctx = null; snap = null; nac = null; painted = null; anuncio.textContent = ""; },
  };
}
