import { expect, test } from "bun:test";

const read = (f) => Bun.file(new URL(`./${f}`, import.meta.url)).text();

// The tabs are found with [data-modo] (aria-selected, and the document click handler's closest()).
// If <body> carried that attribute too, aria-selected would land on the body and a click on empty
// space would count as a tab click and re-render the view.
test("the body never carries the attribute the tabs are selected by", async () => {
  for (const f of ["boot.js", "app.js", "styles.css"]) expect([f, /body\[data-modo|body\.dataset\.modo|body\.setAttribute\(\s*["']data-modo/.test(await read(f))]).toEqual([f, false]);
  expect(await read("boot.js")).toContain("dataset.visao");
  expect(await read("app.js")).toContain("document.body.dataset.visao");
});

test("the CSS that hides radar-only controls reads the same attribute the scripts write", async () => {
  const css = await read("styles.css");
  expect(css).toContain('body[data-visao]:not([data-visao="radar"]) .radar-only');
  expect(css).toContain('body[data-visao]:not([data-visao="radar"]) #radar-view');
});

// boot.js is a classic script that runs before first paint: run it for real against a fake storage.
test("the saved view is used, and an empty, corrupt or blocked storage falls back to the radar", async () => {
  const src = await read("boot.js");
  const run = (storage) => { const body = { dataset: {} }; new Function("document", "localStorage", src)({ body }, storage); return body.dataset.visao; };
  expect(run({ getItem: () => '"rede"' })).toBe("rede");
  expect(run({ getItem: () => null })).toBe("radar");
  expect(run({ getItem: () => "{oops" })).toBe("radar");
  expect(run({ getItem: () => { throw new Error("blocked"); } })).toBe("radar");
});
