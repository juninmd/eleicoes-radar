import { DEFAULT_PRESET, PRESETS, score } from "./score.js";
import { displayName, h, int, moneyShort, pct, slug, STATUS } from "./format.js";
import { countUp } from "./hero.js";
import { renderDossier } from "./dossier.js";
import { isPicked, normalizeCola, seatsOf, togglePick } from "./cola.js";
import type { Ballot } from "./cola.js";
import { colaHtml, mountColaButtons } from "./cola-view.js";
import { candHash, isCandHash, parseCandLink } from "./cand-link.js";
import { abaSobDemanda, quandoPronta } from "./abas-sob-demanda.js";
import { PAN_MODES } from "./pan-modos.js";
import { createFornecedores, ufsPendentes } from "./fornecedores-carga.js";
import { matches, SORTS, semEvidencia } from "./lista.js";
import { achados } from "./achados.js";
import { LEVELS, presetsHtml, weightsHtml } from "./pesos.js";
import { mountTabs, syncTabs, tituloDaAba } from "./tabs.js";
import { keepFocus, visibleOpener } from "./focus.js";
import type { AppState, AvatarSrc, Meta } from "./app-tipos.js";
import type { Candidatura } from "./types.js";
import type { Cargo } from "./apuracao-tse.js";
import type { Visao } from "./apuracao-link.js";

// Ballot order and digit count exactly as on the urna.
const BALLOTS: Ballot[] = [
  { cargo: "Deputado Federal", digits: 4 },
  { cargo: "Deputado Estadual", alt: "Deputado Distrital", digits: 5 },
  { cargo: "Senador", digits: 3, seats: 2 }, // 2/3 renewal: 2 seats in 2026 and 2034, 1 in 2030
  { cargo: "Governador", digits: 2 },
  { cargo: "Presidente", digits: 2, national: true },
];
const PAGE = 40;

const store = {
  get<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(`radar:${k}`) as string) ?? d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(`radar:${k}`, JSON.stringify(v)); } catch { /* storage blocked: session-only */ } },
};

const state: AppState = {
  uf: store.get("uf", "SP"),
  ballot: 0,
  // v2: indicator set changed; older saved weights would silently zero the agenda.
  weights: { ...PRESETS[DEFAULT_PRESET].w, ...store.get("weights-v2", {}) },
  agenda: null,
  busca: "",
  ordem: "nota",
  situacao: "todas",
  fotos: {},
  mostrarFotos: store.get("fotos", true),
  limit: PAGE,
  cands: [],
  open: null,
  cola: normalizeCola(store.get("cola", {})),
  modo: "aovivo", // the link always opens on Ao vivo; a #cand= or #apuracao link switches below (and boot.ts mirrors this before first paint)
  exp: null,
  pan: null,
  rede: null,
  redeFoco: null, // candidate id, or null for the overview
  redeSel: null,
};
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const cache = new Map<string, Promise<unknown>>();
// Heavy tabs: each module is downloaded on its first open (or prefetched on hover); the radar boot does not wait for them.
const apuracao = abaSobDemanda(() => import("./apuracao-mount.js"), (m) => m.mountApuracao($("#apu-view")));
const aoVivo = abaSobDemanda(() => import("./apuracao-aovivo.js"), (m) => m.mountAoVivo($("#live-view")));
const panorama = abaSobDemanda(() => import("./panorama.js"), (m) => m.mountPanorama($("#pan-view")));
const expectativa = abaSobDemanda(() => import("./expectativa.js"), (m) => m.renderExpectativa);
const redeAba = abaSobDemanda(() => import("./rede.js"), (m) => m.renderRede);
const abaDo = (modo: string) => (modo === "apuracao" ? apuracao : modo === "aovivo" ? aoVivo : modo === "expectativa" ? expectativa : modo === "rede" ? redeAba : modo in PAN_MODES ? panorama : null);
// A deep link to the Apuração tab, applied once that tab is ready (see abrirLink).
let linkPendente: Visao | null = null;

async function loadJson<T = unknown>(path: string): Promise<T> {
  // Falha não fica no cache: a próxima chamada tenta de novo.
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json(); }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path) as Promise<T>;
}

const ballotOf = (c: Candidatura) => BALLOTS.findIndex((b) => b.cargo === c.cargo || b.alt === c.cargo);

let retrying = false;
async function tentarCarregar(acao: "uf" | "main", btn?: HTMLButtonElement) {
  if (retrying) return;
  retrying = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Carregando…";
  }
  try {
    if (acao === "uf") {
      await loadUf();
    } else {
      await main();
    }
  } catch (err: unknown) {
    console.error(err);
    document.body.classList.add("ready");
    document.body.dataset.visao = "radar";
    $("#lista").classList.remove("carregando");
    $("#lista").innerHTML = `<li class="empty"><p role="alert">Não foi possível carregar os dados${acao === "uf" ? " desta UF" : ""}. Verifique a conexão e tente de novo.</p><button type="button" class="btn-confirma" data-retry-${acao}>Tentar novamente</button></li>`;
  } finally {
    retrying = false;
  }
}

