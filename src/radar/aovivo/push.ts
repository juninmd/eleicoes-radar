// Web Push without a payload and without a dependency: the server proves who it is (VAPID, an ES256 JWT) and the service worker, once
// woken, asks /api/aovivo/ultimo for the text. No payload means no per-subscriber encryption keys to store. Subscriptions live in memory:
// the page registers again every time it opens, so a restart only silences browsers that never come back.
const b64u = (b: ArrayBuffer | Uint8Array): string => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
const deB64u = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(s, "base64url"));

// The server POSTs to a URL the client sent, so only the push services of the browsers are accepted (no internal address, no SSRF).
const HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function endpointValido(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 600) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    return HOSTS.some((re) => re.test(u.hostname)) ? u : null;
  } catch {
    return null;
  }
}

export interface Vapid { publica: string; assinar(audiencia: string): Promise<string> }

// Keys come from the environment (a Secret in the cluster). Without them push is off and the page hides its button.
export async function criarVapid(env: { VAPID_PUBLIC?: string; VAPID_PRIVATE?: string; VAPID_SUBJECT?: string }, agora = Date.now): Promise<Vapid | null> {
  const { VAPID_PUBLIC: pub, VAPID_PRIVATE: priv, VAPID_SUBJECT: sub } = env;
  if (!pub || !priv || !sub) return null;
  const ponto = deB64u(pub);
  if (ponto.length !== 65 || ponto[0] !== 4 || deB64u(priv).length !== 32) return null;
  const chave = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64u(ponto.slice(1, 33)), y: b64u(ponto.slice(33)), d: priv }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return {
    publica: pub,
    async assinar(audiencia) {
      const corpo = `${b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${b64u(Buffer.from(JSON.stringify({ aud: audiencia, exp: Math.floor(agora() / 1000) + 12 * 3600, sub })))}`;
      return `${corpo}.${b64u(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(corpo)))}`;
    },
  };
}

import { armazemMemoria, type Armazem } from "./armazem.js";

export interface PushOpts { vapid: Vapid | null; enviar?: typeof fetch; max?: number; paralelo?: number; armazem?: Armazem }

export function criarPush({ vapid, enviar = fetch, max = 20_000, paralelo = 20, armazem = armazemMemoria() }: PushOpts) {
  // What the store kept from before a restart is checked again: a row that is no longer a browser push address is dropped, not trusted.
  const inscritos = new Set<string>();
  for (const e of armazem.endpoints()) { const u = endpointValido(e); if (u && inscritos.size < max) inscritos.add(u.href); else armazem.apagarEndpoint(e); }
  return {
    ativo: () => vapid !== null,
    chave: () => vapid?.publica ?? null,
    total: () => inscritos.size,
    inscrever(endpoint: unknown): "ok" | "invalido" | "lotado" {
      const u = endpointValido(endpoint);
      if (!u) return "invalido";
      if (!inscritos.has(u.href) && inscritos.size >= max) return "lotado";
      inscritos.add(u.href);
      armazem.gravarEndpoint(u.href);
      return "ok";
    },
    cancelar(endpoint: unknown) { const u = endpointValido(endpoint); if (u) { inscritos.delete(u.href); armazem.apagarEndpoint(u.href); } },
    // Wakes every subscriber. 4xx answers mean the subscription is gone or was made for another key (the list is only ever refilled by the page):
    // forget it. Network errors and 5xx keep it for the next event.
    async notificar(): Promise<{ enviados: number; removidos: number; falhas: number }> {
      const r = { enviados: 0, removidos: 0, falhas: 0 };
      if (!vapid) return r;
      const fila = [...inscritos];
      const jwts = new Map<string, Promise<string>>();
      const um = async (href: string) => {
        const u = new URL(href);
        if (!jwts.has(u.origin)) jwts.set(u.origin, vapid.assinar(u.origin));
        try {
          const res = await enviar(href, { method: "POST", headers: { Authorization: `vapid t=${await jwts.get(u.origin)}, k=${vapid.publica}`, TTL: "3600", Urgency: "high", Topic: "radar-evento" }, signal: AbortSignal.timeout(8000) });
          if ([400, 401, 403, 404, 410].includes(res.status)) { inscritos.delete(href); armazem.apagarEndpoint(href); r.removidos++; } else if (res.ok) r.enviados++; else r.falhas++;
        } catch {
          r.falhas++;
        }
      };
      await Promise.all(Array.from({ length: Math.min(paralelo, fila.length) }, async () => { for (let h = fila.pop(); h; h = fila.pop()) await um(h); }));
      return r;
    },
  };
}
export type Push = ReturnType<typeof criarPush>;
