import { expect, test } from "bun:test";
import { INDICATORS, PRESETS } from "./score.js";
import { activePreset, presetsHtml, weightsHtml } from "./pesos.js";

test("each preset is recognised by its own weights", () => {
  for (const [key, p] of Object.entries(PRESETS)) expect(activePreset(p.w)).toBe(key);
});

test("moving one slider leaves no preset marked, instead of pretending it is still the preset", () => {
  const w = { ...PRESETS.agenda.w, presenca: 3 };
  expect(activePreset(w)).toBeNull();
  expect(presetsHtml(w)).not.toContain('aria-pressed="true"');
});

test("a missing key counts as zero, so old saved weights still match", () => {
  const { presenca, ...rest } = PRESETS.campanha.w;
  expect(activePreset(rest)).toBe("campanha");
});

test("exactly one preset button is pressed when the weights equal a preset", () => {
  expect(presetsHtml(PRESETS.mandato.w).match(/aria-pressed="true"/g)).toHaveLength(1);
});

test("every slider has its description on the page and points to it", () => {
  const html = weightsHtml(PRESETS.agenda.w);
  for (const { key, desc } of INDICATORS) {
    expect(html).toContain(`aria-describedby="d-${key}"`);
    expect(html).toContain(`id="d-${key}"`);
    expect(html).toContain(desc.slice(0, 40).replace(/&/g, "&amp;"));
  }
  expect(html).not.toContain("title=");
});

test("a slider announces its level in words, not only its number", () => {
  expect(weightsHtml({ impostos: 3 })).toContain('aria-valuetext="alto"');
});
