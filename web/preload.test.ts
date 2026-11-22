import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Runtime imports only: `import type` is erased by the transpiler and never requested.
const filhos = (f: string) => [...readFileSync(`web/${f}.ts`, "utf8").matchAll(/^(?:import|export)\s(?!type\b)[^;]*?from\s+"\.\/([\w-]+)\.js"/gms)].map((m) => m[1]);
const fecho = (raiz: string, visto = new Set<string>()): Set<string> => {
  if (!visto.has(raiz)) {
    visto.add(raiz);
    for (const d of filhos(raiz)) fecho(d, visto);
  }
  return visto;
};
const ordenado = (xs: Iterable<string>) => [...xs].sort();

test("boot.js preloads the static modules of Ao vivo (the default screen) that app.js does not already bring", () => {
  const boot = readFileSync("web/boot.ts", "utf8");
  const lista = [...boot.slice(boot.indexOf("const modulos")).split("];")[0].matchAll(/"([\w-]+)\.js"/g)].map((m) => m[1]);
  const app = fecho("app");
  expect(ordenado(lista)).toEqual(ordenado([...fecho("apuracao-aovivo")].filter((x) => !app.has(x))));
  expect(boot).toContain('add("preload", "mapa-uf.json", { as: "fetch", crossOrigin: "anonymous" })');
});

// Preloaded fonts share the first seconds of bandwidth with app.css, which blocks first paint: measured FCP 1.10 s -> 0.90 s (slow 4G)
// after dropping the mono one. Only the heading font (font-display: optional, it must be ready in time) and the body font stay.
test("index.html preloads only the fonts first paint needs", () => {
  const fontes = [...readFileSync("web/index.html", "utf8").matchAll(/<link rel="preload" href="fonts\/([\w-]+)\.woff2"/g)].map((m) => m[1]);
  expect(fontes.sort()).toEqual(["big-shoulders-display", "public-sans"]);
});
