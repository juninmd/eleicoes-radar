// Zoom and pan of the Noite map: the stage (`cena`, the world in its own units) moves inside the viewport (`vp`). The geometry is pure
// (apuracao-cena.ts); this only listens: drag, pinch, Ctrl/⌘ + wheel (a plain wheel keeps scrolling the page), the +/−/fit buttons, and a
// state that takes keyboard focus is panned into view. Touch only drags once the map is zoomed, so a finger on a fitted map still scrolls the page.
import { MUNDO_VB, enquadrar, limitar, trazerParaVista, zoomEm } from "./apuracao-cena.js";
import type { Retangulo, Vista } from "./apuracao-cena.js";

export interface Zoom {
  irPara(alvo: Retangulo, animar: boolean): void; // frames a place (Brazil, the world) and makes it the one "fit" returns to
  vista(): Vista;
  destruir(): void;
}
export interface OpcoesZoom { vp: HTMLElement; cena: HTMLElement; reduzido: () => boolean }

const LIMIAR_ARRASTO = 4; // px a pointer must move before it is a drag and not a click
const PASSO_BOTAO = 1.6;
const DURACAO_MS = 700;

export function criarZoom({ vp, cena, reduzido }: OpcoesZoom): Zoom {
  let v: Vista = { k: 1, x: 0, y: 0 };
  let alvo: Retangulo | null = null;
  let kAlvo = 1; // zoom of the framed place: above it the map counts as "zoomed in"
  let manual = false; // the reader moved the view: a resize keeps it instead of re-framing
  let fimAnimacao: ReturnType<typeof setTimeout> | undefined;
  const dedos = new Map<number, { x: number; y: number }>();
  let arrastando = false, moveu = false, base = { x: 0, y: 0 }, vistaBase: Vista = v, pinca = 0;

  const tamanho = () => ({ w: vp.clientWidth || 1, h: vp.clientHeight || 1 });
  const aplica = () => {
    cena.style.transform = `translate(${v.x.toFixed(2)}px, ${v.y.toFixed(2)}px) scale(${v.k.toFixed(5)})`;
    cena.style.setProperty("--inv", (1 / v.k).toFixed(5)); // labels keep their size while the stage grows
    vp.classList.toggle("ampliado", v.k > kAlvo * 1.02);
    cena.dataset.k = v.k.toFixed(3);
  };
  const mudar = (nova: Vista, animar = false) => {
    v = limitar(nova, tamanho());
    if (animar && !reduzido()) {
      cena.classList.add("anima");
      clearTimeout(fimAnimacao);
      fimAnimacao = setTimeout(() => cena.classList.remove("anima"), DURACAO_MS + 80);
    } else { clearTimeout(fimAnimacao); cena.classList.remove("anima"); }
    aplica();
  };
  const centro = () => { const t = tamanho(); return { x: t.w / 2, y: t.h / 2 }; };
  const doEvento = (e: { clientX: number; clientY: number }) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const irPara = (novo: Retangulo, animar: boolean) => {
    alvo = novo; manual = false;
    const q = enquadrar(novo, tamanho());
    kAlvo = limitar(q, tamanho()).k;
    mudar(q, animar);
  };

  const aoRolar = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // a plain wheel scrolls the page; a trackpad pinch arrives as ctrl + wheel
    e.preventDefault();
    manual = true;
    mudar(zoomEm(v, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), doEvento(e), tamanho()));
  };

  const aoApertar = (e: PointerEvent) => {
    if (dedos.size === 0) moveu = false; // a drag that ended without a click must not eat the next one
    if (e.button > 0 || (e.target as Element).closest(".nt-zoom")) return;
    dedos.set(e.pointerId, doEvento(e));
    if (dedos.size === 1) { base = doEvento(e); vistaBase = v; arrastando = false; }
    else if (dedos.size === 2) { const [a, b] = [...dedos.values()] as [{ x: number; y: number }, { x: number; y: number }]; pinca = Math.hypot(a.x - b.x, a.y - b.y); arrastando = true; moveu = true; }
  };
  const aoMover = (e: PointerEvent) => {
    if (!dedos.has(e.pointerId)) return;
    const p = doEvento(e);
    dedos.set(e.pointerId, p);
    if (dedos.size >= 2) {
      const [a, b] = [...dedos.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinca > 0 && d > 0) { manual = true; mudar(zoomEm(v, d / pinca, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tamanho())); }
      pinca = d;
      return;
    }
    if (!arrastando) {
      if (Math.hypot(p.x - base.x, p.y - base.y) < LIMIAR_ARRASTO) return;
      if (e.pointerType === "touch" && !vp.classList.contains("ampliado")) { dedos.clear(); return; } // let the page scroll
      arrastando = true; moveu = true;
      try { vp.setPointerCapture(e.pointerId); } catch { /* the pointer already ended */ }
      vp.classList.add("arrastando");
    }
    manual = true;
    mudar({ k: vistaBase.k, x: vistaBase.x + (p.x - base.x), y: vistaBase.y + (p.y - base.y) });
  };
  const aoSoltar = (e: PointerEvent) => {
    dedos.delete(e.pointerId);
    if (dedos.size === 0) { arrastando = false; vp.classList.remove("arrastando"); } else { const [resto] = [...dedos.values()]; base = resto!; vistaBase = v; pinca = 0; }
  };
  // The click that ends a drag must not select the state under the finger.
  const aoClicar = (e: MouseEvent) => {
    if (moveu) { e.stopPropagation(); e.preventDefault(); moveu = false; return; }
    const b = (e.target as Element).closest<HTMLElement>("[data-nt-zoom]");
    if (!b) return;
    manual = true;
    const acao = b.dataset.ntZoom;
    if (acao === "mais") mudar(zoomEm(v, PASSO_BOTAO, centro(), tamanho()), true);
    else if (acao === "menos") mudar(zoomEm(v, 1 / PASSO_BOTAO, centro(), tamanho()), true);
    else if (alvo) irPara(alvo, true);
  };
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") mudar(zoomEm(v, PASSO_BOTAO, centro(), tamanho()), true);
    else if (e.key === "-" || e.key === "_") mudar(zoomEm(v, 1 / PASSO_BOTAO, centro(), tamanho()), true);
    else if (e.key === "0" && alvo) irPara(alvo, true);
    else return;
    manual = true;
    e.preventDefault();
  };
  const aoFocar = (e: FocusEvent) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-nt-uf]");
    if (!el || !el.offsetWidth) return;
    const nova = trazerParaVista(v, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }, tamanho());
    if (nova !== v) mudar(nova, true);
  };

  const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (alvo && !manual) irPara(alvo, false); else mudar(v); }) : null;
  observador?.observe(vp);
  vp.addEventListener("wheel", aoRolar, { passive: false });
  vp.addEventListener("pointerdown", aoApertar);
  vp.addEventListener("pointermove", aoMover);
  vp.addEventListener("pointerup", aoSoltar);
  vp.addEventListener("pointercancel", aoSoltar);
  vp.addEventListener("click", aoClicar, true);
  vp.addEventListener("keydown", aoTeclar);
  vp.addEventListener("focusin", aoFocar);
  aplica();

  return {
    irPara,
    vista: () => v,
    destruir() {
      observador?.disconnect();
      clearTimeout(fimAnimacao);
      vp.removeEventListener("wheel", aoRolar);
      vp.removeEventListener("pointerdown", aoApertar);
      vp.removeEventListener("pointermove", aoMover);
      vp.removeEventListener("pointerup", aoSoltar);
      vp.removeEventListener("pointercancel", aoSoltar);
      vp.removeEventListener("click", aoClicar, true);
      vp.removeEventListener("keydown", aoTeclar);
      vp.removeEventListener("focusin", aoFocar);
    },
  };
}

export const MUNDO_RETANGULO: Retangulo = { x: 0, y: 0, w: MUNDO_VB[2], h: MUNDO_VB[3] };
