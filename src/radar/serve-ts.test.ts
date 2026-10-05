import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleAt } from "./serve";

// The browser asks for /x.js; the source on disk is x.ts. The server hands over the transpiled module and never the source.
let root: string;
let get: (path: string, init?: RequestInit) => Promise<Response>;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "radar-serve-ts-"));
  writeFileSync(join(root, "b.ts"), "export const b: number = 1;\n");
  writeFileSync(join(root, "app.ts"), 'import { b } from "./b.js";\ninterface Box { n: number }\nexport const a = (x: Box): number => x.n + b;\n');
  writeFileSync(join(root, "plain.js"), "export const plain = 1;\n");
  writeFileSync(join(root, "plain.ts"), "export const plain = 2;\n"); // a real .js wins over a .ts of the same name
  writeFileSync(join(root, "broken.ts"), "export const = ;\n");
  const handle = handleAt(root);
  get = (path, init = {}) => handle(new Request(`http://x${path}`, init));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("TypeScript sources served as modules", () => {
  test("/x.js comes from x.ts, as JavaScript with the types gone and the import specifiers untouched", async () => {
    const r = await get("/app.js");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("javascript");
    const js = await r.text();
    expect(js).toContain('from "./b.js"'); // the browser follows this to /b.js, served from b.ts the same way
    expect(js).toContain("export");
    expect(js).not.toContain("interface");
    expect(js).not.toContain(": number");
  });

  test("the source itself is never served, and .ts is not a video type here", async () => {
    for (const path of ["/app.ts", "/b.ts"]) expect((await get(path)).status).toBe(404);
  });

  test("a real .js file wins over a .ts of the same name", async () => {
    expect(await (await get("/plain.js")).text()).toContain("plain = 1");
  });

  test("gzip works for the transpiled module, and the security headers are on it", async () => {
    const r = await get("/app.js", { headers: { "accept-encoding": "gzip" } });
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await r.arrayBuffer())))).toContain('from "./b.js"');
  });

  test("an edited source is served fresh, plain and gzipped, without restarting the server", async () => {
    const file = join(root, "b.ts");
    expect(await (await get("/b.js")).text()).toContain("b = 1");
    expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await (await get("/b.js", { headers: { "accept-encoding": "gzip" } })).arrayBuffer())))).toContain("b = 1");
    writeFileSync(file, "export const b: number = 7;\n");
    const later = new Date(Date.now() + 5000);
    utimesSync(file, later, later);
    expect(await (await get("/b.js")).text()).toContain("b = 7");
    expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await (await get("/b.js", { headers: { "accept-encoding": "gzip" } })).arrayBuffer())))).toContain("b = 7");
  });

  test("a source that does not compile answers 500 instead of a half-working page, and still carries the security headers", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {}); // the server logs the compile error; the test reads the response
    const r = await get("/broken.js");
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
    expect(r.status).toBe(500);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("a module that exists in neither form is a plain 404", async () => {
    expect((await get("/nada.js")).status).toBe(404);
  });
});
