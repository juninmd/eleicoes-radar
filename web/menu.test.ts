import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// The tab bar became a left menu: the tabs are a sibling of the content, not a strip inside #principal,
// and the menu is reachable from a fixed handle with an explicit open/pin/close state.
test("index.html: #modos lives inside the menu, outside the main content", () => {
  const html = readFileSync("web/index.html", "utf8");
  const menu = html.indexOf('<nav id="menu"');
  const modos = html.indexOf('<div id="modos"');
  const fimMenu = html.indexOf("</nav>", menu);
  const principal = html.indexOf('<main id="principal"');
  expect(menu).toBeGreaterThan(-1);
  expect(modos).toBeGreaterThan(menu);
  expect(modos).toBeLessThan(fimMenu);
  expect(modos).toBeLessThan(principal);
  expect(html).toContain('id="menu-toggle"');
  expect(html).toContain('aria-controls="menu"');
  expect(html).toContain('id="menu-fixar"');
  expect(html).toContain('aria-orientation="vertical"');
});

test("app.ts: the menu opens on the handle, pins, closes with Esc and remembers the choice", () => {
  const code = readFileSync("web/app.ts", "utf8");
  expect(code).toContain("menu-fixado");
  expect(code).toContain('localStorage.getItem("radar:menu")');
  expect(code).toContain('localStorage.setItem("radar:menu", "fixado")');
  expect(code).toContain('menuToggle.addEventListener("click"');
  expect(code).toContain("menu.addEventListener(\"pointerleave\"");
  expect(code).toContain("e.key !== \"Escape\"");
  expect(code).toContain("stopImmediatePropagation");
  expect(code).toContain('$("#menu-sobre")');
});

test("styles.css: the menu hides off-canvas and Ao vivo drops the rail and the max width", () => {
  const css = readFileSync("web/styles.css", "utf8");
  expect(css).toContain("body.menu-aberto .menu");
  expect(css).toContain("body.menu-fixado .menu");
  expect(css).toContain("translateX(-102%)");
  expect(css).toContain("body[data-visao=\"aovivo\"] .rail");
  expect(css).toContain("body[data-visao=\"aovivo\"] .layout");
  expect(css).toContain("min-height: 100dvh");
});

test("apuracao-noite: the map reports a state click and hides the open button when embedded", () => {
  const code = readFileSync("web/apuracao-noite.ts", "utf8");
  expect(code).toContain("onUf?: (uf: string) => void");
  expect(code).toContain("onLugar?: (lugar: Lugar) => void");
  expect(code).toContain("ultimo.onUf?.(sel)");
  expect(code).toContain("ultimo.onLugar?.(lugar)");
  expect(code).toContain("p.semAbrir ?");
  expect(code).toContain("p.lugar !== lugar");
});

test("apuracao-aovivo: no state dropdown; the map picker and the back button replace it", () => {
  const code = readFileSync("web/apuracao-aovivo.ts", "utf8");
  expect(code).not.toContain('<select id="live-escopo"');
  expect(code).not.toContain("Onde<select");
  expect(code).toContain("data-live-total");
  expect(code).toContain("Voltar ao Brasil (total)");
  expect(code).toContain("onUf:");
  expect(code).toContain("onLugar:");
});
