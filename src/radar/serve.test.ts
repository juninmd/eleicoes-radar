import { describe, expect, test } from "bun:test";
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
    const r = await get("/app.js", { headers: { "accept-encoding": "gzip, br" } });
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await r.arrayBuffer())))).toContain("renderExpectativa");
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
