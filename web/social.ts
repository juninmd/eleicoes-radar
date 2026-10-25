// The discreet extras of the live tab: a small chip with the number of people online that opens a panel (map, cheering, push notices).
// It lives outside the tab's redrawn area (a fixed element on <body>), so no redraw of the tab can wipe it or move the layout.
import { ler, naoRastrear, ping, votar, type Estado } from "./social-api.js";
import { ativar, desativar, estadoPush, reinscrever, type EstadoPush } from "./social-push.js";
import { chip, painel, rotuloChip, type MapaUf } from "./social-view.js";

const INTERVALO_MS = 25_000;
const TETO_MS = 120_000;
const REINSCREVER_MS = 10 * 60_000;

export function criarSocial() {
  let raiz: HTMLElement | null = null;
  let botao: HTMLElement | null = null; // the chip: markup written once, then updated in place
  let corpo: HTMLElement | null = null; // the panel: its content is replaced only while it is open
  let uf = "";
  let estado: Estado | null = null;
  let aberto = false;
  let mapa: MapaUf | null = null;
  let pedindoMapa = false;
  let push: EstadoPush = "inativo";
  let pushOcupado = false;
  let pushErro = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let falhas = 0;
  let inscritoEm = 0;
  let ultimo = "";
  let geracao = 0; // each montar() starts a new life: an old request or timer chain that wakes later does nothing
  let pingEm = 0;
  const semRastro = naoRastrear();

  const pintar = () => {
    if (!raiz || !botao || !corpo || !estado) return;
    raiz.hidden = false;
    // The chip is touched in place, so a changing count never recreates the button (focus and the screen reader stay put).
    const n = botao.querySelector<HTMLElement>("#soc-n");
    if (n) n.textContent = estado.online.toLocaleString("pt-BR");
    botao.setAttribute("aria-expanded", String(aberto));
    botao.setAttribute("aria-label", `${rotuloChip(estado.online)} na tela Ao vivo. ${aberto ? "Fechar" : "Abrir"} o painel`);
    corpo.hidden = !aberto;
    if (!aberto) { ultimo = ""; return; }
    const html = painel({ estado, mapa, push, pushOcupado, pushErro, semRastro });
    if (html === ultimo) return;
    ultimo = html;
    const foco = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-foco]")?.dataset.foco ?? "";
    const rolagem = corpo.scrollTop;
    corpo.innerHTML = html;
    corpo.scrollTop = rolagem;
    // The redraw replaces the buttons: give focus back to the one the reader was on.
    if (foco) corpo.querySelector<HTMLElement>(`[data-foco="${CSS.escape(foco)}"]`)?.focus({ preventScroll: true });
  };

  const consultar = async (g: number) => {
    if (document.hidden || !raiz) return; // a hidden tab is not watching: it stops pinging and drops off the count
    const novo = await (semRastro ? ler() : ping(uf));
    if (g !== geracao) return;
    if (!semRastro) pingEm = Date.now();
    const voltou = !!novo && falhas > 0;
    falhas = novo ? 0 : falhas + 1;
    if (novo) {
      estado = novo;
      // The server keeps subscriptions in memory: after it restarts (or on a first read) this page puts its own back. Idempotent.
      if (voltou || Date.now() - inscritoEm > REINSCREVER_MS) { inscritoEm = Date.now(); void reinscrever(); }
      pintar();
    }
  };
  const agendar = (g: number) => {
    if (g !== geracao) return;
    timer = setTimeout(async () => { await consultar(g); agendar(g); }, Math.min(TETO_MS, INTERVALO_MS * 2 ** Math.min(falhas, 3)));
  };

  const carregarMapa = () => {
    if (mapa || pedindoMapa) return;
    pedindoMapa = true;
    fetch("mapa-uf.json").then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) { mapa = m as MapaUf; pintar(); } }).catch(() => {}).finally(() => { pedindoMapa = false; });
  };

  const alternar = async (abrir: boolean) => {
    aberto = abrir;
    if (abrir) { carregarMapa(); push = await estadoPush(); }
    pintar();
    if (!abrir) botao?.focus({ preventScroll: true });
  };

  const clique = async (e: Event) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-soc-abrir], [data-soc-fechar], [data-soc-voto], [data-soc-push]");
    if (!t || !estado) return;
    if ("socAbrir" in t.dataset) { await alternar(!aberto); return; }
    if ("socFechar" in t.dataset) { await alternar(false); return; }
    if (t.dataset.socVoto) {
      // Only a visitor that is online can cheer: refresh the heartbeat first when the last one is getting old.
      if (Date.now() - pingEm > 30_000) { const p = await ping(uf); if (p) { pingEm = Date.now(); estado = p; } }
      const novo = await votar(t.dataset.socVoto);
      if (novo) { estado = novo; pintar(); }
      return;
    }
    if ("socPush" in t.dataset) {
      pushOcupado = true; pushErro = ""; pintar();
      try { push = push === "ativo" ? await desativar() : await ativar(); } catch (err) { pushErro = err instanceof Error ? err.message : "não foi possível ligar os avisos"; push = await estadoPush(); }
      pushOcupado = false; pintar();
    }
  };
  const teclado = (e: KeyboardEvent) => { if (e.key === "Escape" && aberto) void alternar(false); };
  const fora = (e: PointerEvent) => { if (aberto && raiz && !raiz.contains(e.target as Node)) { aberto = false; pintar(); } };
  const visivel = () => { if (!document.hidden && raiz) void consultar(geracao); };

  return {
    // `ufDoLeitor`: the state the reader already chose in the page ("UF do seu título"); anything else counts as not informed.
    montar(ufDoLeitor: string) {
      uf = ufDoLeitor;
      if (raiz) return;
      const g = ++geracao;
      raiz = document.createElement("aside");
      raiz.className = "soc";
      raiz.setAttribute("aria-label", "Quem está online e avisos");
      raiz.hidden = true;
      raiz.innerHTML = `<div class="soc-pilha">${chip(0, false)}<section id="soc-painel" class="soc-painel" role="region" aria-labelledby="soc-t" hidden></section></div>`;
      botao = raiz.querySelector<HTMLElement>("[data-soc-abrir]");
      corpo = raiz.querySelector<HTMLElement>("#soc-painel");
      document.body.append(raiz);
      raiz.addEventListener("click", clique);
      document.addEventListener("keydown", teclado);
      document.addEventListener("pointerdown", fora);
      document.addEventListener("visibilitychange", visivel);
      void consultar(g).then(() => agendar(g));
    },
    desmontar() {
      if (!raiz) return;
      geracao++; // invalidates every pending chain at once
      if (timer) clearTimeout(timer);
      timer = null;
      document.removeEventListener("keydown", teclado);
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("visibilitychange", visivel);
      raiz.remove();
      raiz = botao = corpo = null;
      estado = null; aberto = false; ultimo = ""; falhas = 0; inscritoEm = 0; pingEm = 0;
    },
  };
}
