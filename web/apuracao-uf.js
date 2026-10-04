// Polls the results file of every state for one office (the map and the national tally need all of
// them). Same rules as createFeed: injected clock/network/visibility, a token against stale answers,
// a failing state keeps its last numbers, and a renderer error never stops the cycle.
import { HttpError, loadResultado, POLL_MS } from "./apuracao-feed.js";
import { tseUrl } from "./apuracao-tse.js";

export const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
// Votes cast abroad have their own presidential file ("zz"); state races have none.
export const EXTERIOR = "ZZ";
export const ufsDo = (cargo) => (cargo === "Presidente" ? [...UFS, EXTERIOR] : UFS);

const vazio = () => ({ status: "carregando", dados: null, erro: null, buscadoEm: null });

export function createBrasilFeed({ load = loadResultado, url = tseUrl, onChange, every = POLL_MS, concurrency = 6, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) }, visible = () => !document.hidden, now = () => new Date() }) {
  let cargo = null;
  let token = 0;
  let timer = null;
  let ctl = null;
  let snap = { cargo: null, ciclo: 0, buscadoEm: null, ufs: {} };

  const notify = () => {
    try { onChange({ ...snap, ufs: { ...snap.ufs } }); } catch (e) { console.error("apuração: falha ao desenhar", e); }
  };
  const cancel = () => { token++; ctl?.abort(); timers.clear(timer); timer = null; };
  const patch = (uf, p) => { snap = { ...snap, ufs: { ...snap.ufs, [uf]: { ...snap.ufs[uf], ...p } } }; notify(); };

  async function one(uf, mine) {
    let p;
    try {
      p = { status: "ok", dados: await load(url(cargo, uf), ctl.signal), erro: null, buscadoEm: now() };
    } catch (e) {
      // 404: not published (now). Either way the state keeps the numbers it had.
      p = e instanceof HttpError && e.status === 404 ? { status: "ausente", erro: null } : { status: "erro", erro: e?.message || "falha ao consultar o TSE" };
    }
    if (mine === token) patch(uf, p);
  }

  async function tick() {
    const mine = token;
    if (!visible()) { timer = timers.set(tick, every); return; } // background tab: no request
    ctl = new AbortController();
    const fila = [...ufsDo(cargo)];
    const worker = async () => { while (fila.length && mine === token) await one(fila.shift(), mine); };
    await Promise.all(Array.from({ length: Math.min(concurrency, fila.length) }, worker));
    if (mine !== token) return;
    snap = { ...snap, ciclo: snap.ciclo + 1, buscadoEm: now() };
    notify();
    timer = timers.set(tick, every);
  }

  return {
    follow(next) {
      if (next === cargo) return;
      cancel();
      cargo = next;
      snap = { cargo, ciclo: 0, buscadoEm: null, ufs: Object.fromEntries(ufsDo(cargo).map((uf) => [uf, vazio()])) };
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
      cargo = null;
    },
  };
}
