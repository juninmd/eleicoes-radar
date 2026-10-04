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

  test("focus outside the tab is left alone", () => {
    const fora = no("button", { "data-uf": "SP" });
    const dentro = no("button", { "data-uf": "SP" });
    globalThis.document = { activeElement: fora };
    repaint(fakeEl([dentro], [dentro]), "");
    expect(dentro.focado).toBe(false);
  });
});
