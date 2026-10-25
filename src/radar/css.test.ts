import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The page loads one generated stylesheet. The hand-written sheets and tailwind.css are its sources, so an edit that was not rebuilt must fail here.
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const build = () => {
  const dir = mkdtempSync(join(tmpdir(), "radar-css-"));
  const out = join(dir, "app.css");
  const run = Bun.spawnSync([process.execPath, "x", "--bun", "tailwindcss", "-i", "tailwind.css", "-o", out, "--minify"], { stdin: "ignore", stderr: "pipe", timeout: 60_000 });
  const css = run.exitCode === 0 ? read(out) : `build failed: ${run.stderr.toString()}`;
  rmSync(dir, { recursive: true, force: true });
  return css;
};

test("web/app.css is what `bun run css` builds from tailwind.css and the sheets (run it after editing one)", () => {
  expect(build()).toBe(read("web/app.css"));
}, 60_000); // a Tailwind build: over 5 s when the machine is busy

test("the bundle has no @apply, @theme or @import left: they are all resolved at build time", () => {
  const css = read("web/app.css");
  expect(css).not.toMatch(/@apply|@theme|@import/);
});

test("the page links the bundle, not the sheets it is made of", () => {
  const html = read("web/index.html");
  expect(html).toContain('<link rel="stylesheet" href="app.css">');
  for (const sheet of ["styles", "expectativa", "apuracao", "panorama"]) expect(html).not.toContain(`href="${sheet}.css"`);
});
