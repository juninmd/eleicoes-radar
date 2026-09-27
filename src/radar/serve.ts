// Local preview of web/. index.html is authored as an artifact body (no <html>/<head>),
// so it is wrapped in the same skeleton the artifact host adds.
import { resolve, sep } from "node:path";

const ROOT = resolve("web");
const PORT = Number(process.env.PORT ?? 4173);
const SKELETON = (body: string) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${body}</body></html>`;

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path === "/health") return new Response("ok");
    const file = resolve(ROOT, `.${path === "/" ? "/index.html" : path}`);
    if (!file.startsWith(ROOT + sep)) return new Response("forbidden", { status: 403 });
    const f = Bun.file(file);
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    if (file.endsWith("index.html")) return new Response(SKELETON(await f.text()), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    return new Response(f);
  },
});
console.log(`Radar do Voto em http://${server.hostname}:${server.port}`);
