// WAI-ARIA tabs: one tab stop per tablist, arrow keys move between tabs and activate them.

// Pure so the keyboard rules are testable: the index a key moves to, or null when the key is not ours.
export function nextIndex(key, current, count) {
  if (!count) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  return null;
}

// A saved tab name that no longer exists (stale storage, renamed view) falls back, so one tab is always selected.
export const knownTab = (saved, known, fallback) => (known.includes(saved) ? saved : fallback);

// Only the selected tab is reachable with Tab; call after anything that changes aria-selected.
export function syncTabs(list) {
  for (const t of list.querySelectorAll('[role="tab"]')) t.tabIndex = t.getAttribute("aria-selected") === "true" ? 0 : -1;
}

// Tabs are activated by their own click handler, so arrows just click the target and keep focus on the
// selected tab (the list may have been re-rendered by that click).
export function mountTabs(list) {
  list.addEventListener("keydown", (e) => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const to = nextIndex(e.key, at, tabs.length);
    if (to === null) return;
    e.preventDefault();
    tabs[to].click();
    syncTabs(list);
    list.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  });
}