async function loadUf() {
  const reqUf = state.uf;
  // The retry button lives in the list, which render() replaces: remember focus to give it back.
  const foco = $("#lista").contains(document.activeElement);
  $("#lista").setAttribute("aria-busy", "true");
  try {
    const [local, br] = await Promise.all([loadJson<Candidatura[]>(`data/uf/${reqUf}.json`), loadJson<Candidatura[]>("data/uf/BR.json")]);
    if (state.uf !== reqUf) return;
    state.cands = [...local, ...br];
  } catch {
    if (state.uf !== reqUf) return;
    // Sem isto a lista ficaria em aria-busy para sempre e sem aviso.
    $("#lista").classList.remove("carregando");
    $("#lista").innerHTML = `<li class="empty"><p role="alert">Não foi possível carregar as candidaturas desta UF. Verifique a conexão.</p><button type="button" class="btn-confirma" data-retry-uf>Tentar novamente</button></li>`;
    if (foco) $<HTMLButtonElement>("#lista button[data-retry-uf]")?.focus();
    return;
  } finally {
    if (state.uf === reqUf) {
      $("#lista").removeAttribute("aria-busy");
    }
  }
  $("#lista").classList.remove("carregando");
  for (const uf of [state.uf, "BR"]) forn.aplicar(state.cands, uf); // a sidecar already read for this UF is merged before the first paint
  render();
  if (foco) $("#lista").focus({ preventScroll: true });
  loadFotos();
  ocioso(() => pedirFornecedores(ufsPendentes(state.cands, [state.uf, "BR"])));
}

$("#lista").addEventListener("click", (e) => {
  const btn = (e.target as Element | null)?.closest<HTMLButtonElement>("button[data-retry-uf], button[data-retry-main]");
  if (!btn) return;
  if ("retryUf" in btn.dataset) {
    tentarCarregar("uf", btn);
  } else if ("retryMain" in btn.dataset) {
    tentarCarregar("main", btn);
  }
});

// Photos load per open ballot, after the list; a missing file just means initials. Off means no bytes: a ballot file is up to 7 MB gzipped.
async function loadFotos() {
  if (!state.mostrarFotos) return;
  const b = BALLOTS[state.ballot];
  const cargo = state.uf === "DF" && b.alt ? b.alt : b.cargo;
  const file = `data/fotos/${b.national ? "BR" : state.uf}-${slug(cargo)}.json`;
  const fotos = await loadJson<Record<string, string>>(file).catch(() => ({}));
  Object.assign(state.fotos, fotos);
  renderList();
  renderDossierPanel();
  renderModo();
}

function visible() {
  const b = BALLOTS[state.ballot];
  return state.cands
    .filter((c) => ballotOf(c) === state.ballot && (!b.national || c.uf === "BR"))
    .filter((c) => state.situacao === "todas" || (state.situacao === "camara" ? c.mandato : c.perfil?.status === state.situacao))
    .filter((c) => matches(c, state.busca))
    .map((c) => ({ c, s: score(c.ind, state.weights) }))
    .sort(SORTS[state.ordem]);
}

function renderTabs() {
  keepFocus($("#cedulas"), () => {
    $("#cedulas").innerHTML = BALLOTS.map((b, i) => {
      const n = state.cands.filter((c) => ballotOf(c) === i && (!b.national || c.uf === "BR")).length;
      const nome = state.uf === "DF" && b.alt ? b.alt : b.cargo;
      return `<button type="button" role="tab" id="ced-${i}" aria-selected="${i === state.ballot}" aria-controls="cedula-painel" data-ballot="${i}">
        <span class="tname">${h(nome)}</span><span class="digits">${"<i></i>".repeat(b.digits)}</span><span class="tcount">${int(n)}</span></button>`;
    }).join("");
  });
  syncTabs($("#cedulas"));
  $("#cedula-painel").setAttribute("aria-labelledby", `ced-${state.ballot}`);
}

function renderWeights() {
  $("#pesos").innerHTML = weightsHtml(state.weights);
  $("#presets").innerHTML = presetsHtml(state.weights);
}

