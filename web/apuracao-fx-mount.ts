// The wiring of the two animated views (Corrida, Noite no mapa) into the Apuração tab: which one is on screen, the shared preferences (Efeitos, Som),
// and the simulation player. The tab's own redraw (apuracao-mount.js) calls `sync` after every paint; this file mounts the view once into the
// placeholder the frame leaves (`data-fx-host`) and from then on only updates it in place.
import { criarSom } from "./apuracao-som.js";
import { linhasUf, totalNacional } from "./apuracao-nacional.js";
import { criarCorrida } from "./apuracao-corrida.js";
import { criarNoite } from "./apuracao-noite.js";
import { CHAVE_FX, CHAVE_SOM, efeitosAtivos, gravarPref, lerPref, movimentoReduzido } from "./apuracao-fx.js";
import { histCorrida, horaCorrida, horaNoite, PASSO_INICIAL, PASSOS, quadroCorrida, quadroNoite } from "./apuracao-demo.js";
import type { Contexto } from "./apuracao-mount.js";
import type { FeedSnapshot } from "./apuracao-feed.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Cores } from "./apuracao-nacional.js";
import type { MundoMap } from "./apuracao-noite.js";
import type { ExteriorProps } from "./apuracao-exterior.js";
import type { Ponto } from "./apuracao-graficos.js";
import type { UfMap } from "../src/radar/geo/uf-map";
import type { Vista } from "./apuracao.js";

// simulado: the tab's own simulation feeds snap and nac (the views label it like their local one)
export interface FxEstado { ctx: Contexto | null; vista: Vista; snap: FeedSnapshot | null; nac: BrasilSnapshot | null; hist: Ponto[]; mapa: UfMap | null | undefined; mundo?: MundoMap | null; exterior?: Omit<ExteriorProps, "cor" | "turno" | "compacto"> | null; cor: Cores; simulado?: boolean }
export interface FxDeps { el: HTMLElement; anunciar(txt: string): void; estado(): FxEstado }

export const PASSO_MS: Record<number, number> = { 1: 1300, 3: 450, 8: 170 };
const FX_VISTAS: ReadonlySet<string> = new Set(["corrida", "noite"]);

