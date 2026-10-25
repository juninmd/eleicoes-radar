// Polls the results file of every state for one office (the map and the national tally need all of
// them). Same rules as createFeed: injected clock/network/visibility, a token against stale answers,
// a failing state keeps its last numbers, and a renderer error never stops the cycle.
import { esperaComRecuo, HttpError, loadResultado, maisRecente, POLL_MS } from "./apuracao-feed.js";
import type { FeedStatus, Loader, Timers } from "./apuracao-feed.js";
import { tseUrl } from "./apuracao-tse.js";
import type { Apuracao, Cargo } from "./apuracao-tse.js";

export const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
// Votes cast abroad have their own presidential file ("zz"); state races have none.
export const EXTERIOR = "ZZ";
export const ufsDo = (cargo: Cargo | null): string[] => (cargo === "Presidente" ? [...UFS, EXTERIOR] : UFS);

// What the feed knows about one state's file; `dados` stays the last good file when a later poll fails.
export interface UfEstado { status: FeedStatus; dados: Apuracao | null; erro: string | null; buscadoEm: Date | null }
export interface BrasilSnapshot { cargo: Cargo | null; ciclo: number; buscadoEm: Date | null; ufs: Record<string, UfEstado> }
export interface BrasilFeedOptions {
  load?: Loader;
  url?: (cargo: Cargo, uf: string) => string;
  onChange: (snap: BrasilSnapshot) => void;
  every?: number;
  concurrency?: number;
  timers?: Timers;
  visible?: () => boolean;
  now?: () => Date;
}
export interface BrasilFeed { follow(next: Cargo): void; refresh(): void; stop(): void }

const vazio = (): UfEstado => ({ status: "carregando", dados: null, erro: null, buscadoEm: null });

export function createBrasilFeed({ load = loadResultado, url = tseUrl, onChange, every = POLL_MS, concurrency = 6, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) }, visible = () => !document.hidden, now = () => new Date() }: BrasilFeedOptions): BrasilFeed {
  let cargo: Cargo | null = null;
  let token = 0;
  let timer: unknown = null;
  let ctl: AbortController | null = null;
  let snap: BrasilSnapshot = { cargo: null, ciclo: 0, buscadoEm: null, ufs: {} };
  let falhas = 0; // consecutive cycles in which the TSE failed every state that was asked (a 404 is not a failure)

  const notify = () => {
    try { onChange({ ...snap, ufs: { ...snap.ufs } }); } catch (e) { console.error("apuração: falha ao desenhar", e); }
  };
  const cancel = () => { token++; ctl?.abort(); timers.clear(timer); timer = null; };
  const patch = (uf: string, p: Partial<UfEstado>) => { snap = { ...snap, ufs: { ...snap.ufs, [uf]: { ...snap.ufs[uf], ...p } } }; notify(); };

  async function one(uf: string, mine: number): Promise<FeedStatus | null> {
    let p: Partial<UfEstado>;
    try {
      p = { status: "ok", dados: maisRecente(await load(url(cargo!, uf), ctl!.signal), snap.ufs[uf]?.dados), erro: null, buscadoEm: now() };
    } catch (e) {
      // 404: not published (now). Either way the state keeps the numbers it had.
      p = e instanceof HttpError && e.status === 404 ? { status: "ausente", erro: null } : { status: "erro", erro: (e as Error | null | undefined)?.message || "falha ao consultar o TSE" };
    }
    if (mine === token) patch(uf, p);
    return p.status ?? null;
  }

  async function tick() {
    const mine = token;
    if (!visible()) { timer = timers.set(tick, every); return; } // background tab: no request
    ctl = new AbortController();
    const fila = [...ufsDo(cargo)];
    const estados: (FeedStatus | null)[] = [];
    const worker = async () => { while (fila.length && mine === token) estados.push(await one(fila.shift()!, mine)); };
    await Promise.all(Array.from({ length: Math.min(concurrency, fila.length) }, worker));
    if (mine !== token) return;
    // A cycle with no answer at all, and some errors, counts as one failure of the TSE; any answer resets the wait.
    falhas = !estados.includes("ok") && estados.includes("erro") ? falhas + 1 : 0;
    snap = { ...snap, ciclo: snap.ciclo + 1, buscadoEm: now() };
    notify();
    timer = timers.set(tick, esperaComRecuo(every, falhas));
  }

  return {
    follow(next) {
      if (next === cargo) return;
      cancel();
      falhas = 0;
      cargo = next;
      snap = { cargo, ciclo: 0, buscadoEm: null, ufs: Object.fromEntries(ufsDo(cargo).map((uf): [string, UfEstado] => [uf, vazio()])) };
      notify();
      tick();
    },
    refresh() {
      if (cargo === null) return;
      cancel();
      tick();
    },
    stop() {
      cancel();
      falhas = 0;
      cargo = null;
    },
  };
}
