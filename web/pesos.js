// Weight sliders and presets. The preset buttons say which one the current weights equal.
import { INDICATORS, PRESETS } from "./score.js";
import { h } from "./format.js";

export const LEVELS = ["off", "baixo", "médio", "alto"];

// The preset whose weights equal `weights` (missing key = 0), or null once the user moves a slider.
export function activePreset(weights) {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (INDICATORS.every(({ key: k }) => (weights[k] ?? 0) === (p.w[k] ?? 0))) return key;
  }
  return null;
}

export function presetsHtml(weights) {
  const on = activePreset(weights);
  return Object.entries(PRESETS).map(([k, p]) => `<button type="button" data-preset="${k}" aria-pressed="${k === on}">${h(p.nome)}</button>`).join("");
}

// Each indicator's description is on the page, tied to its slider, not only in a hover tooltip.
export function weightsHtml(weights) {
  return INDICATORS.map(({ key, grupo, nome, fonte, desc }, i) => `${grupo !== INDICATORS[i - 1]?.grupo ? `<p class="grupo">${h(grupo)}</p>` : ""}
    <div class="peso">
      <label for="w-${key}"><span>${h(nome)} <small>${h(fonte)}</small></span></label>
      <output for="w-${key}">${LEVELS[weights[key] ?? 0]}</output>
      <input type="range" id="w-${key}" min="0" max="3" step="1" value="${weights[key] ?? 0}" data-weight="${key}" aria-describedby="d-${key}" aria-valuetext="${LEVELS[weights[key] ?? 0]}">
      <details class="how"><summary>O que é isto?</summary><p id="d-${key}">${h(desc)}</p></details>
    </div>`).join("");
}
