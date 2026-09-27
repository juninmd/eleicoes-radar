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
  test("gzip when accepted", async () => {
    const r = await get("/app.js", { headers: { "accept-encoding": "gzip, br" } });
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await r.arrayBuffer())))).toContain("renderExpectativa");
  });
  test("path traversal and writes are refused", async () => {
    expect((await get("/..%2f..%2fpackage.json")).status).toBe(403);
    expect((await get("/", { method: "POST" })).status).toBe(405);
    expect((await get("/%E0%A4%A")).status).toBe(400);
    expect((await get("/nao-existe.js")).status).toBe(404);
  });
});
