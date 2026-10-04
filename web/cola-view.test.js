import { expect, test } from "bun:test";
import { colaHtml, colaText, mountColaButtons } from "./cola-view.js";
import { titleName } from "./format.js";

const ballots = [{ cargo: "Deputado Federal", digits: 4 }, { cargo: "Presidente", digits: 2 }];
const pick = { id: "1", num: "1234", nome: "ANA DA SILVA", partido: "PT" };
const cola = { "Deputado Federal": [pick] };
const avatar = (p, size) => `<i data-av="${p.id}-${size}"></i>`;

test("the text to copy lists every ballot, with a dash for the ones left blank", () => {
  const lines = colaText(cola, ballots).split("\n");
  expect(lines[0]).toContain("Minha cola");
  expect(lines).toContain(`Deputado Federal: 1234 ${titleName(pick.nome)} (PT)`);
  expect(lines.at(-1)).toMatch(/Presidente: —$/);
});

test("the list shows the picked number and, for a blank ballot, as many blanks as the urna has digits", () => {
  const html = colaHtml(cola, ballots, avatar);
  expect(html).toContain("1234");
  expect(html).toContain('data-av="1-xs"');
  expect(html).toContain("__"); // Presidente, 2 digits
  expect(html).toContain("em branco na cola");
});

test("a name from the data cannot inject markup into the list", () => {
  const evil = { "Deputado Federal": [{ ...pick, nome: "<img src=x onerror=alert(1)>", partido: "A&B" }] };
  const html = colaHtml(evil, ballots, avatar);
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;");
});

// A fake page: only the elements mountColaButtons touches, with the clipboard swapped in per test.
async function clickCopy(clipboard) {
  const el = (extra = {}) => ({ listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, textContent: "", value: "", hidden: true, select() { this.selected = true; }, ...extra });
  const els = { "#copiar": el(), "#limpar": el(), "#imprimir": el(), "#copiar-status": el(), "#cola-texto": el() };
  const docDesc = Object.getOwnPropertyDescriptor(globalThis, "document");
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "document", { value: { querySelector: (s) => els[s] }, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: { clipboard }, configurable: true, writable: true });
  try {
    mountColaButtons({ get: () => cola, ballots, clear: () => {} });
    els["#copiar"].listeners.click();
    await new Promise((r) => setTimeout(r, 0));
    return els;
  } finally {
    docDesc ? Object.defineProperty(globalThis, "document", docDesc) : delete globalThis.document;
    navDesc ? Object.defineProperty(globalThis, "navigator", navDesc) : delete globalThis.navigator;
  }
}

test("copy uses the clipboard when there is one", async () => {
  let written = "";
  const els = await clickCopy({ writeText: async (t) => { written = t; } });
  expect(written).toBe(colaText(cola, ballots));
  expect(els["#copiar-status"].textContent).toBe("Cola copiada.");
  expect(els["#cola-texto"].hidden).toBe(true);
});

test("without a clipboard API the text is offered for manual copy instead of the click doing nothing", async () => {
  const els = await clickCopy(undefined);
  expect(els["#cola-texto"].value).toBe(colaText(cola, ballots));
  expect(els["#cola-texto"].hidden).toBe(false);
  expect(els["#copiar-status"].textContent).toBe("Selecione e copie o texto.");
});

test("a refused clipboard write falls back the same way", async () => {
  const els = await clickCopy({ writeText: async () => { throw new Error("denied"); } });
  expect(els["#cola-texto"].hidden).toBe(false);
  expect(els["#copiar-status"].textContent).toBe("Selecione e copie o texto.");
});