function renderList() {
  const list = visible();
  $("#achados").innerHTML = achados(list.map((x) => x.c));
  $("#sem-evidencia").hidden = !semEvidencia(list);
  const temFiltro = Boolean(state.busca || state.situacao !== "todas");
  const btnLimpar = document.getElementById("limpar-filtros");
  if (btnLimpar) btnLimpar.hidden = !temFiltro;
  const statusEl = document.getElementById("busca-status");
  if (statusEl) {
    statusEl.textContent = temFiltro
      ? (list.length === 0 ? "Nenhuma candidatura encontrada." : `${int(list.length)} candidatura${list.length > 1 ? "s" : ""} encontrada${list.length > 1 ? "s" : ""}.`)
      : "";
  }
  const shown = list.slice(0, state.limit);
  // Two registrations with one number usually means a substitution the registry
  // does not resolve (its status field is empty); flag it instead of guessing.
  const seen = new Map<string, number>();
  for (const { c } of list) seen.set(c.num, (seen.get(c.num) ?? 0) + 1);
  const ballot = BALLOTS[state.ballot];
  $("#lista").innerHTML = shown.length ? shown.map(({ c, s }, i) => `
    <li><button type="button" class="cand${state.open === c.id ? " open" : ""}" data-open="${h(c.id)}" aria-expanded="${state.open === c.id}" aria-controls="dossie">
      <span class="pos">${i + 1}</span>
      <span class="num">${h(c.num.padStart(ballot.digits, " "))}</span>
      ${avatar(c, "sm")}
      <span class="who"><b>${h(displayName(c))}</b><small>${h(c.partido)}${STATUS[c.perfil?.status as string]?.curto ? ` · <em class="tag st-${h(c.perfil!.status)}">${h(STATUS[c.perfil!.status].curto)}</em>` : ""}${seen.get(c.num)! > 1 ? ` · <em class="tag st-reeleicao">número repetido no TSE</em>` : ""}${isPicked(state.cola, c) ? ` · <em class="tag ok">na cola</em>` : ""}</small></span>
      <span class="money"><span class="sr">Arrecadação </span>${moneyShort(c.fin.total)}</span>
      <span class="score"><span class="sr">Nota </span><b>${s.nota ?? "–"}</b><span class="ev"><span class="sr">Evidência ${pct(s.cobertura)}</span>${[0.01, 0.5, 0.99].map((t) => `<i class="${s.cobertura >= t ? "on" : ""}"></i>`).join("")}</span></span>
    </button></li>`).join("") : `<li class="empty"><p>Nenhuma candidatura encontrada com esses filtros.</p><button type="button" class="btn-confirma" data-limpar-filtros>Limpar filtros</button></li>`;
  $("#mais").hidden = list.length <= state.limit;
  $("#mais").textContent = `Mostrar mais ${Math.min(PAGE, list.length - state.limit)} de ${int(list.length - state.limit)} restantes`;
}

function avatar(c: AvatarSrc, size: string) {
  const src = state.mostrarFotos && (state.fotos[c.id] || c.foto);
  const initials = displayName(c).split(" ").filter((w) => /^[A-ZÀ-Ú]/.test(w)).map((w) => w[0]).slice(0, 2).join("");
  return src
    ? `<img class="av ${size}" src="${h(src)}" alt="" loading="lazy" decoding="async">`
    : `<span class="av ${size} ini" aria-hidden="true">${h(initials)}</span>`;
}

function renderDossierPanel() {
  const panel = $("#dossie");
  const c = state.cands.find((x) => x.id === state.open);
  panel.hidden = !c;
  document.body.classList.toggle("has-dossie", !!c);
  if (c) panel.innerHTML = renderDossier(c, score(c.ind, state.weights), isPicked(state.cola, c), state.agenda, avatar(c, "lg"), state.exp, estadoForn(c));
}

// The supplier sidecar is read only by the dossier and the network: it loads after the list, or at once when one of them asks first.
const forn = createFornecedores();
const estadoForn = (c: Candidatura) => forn.estadoDe(c);
const ocioso = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn) : setTimeout(fn, 200));

function pedirFornecedores(ufs: string[]) {
  for (const uf of ufs) if (forn.estado(uf) !== "pronto") forn.carregar(uf).catch(() => {}).then(() => atualizaFornecedores(uf));
}

// Redraws the open dossier only when its candidate is in that UF. After a retry the button is gone, so focus goes to the dossier.
function redesenharDossie(uf: string, retomar: boolean) {
  const aberto = state.cands.find((x) => x.id === state.open);
  if (aberto?.uf !== uf) return;
  keepFocus($("#dossie"), renderDossierPanel);
  if (retomar && document.activeElement === document.body) $("#dossie").focus({ preventScroll: true });
}

// Merges a finished sidecar and redraws only what shows those fields: the open dossier and the network.
function atualizaFornecedores(uf: string) {
  forn.aplicar(state.cands, uf);
  redesenharDossie(uf, false);
  if (state.modo === "rede") renderModo();
}

// Opening moves focus into the dossier; closing gives it back to the candidate that opened it.
function setOpen(id: string | null) {
  const prev = state.open;
  state.open = id;
  renderList();
  renderDossierPanel();
  if (id) history.replaceState(null, "", `${location.pathname}${location.search}${candHash(id, state.uf)}`);
  else limparHashCand();
  const c = id ? state.cands.find((x) => x.id === id) : undefined;
  if (c && c.fornecedores === undefined) pedirFornecedores([c.uf]);
  if (id) { renderModo(); $("#dossie").focus({ preventScroll: true }); }
  else if (prev) (visibleOpener(document, "open", prev) ?? $('#modos [aria-selected="true"]'))?.focus(); // the opener may be in any tab, or filtered out
}

