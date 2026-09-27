import { DEFAULT_PRESET, INDICATORS, PRESETS, score } from "./score.js";
import { displayName, h, int, moneyShort, pct, slug, STATUS, titleName } from "./format.js";
import { renderDossier } from "./dossier.js";
import { renderExpectativa } from "./expectativa.js";

// Ballot order and digit count exactly as on the urna.
const BALLOTS = [
  { cargo: "Deputado Federal", digits: 4 },
  { cargo: "Deputado Estadual", alt: "Deputado Distrital", digits: 5 },
  { cargo: "Senador", digits: 3 },
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
  cola: store.get("cola", {}),
  modo: store.get("modo", "radar"), // "radar" | "expectativa"
  exp: null,
};
const $ = (s) => document.querySelector(s);
const cache = new Map();

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
  const q = state.busca.trim().toLowerCase();
  const list = state.cands
    .filter((c) => ballotOf(c) === state.ballot && (!b.national || c.uf === "BR"))
    .filter((c) => state.situacao === "todas" || (state.situacao === "camara" ? c.mandato : c.perfil?.status === state.situacao))
    .filter((c) => !q || c.nome.toLowerCase().includes(q) || (c.urna ?? "").toLowerCase().includes(q) || c.num.startsWith(q) || c.partido.toLowerCase() === q)
    .map((c) => ({ c, s: score(c.ind, state.weights) }));
  const by = {
    nota: (a, b) => (b.s.nota ?? -1) - (a.s.nota ?? -1) || b.s.cobertura - a.s.cobertura,
    evidencia: (a, b) => b.s.cobertura - a.s.cobertura || (b.s.nota ?? -1) - (a.s.nota ?? -1),
    dinheiro: (a, b) => b.c.fin.total - a.c.fin.total,
    numero: (a, b) => a.c.num.localeCompare(b.c.num),
  }[state.ordem];
  return list.sort(by);
}

function renderTabs() {
  $("#cedulas").innerHTML = BALLOTS.map((b, i) => {
    const n = state.cands.filter((c) => ballotOf(c) === i && (!b.national || c.uf === "BR")).length;
    const nome = state.uf === "DF" && b.alt ? b.alt : b.cargo;
    return `<button type="button" role="tab" aria-selected="${i === state.ballot}" data-ballot="${i}">
      <span class="tname">${h(nome)}</span><span class="digits">${"<i></i>".repeat(b.digits)}</span><span class="tcount">${int(n)}</span></button>`;
  }).join("");
}

function renderWeights() {
  $("#pesos").innerHTML = INDICATORS.map(({ key, grupo, nome, fonte, desc }, i) => `${grupo !== INDICATORS[i - 1]?.grupo ? `<p class="grupo">${h(grupo)}</p>` : ""}
    <label class="peso" for="w-${key}" title="${h(desc)}">
      <span>${h(nome)} <small>${h(fonte)}</small></span>
      <input type="range" id="w-${key}" min="0" max="3" step="1" value="${state.weights[key] ?? 0}" data-weight="${key}">
      <output>${["off", "baixo", "médio", "alto"][state.weights[key] ?? 0]}</output>
    </label>`).join("");
}

function renderFindings(list) {
  const all = list.map((x) => x.c);
  const total = all.reduce((a, c) => a + c.fin.total, 0);
  const pub = all.reduce((a, c) => a + c.fin.publico, 0);
  const inc = all.filter((c) => c.mandato?.votos);
  const pres = inc.map((c) => c.mandato.votos.votou / c.mandato.votos.possiveis).sort((a, b) => a - b);
  const med = pres.length ? pres[Math.floor(pres.length / 2)] : null;
  const semDoador = all.filter((c) => c.fin.total > 0 && c.fin.doadoresPF === 0).length;
  $("#achados").innerHTML = `
    <div><b>${int(all.length)}</b><span>candidaturas com receita declarada · ${int(all.filter((c) => c.perfil?.status === "reeleicao").length)} tentam reeleição, ${int(all.filter((c) => c.perfil?.status === "novo").length)} estreantes</span></div>
    <div><b>${total ? pct(pub / total) : "–"}</b><span>do dinheiro arrecadado (${moneyShort(total)}) veio de fundos públicos</span></div>
    <div><b>${int(semDoador)}</b><span>campanhas com dinheiro e nenhum doador pessoa física</span></div>
    <div><b>${med === null ? "–" : pct(med)}</b><span>presença mediana dos ${int(inc.length)} que já são deputados federais</span></div>`;
}

function renderList() {
  const list = visible();
  renderFindings(list);
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
      <span class="who"><b>${h(displayName(c))}</b><small>${h(c.partido)}${STATUS[c.perfil?.status]?.curto ? ` · <em class="tag st-${h(c.perfil.status)}">${h(STATUS[c.perfil.status].curto)}</em>` : ""}${seen.get(c.num) > 1 ? ` · <em class="tag st-reeleicao">número repetido no TSE</em>` : ""}${state.cola[c.cargo]?.id === c.id ? ` · <em class="tag ok">na cola</em>` : ""}</small></span>
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
  if (c) panel.innerHTML = renderDossier(c, score(c.ind, state.weights), state.cola[c.cargo]?.id === c.id, state.agenda, avatar(c, "lg"));
}

