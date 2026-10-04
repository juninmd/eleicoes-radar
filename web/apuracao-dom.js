// DOM helpers of the Apuração tab. Kept apart from the pure renderers so those stay testable without a DOM.

// The page minus the "queried at" clock: equal keys mean a refresh brought nothing to redraw.
export const semRelogio = (html) => html.replace(/(<span id="apu-quando">)[^<]*(<\/span>)/, "$1$2");
export const relogio = (html) => html.match(/<span id="apu-quando">([^<]*)<\/span>/)?.[1] ?? null;

const CHAVES = ["data-open", "data-vista", "data-modo-mapa", "data-uf", "data-abrir-uf"];

// What identifies the focused control after a redraw: its id, or its tag plus the data attribute it carries,
// and its position among the controls that match the same way (a small state is a chip and a table button).
function focoDe(el) {
  const f = document.activeElement;
  if (!f || !el.contains(f)) return null;
  if (f.id) return { sel: `#${CSS.escape(f.id)}`, i: 0 };
  const attr = CHAVES.find((a) => f.hasAttribute(a));
  if (!attr) return null;
  const sel = `${f.localName}[${attr}="${CSS.escape(f.getAttribute(attr))}"]`;
  return { sel, i: Math.max(0, [...el.querySelectorAll(sel)].indexOf(f)) };
}

// Redrawing replaces the DOM, which would close the open <details>, drop focus and reset the table scroll.
export function repaint(el, html) {
  const open = el.querySelector("details.how")?.open;
  const foco = focoDe(el);
  const scroll = el.querySelector(".scroll")?.scrollLeft ?? 0;
  el.innerHTML = html;
  if (open) el.querySelector("details.how")?.setAttribute("open", "");
  if (foco) el.querySelectorAll(foco.sel)[foco.i]?.focus({ preventScroll: true });
  const box = el.querySelector(".scroll");
  if (box) box.scrollLeft = scroll;
}
