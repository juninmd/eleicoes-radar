import { expect, test } from "bun:test";
import { COR_TEMA, CHAVE_TEMA, gravarTema, lerTemaSalvo, ligarTema, resolverTema } from "./tema.js";

test("resolverTema: a saved choice wins, otherwise the OS, otherwise dark", () => {
  expect(resolverTema("light", false)).toBe("light");
  expect(resolverTema("dark", true)).toBe("dark");
  expect(resolverTema(null, true)).toBe("light");
  expect(resolverTema(null, false)).toBe("dark");
  expect(resolverTema("", true)).toBe("light");
  expect(resolverTema("auto", false)).toBe("dark");
  expect(resolverTema(" LIGHT ", true)).toBe("light"); // anything other than the two tokens is "no choice"
});

interface Memoria { valor: string | null; getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }
const memoria = (inicial: string | null = null): Memoria => {
  const m: Memoria = { valor: inicial, getItem(k) { if (k !== CHAVE_TEMA) return null; return m.valor; }, setItem(k, v) { if (k === CHAVE_TEMA) m.valor = v; } };
  return m;
};
const quebra = () => ({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });

function withGlobals(g: { document?: unknown; localStorage?: unknown; matchMedia?: unknown }, fn: () => void) {
  const keys = ["document", "localStorage", "matchMedia"] as const;
  const prev = keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const);
  for (const k of keys) {
    if (g[k] === undefined) delete (globalThis as Record<string, unknown>)[k];
    else Object.defineProperty(globalThis, k, { value: g[k], configurable: true, writable: true });
  }
  try { fn(); } finally {
    for (const [k, d] of prev) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (globalThis as Record<string, unknown>)[k];
    }
  }
}

test("reading and writing the choice never throws when storage is missing or blocked", () => {
  withGlobals({ localStorage: undefined }, () => {
    expect(lerTemaSalvo()).toBeNull();
    expect(() => gravarTema("light")).not.toThrow();
  });
  withGlobals({ localStorage: quebra() }, () => {
    expect(lerTemaSalvo()).toBeNull();
    expect(() => gravarTema("dark")).not.toThrow();
  });
  const m = memoria(null);
  withGlobals({ localStorage: m }, () => {
    expect(lerTemaSalvo()).toBeNull();
    gravarTema("light");
    expect(m.valor).toBe("light");
    expect(lerTemaSalvo()).toBe("light");
  });
});

interface Botao { pressed: string; clicks: Array<() => void>; setAttribute(n: string, v: string): void; addEventListener(t: string, fn: () => void): void }
const botao = (): Botao => {
  const b: Botao = { pressed: "", clicks: [], setAttribute(n, v) { if (n === "aria-pressed") b.pressed = v; }, addEventListener(t, fn) { if (t === "click") b.clicks.push(fn); } };
  return b;
};

test("the button flips aria-pressed and data-theme and keeps the choice", () => {
  const store = memoria("dark");
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const meta = { content: "" };
  const doc = { documentElement: root, querySelector: () => ({ setAttribute: (_n: string, v: string) => { meta.content = v; } }) };
  const btn = botao();
  let matches = false;
  const ouvintes: Array<() => void> = [];
  const mq = { get matches() { return matches; }, addEventListener(_t: string, fn: () => void) { ouvintes.push(fn); } };
  withGlobals({ document: doc, localStorage: store, matchMedia: () => mq }, () => {
    ligarTema(btn as unknown as HTMLButtonElement);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(meta.content).toBe(COR_TEMA.dark);
    expect(btn.pressed).toBe("false");

    btn.clicks[0]!();
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(meta.content).toBe(COR_TEMA.light);
    expect(btn.pressed).toBe("true");
    expect(store.valor).toBe("light");

    btn.clicks[0]!();
    expect(root.dataset.theme).toBe("dark");
    expect(btn.pressed).toBe("false");
    expect(store.valor).toBe("dark");

    // A saved choice ignores the OS.
    matches = true;
    ouvintes[0]!();
    expect(root.dataset.theme).toBe("dark");
  });
});

