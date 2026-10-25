// The JSON endpoints under /api/. Writes need a JSON body, a same-origin Origin (when the browser sends one), and a small body; no CORS
// headers are ever sent, so other sites cannot call them from a browser. Unknown paths answer 404 before anything is read.
// Behind the cluster's load balancer every client may share ONE source address, so the address limits are high ceilings (they only
// bound a flood) and the real per-visitor limits are keyed by the visitor's own code.
import { ID_VALIDO, type Presenca } from "./presenca.js";
import { criarLimite } from "./limite.js";
import type { Monitor } from "./monitor.js";
import type { Push } from "./push.js";

export interface ApiDeps { presenca: Presenca; push: Push; monitor: Monitor }
const MAX_CORPO = 1024;
const GET = new Set(["/api/aovivo/estado", "/api/aovivo/ultimo", "/api/push/chave"]);
const POST = new Set(["/api/aovivo/ping", "/api/aovivo/torcida", "/api/push/inscrever", "/api/push/cancelar"]);

const json = (dados: unknown, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const erro = (status: number, msg: string, extra: Record<string, string> = {}) => new Response(JSON.stringify({ erro: msg }), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
const MUITAS = () => erro(429, "muitas requisições", { "Retry-After": "60" });

export function criarApi({ presenca, push, monitor }: ApiDeps, agora: () => number = Date.now) {
  const minuto = (max: number, chaves = 20_000) => criarLimite({ max, janelaMs: 60_000, chaves, agora });
  const ipLer = minuto(6000), ipPing = minuto(20_000), ipVoto = minuto(1200), ipPush = minuto(1200);
  const idPing = minuto(8, 100_000), idVoto = minuto(10, 100_000);

  const estado = (id?: string) => ({ ...presenca.resumo(), meu: id ? presenca.meuVoto(id) : null, eventos: monitor.eventos().slice(0, 5), push: push.ativo() });

  async function corpo(req: Request): Promise<Record<string, unknown> | Response> {
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return erro(415, "esperado application/json");
    const origem = req.headers.get("origin");
    if (origem) { try { if (new URL(origem).host !== req.headers.get("host")) return erro(403, "origem não permitida"); } catch { return erro(403, "origem não permitida"); } }
    if (Number(req.headers.get("content-length") ?? 0) > MAX_CORPO) return erro(413, "corpo grande demais");
    const txt = await req.text(); // the server also caps request bodies (maxRequestBodySize), so a chunked flood never gets here whole
    if (txt.length > MAX_CORPO) return erro(413, "corpo grande demais");
    try {
      const v = JSON.parse(txt);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : erro(400, "JSON inválido");
    } catch {
      return erro(400, "JSON inválido");
    }
  }

  // null: not an API path, the static server goes on.
  return async function api(req: Request, ip: string): Promise<Response | null> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/api/")) return null;
    const post = req.method === "POST";
    if (req.method !== "GET" && !post) return erro(405, "método não permitido", { Allow: "GET, POST" });
    if (!(post ? POST : GET).has(pathname)) return erro(404, "não encontrado");

    if (!post) {
      // Everyone gets the same answer: no limit on what a woken service worker asks for after a fan-out.
      if (pathname === "/api/aovivo/ultimo") return monitor.ultimo() ? json(monitor.ultimo()) : erro(404, "sem eventos");
      if (!ipLer(ip)) return MUITAS();
      return pathname === "/api/aovivo/estado" ? json(estado()) : push.chave() ? json({ chave: push.chave() }) : erro(404, "push desligado");
    }
    const ipOk = pathname === "/api/aovivo/ping" ? ipPing : pathname === "/api/aovivo/torcida" ? ipVoto : ipPush;
    if (!ipOk(ip)) return MUITAS();
    const b = await corpo(req);
    if (b instanceof Response) return b;
    const id = typeof b.id === "string" ? b.id : "";
    if (pathname === "/api/aovivo/ping") {
      if (!ID_VALIDO.test(id)) return erro(400, "id inválido");
      if (!idPing(id)) return MUITAS();
      presenca.ping(id, typeof b.uf === "string" ? b.uf : "");
      return json(estado(id));
    }
    if (pathname === "/api/aovivo/torcida") {
      if (ID_VALIDO.test(id) && !idVoto(id)) return MUITAS();
      const r = presenca.votar(id, typeof b.opcao === "string" ? b.opcao : "");
      if (r === "ok") return json(estado(id));
      return r === "lotada" ? erro(503, "enquete lotada") : r === "sem-presenca" ? erro(409, "abra a tela Ao vivo antes de votar") : erro(400, "opção inválida");
    }
    if (pathname === "/api/push/inscrever") {
      const r = push.ativo() ? push.inscrever(b.endpoint) : "invalido";
      return r === "ok" ? json({ ok: true }) : erro(r === "lotado" ? 503 : 400, r === "lotado" ? "limite de inscritos" : "inscrição inválida");
    }
    push.cancelar(b.endpoint);
    return json({ ok: true });
  };
}
export type Api = ReturnType<typeof criarApi>;