// Closing the dossier by any path must also drop the #cand= hash, or a reload reopens it.
function limparHashCand() {
  if (isCandHash(location.hash)) history.replaceState(null, "", `${location.pathname}${location.search}`);
}

const renderCola = () => { $("#cola-lista").innerHTML = colaHtml(state.cola, BALLOTS, avatar); };

// The Apuração map opens a state's race: same effect as picking the UF in the sidebar.
function abrirUf(uf: string) {
  state.uf = uf;
  state.limit = PAGE;
  setOpen(null);
  store.set("uf", uf);
  $<HTMLSelectElement>("#uf").value = uf;
  return loadUf();
}

// The label is a constant so a quick second click cannot save "Copiado!" as the text to restore.
const COPIAR_LINK = "Copiar link";
let copiaT = 0;
function avisoCopia(t: HTMLElement, texto: string, aviso: string) {
  clearTimeout(copiaT);
  if (texto !== COPIAR_LINK) t.textContent = texto;
  $("#copia-status").textContent = aviso;
  copiaT = window.setTimeout(() => { t.textContent = COPIAR_LINK; $("#copia-status").textContent = ""; }, 2000);
}

// Opens a candidate of the loaded UF on its own ballot and in the radar tab, where the list is.
function abrirCandidato(id: string) {
  const c = state.cands.find((x) => x.id === id);
  if (!c) return;
  if (state.modo !== "radar") { state.modo = "radar"; store.set("modo", state.modo); }
  const bIdx = ballotOf(c);
  if (bIdx >= 0 && bIdx !== state.ballot) {
    state.ballot = bIdx;
    renderTabs();
    loadFotos();
  }
  setOpen(c.id);
}

// The race on the open ballot tab, as the TSE and the expectation data name it.
function raceOf() {
  const b = BALLOTS[state.ballot];
  return { cargo: (state.uf === "DF" && b.alt ? b.alt : b.cargo) as Cargo, uf: b.national ? "BR" : state.uf };
}

const prevDe = (id: string) => state.cands.find((c) => c.id === id)?.prev;

// The Ao vivo tab features the President's race: its photos are not loaded with the ballot unless that one is open.
let fotosPresidente = false;
function carregarFotosPresidente() {
  if (fotosPresidente) return;
  fotosPresidente = true;
  loadJson<Record<string, string>>(`data/fotos/BR-${slug("Presidente")}.json`)
    .then((f) => { Object.assign(state.fotos, f); mostrarAoVivo(); })
    .catch(() => {}); // no file: initials
}

// From a card of the Ao vivo tab to that race in the Apuração tab.
function abrirCorrida(cargo: Cargo) {
  const i = BALLOTS.findIndex((b) => b.cargo === cargo || b.alt === cargo);
  if (i < 0) return;
  state.ballot = i;
  state.modo = "apuracao";
  state.limit = PAGE;
  store.set("modo", state.modo);
  renderTabs();
  renderModo();
}

function renderModo() {
  for (const b of document.querySelectorAll<HTMLElement>("#modos [data-modo]")) b.setAttribute("aria-selected", String(b.dataset.modo === state.modo));
  syncTabs($("#modos"));
  document.body.dataset.visao = state.modo; // CSS hides the controls that only the radar list uses; not data-modo, which selects the tabs
  $("#painel").setAttribute("aria-labelledby", `tab-${state.modo}`);
  document.title = tituloDaAba($(`#tab-${state.modo}`).textContent!.trim());
  $("#radar-view").hidden = state.modo !== "radar";
  $("#exp-view").hidden = state.modo !== "expectativa";
  $("#rede-view").hidden = state.modo !== "rede";
  $("#apu-view").hidden = state.modo !== "apuracao";
  $("#live-view").hidden = state.modo !== "aovivo";
  $("#pan-view").hidden = !(state.modo in PAN_MODES);
  if (state.modo === "aovivo") { mostrarAoVivo(); carregarFotosPresidente(); }
  else aoVivo.get()?.hide();
  if (state.modo === "apuracao") {
    quandoPronta(apuracao, $("#apu-view"), () => state.modo === "apuracao", (ap) => {
      if (linkPendente) { ap.restaurar(linkPendente); linkPendente = null; }
      ap.show({ ...raceOf(), ufEleitor: state.uf, byId: new Map(state.cands.map((c) => [c.id, c] as const)), avatar, exp: state.exp, abrirUf });
    });
  } else apuracao.get()?.hide();
  if (state.modo in PAN_MODES) { quandoPronta(panorama, $("#pan-view"), () => state.modo in PAN_MODES, (p) => p.show({ modo: state.modo, pan: state.pan, ...raceOf(), cands: state.cands })); return; }
  if (state.modo === "rede") {
    const cand = state.redeFoco && state.cands.find((x) => x.id === state.redeFoco);
    quandoPronta(redeAba, $("#rede-view"), () => state.modo === "rede", (renderRede) => {
      keepFocus($("#rede-view"), () => { $("#rede-view").innerHTML = renderRede({ rede: state.rede, cand: cand || null, sel: state.redeSel, forn: cand ? estadoForn(cand) : "pronto" }); });
    });
    return;
  }
  if (state.modo !== "expectativa") return;
  quandoPronta(expectativa, $("#exp-view"), () => state.modo === "expectativa", (renderExpectativa) => {
    $("#exp-view").innerHTML = renderExpectativa({ exp: state.exp, ...raceOf(), cands: state.cands, avatar, limit: state.limit });
  });
}

