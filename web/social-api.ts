// Client side of /api/aovivo: presence, cheering and the latest events. The only identity is a random code this browser makes up; it is
// sent with the state the reader chose in the page, nothing else. Do Not Track / Global Privacy Control turns the code off (read-only).
export interface OpcaoTorcida { id: string; nome: string; partido: string; votos: number }
export interface Torcida { corrida: string; total: number; opcoes: OpcaoTorcida[] }
export interface EventoAviso { id: string; t: number; titulo: string; texto: string; rotulo: string }
export interface Estado { online: number; porUf: Record<string, number>; semUf: number; torcida: Torcida | null; meu: string | null; eventos: EventoAviso[]; push: boolean }

const CHAVE = "radar:vid";
const FORMATO = /^[A-Za-z0-9_-]{16,48}$/;
let memoria = "";

export function idAnonimo(): string {
  try { const v = localStorage.getItem(CHAVE); if (v && FORMATO.test(v)) return v; } catch { /* private window: the code lasts until the tab closes */ }
  if (memoria) return memoria;
  const b = crypto.getRandomValues(new Uint8Array(16));
  memoria = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try { localStorage.setItem(CHAVE, memoria); } catch { /* same */ }
  return memoria;
}

export const naoRastrear = (): boolean => navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

async function chamar(url: string, corpo?: unknown): Promise<Estado | null> {
  try {
    const r = await fetch(url, { method: corpo === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(8000), ...(corpo === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }) });
    return r.ok ? ((await r.json()) as Estado) : null;
  } catch {
    return null; // offline or the server restarting: the caller keeps the last numbers
  }
}

export const ping = (uf: string) => chamar("/api/aovivo/ping", { id: idAnonimo(), uf });
export const ler = () => chamar("/api/aovivo/estado");
export const votar = (opcao: string) => chamar("/api/aovivo/torcida", { id: idAnonimo(), opcao });
