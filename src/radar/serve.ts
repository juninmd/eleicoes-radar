// Serves web/ locally and in production (Docker). index.html is authored as an
// artifact body (no <html>/<head>), so it is wrapped in the skeleton the artifact host adds.
// The page is authored in TypeScript: a module the browser asks for as /x.js is served from x.ts, transpiled on demand
// (no build step, so the Dockerfile and the CSP stay as they were). Gzip and transpiled output are cached in memory,
// keyed by file and mtime, so an edited source is never served stale.
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
const SOURCE = /\.ts[. ]*$|:/i;
type Bytes = Uint8Array<ArrayBuffer>;
const gz = new Map<string, Bytes>();
const transpiled = new Map<string, Bytes>();
const TS = new Bun.Transpiler({ loader: "ts" });

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

async function body(file: string): Promise<Bytes> {
  const f = Bun.file(file);
  return file.endsWith("index.html") ? new TextEncoder().encode(SKELETON(await f.text())) : new Uint8Array(await f.arrayBuffer());
}

async function compile(source: string, key: string): Promise<Bytes> {
  let out = transpiled.get(key);
  if (!out) transpiled.set(key, (out = new TextEncoder().encode(TS.transformSync(await Bun.file(source).text()))));
  return out;
}

export const handleAt = (root: string) => async (req: Request): Promise<Response> => secure(await route(req, resolve(root)));
export const handle = handleAt(ROOT);

async function route(req: Request, root: string): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (path === "/health") return new Response("ok");
  const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
  if (!file.startsWith(root + sep)) return new Response("forbidden", { status: 403 });
  // Sources are served as modules (x.js), never as they are. Windows opens "x.TS", "x.ts.", "x.ts " and "x.ts::$DATA" as x.ts.
  if (SOURCE.test(file.slice(root.length))) return new Response("not found", { status: 404 });
  let source = file;
  if (!(await Bun.file(file).exists())) {
    const ts = file.endsWith(".js") ? `${file.slice(0, -3)}.ts` : "";
    if (!ts || !(await Bun.file(ts).exists())) return new Response("not found", { status: 404 });
    source = ts;
  }
  const key = `${source}:${Bun.file(source).lastModified}`;
  let compiled: Bytes | undefined;
  if (source !== file) {
    try {
      compiled = await compile(source, key);
    } catch (e) {
      console.error(`transpile ${source}: ${e}`);
      return new Response("transpile error", { status: 500 });
    }
  }

  const html = file.endsWith(".html");
  const headers = new Headers({
    "Content-Type": html ? "text/html; charset=utf-8" : Bun.file(file).type,
    // Data changes on each deploy; a short cache keeps repeat visits fast without going stale.
    "Cache-Control": html ? "no-cache" : "public, max-age=300",
    Vary: "Accept-Encoding",
  });
  if (COMPRESSIBLE.test(file) && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    let z = gz.get(key);
    if (!z) gz.set(key, (z = Bun.gzipSync(compiled ?? (await body(file)))));
    headers.set("Content-Encoding", "gzip");
    return new Response(req.method === "HEAD" ? null : z, { headers });
  }
  return new Response(req.method === "HEAD" ? null : (compiled ?? (await body(file))), { headers });
}

if (import.meta.main) {
  const server = Bun.serve({ port: PORT, hostname: HOST, fetch: handle });
  console.log(`Radar do Voto em http://${server.hostname}:${server.port}`);
}
