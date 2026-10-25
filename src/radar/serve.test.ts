import { describe, expect, test } from "bun:test";
import { brotliDecompressSync } from "node:zlib";
import { handle } from "./serve";

const get = (path: string, init: RequestInit = {}) => handle(new Request(`http://x${path}`, init));

describe("static server", () => {
  test("health", async () => {
    expect(await (await get("/health")).text()).toBe("ok");
  });
  test("index is wrapped in a full document", async () => {
    const r = await get("/");
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(await r.text()).toStartWith("<!doctype html>");
  });
  test("the title, description, icon and stylesheets sit in <head>, where crawlers and audits read them", async () => {
    const html = await (await get("/")).text();
    const [head, body] = html.split("</head>");
    for (const tag of ["<title>", '<meta name="description"', '<meta name="theme-color"', '<link rel="icon"', '<link rel="stylesheet" href="app.css">', '<meta charset="utf-8">']) {
      expect(head).toContain(tag);
      expect(body).not.toContain(tag);
    }
    expect(body).toMatch(/^<body>\s*<script src="boot.js">/); // the first thing in the body is the script that needs a body
  });
  test("gzip when accepted", async () => {
    const r = await get("/app.js", { headers: { "accept-encoding": "gzip" } });
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await r.arrayBuffer())))).toContain("renderExpectativa");
  });
  test("brotli wins when accepted: same bytes, smaller body", async () => {
    const br = await get("/app.js", { headers: { "accept-encoding": "gzip, br" } });
    expect(br.headers.get("content-encoding")).toBe("br");
    const gz = await get("/app.js", { headers: { "accept-encoding": "gzip" } });
    const brBytes = new Uint8Array(await br.arrayBuffer());
    expect(brBytes.length).toBeLessThan((await gz.arrayBuffer()).byteLength);
    expect(new TextDecoder().decode(brotliDecompressSync(brBytes))).toContain("renderExpectativa");
  });
  test("br;q=0 and identity never get brotli", async () => {
    expect((await get("/app.js", { headers: { "accept-encoding": "gzip, br;q=0" } })).headers.get("content-encoding")).toBe("gzip");
    expect((await get("/app.js", { headers: { "accept-encoding": "identity" } })).headers.get("content-encoding")).toBeNull();
  });
  test("two simultaneous first requests share one compression and get the same bytes", async () => {
    const [x, y] = await Promise.all([get("/app.css", { headers: { "accept-encoding": "br" } }), get("/app.css", { headers: { "accept-encoding": "br" } })]);
    expect(Buffer.from(await x.arrayBuffer()).equals(Buffer.from(await y.arrayBuffer()))).toBe(true);
  });
  test("a matching ETag answers 304 with no body, a stale one gets the file", async () => {
    const first = await get("/app.css");
    const tag = first.headers.get("etag");
    expect(tag).toBeTruthy();
    const same = await get("/app.css", { headers: { "if-none-match": tag! } });
    expect(same.status).toBe(304);
    expect((await same.arrayBuffer()).byteLength).toBe(0);
    expect(same.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect((await get("/app.css", { headers: { "if-none-match": 'W/"outro"' } })).status).toBe(200);
  });
  test("a NUL byte in the path is a 400, not an exception with a stack trace", async () => {
    for (const path of ["/%00", "/index.html%00", "/app.js%00.ts"]) expect((await get(path)).status).toBe(400);
  });
  test("every response carries the security headers, the page and the assets alike", async () => {
    for (const path of ["/", "/app.js", "/data/meta.json", "/health", "/nao-existe.js"]) {
      const r = await get(path);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("x-frame-options")).toBe("DENY");
      expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    }
  });
  test("the policy lets the page run and blocks what it never needs", async () => {
    const csp = (await get("/")).headers.get("content-security-policy") ?? "";
    const dir = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
    expect(dir("script-src")).toBe("script-src 'self'"); // no inline script, no eval, no third party
    expect(dir("connect-src")).toBe("connect-src 'self' https://resultados.tse.jus.br"); // data and the live TSE feed
    expect(dir("img-src")).toBe("img-src 'self' data:"); // photos are data URIs
    expect(dir("font-src")).toBe("font-src 'self'");
    for (const d of ["object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"]) expect(csp).toContain(d);
    expect(csp).not.toMatch(/https:\/\/fonts\.|unsafe-eval|\*/);
  });
  // script-src 'self' silently drops inline handlers and inline scripts: the page would load and some buttons would just not work.
  test("nothing the page or its templates emit relies on an inline script, handler or javascript: URL", async () => {
    const dir = new URL("../../web/", import.meta.url);
    const sources = [await (await get("/")).text()];
    for (const f of new Bun.Glob("*.ts").scanSync({ cwd: dir.pathname.replace(/^\/([A-Za-z]:)/, "$1") })) {
      if (!f.endsWith(".test.ts")) sources.push(await Bun.file(new URL(f, dir)).text());
    }
    expect(sources.length).toBeGreaterThan(20);
    for (const s of sources) {
      expect(s).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
      expect(s).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
      expect(s).not.toMatch(/javascript:/i);
    }
  });
  test("every font the stylesheet names is served from this origin", async () => {
    const css = await (await get("/fonts.css")).text();
    const files = [...css.matchAll(/url\((fonts\/[^)]+)\)/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const r = await get(`/${f}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("font/woff2");
    }
    expect(css).not.toContain("googleapis");
  });
  test("path traversal and writes are refused", async () => {
    expect((await get("/..%2f..%2fpackage.json")).status).toBe(403);
    expect((await get("/", { method: "POST" })).status).toBe(405);
    expect((await get("/%E0%A4%A")).status).toBe(400);
    expect((await get("/nao-existe.js")).status).toBe(404);
  });
});