test("with nothing saved, an OS change follows; a blocked store still toggles the page", () => {
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const doc = { documentElement: root, querySelector: () => null };
  let matches = false;
  const ouvintes: Array<() => void> = [];
  const mq = { get matches() { return matches; }, addEventListener(_t: string, fn: () => void) { ouvintes.push(fn); } };
  const btn = botao();
  withGlobals({ document: doc, localStorage: memoria(null), matchMedia: () => mq }, () => {
    ligarTema(btn as unknown as HTMLButtonElement);
    expect(root.dataset.theme).toBe("dark");
    matches = true;
    ouvintes[0]!();
    expect(root.dataset.theme).toBe("light");
    expect(btn.pressed).toBe("true");
    matches = false;
    ouvintes[0]!();
    expect(root.dataset.theme).toBe("dark");
  });

  const btn2 = botao();
  const root2 = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  withGlobals({ document: { documentElement: root2, querySelector: () => null }, localStorage: quebra(), matchMedia: () => ({ matches: true, addEventListener() {} }) }, () => {
    expect(() => ligarTema(btn2 as unknown as HTMLButtonElement)).not.toThrow();
    expect(root2.dataset.theme).toBe("light"); // OS, because nothing could be read
    expect(btn2.pressed).toBe("true");
    expect(() => btn2.clicks[0]!()).not.toThrow();
    expect(root2.dataset.theme).toBe("dark");
    expect(btn2.pressed).toBe("false");
  });
});

test("the early script matches resolverTema and does not throw without storage", async () => {
  const src = new Bun.Transpiler({ loader: "ts" }).transformSync(await Bun.file(new URL("./tema-boot.ts", import.meta.url)).text());
  expect(src).not.toMatch(/\bexport\b|\bimport\b/); // a classic script: a module would run after first paint
  const run = (salvo: string | null, claro: boolean, storage: { getItem: (k: string) => string | null } | undefined) => {
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
    const meta = { content: "" };
    const doc = { documentElement: root, querySelector: () => ({ setAttribute: (_n: string, v: string) => { meta.content = v; } }) };
    new Function("document", "localStorage", "matchMedia", src)(doc, storage, (q: string) => ({ matches: q.includes("light") && claro }));
    return { theme: root.dataset.theme, scheme: root.style.colorScheme, meta: meta.content };
  };
  for (const salvo of [null, "light", "dark", "outro"]) for (const claro of [true, false]) {
    const got = run(salvo, claro, memoria(salvo));
    const tema = resolverTema(salvo, claro);
    expect(got).toEqual({ theme: tema, scheme: tema, meta: COR_TEMA[tema] });
  }
  expect(() => run(null, true, quebra())).not.toThrow();
  expect(run(null, true, quebra()).theme).toBe("light");
  expect(run(null, false, undefined).theme).toBe("dark");
});

test("index.html: classic theme script after boot, and a real header button", async () => {
  const html = await Bun.file(new URL("./index.html", import.meta.url)).text();
  expect(html).toMatch(/<script src="boot\.js"><\/script>\s*<script src="tema-boot\.js"><\/script>/);
  expect(html).not.toMatch(/<script[^>]*tema-boot[^>]*type="module"/);
  const botao = html.match(/<button type="button" id="tema"[\s\S]*?<\/button>/)?.[0] ?? "";
  expect(botao).toContain('aria-pressed="false"');
  expect(botao).toContain("Tema escuro");
  expect(botao).toContain("Tema claro");
  expect(botao).not.toMatch(/\son[a-z]+=/i);
  const css = await Bun.file(new URL("./styles.css", import.meta.url)).text();
  expect(css).toMatch(/\.btn-tema\s*\{[^}]*min-height:\s*44px/);
  expect(css).toMatch(/\.btn-tema:focus-visible/);
});