// Ao vivo redraws on its own (feed, photos); the callback is a no-op once the user has left the tab.
function mostrarAoVivo() {
  quandoPronta(aoVivo, $("#live-view"), () => state.modo === "aovivo", (ao) => ao.show({ uf: state.uf, abrir: abrirCorrida, avatar, prev: prevDe, exp: state.exp }));
}

function render() {
  renderTabs();
  renderModo();
  renderList();
  renderDossierPanel();
  renderCola();
}

let bound = false;
function bind() {
  if (bound) return;
  bound = true;
  $<HTMLSelectElement>("#uf").value = state.uf;
  $("#uf").addEventListener("change", (e) => { state.uf = (e.target as HTMLSelectElement).value; state.limit = PAGE; setOpen(null); store.set("uf", state.uf); loadUf(); });
  // Espera a digitação parar: evita recriar a lista inteira a cada tecla.
  let buscaT = 0;
  $("#busca").addEventListener("input", (e) => {
    const valor = (e.target as HTMLInputElement).value;
    clearTimeout(buscaT);
    buscaT = window.setTimeout(() => { state.busca = valor; state.limit = PAGE; renderList(); }, 150);
  });
  $("#ordem").addEventListener("change", (e) => { state.ordem = (e.target as HTMLSelectElement).value; renderList(); });
  $<HTMLInputElement>("#mostrarFotos").checked = state.mostrarFotos;
  $("#mostrarFotos").addEventListener("change", (e) => { state.mostrarFotos = (e.target as HTMLInputElement).checked; store.set("fotos", state.mostrarFotos); renderList(); renderDossierPanel(); if (state.mostrarFotos) loadFotos(); mostrarAoVivo(); });
  $("#situacao").addEventListener("change", (e) => { state.situacao = (e.target as HTMLSelectElement).value; state.limit = PAGE; render(); });
  $("#mais").addEventListener("click", () => {
    const primeiroNovo = state.limit;
    state.limit += PAGE;
    renderList();
    // The button hides at the end of the list and would drop focus to <body>.
    if ($("#mais").hidden) document.querySelectorAll<HTMLElement>("#lista .cand")[primeiroNovo]?.focus();
  });
  let pesosRaf = 0;
  $("#pesos").addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const k = input.dataset.weight as keyof AppState["weights"] | undefined;
    if (!k) return;
    const val = Number(input.value);
    state.weights[k] = val;
    input.setAttribute("aria-valuetext", LEVELS[val]);
    input.closest(".peso")!.querySelector("output")!.textContent = LEVELS[val];
    if (!pesosRaf) {
      pesosRaf = requestAnimationFrame(() => {
        pesosRaf = 0;
        store.set("weights-v2", state.weights);
        $("#presets").innerHTML = presetsHtml(state.weights);
        renderList();
        renderDossierPanel();
      });
    }
  });
  const usePreset = (k: string) => {
    state.weights = { ...PRESETS[k].w };
    store.set("weights-v2", state.weights);
    keepFocus($("#presets"), renderWeights);
    render();
  };
  $("#presets").addEventListener("click", (e) => { if (PRESETS[(e.target as HTMLElement).dataset.preset as string]) usePreset((e.target as HTMLElement).dataset.preset as string); });
  $("#usar-campanha").addEventListener("click", () => { usePreset("campanha"); $("#lista").scrollIntoView({ block: "start" }); $("#lista").focus({ preventScroll: true }); });
    const resetFiltros = () => {
    clearTimeout(buscaT);
    state.busca = "";
    state.situacao = "todas";
    state.limit = PAGE;
    $<HTMLInputElement>("#busca").value = "";
    $<HTMLSelectElement>("#situacao").value = "todas";
    renderList();
  };
  $("#limpar-filtros")?.addEventListener("click", resetFiltros);

  // Left menu: hidden by default, opens on the edge handle or on hover, stays only when pinned.
  const menu = $<HTMLElement>("#menu");
  const menuToggle = $<HTMLButtonElement>("#menu-toggle");
  const menuFixar = $<HTMLButtonElement>("#menu-fixar");
  const menuFechar = $<HTMLButtonElement>("#menu-fechar");
  const menuScrim = $<HTMLElement>("#menu-scrim");
  const menuMobile = () => typeof matchMedia === "function" && matchMedia("(max-width: 860px)").matches;
  let menuFixado = false;
  try { menuFixado = localStorage.getItem("radar:menu") === "fixado" && !menuMobile(); } catch { /* private window */ }
  let menuAberto = menuFixado;
  const pintarMenu = () => {
    document.body.classList.toggle("menu-aberto", menuAberto && !menuFixado);
    document.body.classList.toggle("menu-fixado", menuFixado);
    menuToggle.setAttribute("aria-expanded", String(menuAberto || menuFixado));
    menuFixar.setAttribute("aria-pressed", String(menuFixado));
    menuScrim.hidden = !(menuAberto && !menuFixado);
  };
  const guardarMenu = () => { try { if (menuFixado) localStorage.setItem("radar:menu", "fixado"); else localStorage.removeItem("radar:menu"); } catch { /* private window */ } };
  const abrirMenu = (fixar = false) => { if (fixar) menuFixado = true; menuAberto = true; guardarMenu(); pintarMenu(); };
  const fecharMenu = (devolverFoco = false) => { menuAberto = false; guardarMenu(); pintarMenu(); if (devolverFoco) menuToggle.focus({ preventScroll: true }); };
  const soltarMenu = () => { menuFixado = false; fecharMenu(true); };
  const focarAbaAtual = () => requestAnimationFrame(() => $('#modos [aria-selected="true"]')?.focus({ preventScroll: true }));
  const irAoConteudo = () => { $("#principal").focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "auto" }); };
  pintarMenu();
  menuToggle.addEventListener("click", () => {
    if (menuFixado) { soltarMenu(); return; }
    if (menuAberto) { fecharMenu(); return; }
    abrirMenu(false); // transient: the pin inside keeps it open, choosing a tab closes it
    focarAbaAtual();
  });
  menuFixar.addEventListener("click", () => { menuFixado = !menuFixado; menuAberto = true; guardarMenu(); pintarMenu(); });
  menuFechar.addEventListener("click", soltarMenu);
  menuScrim.addEventListener("click", soltarMenu);
  $("#menu-sobre")?.addEventListener("click", () => { menuFixado = false; fecharMenu(); });
  menu.addEventListener("pointerleave", (e) => {
    const para = e.relatedTarget as Node | null;
    if (menuFixado || menu.contains(document.activeElement) || (para && menu.contains(para))) return;
    fecharMenu();
  });
  menu.addEventListener("focusin", () => { if (!menuAberto && !menuFixado) { menuAberto = true; pintarMenu(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || (!menuAberto && !menuFixado)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    menuFixado = false; fecharMenu(true);
  }, true);

  document.addEventListener("click", (e) => {
    const jump = (e.target as Element).closest<HTMLAnchorElement>(".djump a");
    if (jump) {
      const href = jump.getAttribute("href");
      if (href?.startsWith("#")) {
        const target = $("#dossie").querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          (target as HTMLElement).setAttribute("tabindex", "-1");
          (target as HTMLElement).focus({ preventScroll: true });
        }
      }
      return;
    }
    const t = (e.target as Element).closest<HTMLElement>("[data-ballot],[data-open],[data-close],[data-cola],[data-modo],#exp-mais,[data-rede],[data-rede-geral],[data-rede-foco],[data-copy-cand],[data-forn-retry],[data-limpar-filtros]");
    if (!t) return;
    if (t.dataset.limparFiltros !== undefined) { resetFiltros(); return; }
    if (t.dataset.copyCand) {
      const u = new URL(location.href);
      u.hash = candHash(t.dataset.copyCand, state.uf);
      const copiado = () => avisoCopia(t, "Copiado!", "Link copiado.");
      const falhou = () => avisoCopia(t, COPIAR_LINK, "Não foi possível copiar. O link já está na barra de endereço: copie daí.");
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(u.href).then(copiado, falhou);
      else falhou();
      return;
    }
    if (t.dataset.modo) {
      state.modo = t.dataset.modo; state.limit = PAGE; store.set("modo", state.modo);
      if (location.hash === "#sobre") { history.replaceState(null, "", `${location.pathname}${location.search}`); document.body.classList.remove("sobre"); }
      renderModo();
      if (!menuFixado) { fecharMenu(); irAoConteudo(); }
      else if (menuMobile()) { soltarMenu(); irAoConteudo(); }
      return;
    }
    if (t.dataset.redeFoco !== undefined) {
      state.redeFoco = t.dataset.redeFoco; state.redeSel = null; state.modo = "rede";
      const c = state.cands.find((x) => x.id === state.redeFoco);
      if (c && c.fornecedores === undefined) pedirFornecedores([c.uf]);
      renderModo(); return;
    }
    if (t.dataset.fornRetry) {
      const uf = t.dataset.fornRetry;
      const nova = forn.tentar(uf);
      redesenharDossie(uf, true); // shows "Carregando" now, in this click, instead of the old error until the download ends
      nova.catch(() => {}).then(() => atualizaFornecedores(uf));
      return;
    }
    if ("redeGeral" in t.dataset) { state.redeFoco = null; state.redeSel = null; renderModo(); return; }
    if (t.dataset.rede) { state.redeSel = state.redeSel === t.dataset.rede ? null : t.dataset.rede; renderModo(); return; }
    if (t.id === "exp-mais") { state.limit += PAGE; renderModo(); return; }
    if (t.dataset.ballot) { state.ballot = Number(t.dataset.ballot); state.limit = PAGE; setOpen(null); render(); loadFotos(); }
    else if (t.dataset.open) setOpen(state.open === t.dataset.open ? null : t.dataset.open);
    else if ("close" in t.dataset) setOpen(null);
    else if (t.dataset.cola) {
      const c = state.cands.find((x) => x.id === t.dataset.cola)!;
      const pick = { id: c.id, num: c.num, nome: c.urna || c.nome, partido: c.partido, foto: state.fotos[c.id] };
      state.cola = togglePick(state.cola, c, pick, seatsOf(BALLOTS[ballotOf(c)]));
      store.set("cola", state.cola);
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement as HTMLElement | null;
    const typing = active && (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) || active.isContentEditable);
    if (e.key === "Escape") {
      if (state.open) { setOpen(null); return; }
      if (active?.id === "busca") {
        clearTimeout(buscaT);
        (active as HTMLInputElement).value = "";
        state.busca = "";
        state.limit = PAGE;
        renderList();
        active.blur();
        return;
      }
    }
    if (typing) return;
    // The ballot and the search belong to the radar tab; elsewhere the keys must not act on hidden controls.
    const radar = state.modo === "radar";
    if (e.key === "/" && radar && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const b = $<HTMLInputElement>("#busca");
      b?.focus();
      b?.select();
    } else if (e.key >= "1" && e.key <= "5" && radar && !e.ctrlKey && !e.metaKey && !e.altKey && !state.open) {
      const idx = Number(e.key) - 1;
      if (idx !== state.ballot && idx < BALLOTS.length) {
        state.ballot = idx; state.limit = PAGE; state.open = null; limparHashCand(); render(); loadFotos();
      }
    }
    // SVG nodes are role=button but, unlike <button>, do not turn Enter/Space into a click.
    else if ((e.key === "Enter" || e.key === " ") && (e.target as Element).matches?.("[data-rede]")) { e.preventDefault(); (e.target as Element).dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  });
  mountTabs($("#modos"));
  mountTabs($("#cedulas"));
    const btnTopo = document.getElementById("voltar-topo") as HTMLButtonElement | null;
  if (btnTopo) {
    let scrollRaf = 0;
    window.addEventListener("scroll", () => {
      if (!scrollRaf) {
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0;
          btnTopo.hidden = window.scrollY < 400 || state.modo !== "radar";
        });
      }
    }, { passive: true });
    btnTopo.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      ($('#cedulas [aria-selected="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
    });
  }

  mountColaButtons({ get: () => state.cola, ballots: BALLOTS, clear: () => { state.cola = {}; store.set("cola", state.cola); render(); } });
  // Hover or keyboard focus on a heavy tab starts its download, so the click does not wait for it.
  for (const ev of ["pointerover", "focusin"]) $("#modos").addEventListener(ev, (e) => abaDo((e.target as Element).closest<HTMLElement>("[data-modo]")?.dataset.modo ?? "")?.baixar());
}
function setupConexaoListener() {
  const el = $("#status-conexao");
  if (!el || typeof window === "undefined" || !("onLine" in navigator)) return;

  let avisoT: ReturnType<typeof setTimeout> | undefined;
  const avisar = (msg: string, dotClass: string, duracao = 0) => {
    if (avisoT) clearTimeout(avisoT);
    el.innerHTML = `<span class="${dotClass}" aria-hidden="true"></span> <span>${h(msg)}</span>`;
    el.hidden = false;
    if (duracao > 0) {
      avisoT = setTimeout(() => { el.hidden = true; }, duracao);
    }
  };

  window.addEventListener("offline", () => {
    avisar("Você está offline. Exibindo dados locais em cache.", "dot-off");
  });
  window.addEventListener("online", () => {
    avisar("Conexão restabelecida.", "dot-on", 3500);
    const retryMain = $<HTMLButtonElement>("#lista button[data-retry-main]");
    if (retryMain) {
      tentarCarregar("main", retryMain);
      return;
    }
    const retryUf = $<HTMLButtonElement>("#lista button[data-retry-uf]");
    if (retryUf) {
      tentarCarregar("uf", retryUf);
    }
  });
  if (!navigator.onLine) {
    avisar("Você está offline. Exibindo dados locais em cache.", "dot-off");
  }
}
setupConexaoListener();


