// The discreet extras of the live tab: a small chip with the number of people online that opens a panel (map, cheering, push notices).
// It lives outside the tab's redrawn area (a fixed element on <body>), so no redraw of the tab can wipe it or move the layout.
import { ler, naoRastrear, ping, votar, type Estado } from "./social-api.js";
import { ativar, desativar, estadoPush, reinscrever, type EstadoPush } from "./social-push.js";
import { chip, painel, type MapaUf } from "./social-view.js";

const INTERVALO_MS = 25_000;
const TETO_MS = 120_000;
const REINSCREVER_MS = 10 * 60_000;

export function criarSocial() {
  let raiz: HTMLElement | null = null;
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
  const semRastro = naoRastrear();

  const pintar = () => {
    if (!raiz || !estado) return;
    raiz.hidden = false;
    const botao = raiz.querySelector<HTMLElement>(".soc-pilha");
    const html = `${chip(estado.online, aberto)}<section id="soc-painel" class="soc-painel" role="region" aria-labelledby="soc-t"${aberto ? "" : " hidden"}>${aberto ? painel({ estado, mapa, push, pushOcupado, pushErro, semRastro }) : ""}</section>`;
    if (html === ultimo) return;
    ultimo = html;
    const foco = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-foco]")?.dataset.foco ?? (document.activeElement?.closest("[data-soc-abrir]") ? "abrir" : "");
    (botao ?? raiz).innerHTML = html;
    // The redraw replaces the buttons: give focus back to the one the reader was on.
    if (foco) (foco === "abrir" ? raiz.querySelector<HTMLElement>("[data-soc-abrir]") : raiz.querySelector<HTMLElement>(`[data-foco="${CSS.escape(foco)}"]`))?.focus({ preventScroll: true });
  };

  const consultar = async () => {
    if (document.hidden || !raiz) return; // a hidden tab is not watching: it stops pinging and drops off the count
    const novo = await (semRastro ? ler() : ping(uf));
    if (!raiz) return;
    const voltou = !!novo && falhas > 0;
    falhas = novo ? 0 : falhas + 1;
    if (novo) {
      estado = novo;
      // The server keeps subscriptions in memory: after it restarts (or on a first read) this page puts its own back. Idempotent.
      if (voltou || Date.now() - inscritoEm > REINSCREVER_MS) { inscritoEm = Date.now(); void reinscrever(); }
      pintar();
    }
  };
  const agendar = () => {
    if (!raiz) return;
    timer = setTimeout(async () => { await consultar(); agendar(); }, Math.min(TETO_MS, INTERVALO_MS * 2 ** Math.min(falhas, 3)));
  };

  const carregarMapa = () => {
    if (mapa || pedindoMapa) return;
    pedindoMapa = true;
    fetch("mapa-uf.json").then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) { mapa = m as MapaUf; ultimo = ""; pintar(); } }).catch(() => {}).finally(() => { pedindoMapa = false; });
  };

  const clique = async (e: Event) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-soc-abrir], [data-soc-fechar], [data-soc-voto], [data-soc-push]");
    if (!t || !estado) return;
    if ("socAbrir" in t.dataset || "socFechar" in t.dataset) {
      aberto = "socAbrir" in t.dataset ? !aberto : false;
      if (aberto) { carregarMapa(); push = await estadoPush(); }
      pintar();
      if (!aberto) raiz?.querySelector<HTMLElement>("[data-soc-abrir]")?.focus({ preventScroll: true });
      return;
    }
    if (t.dataset.socVoto) {
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
  const teclado = (e: KeyboardEvent) => { if (e.key === "Escape" && aberto) { aberto = false; pintar(); raiz?.querySelector<HTMLElement>("[data-soc-abrir]")?.focus({ preventScroll: true }); } };
  const fora = (e: PointerEvent) => { if (aberto && raiz && !raiz.contains(e.target as Node)) { aberto = false; pintar(); } };
  const visivel = () => { if (!document.hidden) void consultar(); };

  return {
    // `ufDoLeitor`: the state the reader already chose in the page ("UF do seu título"); anything else counts as not informed.
    montar(ufDoLeitor: string) {
      uf = ufDoLeitor;
      if (raiz) return;
      raiz = document.createElement("aside");
      raiz.className = "soc";
      raiz.setAttribute("aria-label", "Quem está online e avisos");
      raiz.hidden = true;
      raiz.innerHTML = `<div class="soc-pilha"></div>`;
      document.body.append(raiz);
      raiz.addEventListener("click", clique);
      document.addEventListener("keydown", teclado);
      document.addEventListener("pointerdown", fora);
      document.addEventListener("visibilitychange", visivel);
      void consultar().then(agendar);
    },
    desmontar() {
      if (!raiz) return;
      if (timer) clearTimeout(timer);
      timer = null;
      document.removeEventListener("keydown", teclado);
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("visibilitychange", visivel);
      raiz.remove();
      raiz = null; estado = null; aberto = false; ultimo = ""; falhas = 0; inscritoEm = 0;
    },
  };
}