export function criarFx({ el, anunciar, estado }: FxDeps) {
  const corrida = criarCorrida();
  const noite = criarNoite();
  const som = criarSom(() => lerPref(CHAVE_SOM));
  const demo = { ativo: false, i: PASSO_INICIAL, tocando: false, vel: 1, timer: 0, vista: "" };
  const FASES: Record<string, [string, string]> = { aguardando: ["Aguardando início", "baixa"], parcial: ["Apuração em andamento", "aberta"], concluida: ["Apuração concluída", "alta"] };

  const parar = () => { clearTimeout(demo.timer); demo.timer = 0; };
  const desligarDemo = () => { parar(); demo.ativo = false; demo.tocando = false; demo.i = PASSO_INICIAL; demo.vel = 1; };

  function preferencias(alvo: HTMLElement | null) {
    const raiz = alvo?.closest(".apu") ?? el;
    const fx = raiz.querySelector<HTMLButtonElement>("[data-fx-pref='fx']"), s = raiz.querySelector<HTMLButtonElement>("[data-fx-pref='som']"), d = raiz.querySelector<HTMLButtonElement>("[data-demo-toggle]");
    const reduzido = movimentoReduzido(), ef = lerPref(CHAVE_FX) && !reduzido;
    if (fx) { fx.setAttribute("aria-pressed", String(ef)); fx.disabled = reduzido; fx.textContent = reduzido ? "Efeitos: desligados pelo sistema" : `Efeitos: ${ef ? "ligados" : "desligados"}`; }
    if (s) { const on = lerPref(CHAVE_SOM); s.setAttribute("aria-pressed", String(on)); s.textContent = `Som: ${on ? "ligado" : "desligado"}`; }
    if (d) { d.setAttribute("aria-pressed", String(demo.ativo)); d.textContent = demo.ativo ? "Sair da simulação" : "Ver simulação"; }
  }

  // The player of the simulation: built once per frame of the view, updated in place afterwards.
  function deck(vista: Vista) {
    const caixa = el.querySelector<HTMLElement>("[data-fx-deck]");
    if (!caixa) return;
    if (!demo.ativo) { caixa.hidden = true; caixa.replaceChildren(); return; }
    caixa.hidden = false;
    if (!caixa.firstElementChild) {
      caixa.innerHTML = `<p class="apu-aviso"><b>Simulação.</b> Candidaturas, partidos, horários e números inventados: nada aqui é dado real. Use os controles para tocar, pausar ou voltar no tempo.</p>
        <div class="fx-deck-linha">
          <button type="button" class="ghost" data-demo="play"></button><button type="button" class="ghost" data-demo="reinicia">Recomeçar</button>
          <span class="muted small">Velocidade</span>${[1, 3, 8].map((v) => `<button type="button" class="ghost" data-demo="vel" data-vel="${v}" aria-label="Velocidade ${v} vezes">×${v}</button>`).join("")}
          <label class="demo-cursor"><span class="sr">Momento da noite simulada</span><input type="range" id="demo-scrub" min="0" max="${PASSOS - 1}" step="1" value="${demo.i}"></label>
          <output class="demo-hora" for="demo-scrub"></output>
        </div>`;
    }
    const fim = demo.i >= PASSOS - 1;
    caixa.querySelector<HTMLElement>("[data-demo='play']")!.textContent = demo.tocando ? "Pausar" : fim ? "Rever" : "Continuar";
    caixa.querySelectorAll<HTMLElement>("[data-demo='vel']").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.vel) === demo.vel)));
    const r = caixa.querySelector<HTMLInputElement>("#demo-scrub")!;
    if (document.activeElement !== r) r.value = String(demo.i);
    caixa.querySelector<HTMLElement>(".demo-hora")!.textContent = `${vista === "corrida" ? horaCorrida(demo.i) : horaNoite(demo.i)} · ${demo.i + 1} de ${PASSOS}`;
  }

  // The phase badge of the frame is filled here, in place (see the note in apuracao.ts#renderApuracao)
  function fase(vista: Vista, e: FxEstado) {
    const b = el.querySelector<HTMLElement>("[data-fx-fase]");
    if (!b) return;
    const f = demo.ativo ? (vista === "corrida" ? quadroCorrida(demo.i).fase : (totalNacional(linhasUf(quadroNoite(demo.i).ufs, "Presidente")).fase as string | null))
      : vista === "corrida" ? e.snap?.dados?.fase : (totalNacional(linhasUf(e.nac?.ufs ?? {}, e.ctx?.cargo ?? "Presidente")).fase as string | null);
    const [txt, cls] = (f && FASES[f]) || ["Consultando", "baixa"];
    b.textContent = txt;
    b.className = `rot ${cls}`;
  }

  function sync(salto = false) {
    const e = estado();
    const alvo = el.querySelector<HTMLElement>("[data-fx-host]");
    if (!e.ctx || !alvo || !FX_VISTAS.has(e.vista)) {
      corrida.parar(); noite.parar();
      if (demo.ativo) desligarDemo();
      return;
    }
    if (demo.ativo && demo.vista !== e.vista) desligarDemo(); // each view plays its own night: changing view ends the simulation
    const efeitos = efeitosAtivos();
    fase(e.vista, e);
    preferencias(alvo);
    deck(e.vista);
    const dur = `${demo.ativo ? Math.min(900, (PASSO_MS[demo.vel] ?? 1300) * 0.85) : 900}ms`;
    if (e.vista === "corrida") {
      noite.parar();
      corrida.montar(alvo);
      corrida.raiz?.style.setProperty("--dur", dur);
      corrida.atualizar({
        dados: demo.ativo ? quadroCorrida(demo.i) : e.snap?.dados ?? null,
        status: demo.ativo ? "ok" : e.snap?.status ?? "carregando",
        cargo: e.ctx.cargo, byId: demo.ativo ? new Map() : e.ctx.byId, avatar: e.ctx.avatar, cor: e.cor,
        hist: demo.ativo ? histCorrida(demo.i) : e.hist, efeitos, salto, simulado: demo.ativo || !!e.simulado, anunciar, som,
      });
    } else {
      corrida.parar();
      noite.montar(alvo);
      noite.raiz?.style.setProperty("--dur", dur);
      noite.atualizar({
        nac: demo.ativo ? quadroNoite(demo.i) : e.nac,
        cargo: demo.ativo ? "Presidente" : e.ctx.cargo, mapa: e.mapa, mundo: e.mundo,
        exterior: e.exterior && demo.ativo ? { ...e.exterior, nac: quadroNoite(demo.i), simulado: true } : e.exterior, byId: demo.ativo ? new Map() : e.ctx.byId, avatar: e.ctx.avatar, cor: e.cor,
        efeitos, salto, simulado: demo.ativo || !!e.simulado, anunciar, som,
      });
    }
  }

  function passo() {
    if (!demo.ativo || !demo.tocando) return;
    if (demo.i >= PASSOS - 1) { demo.tocando = false; sync(); return; }
    demo.i++;
    sync();
    if (demo.i >= PASSOS - 1) { demo.tocando = false; sync(); return; }
    demo.timer = window.setTimeout(passo, PASSO_MS[demo.vel] ?? 1300);
  }
  const tocar = () => { parar(); demo.tocando = true; demo.timer = window.setTimeout(passo, 250); sync(); };

  return {
    sync,
    // Buttons of the frame and of the player. Returns true when the click was one of ours.
    clique(t: HTMLElement): boolean {
      if (t.dataset.fxPref) {
        if (t.dataset.fxPref === "fx") gravarPref(CHAVE_FX, !lerPref(CHAVE_FX));
        else { gravarPref(CHAVE_SOM, !lerPref(CHAVE_SOM)); som.desbloquear(); }
        sync(); // not a jump: switching effects on or off must not wipe the list of facts of the session
        return true;
      }
      if ("demoToggle" in t.dataset) {
        som.desbloquear();
        if (demo.ativo) { desligarDemo(); sync(true); return true; }
        demo.ativo = true; demo.i = PASSO_INICIAL; demo.vel = 1; demo.vista = estado().vista;
        if (movimentoReduzido()) { demo.tocando = false; sync(true); } else { sync(true); tocar(); }
        return true;
      }
      if (t.dataset.demo) {
        som.desbloquear();
        if (t.dataset.demo === "play") { if (demo.tocando) { demo.tocando = false; parar(); sync(); } else { if (demo.i >= PASSOS - 1) { demo.i = 0; sync(true); } tocar(); } }
        else if (t.dataset.demo === "reinicia") { demo.i = 0; sync(true); tocar(); }
        else if (t.dataset.demo === "vel") { demo.vel = Number(t.dataset.vel) || 1; sync(); }
        return true;
      }
      return false;
    },
    // The scrubber of the simulation: moving it pauses and shows that moment as it is.
    entrada(e: Event): boolean {
      const t = e.target as HTMLInputElement;
      if (t.id !== "demo-scrub") return false;
      demo.tocando = false; parar();
      demo.i = Math.min(PASSOS - 1, Math.max(0, Number(t.value) || 0));
      sync(true);
      return true;
    },
    // The race or the round changed: whatever the simulation was showing no longer belongs to it.
    reiniciar() { desligarDemo(); corrida.parar(); noite.parar(); },
    parar() { desligarDemo(); corrida.parar(); noite.parar(); },
  };
}
