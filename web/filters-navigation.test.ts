import { describe, expect, test } from "bun:test";

describe("filter state and navigation UX", () => {
  test("index.html contains voltar-topo button with accessible label and hidden by default", async () => {
    const html = await Bun.file(new URL("./index.html", import.meta.url)).text();
    expect(html).toContain('id="voltar-topo"');
    expect(html).toContain('class="voltar-topo radar-only"');
    expect(html).toContain('aria-label="Voltar ao início da lista"');
    expect(html).toMatch(/<button[^>]+id="voltar-topo"[^>]+hidden/);
  });

  test("toolbar includes quick clear filters button", async () => {
    const html = await Bun.file(new URL("./index.html", import.meta.url)).text();
    expect(html).toContain('id="limpar-filtros"');
    expect(html).toContain('class="btn-limpar-filtros"');
    expect(html).toContain("Limpar filtros");
  });

  test("styles.css styles voltar-topo and btn-limpar-filtros cleanly", async () => {
    const css = await Bun.file(new URL("./styles.css", import.meta.url)).text();
    expect(css).toContain(".voltar-topo");
    expect(css).toContain(".btn-limpar-filtros");
    expect(css).toContain("min-width: 44px"); // WCAG 2.1 touch target
    expect(css).toContain("min-height: 44px");
  });
});
