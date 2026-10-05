import { expect, test } from "bun:test";
import { focusSelector, keepFocus, visibleOpener } from "./focus.js";

const asRoot = (o: unknown) => o as ParentNode;

test("a data attribute becomes an attribute selector that finds the same element after a re-render", () => {
  expect(focusSelector({ dataset: { rede: "fornecedor:123" } })).toBe('[data-rede="fornecedor:123"]');
  expect(focusSelector({ dataset: { open: "SP-1" } })).toBe('[data-open="SP-1"]');
});

test("camelCase dataset keys go back to kebab-case attributes", () => {
  expect(focusSelector({ dataset: { redeGeral: "" } })).toBe('[data-rede-geral=""]');
});

test("quotes and backslashes in the value cannot break out of the selector", () => {
  expect(focusSelector({ dataset: { open: 'a"]b\\c' } })).toBe('[data-open="a\\"]b\\\\c"]');
});

test("an element with no data attribute, or no element at all, gives nothing to restore", () => {
  expect(focusSelector({ dataset: {} })).toBeNull();
  expect(focusSelector(null)).toBeNull();
  expect(focusSelector({})).toBeNull();
});

const withDocument = (doc: unknown, fn: () => void) => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  try { fn(); } finally { prev ? Object.defineProperty(globalThis, "document", prev) : delete (globalThis as { document?: unknown }).document; }
};
interface FakeEl { hidden: boolean; focused?: boolean; closest(s: string): object | null; focus(): void }
const el = (o = {}): FakeEl => ({ hidden: false, closest(s) { return this.hidden && s === "[hidden]" ? {} : null; }, focus() { this.focused = true; }, ...o });

test("closing returns focus to the opener that is on screen, not to its twin in a hidden view", () => {
  const offscreen = el({ hidden: true });
  const onscreen = el();
  const seen: string[] = [];
  const root = asRoot({ querySelectorAll: (sel: string) => { seen.push(sel); return [offscreen, onscreen]; } });
  expect(visibleOpener(root, "open", 'SP"1')).toBe(onscreen as unknown as HTMLElement);
  expect(seen[0]).toBe('[data-open="SP\\"1"]'); // the id is escaped like any other selector value
  expect(visibleOpener(asRoot({ querySelectorAll: () => [offscreen] }), "open", "x")).toBeNull();
  expect(visibleOpener(asRoot({ querySelectorAll: () => [] }), "open", "x")).toBeNull();
});

test("keepFocus puts focus on the re-rendered twin, after the render", () => {
  const before = { dataset: { rede: "f:1" } };
  const twin = el();
  const order: string[] = [];
  const container = { contains: (e: unknown) => e === before, querySelector: (sel: string) => { order.push(`find ${sel}`); return twin; } } as unknown as HTMLElement;
  withDocument({ activeElement: before }, () => keepFocus(container, () => order.push("render")));
  expect(order).toEqual(["render", 'find [data-rede="f:1"]']);
  expect(twin.focused).toBe(true);
});

test("keepFocus leaves focus alone when it was outside the container or the twin is gone", () => {
  const outside = { dataset: { open: "1" } };
  let searched = false;
  const container = { contains: () => false, querySelector: () => { searched = true; return null; } } as unknown as HTMLElement;
  withDocument({ activeElement: outside }, () => keepFocus(container, () => {}));
  expect(searched).toBe(false);
  const inside = { dataset: { open: "1" } };
  const gone = { contains: () => true, querySelector: () => null } as unknown as HTMLElement;
  expect(() => withDocument({ activeElement: inside }, () => keepFocus(gone, () => {}))).not.toThrow();
});
