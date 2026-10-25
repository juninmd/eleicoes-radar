import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { presetsHtml } from "./pesos.js";
import { PRESETS } from "./score.js";

test("web/styles.css styles active presets with accessible contrast and urn token border without font-weight shift", () => {
	const css = readFileSync("web/styles.css", "utf8");
	expect(css).toContain('#presets button[aria-pressed="true"]');
	expect(css).toContain("var(--panel-2)");
	expect(css).toContain("var(--confirma)");
	expect(css).toContain("box-shadow: 0 0 0 1px var(--confirma)");
	expect(css).not.toContain(
		'#presets button[aria-pressed="true"] { background: var(--panel-2); color: var(--panel-ink); border-color: var(--confirma); box-shadow: 0 0 0 1px var(--confirma); font-weight: 700; }',
	);
});

test("web/styles.css provides explicit :focus-visible for presets and buttons", () => {
	const css = readFileSync("web/styles.css", "utf8");
	expect(css).toContain("#presets button:focus-visible");
	expect(css).toContain("var(--focus)");
});

test("web/apuracao.css formats apu-quando and apu-idade with tabular-nums without duplication", () => {
	const css = readFileSync("web/apuracao.css", "utf8");
	const quandoMatches = css.match(/#apu-quando\s*\{/g) || [];
	const idadeMatches = css.match(/#apu-idade\s*\{/g) || [];
	expect(quandoMatches.length).toBe(1);
	expect(idadeMatches.length).toBe(1);
	expect(css).toContain("font-variant-numeric: tabular-nums");
});

test("presetsHtml outputs aria-pressed on each button reflecting active preset", () => {
	const html = presetsHtml(PRESETS.agenda.w);
	expect(html).toContain('data-preset="agenda"');
	expect(html).toContain('aria-pressed="true"');
	expect(html).toContain('data-preset="campanha"');
	expect(html).toContain('aria-pressed="false"');
});
