import { expect, test } from "bun:test";

const read = (f: string) => Bun.file(new URL(`./${f}`, import.meta.url)).text();

// The tabs are found with [data-modo] (aria-selected, and the document click handler's closest()).
// If <body> carried that attribute too, aria-selected would land on the body and a click on empty
// space would count as a tab click and re-render the view.
test("the body never carries the attribute the tabs are selected by", async () => {
  for (const f of ["boot.ts", "app.ts", "styles.css"]) expect([f, /body\[data-modo|body\.dataset\.modo|body\.setAttribute\(\s*["']data-modo/.test(await read(f))]).toEqual([f, false]);
  expect(await read("boot.ts")).toContain("dataset.visao");
  expect(await read("app.ts")).toContain("document.body.dataset.visao");
});

test("the CSS that hides radar-only controls reads the same attribute the scripts write", async () => {
  const css = await read("styles.css");
  expect(css).toContain('body[data-visao]:not([data-visao="radar"]) .radar-only');
  expect(css).toContain('body[data-visao]:not([data-visao="radar"]) #radar-view');
});

// boot.js is a classic script that runs before first paint: run it for real against fake globals.
// The link opens on Ao vivo whatever tab was saved (and with no storage access at all); deep links keep their own screen.
test("the link opens on Ao vivo, not on the tab saved by an earlier visit", async () => {
  const src = new Bun.Transpiler({ loader: "ts" }).transformSync(await read("boot.ts")); // same transpile the server applies
  const run = (hash: string) => { const body = { dataset: {} as Record<string, string> }; new Function("document", "location", src)({ body }, { hash }); return body.dataset.visao; };
  expect(run("")).toBe("aovivo");
  expect(run("#sobre")).toBe("aovivo"); // an overlay: Ao vivo stays underneath
  expect(run("#cand=280002551544&uf=SP")).toBe("radar");
  expect(run("#apuracao/Presidente/BR")).toBe("apuracao");
  expect(run("#auditoria")).toBe("auditoria");
});

test("boot.ts and app.ts agree on the first screen", async () => {
  expect(await read("app.ts")).toMatch(/modo: "aovivo"/);
  expect(await read("boot.ts")).not.toContain("localStorage"); // a saved tab would make the two disagree and the layout jump
});

// Before app.js runs, the static markup is all a screen reader or a slow phone sees: it must already describe the screen the link opens.
test("the first tab in the menu is Ao vivo and is the one marked selected in the static HTML", async () => {
  const html = await read("index.html");
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  expect(tabs[0]).toContain('data-modo="aovivo"');
  expect(tabs.filter((t) => t.includes('aria-selected="true"'))).toHaveLength(1);
  expect(tabs[0]).toContain('aria-selected="true"');
  expect(tabs.slice(1).every((t) => t.includes('tabindex="-1"'))).toBe(true); // only the selected tab is in the Tab order
});
