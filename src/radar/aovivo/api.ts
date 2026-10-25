// The JSON endpoints under /api/. Writes need a JSON body, a same-origin Origin (when the browser sends one), and a small body; every
// endpoint is rate limited by client address. No CORS headers are ever sent, so other sites cannot call them from a browser.
import { ID_VALIDO, type Presenca } from "./presenca.js";
import { criarLimite } from "./limite.js";
import type { Monitor } from "./monitor.js";
import type { Push } from "./push.js";

export interface ApiDeps { presenca: Presenca; push: Push; monitor: Monitor }
const MAX_CORPO = 1024;

const json = (dados: unknown, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const erro = (status: number, msg: string, extra: Record<string, string> = {}) => new Response(JSON.stringify({ erro: msg }), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });

export function criarApi({ presenca, push, monitor }: ApiDeps, agora: () => number = Date.now) {
  const lerLimite = criarLimite({ max: 180, janelaMs: 60_000, agora });
  const pingLimite = criarLimite({ max: 120, janelaMs: 60_000, agora });
  const votoLimite = criarLimite({ max: 20, janelaMs: 60_000, agora });
  const pushLimite = criarLimite({ max: 10, janelaMs: 60_000, agora });

  const estado = (id?: string) => ({ ...presenca.resumo(), meu: id ? presenca.meuVoto(id) : null, eventos: monitor.eventos().slice(0, 5), push: push.ativo() });

  async function corpo(req: Request): Promise<Record<string, unknown> | Response> {
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return erro(415, "esperado application/json");
    const origem = req.headers.get("origin");
    if (origem) { try { if (new URL(origem).host !== req.headers.get("host")) return erro(403, "origem não permitida"); } catch { return erro(403, "origem não permitida"); } }
    if (Number(req.headers.get("content-length") ?? 0) > MAX_CORPO) return erro(413, "corpo grande demais");
    const txt = await req.text();
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
    const limite = post ? (pathname === "/api/aovivo/ping" ? pingLimite : pathname === "/api/aovivo/torcida" ? votoLimite : pushLimite) : lerLimite;
    if (!limite(`${pathname}|${ip}`)) return erro(429, "muitas requisições", { "Retry-After": "60" });

    if (!post) {
      if (pathname === "/api/aovivo/estado") return json(estado());
      if (pathname === "/api/aovivo/ultimo") return monitor.ultimo() ? json(monitor.ultimo()) : erro(404, "sem eventos");
      if (pathname === "/api/push/chave") return push.chave() ? json({ chave: push.chave() }) : erro(404, "push desligado");
      return erro(404, "não encontrado");
    }
    const b = await corpo(req);
    if (b instanceof Response) return b;
    const id = typeof b.id === "string" ? b.id : "";
    if (pathname === "/api/aovivo/ping") {
      if (!ID_VALIDO.test(id)) return erro(400, "id inválido");
      presenca.ping(id, typeof b.uf === "string" ? b.uf : "");
      return json(estado(id));
    }
    if (pathname === "/api/aovivo/torcida") {
      const r = presenca.votar(id, typeof b.opcao === "string" ? b.opcao : "");
      return r === "ok" ? json(estado(id)) : erro(r === "lotada" ? 503 : 400, r === "lotada" ? "enquete lotada" : "opção inválida");
    }
    if (pathname === "/api/push/inscrever") {
      const r = push.ativo() ? push.inscrever(b.endpoint) : "invalido";
      return r === "ok" ? json({ ok: true }) : erro(r === "lotado" ? 503 : 400, r === "lotado" ? "limite de inscritos" : "inscrição inválida");
    }
    if (pathname === "/api/push/cancelar") { push.cancelar(b.endpoint); return json({ ok: true }); }
    return erro(404, "não encontrado");
  };
}
export type Api = ReturnType<typeof criarApi>;