function renderCola() {
  const rows = BALLOTS.map((b) => ({ b, pick: state.cola[b.cargo] ?? (b.alt && state.cola[b.alt]) }));
  $("#cola-lista").innerHTML = rows.map(({ b, pick }) => `
    <li>${pick ? avatar(pick, "xs") : `<span class="av xs ini" aria-hidden="true"></span>`}<span>${h(b.cargo)}</span><span class="num">${pick ? h(pick.num) : "_".repeat(b.digits)}</span><small>${pick ? h(`${titleName(pick.nome)} (${pick.partido})`) : "em branco na cola"}</small></li>`).join("");
}

function renderModo() {
  for (const b of document.querySelectorAll("[data-modo]")) b.setAttribute("aria-selected", String(b.dataset.modo === state.modo));
  $("#radar-view").hidden = state.modo !== "radar";
  $("#exp-view").hidden = state.modo !== "expectativa";
  if (state.modo !== "expectativa") return;
  const b = BALLOTS[state.ballot];
  const cargo = state.uf === "DF" && b.alt ? b.alt : b.cargo;
  $("#exp-view").innerHTML = renderExpectativa({ exp: state.exp, cargo, uf: b.national ? "BR" : state.uf, cands: state.cands, avatar, limit: state.limit });
}

function render() {
  renderTabs();
  renderModo();
  renderList();
  renderDossierPanel();
  renderCola();
}

function colaText() {
  return ["Minha cola · Eleições 2026 · 4 de outubro", ...BALLOTS.map((b) => {
    const p = state.cola[b.cargo] ?? (b.alt && state.cola[b.alt]);
    return `${b.cargo}: ${p ? `${p.num} ${titleName(p.nome)} (${p.partido})` : "—"}`;
  })].join("\n");
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
    e.target.nextElementSibling.textContent = ["off", "baixo", "médio", "alto"][state.weights[k]];
    store.set("weights-v2", state.weights);
    renderList();
    renderDossierPanel();
  });
  $("#presets").innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button type="button" data-preset="${k}">${h(p.nome)}</button>`).join("");
  $("#presets").addEventListener("click", (e) => {
    const p = PRESETS[e.target.dataset.preset];
    if (!p) return;
    state.weights = { ...p.w };
    store.set("weights-v2", state.weights);
    renderWeights();
    render();
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ballot],[data-open],[data-close],[data-cola],[data-modo],#exp-mais");
    if (!t) return;
    if (t.dataset.modo) { state.modo = t.dataset.modo; state.limit = PAGE; store.set("modo", state.modo); renderModo(); return; }
    if (t.id === "exp-mais") { state.limit += PAGE; renderModo(); return; }
    if (t.dataset.ballot) { state.ballot = Number(t.dataset.ballot); state.limit = PAGE; state.open = null; render(); loadFotos(); }
    else if (t.dataset.open) { state.open = state.open === t.dataset.open ? null : t.dataset.open; renderList(); renderDossierPanel(); renderModo(); }
    else if ("close" in t.dataset) { state.open = null; renderList(); renderDossierPanel(); }
    else if (t.dataset.cola) {
      const c = state.cands.find((x) => x.id === t.dataset.cola);
      if (state.cola[c.cargo]?.id === c.id) delete state.cola[c.cargo];
      else state.cola[c.cargo] = { id: c.id, num: c.num, nome: c.urna || c.nome, partido: c.partido, foto: state.fotos[c.id] };
      store.set("cola", state.cola);
      render();
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.open) { state.open = null; renderList(); renderDossierPanel(); } });
  $("#copiar").addEventListener("click", () => {
    const text = colaText();
    const done = (msg) => { $("#copiar-status").textContent = msg; };
    navigator.clipboard?.writeText(text).then(() => done("Cola copiada."), () => { $("#cola-texto").value = text; $("#cola-texto").hidden = false; $("#cola-texto").select(); done("Selecione e copie o texto."); });
  });
  $("#limpar").addEventListener("click", () => { state.cola = {}; store.set("cola", state.cola); render(); });
  $("#imprimir").addEventListener("click", () => window.print());
}

async function main() {
  const [meta, agenda, exp] = await Promise.all([loadJson("data/meta.json"), loadJson("data/agenda.json"), loadJson("data/expectativa.json").catch(() => null)]);
  state.agenda = agenda;
  state.exp = exp;
  $("#uf").innerHTML = meta.ufs.filter((u) => u.uf !== "BR").map((u) => `<option value="${u.uf}">${u.uf}</option>`).join("");
  if (!meta.ufs.some((u) => u.uf === state.uf)) state.uf = "SP";
  $("#retrato").textContent = `TSE: contas de campanha até ${meta.retratoTse} · Câmara: dados até ${new Date(meta.geradoEm).toLocaleDateString("pt-BR")} · ${int(meta.total)} candidaturas, ${int(meta.comMandato)} com mandato na Câmara`;
  renderWeights();
  bind();
  await loadUf();
}

main().catch((e) => { $("#lista").innerHTML = `<li class="empty">Não foi possível carregar os dados (${h(e.message)}). Rode <code>bun run radar:build</code> e recarregue.</li>`; });
