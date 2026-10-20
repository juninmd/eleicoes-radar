// Shared pieces of the animated views of the Apuração tab (Corrida, Noite no mapa). The rest of the tab is redrawn from HTML strings on every
// change, which would throw away the very thing an animation needs: the element that was already on screen. These views therefore keep their
// own DOM and update it in place; this file holds what both need, pure functions first, then the few DOM helpers.
import { int, titleName } from "./format.js";
import type { Cores } from "./apuracao-nacional.js";

// ---- preferences, shared with the Ao vivo tab (same keys, so a choice made there holds here)
export const CHAVE_FX = "radar:fx";
export const CHAVE_SOM = "radar:som";
export const lerPref = (chave: string): boolean => { try { return localStorage.getItem(chave) !== "off"; } catch { return true; } };
export const gravarPref = (chave: string, ligado: boolean): void => { try { localStorage.setItem(chave, ligado ? "on" : "off"); } catch { /* private window: the choice lasts until the tab closes */ } };
export const movimentoReduzido = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// The system's "reduce motion" always wins over the button: the reader asked for it somewhere that matters more.
export const efeitosAtivos = (): boolean => lerPref(CHAVE_FX) && !movimentoReduzido();

// ---- numbers
export const decimos = (parcela: number): string => (parcela * 1000).toFixed(2); // a share as tenths of a point: the CSS counter prints it
export const pct1 = (parcela: number): string => `${(parcela * 100).toFixed(1).replace(".", ",")}%`;

// A number as odometer cells: one digit column per digit, the separators stay put.
export type Celula = { d: string } | { s: string };
export const celulas = (n: number): Celula[] => [...int(Math.max(0, Math.round(n)))].map((ch) => (/\d/.test(ch) ? { d: ch } : { s: ch }));
const COLUNA = "0123456789".replace(/./g, "<i>$&</i>");
export const odometroHtml = (n: number): string => celulas(n).map((c) => ("d" in c ? `<span class="dg" style="--d:${c.d}"><span>${COLUNA}</span></span>` : `<span class="sep">${c.s}</span>`)).join("");

// Updates an odometer in place. The cells are rebuilt only when the number of digits changes; otherwise only `--d` moves, so the column slides.
export function odometro(el: HTMLElement, n: number): void {
  const cs = celulas(n);
  if (el.dataset.len !== String(cs.length)) {
    el.dataset.len = String(cs.length);
    el.innerHTML = odometroHtml(n);
    return;
  }
  cs.forEach((c, i) => { if ("d" in c) (el.children[i] as HTMLElement).style.setProperty("--d", c.d); });
}

// ---- who is ahead
// Pairs (up, down) where `up` was behind `down` in the order before and is ahead of it in the order after. Only candidates present in both
// orders count (one that entered or left the list did not overtake anyone). Both arrays hold candidate ids, best first.
export function ultrapassagens(antes: readonly string[], depois: readonly string[]): { sobe: string; desce: string }[] {
  const a = new Map(antes.map((id, i) => [id, i]));
  const b = new Map(depois.map((id, i) => [id, i]));
  const out: { sobe: string; desce: string }[] = [];
  for (const x of depois) for (const y of depois) {
    if (x === y || !a.has(x) || !a.has(y)) continue;
    if (a.get(x)! > a.get(y)! && b.get(x)! < b.get(y)!) out.push({ sobe: x, desce: y });
  }
  return out;
}

// The scale of the bars: a multiple of 10 points with room above the leader, so 50% is always on the axis when it can matter.
export const eixoMax = (lider: number): number => Math.min(1, Math.max(0.3, Math.ceil((lider + 0.12) * 10 - 1e-9) / 10));

// Milestones of the count (share of sections) that earn a line of their own.
export const MARCOS = [0.25, 0.5, 0.75, 0.9, 0.99, 1] as const;
export const marcosCruzados = (antes: number, depois: number): number[] => MARCOS.filter((m) => antes < m && depois >= m);

// Initials for a face that has no photo, the same rule as the app's avatar (capitalised words, the first two).
export const iniciais = (nome: string): string => titleName(nome).split(" ").filter((w) => /^[A-ZÀ-Ú]/.test(w)).map((w) => w[0]).slice(0, 2).join("");

// ---- geometry of a state shape: the box of its path (numbers come in x,y pairs), so the page needs nothing more than `mapa-uf.json`
export type Caixa = [x0: number, y0: number, x1: number, y1: number];
export function caixaDe(d: string): Caixa | null {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 4) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]!); x1 = Math.max(x1, nums[i]!);
    y0 = Math.min(y0, nums[i + 1]!); y1 = Math.max(y1, nums[i + 1]!);
  }
  return [x0, y0, x1, y1];
}

// ---- colour: the tab's memory is by party, like the map and the charts, so a party keeps its colour in every view
export const corDoPartido = (cor: Cores, partido: string): string => cor(partido || "–");

// ---- small DOM helpers
export const elemento = <K extends keyof HTMLElementTagNameMap>(tag: K, classe = "", html = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (html) e.innerHTML = html;
  return e;
};
// Two frames: the first paint of a view must not animate from zero, so transitions are switched on after it.
export const depoisDoPrimeiroQuadro = (fn: () => void): void => { requestAnimationFrame(() => requestAnimationFrame(fn)); };
// Restart a CSS animation that is triggered by a class.
export function reiniciaClasse(el: Element, classe: string, ms: number, relogio: (fn: () => void, ms: number) => unknown = setTimeout): void {
  el.classList.remove(classe);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(classe);
  relogio(() => el.classList.remove(classe), ms);
}
