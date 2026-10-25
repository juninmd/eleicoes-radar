// The controls above the views of the Apuração tab: the switch between the TSE's numbers ("Dados reais") and the simulated night
// ("Simulação", apuracao-sim.js), the fullscreen button and the player of the night. They live outside the area the tab redraws
// (apuracao-mount.js), so a redraw never takes the focus or the cursor away from them; everything here is updated in place.
import { PASSOS, PASSO_INICIAL, horaSim } from "./apuracao-sim.js";
import { PASSO_MS } from "./apuracao-fx-mount.js";
import { movimentoReduzido } from "./apuracao-fx.js";

export type FonteDados = "real" | "sim";
export interface TopoDeps {
  topo: HTMLElement;
  mudarFonte(f: FonteDados): void; // the mount stops or resumes the TSE feeds
  irPara(k: number, salto: boolean): void; // the mount draws step k; salto: it is not the next step (rebuild the history)
  pronto(): boolean; // the files of the simulated race are in: the night does not move while they load
  telaCheia(): void;
  cheia(): boolean;
}

export function criarTopo({ topo, mudarFonte, irPara, pronto, telaCheia, cheia }: TopoDeps) {
  const st = { fonte: "real" as FonteDados, k: PASSO_INICIAL, tocando: false, vel: 1, timer: 0 };
  topo.className = "apu-topo";
  topo.innerHTML = `<div class="apu-topo-linha">
      <div class="apu-fonte" role="group" aria-label="De onde vêm os números">
        <button type="button" data-fonte="real">Dados reais</button><button type="button" data-fonte="sim">Simulação</button>
      </div>
      <button type="button" class="ghost" data-tela-cheia></button>
    </div>
    <div class="apu-sim fx-deck" hidden>
      <p class="apu-aviso"><b>Simulação.</b> Cada disputa termina no resultado final real do 1º turno no TSE (o 2º turno vem do modelo da visão Cidades), mas nomes, partidos, horários e o caminho da noite são inventados: nenhuma candidatura real aparece com número inventado. Nada aqui é resultado.</p>
      <div class="fx-deck-linha">
        <button type="button" class="ghost" data-sim="play"></button><button type="button" class="ghost" data-sim="reinicia">Recomeçar</button>
        <span class="muted small">Velocidade</span>${[1, 3, 8].map((v) => `<button type="button" class="ghost" data-sim="vel" data-vel="${v}" aria-label="Velocidade ${v} vezes">×${v}</button>`).join("")}
        <label class="demo-cursor"><span class="sr">Momento da noite simulada</span><input type="range" id="sim-scrub" min="0" max="${PASSOS - 1}" step="1" value="${st.k}"></label>
        <output class="demo-hora" for="sim-scrub"></output>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(s: string) => topo.querySelector<T>(s)!;
  const hora = (k: number) => `${horaSim(k).slice(0, 5)} · ${k + 1} de ${PASSOS}`;

  const parar = () => { clearTimeout(st.timer); st.timer = 0; };
  function sync() {
    topo.querySelectorAll<HTMLElement>("[data-fonte]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fonte === st.fonte)));
    const tc = q<HTMLButtonElement>("[data-tela-cheia]");
    tc.textContent = cheia() ? "Sair da tela cheia" : "Tela cheia";
    tc.setAttribute("aria-pressed", String(cheia()));
    q<HTMLElement>(".apu-sim").hidden = st.fonte !== "sim";
    if (st.fonte !== "sim") return;
    q<HTMLElement>("[data-sim='play']").textContent = st.tocando ? "Pausar" : st.k >= PASSOS - 1 ? "Rever" : "Continuar";
    topo.querySelectorAll<HTMLElement>("[data-sim='vel']").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.vel) === st.vel)));
    const r = q<HTMLInputElement>("#sim-scrub");
    if (document.activeElement !== r) r.value = String(st.k);
    q<HTMLElement>(".demo-hora").textContent = `${hora(st.k)}${pronto() ? "" : " · carregando os arquivos do TSE…"}`;
  }
  const agendar = () => { parar(); st.timer = window.setTimeout(passo, PASSO_MS[st.vel] ?? 1300); };
  function passo() {
    st.timer = 0;
    if (st.fonte !== "sim" || !st.tocando) return;
    if (!pronto()) { agendar(); sync(); return; }
    if (st.k < PASSOS - 1) { st.k++; irPara(st.k, false); }
    if (st.k >= PASSOS - 1) st.tocando = false; else agendar();
    sync();
  }
  const tocar = () => { st.tocando = true; agendar(); sync(); };
  const pausar = () => { st.tocando = false; parar(); sync(); };
  const ir = (k: number) => { st.k = Math.min(PASSOS - 1, Math.max(0, k)); irPara(st.k, true); };

  topo.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-fonte], [data-sim], [data-tela-cheia]");
    if (!t) return;
    if (t.dataset.fonte) {
      const f = t.dataset.fonte === "sim" ? "sim" : "real";
      if (f === st.fonte) return;
      st.fonte = f;
      parar(); st.tocando = false;
      if (f === "sim") { st.k = PASSO_INICIAL; st.vel = 1; }
      mudarFonte(f);
      if (f === "sim" && !movimentoReduzido()) tocar(); else sync();
    } else if (t.dataset.sim === "play") {
      if (st.tocando) pausar();
      else { if (st.k >= PASSOS - 1) ir(0); tocar(); }
    } else if (t.dataset.sim === "reinicia") { ir(0); tocar(); }
    else if (t.dataset.sim === "vel") { st.vel = Number(t.dataset.vel) || 1; if (st.tocando) agendar(); sync(); }
    else if ("telaCheia" in t.dataset) telaCheia();
  });
  // Moving the cursor only says which moment it points to; letting go jumps there (and pauses): redrawing on every pixel of a drag would be wasted.
  topo.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "sim-scrub") q<HTMLElement>(".demo-hora").textContent = hora(Number(t.value) || 0);
  });
  topo.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== "sim-scrub") return;
    st.tocando = false; parar();
    ir(Number(t.value) || 0);
    sync();
  });

  sync();
  return {
    fonte: () => st.fonte,
    passo: () => st.k,
    sync,
    pausar, // the tab was left: the night waits where it was
    // A link to a moment of the night: the simulation opens paused at step k.
    abrirSim(k: number) {
      st.fonte = "sim"; st.k = Math.min(PASSOS - 1, Math.max(0, k)); st.vel = 1; st.tocando = false; parar();
      mudarFonte("sim");
      sync();
    },
  };
}
