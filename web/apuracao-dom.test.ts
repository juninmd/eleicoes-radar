import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { repaint } from "./apuracao-dom.js";

// Just enough DOM for repaint: nodes with a tag and attributes, and the two selector shapes it builds.
const no = (localName, attrs = {}) => ({ localName, attrs, id: attrs.id ?? "", focado: false, hasAttribute: (a) => a in attrs, getAttribute: (a) => attrs[a], focus() { this.focado = true; } });
function fakeEl(inicial, depois) {
  let nos = inicial;
  const qsa = (sel) => {
    const m = sel.match(/^(\w+)\[([\w-]+)="(.*)"\]$/);
    if (m) return nos.filter((n) => n.localName === m[1] && n.attrs[m[2]] === m[3]);
    if (sel.startsWith("#")) return nos.filter((n) => n.id === sel.slice(1));
    if (sel === "details") return nos.filter((n) => n.localName === "details");
    const k = sel.match(/^details\[data-k="(.*)"\] > summary$/);
    if (k) return nos.filter((n) => n.localName === "summary" && n.parentElement?.dataset?.k === k[1]);
    if (sel === "details > summary") return nos.filter((n) => n.localName === "summary");
    return [];
  };
  return {
    contains: (n) => nos.includes(n),
    querySelector: (s) => qsa(s)[0] ?? null,
    querySelectorAll: qsa,
    set innerHTML(_) { nos = depois; },
  };
}

const antes = { document: globalThis.document, CSS: globalThis.CSS };
beforeEach(() => { globalThis.CSS = { escape: (s) => String(s) }; });
afterEach(() => { globalThis.document = antes.document; globalThis.CSS = antes.CSS; });

describe("repaint", () => {
  test("focus goes back to the same control, even when another control carries the same tag and data attribute", () => {
    // A small state is a chip on the map and a button in the table: both are button[data-uf="AL"].
    const chip = no("button", { "data-uf": "AL" });
    const botao = no("button", { "data-uf": "AL" });
    const chip2 = no("button", { "data-uf": "AL" });
    const botao2 = no("button", { "data-uf": "AL" });
    globalThis.document = { activeElement: botao };
    repaint(fakeEl([chip, botao], [chip2, botao2]), "<p></p>");
    expect(botao2.focado).toBe(true);
    expect(chip2.focado).toBe(false);
  });

  test("a control with an id is found by id; a control that is gone is skipped without throwing", () => {
    const a = no("button", { id: "apu-mais" });
    const a2 = no("button", { id: "apu-mais" });
    globalThis.document = { activeElement: a };
    repaint(fakeEl([a], [a2]), "");
    expect(a2.focado).toBe(true);
    const b = no("button", { "data-uf": "SP" });
    globalThis.document = { activeElement: b };
    expect(() => repaint(fakeEl([b], []), "")).not.toThrow();
  });

  test("a focused <summary> gets focus back, so a keyboard user is not thrown to the top of the page by a poll", () => {
    const sum = (k) => Object.assign(no("summary"), { parentElement: { localName: "details", dataset: k ? { k } : {} } });
    const [a, b, a2, b2] = [sum("regra-2t"), sum("cad-L1"), sum("regra-2t"), sum("cad-L1")];
    globalThis.document = { activeElement: a };
    repaint(fakeEl([a, b], [b2, a2]), ""); // the order changed: the key, not the position, finds it
    expect(a2.focado).toBe(true);
    expect(b2.focado).toBe(false);
    // without a data-k the place among the folds decides
    const [c, d, c2, d2] = [sum(), sum(), sum(), sum()];
    globalThis.document = { activeElement: d };
    repaint(fakeEl([c, d], [c2, d2]), "");
    expect(d2.focado).toBe(true);
    expect(c2.focado).toBe(false);
  });

  test("every <details> keeps what the reader did with it across a redraw, matched by its data-k; a new one keeps its own default", () => {
    const det = (k, open) => ({ localName: "details", attrs: {}, id: "", dataset: { k }, open, hasAttribute: () => false });
    globalThis.document = { activeElement: null };
    const [formulas, lista1, lista2] = [det("proj-como", true), det("cad-L1", false), det("cad-L2", true)];
    // after the redraw: the same three, plus a list that just became tight (opened by default) and one the reader had closed (default open)
    const [formulas2, lista1b, lista2b, nova] = [det("proj-como", false), det("cad-L1", true), det("cad-L2", true), det("cad-L3", true)];
    repaint(fakeEl([formulas, lista1, lista2], [formulas2, lista1b, lista2b, nova]), "");
    expect(formulas2.open).toBe(true); // was open, stays open
    expect(lista1b.open).toBe(false); // the reader had closed it: the default does not reopen it
    expect(lista2b.open).toBe(true);
    expect(nova.open).toBe(true); // not seen before: the default stands
  });

  test("a <details> with no data-k is told apart by its summary, so opening 'Como ler' on one view does not open another view's first <details>", () => {
    const det = (resumo, open) => ({ localName: "details", attrs: {}, id: "", dataset: {}, open, hasAttribute: () => false, querySelector: (s) => (s === "summary" ? { textContent: resumo } : null) });
    globalThis.document = { activeElement: null };
    // the reader opened "Como ler" on the Placar (where it is the only one); the view switches to the Projeção, which has the formulas first
    const placar = det("Como ler a apuração parcial", true);
    const formulas = det("Como calculamos (fórmulas)", false);
    const comoLer = det("Como ler a apuração parcial", false);
    repaint(fakeEl([placar], [formulas, comoLer]), "");
    expect(formulas.open).toBe(false); // it was never opened: the position of the old first <details> does not leak into it
    expect(comoLer.open).toBe(true);
  });

  test("without a data-k the position decides, so the old single 'Como ler' keeps working", () => {
    const det = (open) => ({ localName: "details", attrs: {}, id: "", dataset: {}, open, hasAttribute: () => false });
    globalThis.document = { activeElement: null };
    const antes = det(true);
    const depois = det(false);
    repaint(fakeEl([antes], [depois]), "");
    expect(depois.open).toBe(true);
  });

  test("focus outside the tab is left alone", () => {
    const fora = no("button", { "data-uf": "SP" });
    const dentro = no("button", { "data-uf": "SP" });
    globalThis.document = { activeElement: fora };
    repaint(fakeEl([dentro], [dentro]), "");
    expect(dentro.focado).toBe(false);
  });
});
