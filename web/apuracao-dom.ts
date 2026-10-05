// DOM helpers of the Apuração tab. Kept apart from the pure renderers so those stay testable without a DOM.

// The page minus what only a clock changes ("queried at" and the age of the file): equal keys mean a refresh brought nothing to redraw.
const vivo = (id) => new RegExp(`(<span id="${id}">)[^<]*(</span>)`);
export const semRelogio = (html) => html.replace(vivo("apu-quando"), "$1$2").replace(vivo("apu-idade"), "$1$2");
const texto = (id) => (html) => html.match(new RegExp(`<span id="${id}">([^<]*)</span>`))?.[1] ?? null;
export const relogio = texto("apu-quando");
export const idade = texto("apu-idade");

const CHAVES = ["data-open", "data-vista", "data-modo-mapa", "data-uf", "data-abrir-uf"];

// What identifies the focused control after a redraw: its id, or its tag plus the data attribute it carries,
// and its position among the controls that match the same way (a small state is a chip and a table button).
function focoDe(el) {
  const f = document.activeElement;
  if (!f || !el.contains(f)) return null;
  if (f.id) return { sel: `#${CSS.escape(f.id)}`, i: 0 };
  if (f.localName === "summary") { // a fold's header carries neither: it is its <details>' data-k, else its place among the headers
    const k = f.parentElement?.dataset?.k;
    if (k) return { sel: `details[data-k="${CSS.escape(k)}"] > summary`, i: 0 };
    return { sel: "details > summary", i: Math.max(0, [...el.querySelectorAll("details > summary")].indexOf(f)) };
  }
  const attr = CHAVES.find((a) => f.hasAttribute(a));
  if (!attr) return null;
  const sel = `${f.localName}[${attr}="${CSS.escape(f.getAttribute(attr))}"]`;
  return { sel, i: Math.max(0, [...el.querySelectorAll(sel)].indexOf(f)) };
}

// A <details> is told apart by its data-k (a list, the formulas), else by its summary text, else by its position: a view
// switch must not hand the state of one view's first <details> to another's.
const chaveDe = (d, i) => d.dataset?.k ?? d.querySelector?.("summary")?.textContent ?? `#${i}`;
const estados = (el) => new Map([...el.querySelectorAll("details")].map((d, i) => [chaveDe(d, i), d.open]));

// Redrawing replaces the DOM, which would close the open <details>, drop focus and reset the table scroll.
// A <details> that was there before gets back the state the reader left it in; a new one keeps its default.
export function repaint(el, html) {
  const abertos = estados(el);
  const foco = focoDe(el);
  const scroll = el.querySelector(".scroll")?.scrollLeft ?? 0;
  el.innerHTML = html;
  el.querySelectorAll("details").forEach((d, i) => { const k = chaveDe(d, i); if (abertos.has(k)) d.open = abertos.get(k); });
  if (foco) el.querySelectorAll(foco.sel)[foco.i]?.focus({ preventScroll: true });
  const box = el.querySelector(".scroll");
  if (box) box.scrollLeft = scroll;
}