// A link to the Apuração tab (apuracao-link.ts): the race, the view, the round and, in the simulation, the moment of the night.
// The link modules load only for a #apuracao hash, so the radar boot stays light.
async function abrirLink() {
  if (location.hash === "#aovivo") { state.modo = "aovivo"; return; } // the link a push notification opens
  if (!location.hash.startsWith("#apuracao")) return;
  const [{ decodificar }, { PASSOS }] = await Promise.all([import("./apuracao-link.js"), import("./apuracao-sim.js")]);
  const v = decodificar(location.hash, PASSOS);
  if (!v) return;
  const i = BALLOTS.findIndex((b) => b.cargo === v.cargo || b.alt === v.cargo);
  if (i < 0) return;
  state.ballot = i;
  state.modo = "apuracao";
  apuracao.baixar(); // the link's tab starts downloading now, not when the data is in
  if (v.uf !== "BR") state.uf = v.uf; // loadUf() below falls back to SP when the state does not exist
  linkPendente = v;
}

// The explanations are their own screen, available even before the data loads. Focus follows the screen: the heading in, the main landmark back.
const sobre = () => {
  const on = location.hash === "#sobre";
  const estava = document.body.classList.contains("sobre");
  document.body.classList.toggle("sobre", on);
  if (on) { scrollTo(0, 0); $("#metodo-t").focus({ preventScroll: true }); }
  else if (estava) $("#principal").focus({ preventScroll: true });
};
addEventListener("hashchange", async () => {
  sobre();
  // Before main() finishes the UF list and the data are not ready: main() handles the hash itself.
  if (!document.body.classList.contains("ready")) return;
  const ufAntes = state.uf;
  await abrirLink();
  const cl = parseCandLink(location.hash); // read before abrirUf, which drops the #cand= hash
  const uf = cl?.uf ?? state.uf;
  if (uf !== ufAntes && [...$<HTMLSelectElement>("#uf").options].some((o) => o.value === uf)) await abrirUf(uf);
  renderTabs();
  renderModo();
  if (cl) abrirCandidato(cl.id);
});
sobre();

