import { expect, test } from "bun:test";
import { knownTab, mountTabs, nextIndex, syncTabs } from "./tabs.js";

test("arrows wrap around the ends so focus never falls off the tablist", () => {
  expect(nextIndex("ArrowRight", 2, 3)).toBe(0);
  expect(nextIndex("ArrowLeft", 0, 3)).toBe(2);
  expect(nextIndex("ArrowDown", 0, 3)).toBe(1);
  expect(nextIndex("ArrowUp", 1, 3)).toBe(0);
});

test("Home and End jump to the first and last tab", () => {
  expect(nextIndex("Home", 2, 5)).toBe(0);
  expect(nextIndex("End", 0, 5)).toBe(4);
});

test("other keys are left alone, so typing and Tab keep working", () => {
  for (const k of ["Tab", "Enter", " ", "a", "Escape"]) expect(nextIndex(k, 1, 3)).toBeNull();
});

test("an empty tablist handles nothing", () => {
  expect(nextIndex("ArrowRight", 0, 0)).toBeNull();
});

// A fake tablist: tabs know whether they are selected, clicking one selects it (as the app's click handler does).
interface FakeTab { attrs: Record<string, string>; tabIndex: number; getAttribute(n: string): string | undefined; click(): void; focus(): void }
type Keydown = (e: { key: string; preventDefault: () => void }) => void;

function tablist(count: number, selected = 0) {
  const tabs: FakeTab[] & { focused?: FakeTab } = Array.from({ length: count }, (_, i): FakeTab => ({
    attrs: { "aria-selected": String(i === selected) }, tabIndex: -2,
    getAttribute(n) { return this.attrs[n]; },
    click() { tabs.forEach((t) => { t.attrs["aria-selected"] = String(t === this); }); },
    focus() { tabs.focused = this; },
  }));
  const handlers: Record<string, Keydown> = {};
  const list = {
    addEventListener: (t: string, f: Keydown) => { handlers[t] = f; },
    querySelectorAll: () => tabs,
    querySelector: () => tabs.find((t) => t.attrs["aria-selected"] === "true"),
  } as unknown as HTMLElement;
  return { tabs, list, handlers };
}
const withActive = (active: unknown, fn: () => void) => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value: { activeElement: active }, configurable: true, writable: true });
  try { fn(); } finally { prev ? Object.defineProperty(globalThis, "document", prev) : delete (globalThis as { document?: unknown }).document; }
};

test("only the selected tab is a Tab stop", () => {
  const { tabs, list } = tablist(3, 1);
  syncTabs(list);
  expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
});

test("an arrow selects the next tab, moves the Tab stop to it and keeps focus on it", () => {
  const { tabs, list, handlers } = tablist(3, 0);
  mountTabs(list);
  let prevented = false;
  withActive(tabs[0], () => handlers.keydown({ key: "ArrowRight", preventDefault: () => { prevented = true; } }));
  expect(prevented).toBe(true);
  expect(tabs.map((t) => t.attrs["aria-selected"])).toEqual(["false", "true", "false"]);
  expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  expect(tabs.focused).toBe(tabs[1]);
});

test("keys that are not ours, or pressed outside the tabs, are not swallowed", () => {
  const { tabs, list, handlers } = tablist(3, 0);
  mountTabs(list);
  let prevented = false;
  const e = (key: string) => ({ key, preventDefault: () => { prevented = true; } });
  withActive(tabs[0], () => handlers.keydown(e("Tab")));
  withActive({}, () => handlers.keydown(e("ArrowRight"))); // focus is on something else inside the list
  expect(prevented).toBe(false);
  expect(tabs[0].attrs["aria-selected"]).toBe("true");
});

test("a saved tab that no longer exists falls back, so a tab is always selected", () => {
  const known = ["radar", "rede"];
  expect(knownTab("rede", known, "radar")).toBe("rede");
  for (const saved of ["old", "constructor", "", null, undefined, 3, { a: 1 }]) expect(knownTab(saved, known, "radar")).toBe("radar");
});
