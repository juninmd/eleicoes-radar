// Fixed-window request limiter, in memory. Bounds abuse of the write endpoints; it is not meant to be exact.
export function criarLimite({ max, janelaMs, chaves = 20_000, agora = Date.now }: { max: number; janelaMs: number; chaves?: number; agora?: () => number }) {
  const janelas = new Map<string, { inicio: number; n: number }>();
  return (chave: string): boolean => {
    const t = agora();
    const j = janelas.get(chave);
    if (j && t - j.inicio < janelaMs) return ++j.n <= max;
    janelas.delete(chave);
    // Full of live keys: drop the oldest instead of growing without bound (an attack from many addresses cannot exhaust memory).
    if (janelas.size >= chaves) janelas.delete(janelas.keys().next().value as string);
    janelas.set(chave, { inicio: t, n: 1 });
    return true;
  };
}

const PRIVADO = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:)/i;

// Behind the cluster's proxy the socket peer is a private address and the real client is the last entry of X-Forwarded-For (the one
// the proxy itself appended). A header sent by a client that reaches the server directly is ignored: its peer is not private.
export function ipDe(req: Request, peer: string | undefined): string {
  const p = peer ?? "";
  if (!PRIVADO.test(p)) return p || "?";
  const xff = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return xff && xff.length <= 45 ? xff : p;
}
