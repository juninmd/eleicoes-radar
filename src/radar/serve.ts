// Serves web/ locally and in production (Docker). index.html is authored as an
// artifact body (no <html>/<head>), so it is wrapped in the skeleton the artifact host adds.
// Files are immutable inside an image, so gzip output is cached in memory.
import { resolve, sep } from "node:path";

const ROOT = resolve(process.env.WEB_ROOT ?? "web");
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "127.0.0.1";
// The leading <title>/<meta>/<link> elements of the body-authored page go to <head>, where crawlers and audits read them.
function splitHead(html: string): [string, string] {
  const re = /\s*(?:<title\b[^>]*>[^<]*<\/title>|<(?:meta|link)\b[^>]*>)/y;
  let end = 0;
  while (re.exec(html)) end = re.lastIndex;
  return [html.slice(0, end), html.slice(end)];
}
const SKELETON = (page: string) => {
  const [head, body] = splitHead(page);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}</head><body>${body}</body></html>`;
};
const COMPRESSIBLE = /\.(html|js|css|json|svg)$/;
const gz = new Map<string, Uint8Array>();

// default-src 'none' and only what the page uses: its own files, photos as data: URIs, and the live TSE results feed.
// style-src keeps 'unsafe-inline' because charts and bars set widths through style attributes; scripts stay 'self' only.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://resultados.tse.jus.br",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");
const SECURITY: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
const secure = (r: Response): Response => {
  for (const [k, v] of Object.entries(SECURITY)) r.headers.set(k, v);
  return r;
};

async function body(file: string): Promise<Uint8Array> {
  const f = Bun.file(file);
  return file.endsWith("index.html") ? new TextEncoder().encode(SKELETON(await f.text())) : new Uint8Array(await f.arrayBuffer());
}

export async function handle(req: Request): Promise<Response> {
  return secure(await route(req));
}

async function route(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (path === "/health") return new Response("ok");
  const file = resolve(ROOT, `.${path === "/" ? "/index.html" : path}`);
  if (!file.startsWith(ROOT + sep)) return new Response("forbidden", { status: 403 });
  if (!(await Bun.file(file).exists())) return new Response("not found", { status: 404 });

  const html = file.endsWith(".html");
  const headers = new Headers({
    "Content-Type": html ? "text/html; charset=utf-8" : Bun.file(file).type,
    // Data changes on each deploy; a short cache keeps repeat visits fast without going stale.
    "Cache-Control": html ? "no-cache" : "public, max-age=300",
    Vary: "Accept-Encoding",
  });
  if (COMPRESSIBLE.test(file) && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    let z = gz.get(file);
    if (!z) gz.set(file, (z = Bun.gzipSync(await body(file))));
    headers.set("Content-Encoding", "gzip");
    return new Response(req.method === "HEAD" ? null : z, { headers });
  }
  return new Response(req.method === "HEAD" ? null : await body(file), { headers });
}

if (import.meta.main) {
  const server = Bun.serve({ port: PORT, hostname: HOST, fetch: handle });
  console.log(`Radar do Voto em http://${server.hostname}:${server.port}`);
}
