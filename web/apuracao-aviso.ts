// Browser notifications for the Apuração tab: the moments worth a glance away from the page (the TSE marks someone "Eleito", the Radar's
// proof of an elected candidate or of a runoff). Off until the reader turns it on (the browser asks for permission on that click) and only
// shown while the tab is hidden: with the page in view the "Últimas atualizações" list already says it. Milestones never notify.
import type { Item } from "./apuracao-novidades.js";

const CHAVE = "radar:avisos";
const MAX_POR_VEZ = 3;

export interface NotificacaoApi {
  permission: string;
  requestPermission(): Promise<string>;
  new (titulo: string, opcoes?: { body?: string; tag?: string }): unknown;
}
export interface Armazem { get(): string | null; set(v: string): void }

// The items a new file added on top of the list (the list keeps the same objects for the old ones), without the milestones.
export function novosAvisos(antes: Item[], depois: Item[]): Item[] {
  const ate = antes.length ? depois.indexOf(antes[0]) : depois.length;
  return (ate < 0 ? depois : depois.slice(0, ate)).filter((i) => i.tipo !== "marco");
}

// The updates carry the page's escaped HTML (names in <b>); a notification is plain text.
export const textoPlano = (html: string): string =>
  html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const armazemPadrao = (): Armazem => ({
  get: () => { try { return localStorage.getItem(CHAVE); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(CHAVE, v); } catch { /* private window: the choice lasts until the tab closes */ } },
});

export type EstadoAviso = "indisponivel" | "bloqueado" | "ligado" | "desligado";

export function criarAvisos({ api = typeof Notification === "undefined" ? undefined : (Notification as unknown as NotificacaoApi), guardar = armazemPadrao(), escondida = () => document.hidden }: { api?: NotificacaoApi; guardar?: Armazem; escondida?: () => boolean } = {}) {
  let quer = guardar.get() === "on";
  const estado = (): EstadoAviso => (!api ? "indisponivel" : api.permission === "denied" ? "bloqueado" : quer && api.permission === "granted" ? "ligado" : "desligado");
  return {
    estado,
    ativo: () => estado() === "ligado",
    // Called from the click: the only moment a browser lets the permission question appear.
    async alternar(): Promise<EstadoAviso> {
      if (!api) return "indisponivel";
      if (estado() === "ligado") quer = false;
      else {
        if (api.permission === "default") await api.requestPermission().catch(() => "denied");
        quer = api.permission === "granted";
      }
      guardar.set(quer ? "on" : "off");
      return estado();
    },
    avisar(titulo: string, itens: Item[]) {
      if (!api || estado() !== "ligado" || !escondida() || !itens.length) return;
      for (const i of itens.slice(0, MAX_POR_VEZ)) new api(titulo, { body: textoPlano(i.texto), tag: `${titulo}|${i.hora}|${i.texto}` });
      if (itens.length > MAX_POR_VEZ) new api(titulo, { body: `E mais ${itens.length - MAX_POR_VEZ} atualizações. Abra a aba para ver.`, tag: `${titulo}|mais` });
    },
  };
}
