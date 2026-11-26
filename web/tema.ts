// Theme choice for the page. The classic script tema-boot.ts applies the same rule before first paint;
// this module wires the header button once app.js loads. A saved choice wins over the OS.
export type Tema = "light" | "dark";

export const CHAVE_TEMA = "radar:tema";
// Browser chrome (`theme-color`). Light matches --ground; dark is the color the page already shipped.
export const COR_TEMA: Record<Tema, string> = { light: "#f4f2f9", dark: "#0f0b19" };

export function resolverTema(salvo: string | null, prefereClaro: boolean): Tema {
  if (salvo === "light" || salvo === "dark") return salvo;
  return prefereClaro ? "light" : "dark";
}

export function lerTemaSalvo(): string | null {
  try { return localStorage.getItem(CHAVE_TEMA); } catch { return null; }
}

export function gravarTema(tema: Tema): void {
  try { localStorage.setItem(CHAVE_TEMA, tema); } catch { /* private window: the choice lasts until the tab closes */ }
}

export function aplicarTema(tema: Tema, doc: Document = document): void {
  const root = doc.documentElement;
  root.dataset.theme = tema;
  root.style.colorScheme = tema;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_TEMA[tema]);
}

function prefereClaroAgora(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
}

// aria-pressed is true while the light theme is on. The visible words ("Tema claro" / "Tema escuro") come from CSS.
export function ligarTema(botao: HTMLButtonElement): void {
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;
  const pintar = (tema: Tema) => {
    aplicarTema(tema);
    botao.setAttribute("aria-pressed", tema === "light" ? "true" : "false");
  };
  pintar(resolverTema(lerTemaSalvo(), mq?.matches === true));
  botao.addEventListener("click", () => {
    const atual: Tema = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next: Tema = atual === "light" ? "dark" : "light";
    gravarTema(next);
    pintar(next);
  });
  mq?.addEventListener("change", () => {
    const salvo = lerTemaSalvo();
    if (salvo === "light" || salvo === "dark") return;
    pintar(resolverTema(null, prefereClaroAgora()));
  });
}
