// Polls one TSE results file at a time. Pure of the DOM: the clock, the network and the tab
// visibility are injected, so the timing rules can be tested.
import { parseApuracao } from "./apuracao-tse.js";

// The TSE caches each file for 20 to 45 s (Cache-Control max-age), so polling faster only repeats answers.
export const POLL_MS = 60_000;

export class HttpError extends Error {
  constructor(status) {
    super(`o TSE respondeu HTTP ${status}`);
    this.status = status;
  }
}

const TIMEOUT_MS = 20_000;

// Date and time of a file as one sortable number; NaN when the file does not say.
export const versaoDe = (d) => {
  const dia = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d?.versao?.data ?? "");
  const hora = /^(\d{2}):(\d{2}):(\d{2})$/.exec(d?.versao?.hora ?? "");
  return dia && hora ? Number(`${dia[3]}${dia[2]}${dia[1]}${hora[1]}${hora[2]}${hora[3]}`) : NaN;
};

// The TSE sometimes answers with a file older than one it already served (seen on count night, even
// the zeroed pre-vote file): the numbers on screen never go back. Unknown versions are taken as new.
export const maisRecente = (novo, atual) => (atual && versaoDe(novo) < versaoDe(atual) ? atual : novo);

// The view prints these messages as they are, so the browser's English text never reaches the page.
function explain(e, timedOut) {
  if (timedOut) return new Error("o TSE não respondeu a tempo");
  if (e instanceof HttpError || e?.name === "AbortError") return e;
  if (e instanceof SyntaxError) return new Error("arquivo do TSE ilegível");
  if (e instanceof TypeError) return new Error("sem conexão com o TSE");
  return e;
}

export async function loadResultado(url, signal, timeoutMs = TIMEOUT_MS) {
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

export function createFeed({ load = loadResultado, onChange, every = POLL_MS, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) }, visible = () => !document.hidden, now = () => new Date() }) {
  let url = null;
  let token = 0;
  let timer = null;
  let ctl = null;
  let snap = { url: null, status: "carregando", dados: null, buscadoEm: null, erro: null };

  // A renderer bug must never stop the polling: the next tick may bring numbers it can draw.
  const notify = () => {
    try { onChange({ ...snap }); } catch (e) { console.error("apuração: falha ao desenhar", e); }
  };
  const emit = (patch) => { snap = { ...snap, ...patch }; notify(); };
  const cancel = () => { token++; ctl?.abort(); timers.clear(timer); timer = null; };

  async function tick() {
    const mine = token;
    if (!visible()) { timer = timers.set(tick, every); return; } // background tab: no request
    ctl = new AbortController();
    let patch;
    try {
      patch = { status: "ok", dados: maisRecente(await load(url, ctl.signal), snap.dados), buscadoEm: now(), erro: null };
    } catch (e) {
      // 404: the TSE has not published this file (now). Either way the last good numbers stay on screen.
      patch = e instanceof HttpError && e.status === 404 ? { status: "ausente", erro: null } : { status: "erro", erro: e?.message || "falha ao consultar o TSE" };
    }
    if (mine !== token) return;
    emit(patch);
    timer = timers.set(tick, every);
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