async function main() {
  renderWeights(); // needs no data: render it before the downloads so the rail does not grow under the reader
  abaDo(state.modo)?.baixar(); // the saved heavy tab downloads beside the data, not after it
  const link = abrirLink(); // beside the data: it only has to settle the tab before the first render
  const dados = Promise.all([loadJson<Meta>("data/meta.json"), loadJson<AppState["agenda"]>("data/agenda.json"), loadJson<AppState["exp"]>("data/expectativa.json").catch(() => null), loadJson<AppState["rede"]>("data/rede.json").catch(() => null), loadJson<AppState["pan"]>("data/panorama.json").catch(() => null)]);
  const [, [meta, agenda, exp, rede, pan]] = await Promise.all([link, dados]);
  state.rede = rede;
  state.pan = pan;
  state.agenda = agenda;
  state.exp = exp;
  $("#uf").innerHTML = meta.ufs.filter((u) => u.uf !== "BR").map((u) => `<option value="${u.uf}">${u.uf}</option>`).join("");
  if (!meta.ufs.some((u) => u.uf === state.uf)) state.uf = "SP";
  $("#retrato").textContent = `TSE: contas de campanha até ${meta.retratoTse} · Câmara: dados até ${new Date(meta.geradoEm).toLocaleDateString("pt-BR")} · ${int(meta.total)} candidaturas, ${int(meta.comMandato)} com mandato na Câmara`;
  countUp($("#st-cand"), meta.total, int);
  countUp($("#st-mand"), meta.comMandato, int);
  countUp($("#st-uf"), meta.ufs.filter((u) => u.uf !== "BR").length, int);
  const candLink = parseCandLink(location.hash);
  if (candLink?.uf && meta.ufs.some((u) => u.uf === candLink.uf)) state.uf = candLink.uf;
  bind();
  await loadUf();
  if (candLink) abrirCandidato(candLink.id);
  document.body.classList.add("ready"); // the method text below stays hidden until the list has its final height
  if (location.hash === "#sobre") $("#metodo-t").focus({ preventScroll: true }); // sobre() ran before the method text was shown
}

// The cause goes to the console: the page only tells the reader what to do, not the file that failed.
main().catch((e) => { console.error(e); document.body.classList.add("ready"); document.body.dataset.visao = "radar"; $("#lista").classList.remove("carregando"); $("#lista").innerHTML = `<li class="empty"><p role="alert">Não foi possível carregar os dados. Verifique a conexão e tente de novo.</p><button type="button" class="btn-confirma" data-retry-main>Tentar novamente</button></li>`; });
