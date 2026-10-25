// Polls one TSE results file at a time. Pure of the DOM: the clock, the network and the tab
// visibility are injected, so the timing rules can be tested.
import { parseApuracao } from "./apuracao-tse.js";
import type { Apuracao } from "./apuracao-tse.js";
import { intervaloDe } from "./apuracao-ritmo.js";

// The TSE caches each file for 20 to 45 s (Cache-Control max-age), so polling faster only repeats answers.
export const POLL_MS = 60_000;

export class HttpError extends Error {
  declare status: number;
  constructor(status: number) {
    super(`o TSE respondeu HTTP ${status}`);
    this.status = status;
  }
}

const TIMEOUT_MS = 20_000;

// Date and time of a file as one sortable number; NaN when the file does not say.
export type Versionado = { versao?: { data?: string; hora?: string } | null } | null | undefined;
export const versaoDe = (d: Versionado): number => {
  const dia = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d?.versao?.data ?? "");
  const hora = /^(\d{2}):(\d{2}):(\d{2})$/.exec(d?.versao?.hora ?? "");
  return dia && hora ? Number(`${dia[3]}${dia[2]}${dia[1]}${hora[1]}${hora[2]}${hora[3]}`) : NaN;
};

// The TSE sometimes answers with a file older than one it already served (seen on count night, even
// the zeroed pre-vote file): the numbers on screen never go back. Unknown versions are taken as new.
export const maisRecente = <T extends Versionado>(novo: T, atual: T | null | undefined): T => (atual && versaoDe(novo) < versaoDe(atual) ? atual : novo);

// The view prints these messages as they are, so the browser's English text never reaches the page.
function explain(e: unknown, timedOut: boolean): unknown {
  if (timedOut) return new Error("o TSE não respondeu a tempo");
  if (e instanceof HttpError || (e as Error | null | undefined)?.name === "AbortError") return e;
  if (e instanceof SyntaxError) return new Error("arquivo do TSE ilegível");
  if (e instanceof TypeError) return new Error("sem conexão com o TSE");
  return e;
}

export async function loadResultado(url: string, signal?: AbortSignal | null, timeoutMs = TIMEOUT_MS): Promise<Apuracao> {
  // Own controller: a hung request must end by itself, and the caller's abort (race switched) must still win.
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
  const relay = () => ctl.abort();
  signal?.addEventListener("abort", relay);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-cache" }); // revalidates by ETag: cheap when nothing changed
    if (!r.ok) throw new HttpError(r.status);
    const parsed = parseApuracao(await r.json());
    if (!parsed) throw new Error("formato do arquivo do TSE não reconhecido");
    return parsed;
  } catch (e) {
    throw explain(e, timedOut);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}

export type FeedStatus = "carregando" | "ok" | "ausente" | "erro";
export interface FeedSnapshot { url: string | null; status: FeedStatus; dados: Apuracao | null; buscadoEm: Date | null; erro: string | null }
export type Loader = (url: string, signal: AbortSignal) => Promise<Apuracao>;
export interface Timers { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void }
export interface FeedOptions {
  load?: Loader;
  onChange: (snap: FeedSnapshot) => void;
  every?: number | ((snap: FeedSnapshot) => number); // a number is fixed; the default follows the rhythm of the count (apuracao-ritmo.ts)
  timers?: Timers;
  visible?: () => boolean;
  now?: () => Date;
}
export interface Feed { follow(next: string): void; refresh(): void; stop(): void }

export function createFeed({ load = loadResultado, onChange, every, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) }, visible = () => !document.hidden, now = () => new Date() }: FeedOptions): Feed {
  let url: string | null = null;
  let token = 0;
  let timer: unknown = null;
  let ctl: AbortController | null = null;
  let snap: FeedSnapshot = { url: null, status: "carregando", dados: null, buscadoEm: null, erro: null };
  const espera = () => (typeof every === "number" ? every : (every ?? ((s: FeedSnapshot) => intervaloDe(s.dados, now(), POLL_MS)))(snap));

  // A renderer bug must never stop the polling: the next tick may bring numbers it can draw.
  const notify = () => {
    try { onChange({ ...snap }); } catch (e) { console.error("apuração: falha ao desenhar", e); }
  };
  const emit = (patch: Partial<FeedSnapshot>) => { snap = { ...snap, ...patch }; notify(); };
  const cancel = () => { token++; ctl?.abort(); timers.clear(timer); timer = null; };

  async function tick() {
    const mine = token;
    if (!visible()) { timer = timers.set(tick, espera()); return; } // background tab: no request
    ctl = new AbortController();
    let patch: Partial<FeedSnapshot>;
    try {
      patch = { status: "ok", dados: maisRecente(await load(url!, ctl.signal), snap.dados), buscadoEm: now(), erro: null };
    } catch (e) {
      // 404: the TSE has not published this file (now). Either way the last good numbers stay on screen.
      patch = e instanceof HttpError && e.status === 404 ? { status: "ausente", erro: null } : { status: "erro", erro: (e as Error | null | undefined)?.message || "falha ao consultar o TSE" };
    }
    if (mine !== token) return;
    emit(patch);
    timer = timers.set(tick, espera());
  }

  return {
    follow(next) {
      if (next === url) return;
      cancel();
      url = next;
      snap = { url, status: "carregando", dados: null, buscadoEm: null, erro: null };
      notify();
      tick();
    },
    refresh() {
      if (url === null) return;
      cancel();
      tick();
    },
    stop() {
      cancel();
      url = null;
    },
  };
}
