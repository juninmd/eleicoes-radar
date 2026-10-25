// Reads the TSE result files on the server so a push can go out with every tab closed. One request per race per round, with the same
// out-of-order guard as the live tab (the TSE sometimes serves a file older than one already seen) and a back-off while it fails.
import { parseApuracao, tseUrl, TSE_BASE, type Apuracao, type Turno } from "../../../web/apuracao-tse.js";
import { maisRecente } from "../../../web/apuracao-feed.js";
import { titleName } from "../../../web/format.js";
import { destaque, detectar, type Disputa, type EstadoDisputa, type Evento } from "./eventos.js";
import type { Opcao } from "./presenca.js";

// The 2026 runoff: the President plus the five state governments that went to a second round.
export const DISPUTAS_2026_T2: Disputa[] = [
  { cargo: "Presidente", uf: "BR", rotulo: "Presidente", marcos: true },
  ...["AC", "AM", "ES", "RN", "TO"].map((uf) => ({ cargo: "Governador" as const, uf, rotulo: `Governo ${uf}`, marcos: false })),
];

export interface MonitorOpts {
  turno: Turno;
  disputas?: Disputa[];
  base?: string;
  buscar?: (url: string) => Promise<unknown>;
  onEventos: (eventos: Evento[]) => void; // one call per round that brought news, in the order the races are listed
  onOpcoes?: (corrida: string, opcoes: Opcao[]) => void;
  agora?: () => number;
  guardar?: number;
  testeMs?: number; // how long a test notice stays what the service worker reads
}

const buscarJson = async (url: string): Promise<unknown> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function criarMonitor({ turno, disputas = DISPUTAS_2026_T2, base = TSE_BASE, buscar = buscarJson, onEventos, onOpcoes, agora = Date.now, guardar = 50, testeMs = 120_000 }: MonitorOpts) {
  const estados = new Map<string, EstadoDisputa>();
  const vistos = new Map<string, Apuracao>();
  const recentes: Evento[] = [];
  let ultimoDestaque: Evento | null = null;
  let falhas = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let parado = true;

  async function uma(disp: Disputa): Promise<Evento[]> {
    const chave = `${disp.cargo}-${disp.uf}`;
    const d = parseApuracao(await buscar(tseUrl(disp.cargo, disp.uf, base, turno)));
    if (!d) throw new Error("arquivo do TSE ilegível");
    const antes = vistos.get(chave);
    if (maisRecente(d, antes) === antes) return []; // an older file than one already seen: ignore it
    vistos.set(chave, d);
    if (disp.cargo === "Presidente" && disp.uf === "BR") onOpcoes?.(`Presidente${turno === 2 ? " · 2º turno" : ""}`, d.candidatos.map((c) => ({ id: c.id, nome: titleName(c.nome), partido: c.partido })).filter((o) => o.id));
    const r = detectar(estados.get(chave) ?? null, d, disp, agora());
    estados.set(chave, r.estado);
    return r.eventos;
  }

  // One failing race does not stop the others; the delay doubles while every race fails, up to two minutes.
  async function rodada(): Promise<boolean> {
    const rs = await Promise.allSettled(disputas.map(uma));
    for (const r of rs) if (r.status === "rejected") console.error(`monitor: ${r.reason}`);
    const novos = rs.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (novos.length) {
      recentes.push(...novos);
      recentes.splice(0, Math.max(0, recentes.length - guardar));
      ultimoDestaque = destaque(novos); // what a woken service worker shows: the most important event of the round, never just the last one
      try { onEventos(novos); } catch (e) { console.error(`monitor: onEventos ${e}`); } // a failing listener must not stop the next round
    }
    return rs.some((r) => r.status === "fulfilled");
  }

  let intervalo = 40_000;
  const agendar = () => {
    if (parado) return;
    timer = setTimeout(async () => { falhas = (await rodada()) ? 0 : falhas + 1; agendar(); }, Math.min(120_000, intervalo * 2 ** Math.min(falhas, 3)));
  };

  return {
    rodada,
    iniciar(intervaloMs = 40_000) {
      if (!parado) return;
      parado = false;
      intervalo = intervaloMs;
      void rodada().then((ok) => { falhas = ok ? 0 : 1; agendar(); });
    },
    parar() { parado = true; if (timer) clearTimeout(timer); timer = null; },
    eventos: (): Evento[] => [...recentes].reverse(),
    ultimo: (): Evento | null => ultimoDestaque,
    // Operator test (SIGUSR2 in runtime.ts): the service worker shows this instead of the latest real event for a couple of minutes.
    // It is not a result and never enters the panel's list; a real event that arrives meanwhile replaces it.
    testar(): Evento {
      const e: Evento = { id: `teste:${agora()}`, t: agora(), tipo: "teste", titulo: "Teste de aviso do Radar", texto: "Se você viu isto, os avisos deste navegador funcionam. Não é um evento da apuração.", rotulo: "Teste" };
      const anterior = ultimoDestaque;
      ultimoDestaque = e;
      const t = setTimeout(() => { if (ultimoDestaque === e) ultimoDestaque = anterior; }, testeMs);
      t.unref?.();
      return e;
    },
  };
}
export type Monitor = ReturnType<typeof criarMonitor>;
