// Fullscreen of the Apuração tab: the browser's own when it allows it, else the panel fills the window (the class does both).
// Esc leaves either way; leaving the browser's fullscreen by its own means (Esc, F11, the system) leaves the panel too.
export function criarTelaCheia(el: HTMLElement, aoMudar: (cheia: boolean) => void) {
  let cheia = false;
  const entrar = () => {
    cheia = true;
    el.classList.add("apu-cheia");
    Promise.resolve(el.requestFullscreen?.()).catch((e: unknown) => console.warn("apuração: tela cheia do navegador indisponível; usando a janela", e));
    aoMudar(true);
  };
  // avisar = false: the tab is being hidden, there is nothing to redraw.
  const sair = (avisar = true) => {
    if (!cheia) return;
    cheia = false;
    el.classList.remove("apu-cheia");
    if (document.fullscreenElement === el) document.exitFullscreen().catch((e: unknown) => console.warn("apuração: sair da tela cheia", e));
    if (avisar) aoMudar(false);
  };
  document.addEventListener("fullscreenchange", () => { if (cheia && document.fullscreenElement !== el) sair(); });
  document.addEventListener("keydown", (e) => { if (cheia && e.key === "Escape") sair(); });
  return { ativa: () => cheia, alternar: () => (cheia ? sair() : entrar()), sair };
}
