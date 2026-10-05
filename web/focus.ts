// Re-rendering a container with innerHTML drops keyboard focus to <body>. Find the element again afterwards
// by its first data-* attribute (every interactive element in the app carries one).

const attrSelector = (attr, value) => `[data-${attr}="${String(value).replace(/["\\]/g, "\\$&")}"]`;

// A selector that finds `el`'s twin after a re-render, or null when it cannot be told apart.
export function focusSelector(el) {
  const first = el?.dataset && Object.entries(el.dataset)[0];
  if (!first) return null;
  return attrSelector(first[0].replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), first[1]);
}

// The same candidate can sit in several views, and the hidden ones cannot take focus: pick the one on screen.
export function visibleOpener(root, attr, value) {
  return [...root.querySelectorAll(attrSelector(attr, value))].find((e) => !e.closest("[hidden]")) ?? null;
}

export function keepFocus(container, render) {
  const sel = container.contains(document.activeElement) ? focusSelector(document.activeElement) : null;
  render();
  if (sel) container.querySelector(sel)?.focus();
}
