// Browser side of the push notices: ask permission on a click, subscribe through the service worker, tell the server. The server sends
// a payload-less push; sw.js asks /api/aovivo/ultimo for the text. Nothing registers until the reader asks (or already had said yes).
export type EstadoPush = "indisponivel" | "inativo" | "ativo" | "bloqueado";

export const suportado = (): boolean => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const post = (url: string, corpo: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(8000) });
const bytes = (b64u: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64u.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function inscricao(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!suportado()) return "indisponivel";
  if (Notification.permission === "denied") return "bloqueado";
  return Notification.permission === "granted" && (await inscricao()) ? "ativo" : "inativo";
}

// After a server restart the list of subscribers is empty: every open page that already said yes puts itself back.
export async function reinscrever(): Promise<void> {
  try {
    const s = Notification.permission === "granted" ? await inscricao() : null;
    if (s) await post("/api/push/inscrever", { endpoint: s.endpoint });
  } catch { /* the next visit tries again */ }
}

// Must run inside the click: Safari only shows the permission prompt for a user gesture.
export async function ativar(): Promise<EstadoPush> {
  if (!suportado()) return "indisponivel";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "bloqueado" : "inativo";
  const r = await fetch("/api/push/chave", { cache: "no-store" });
  if (!r.ok) throw new Error("avisos desligados no servidor");
  const { chave } = (await r.json()) as { chave: string };
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) }));
  const ok = await post("/api/push/inscrever", { endpoint: sub.endpoint });
  if (!ok.ok) throw new Error("o servidor recusou a inscrição");
  return "ativo";
}

export async function desativar(): Promise<EstadoPush> {
  const s = await inscricao();
  if (s) { await post("/api/push/cancelar", { endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe(); }
  return estadoPush();
}
