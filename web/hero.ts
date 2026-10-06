export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Counts a number up in place; goes straight to the final value for reduced motion or when there is no animation clock. */
export function countUp(el: HTMLElement, to: number, fmt: (n: number) => string, ms = 900): void {
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || typeof requestAnimationFrame !== "function" || to <= 0) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(Math.round(to * easeOut(k)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
