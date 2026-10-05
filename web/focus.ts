// Re-rendering a container with innerHTML drops keyboard focus to <body>. Find the element again afterwards
// by its first data-* attribute (every interactive element in the app carries one).

const attrSelector = (attr: string, value: unknown) => `[data-${attr}="${String(value).replace(/["\\]/g, "\\$&")}"]`;

// A selector that finds `el`'s twin after a re-render, or null when it cannot be told apart.
export function focusSelector(el: { dataset?: DOMStringMap } | null | undefined) {
  const first = el?.dataset && Object.entries(el.dataset)[0];
  if (!first) return null;
  return attrSelector(first[0].replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), first[1]);
}

// The same candidate can sit in several views, and the hidden ones cannot take focus: pick the one on screen.
export function visibleOpener(root: ParentNode, attr: string, value: unknown) {
  return [...root.querySelectorAll<HTMLElement>(attrSelector(attr, value))].find((e) => !e.closest("[hidden]")) ?? null;
}

export function keepFocus(container: HTMLElement, render: () => void) {
  const sel = container.contains(document.activeElement) ? focusSelector(document.activeElement as HTMLElement) : null;
  render();
  if (sel) container.querySelector<HTMLElement>(sel)?.focus();
}
