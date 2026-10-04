import { DEFAULT_PRESET, PRESETS, score } from "./score.js";
import { displayName, h, int, moneyShort, pct, slug, STATUS } from "./format.js";
import { renderDossier } from "./dossier.js";
import { isPicked, normalizeCola, seatsOf, togglePick } from "./cola.js";
import { colaHtml, mountColaButtons } from "./cola-view.js";
import { renderExpectativa } from "./expectativa.js";
import { renderRede } from "./rede.js";
import { mountApuracao } from "./apuracao-mount.js";
import { mountPanorama, PAN_MODES } from "./panorama.js";
import { matches, SORTS, semEvidencia } from "./lista.js";
import { achados } from "./achados.js";
import { LEVELS, presetsHtml, weightsHtml } from "./pesos.js";
import { knownTab, mountTabs, syncTabs } from "./tabs.js";
import { keepFocus, visibleOpener } from "./focus.js";

// Ballot order and digit count exactly as on the urna.
const BALLOTS = [
  { cargo: "Deputado Federal", digits: 4 },
  { cargo: "Deputado Estadual", alt: "Deputado Distrital", digits: 5 },
  { cargo: "Senador", digits: 3, seats: 2 }, // 2/3 renewal: 2 seats in 2026 and 2034, 1 in 2030
  { cargo: "Governador", digits: 2 },
  { cargo: "Presidente", digits: 2, national: true },
];
const PAGE = 40;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`radar:${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`radar:${k}`, JSON.stringify(v)); } catch { /* storage blocked: session-only */ } },
};

const state = {
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
  modo: knownTab(store.get("modo", "radar"), ["radar", "expectativa", "rede", "apuracao", ...Object.keys(PAN_MODES)], "radar"),
  exp: null,
  pan: null,
  rede: null,
  redeFoco: null, // candidate id, or null for the overview
  redeSel: null,
};
const $ = (s) => document.querySelector(s);
const cache = new Map();
const apuracao = mountApuracao($("#apu-view"));
const panorama = mountPanorama($("#pan-view"));

async function loadJson(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json(); }));
  return cache.get(path);
}

const ballotOf = (c) => BALLOTS.findIndex((b) => b.cargo === c.cargo || b.alt === c.cargo);

async function loadUf() {
  $("#lista").setAttribute("aria-busy", "true");
  const [local, br] = await Promise.all([loadJson(`data/uf/${state.uf}.json`), loadJson("data/uf/BR.json")]);
  state.cands = [...local, ...br];
  $("#lista").removeAttribute("aria-busy");
  render();
  loadFotos();
}

// Photos load per open ballot, after the list; a missing file just means initials.
async function loadFotos() {
  const b = BALLOTS[state.ballot];
  const cargo = state.uf === "DF" && b.alt ? b.alt : b.cargo;
  const file = `data/fotos/${b.national ? "BR" : state.uf}-${slug(cargo)}.json`;
  const fotos = await loadJson(file).catch(() => ({}));
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
  const shown = list.slice(0, state.limit);
  // Two registrations with one number usually means a substitution the registry
  // does not resolve (its status field is empty); flag it instead of guessing.
  const seen = new Map();
  for (const { c } of list) seen.set(c.num, (seen.get(c.num) ?? 0) + 1);
  const ballot = BALLOTS[state.ballot];
  $("#lista").innerHTML = shown.length ? shown.map(({ c, s }, i) => `
    <li><button type="button" class="cand${state.open === c.id ? " open" : ""}" data-open="${h(c.id)}">
      <span class="pos">${i + 1}</span>
      <span class="num">${h(c.num.padStart(ballot.digits, " "))}</span>
      ${avatar(c, "sm")}
      <span class="who"><b>${h(displayName(c))}</b><small>${h(c.partido)}${STATUS[c.perfil?.status]?.curto ? ` · <em class="tag st-${h(c.perfil.status)}">${h(STATUS[c.perfil.status].curto)}</em>` : ""}${seen.get(c.num) > 1 ? ` · <em class="tag st-reeleicao">número repetido no TSE</em>` : ""}${isPicked(state.cola, c) ? ` · <em class="tag ok">na cola</em>` : ""}</small></span>
      <span class="money">${moneyShort(c.fin.total)}</span>
      <span class="score"><b>${s.nota ?? "–"}</b><span class="ev" aria-label="Evidência ${pct(s.cobertura)}">${[0.01, 0.5, 0.99].map((t) => `<i class="${s.cobertura >= t ? "on" : ""}"></i>`).join("")}</span></span>
    </button></li>`).join("") : `<li class="empty">Nenhuma candidatura encontrada com esses filtros.</li>`;
  $("#mais").hidden = list.length <= state.limit;
  $("#mais").textContent = `Mostrar mais ${Math.min(PAGE, list.length - state.limit)} de ${int(list.length - state.limit)} restantes`;
}

function avatar(c, size) {
  const src = state.mostrarFotos && (state.fotos[c.id] || c.foto);
  const initials = displayName(c).split(" ").filter((w) => /^[A-ZÀ-Ú]/.test(w)).map((w) => w[0]).slice(0, 2).join("");
  return src
    ? `<img class="av ${size}" src="${h(src)}" alt="" loading="lazy">`
    : `<span class="av ${size} ini" aria-hidden="true">${h(initials)}</span>`;
}

function renderDossierPanel() {
  const panel = $("#dossie");
  const c = state.cands.find((x) => x.id === state.open);
  panel.hidden = !c;
  document.body.classList.toggle("has-dossie", !!c);
  if (c) panel.innerHTML = renderDossier(c, score(c.ind, state.weights), isPicked(state.cola, c), state.agenda, avatar(c, "lg"), state.exp);
}

// Opening moves focus into the dossier; closing gives it back to the candidate that opened it.
function setOpen(id) {
  const prev = state.open;
  state.open = id;
  renderList();
  renderDossierPanel();
  if (id) { renderModo(); $("#dossie").focus({ preventScroll: true }); }
  else if (prev) (visibleOpener(document, "open", prev) ?? $('#modos [aria-selected="true"]'))?.focus(); // the opener may be in any tab, or filtered out
}

const renderCola = () => { $("#cola-lista").innerHTML = colaHtml(state.cola, BALLOTS, avatar); };

// The Apuração map opens a state's race: same effect as picking the UF in the sidebar.
function abrirUf(uf) {
  state.uf = uf;
  state.limit = PAGE;
  state.open = null;
  store.set("uf", uf);
  $("#uf").value = uf;
  loadUf();
}

// The race on the open ballot tab, as the TSE and the expectation data name it.
function raceOf() {
  const b = BALLOTS[state.ballot];
  return { cargo: state.uf === "DF" && b.alt ? b.alt : b.cargo, uf: b.national ? "BR" : state.uf };
}

function renderModo() {
  for (const b of document.querySelectorAll("#modos [data-modo]")) b.setAttribute("aria-selected", String(b.dataset.modo === state.modo));
  syncTabs($("#modos"));
  document.body.dataset.visao = state.modo; // CSS hides the controls that only the radar list uses; not data-modo, which selects the tabs
  $("#painel").setAttribute("aria-labelledby", `tab-${state.modo}`);
  $("#radar-view").hidden = state.modo !== "radar";
  $("#exp-view").hidden = state.modo !== "expectativa";
  $("#rede-view").hidden = state.modo !== "rede";
  $("#apu-view").hidden = state.modo !== "apuracao";
  $("#pan-view").hidden = !(state.modo in PAN_MODES);
  if (state.modo === "apuracao") apuracao.show({ ...raceOf(), byId: new Map(state.cands.map((c) => [c.id, c])), avatar, exp: state.exp, abrirUf });
  else apuracao.hide();
  if (state.modo in PAN_MODES) { panorama.show({ modo: state.modo, pan: state.pan, ...raceOf(), cands: state.cands }); return; }
  if (state.modo === "rede") {
    const cand = state.redeFoco && state.cands.find((x) => x.id === state.redeFoco);
    keepFocus($("#rede-view"), () => { $("#rede-view").innerHTML = renderRede({ rede: state.rede, cand: cand || null, sel: state.redeSel }); });
    return;
  }
  if (state.modo !== "expectativa") return;
  $("#exp-view").innerHTML = renderExpectativa({ exp: state.exp, ...raceOf(), cands: state.cands, avatar, limit: state.limit });
}

function render() {
  renderTabs();
  renderModo();
  renderList();
  renderDossierPanel();
  renderCola();
}

function bind() {
  $("#uf").value = state.uf;
  $("#uf").addEventListener("change", (e) => { state.uf = e.target.value; state.limit = PAGE; state.open = null; store.set("uf", state.uf); loadUf(); });
  $("#busca").addEventListener("input", (e) => { state.busca = e.target.value; state.limit = PAGE; renderList(); });
  $("#ordem").addEventListener("change", (e) => { state.ordem = e.target.value; renderList(); });
  $("#mostrarFotos").checked = state.mostrarFotos;
  $("#mostrarFotos").addEventListener("change", (e) => { state.mostrarFotos = e.target.checked; store.set("fotos", state.mostrarFotos); renderList(); renderDossierPanel(); });
  $("#situacao").addEventListener("change", (e) => { state.situacao = e.target.value; state.limit = PAGE; render(); });
  $("#mais").addEventListener("click", () => { state.limit += PAGE; renderList(); });
  $("#pesos").addEventListener("input", (e) => {
    const k = e.target.dataset.weight;
    if (!k) return;
    state.weights[k] = Number(e.target.value);
    e.target.setAttribute("aria-valuetext", LEVELS[state.weights[k]]);
    e.target.closest(".peso").querySelector("output").textContent = LEVELS[state.weights[k]];
    store.set("weights-v2", state.weights);
    $("#presets").innerHTML = presetsHtml(state.weights);
    renderList();
    renderDossierPanel();
  });
  const usePreset = (k) => {
    state.weights = { ...PRESETS[k].w };
    store.set("weights-v2", state.weights);
    keepFocus($("#presets"), renderWeights);
    render();
  };
  $("#presets").addEventListener("click", (e) => { if (PRESETS[e.target.dataset.preset]) usePreset(e.target.dataset.preset); });
  $("#usar-campanha").addEventListener("click", () => { usePreset("campanha"); $("#lista").scrollIntoView({ block: "start" }); $("#lista").focus({ preventScroll: true }); });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ballot],[data-open],[data-close],[data-cola],[data-modo],#exp-mais,[data-rede],[data-rede-geral],[data-rede-foco]");
    if (!t) return;
    if (t.dataset.modo) { state.modo = t.dataset.modo; state.limit = PAGE; store.set("modo", state.modo); renderModo(); return; }
    if (t.dataset.redeFoco !== undefined) { state.redeFoco = t.dataset.redeFoco; state.redeSel = null; state.modo = "rede"; renderModo(); return; }
    if ("redeGeral" in t.dataset) { state.redeFoco = null; state.redeSel = null; renderModo(); return; }
    if (t.dataset.rede) { state.redeSel = state.redeSel === t.dataset.rede ? null : t.dataset.rede; renderModo(); return; }
    if (t.id === "exp-mais") { state.limit += PAGE; renderModo(); return; }
    if (t.dataset.ballot) { state.ballot = Number(t.dataset.ballot); state.limit = PAGE; state.open = null; render(); loadFotos(); }
    else if (t.dataset.open) setOpen(state.open === t.dataset.open ? null : t.dataset.open);
    else if ("close" in t.dataset) setOpen(null);
    else if (t.dataset.cola) {
      const c = state.cands.find((x) => x.id === t.dataset.cola);
      const pick = { id: c.id, num: c.num, nome: c.urna || c.nome, partido: c.partido, foto: state.fotos[c.id] };
      state.cola = togglePick(state.cola, c, pick, seatsOf(BALLOTS[ballotOf(c)]));
      store.set("cola", state.cola);
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) setOpen(null);
    // SVG nodes are role=button but, unlike <button>, do not turn Enter/Space into a click.
    else if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-rede]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  });
  mountTabs($("#modos"));
  mountTabs($("#cedulas"));
  mountColaButtons({ get: () => state.cola, ballots: BALLOTS, clear: () => { state.cola = {}; store.set("cola", state.cola); render(); } });
}

async function main() {
  renderWeights(); // needs no data: render it before the downloads so the rail does not grow under the reader
  const [meta, agenda, exp, rede, pan] = await Promise.all([loadJson("data/meta.json"), loadJson("data/agenda.json"), loadJson("data/expectativa.json").catch(() => null), loadJson("data/rede.json").catch(() => null), loadJson("data/panorama.json").catch(() => null)]);
  state.rede = rede;
  state.pan = pan;
  state.agenda = agenda;
  state.exp = exp;
  $("#uf").innerHTML = meta.ufs.filter((u) => u.uf !== "BR").map((u) => `<option value="${u.uf}">${u.uf}</option>`).join("");
  if (!meta.ufs.some((u) => u.uf === state.uf)) state.uf = "SP";
  $("#retrato").textContent = `TSE: contas de campanha até ${meta.retratoTse} · Câmara: dados até ${new Date(meta.geradoEm).toLocaleDateString("pt-BR")} · ${int(meta.total)} candidaturas, ${int(meta.comMandato)} com mandato na Câmara`;
  bind();
  await loadUf();
  document.body.classList.add("ready"); // the method text below stays hidden until the list has its final height
}

// The error goes in the radar list, so show the radar view even when another tab was saved (renderModo never ran).
main().catch((e) => { document.body.classList.add("ready"); document.body.dataset.visao = "radar"; $("#lista").innerHTML = `<li class="empty">Não foi possível carregar os dados (${h(e.message)}). Rode <code>bun run radar:build</code> e recarregue.</li>`; });
