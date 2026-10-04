import { afterEach, describe, expect, test } from "bun:test";
import { createFeed, HttpError, loadResultado, POLL_MS } from "./apuracao-feed.js";

// Fake clock and network: timers only run when the test fires them, loads resolve when the test says so.
function rig({ visible = true } = {}) {
  const timers = [];
  const calls = [];
  const events = [];
  const rig = {
    visible,
    calls,
    events,
    timers,
    fire: async () => { const t = timers.shift(); t.fn(); await flush(); },
    feed: null,
  };
  const load = (url) => new Promise((resolve, reject) => calls.push({ url, resolve, reject }));
  rig.feed = createFeed({
    load,
    onChange: (s) => events.push({ ...s }),
    timers: { set: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clear: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } },
    visible: () => rig.visible,
    now: () => new Date("2026-10-04T20:00:00Z"),
  });
  return rig;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const data = (n) => ({ fase: "parcial", n });

describe("createFeed", () => {
  test("fetches at once, then polls again after the interval", async () => {
    const r = rig();
    r.feed.follow("u1");
    expect(r.events.at(-1)).toMatchObject({ url: "u1", status: "carregando", dados: null });
    r.calls[0].resolve(data(1));
    await flush();
    expect(r.events.at(-1)).toMatchObject({ status: "ok", dados: data(1), erro: null });
    expect(r.events.at(-1).buscadoEm).toEqual(new Date("2026-10-04T20:00:00Z"));
    expect(r.timers.map((t) => t.ms)).toEqual([POLL_MS]);
    await r.fire();
    expect(r.calls).toHaveLength(2);
    r.calls[1].resolve(data(2));
    await flush();
    expect(r.events.at(-1).dados).toEqual(data(2));
  });

  test("following the same race twice does not double the polling", async () => {
    const r = rig();
    r.feed.follow("u1");
    r.feed.follow("u1");
    r.calls[0].resolve(data(1));
    await flush();
    expect(r.calls).toHaveLength(1);
    expect(r.timers).toHaveLength(1);
  });

  test("a late answer for the previous race never overwrites the current one", async () => {
    const r = rig();
    r.feed.follow("senado");
    r.feed.follow("governador");
    r.calls[1].resolve(data("gov"));
    await flush();
    r.calls[0].resolve(data("sen")); // slower request finishes last
    await flush();
    expect(r.events.at(-1)).toMatchObject({ url: "governador", dados: data("gov") });
    expect(r.timers).toHaveLength(1);
  });

  test("switching race clears the old numbers instead of showing them under the new title", async () => {
    const r = rig();
    r.feed.follow("a");
    r.calls[0].resolve(data("a"));
    await flush();
    r.feed.follow("b");
    expect(r.events.at(-1)).toMatchObject({ url: "b", status: "carregando", dados: null });
  });

  test("a failed refresh keeps the last good numbers, says so, and recovers by itself", async () => {
    const r = rig();
    r.feed.follow("u1");
    r.calls[0].resolve(data(1));
    await flush();
    await r.fire();
    r.calls[1].reject(new TypeError("Failed to fetch"));
    await flush();
    expect(r.events.at(-1)).toMatchObject({ status: "erro", dados: data(1), erro: "Failed to fetch" });
    expect(r.timers).toHaveLength(1); // still polling
    await r.fire();
    r.calls[2].resolve(data(3));
    await flush();
    expect(r.events.at(-1)).toMatchObject({ status: "ok", dados: data(3), erro: null });
  });

  test("a 404 means the TSE has not published this file, and is not a failure", async () => {
    const r = rig();
    r.feed.follow("u1");
    r.calls[0].reject(new HttpError(404));
    await flush();
    expect(r.events.at(-1)).toMatchObject({ status: "ausente", dados: null });
    expect(r.timers).toHaveLength(1);
  });

  test("a hidden tab skips the request but keeps the schedule, and refresh() catches up at once", async () => {
    const r = rig({ visible: false });
    r.feed.follow("u1");
    expect(r.calls).toHaveLength(0);
    expect(r.timers).toHaveLength(1);
    await r.fire();
    expect(r.calls).toHaveLength(0);
    r.visible = true;
    r.feed.refresh();
    expect(r.calls).toHaveLength(1);
    expect(r.timers).toHaveLength(0); // the old timer was replaced, never stacked
    r.calls[0].resolve(data(1));
    await flush();
    expect(r.timers).toHaveLength(1);
  });

  test("the default timers are called detached: browsers throw 'Illegal invocation' for setTimeout used as a method", async () => {
    const real = globalThis.setTimeout;
    globalThis.setTimeout = function strict(fn, ms) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return real(fn, ms);
    };
    try {
      let loads = 0;
      const feed = createFeed({ load: async () => { loads++; return data(loads); }, onChange: () => {}, every: 5, visible: () => true });
      feed.follow("u1");
      await new Promise((r) => real(r, 40));
      feed.stop();
      expect(loads).toBeGreaterThan(1); // the second poll only happens if scheduling worked
    } finally {
      globalThis.setTimeout = real;
    }
  });

  test("a renderer that throws is logged but never stops the polling", async () => {
    const errors = [];
    const real = console.error;
    console.error = (...a) => errors.push(a.join(" "));
    try {
      const calls = [];
      const timers = [];
      let n = 0;
      const feed = createFeed({
        load: (url) => new Promise((resolve) => calls.push({ url, resolve })),
        onChange: () => { if (++n >= 2) throw new Error("render boom"); }, // the first paint ("carregando") works, the data paint throws
        timers: { set: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clear: () => {} },
        visible: () => true,
      });
      feed.follow("u1");
      calls[0].resolve(data(1));
      await flush();
      expect(timers).toHaveLength(1); // the next poll is still armed
      expect(errors.join(" ")).toContain("render boom");
    } finally {
      console.error = real;
    }
  });

  test("a renderer that throws on the first paint does not stop follow() from fetching", async () => {
    const real = console.error;
    console.error = () => {};
    try {
      const calls = [];
      const feed = createFeed({ load: (url) => new Promise((resolve) => calls.push({ url, resolve })), onChange: () => { throw new Error("render boom"); }, timers: { set: () => ({}), clear: () => {} }, visible: () => true });
      feed.follow("u1");
      expect(calls).toHaveLength(1);
    } finally {
      console.error = real;
    }
  });

  test("a 404 after good numbers keeps them on screen: the page promised to keep the last numbers", async () => {
    const r = rig();
    r.feed.follow("u1");
    r.calls[0].resolve(data(1));
    await flush();
    await r.fire();
    r.calls[1].reject(new HttpError(404));
    await flush();
    expect(r.events.at(-1)).toMatchObject({ status: "ausente", dados: data(1) });
  });

  test("switching race aborts the old request and its AbortError is not shown as a failure", async () => {
    const events = [];
    const calls = [];
    const feed = createFeed({
      load: (url, signal) => new Promise((resolve, reject) => {
        calls.push({ url, resolve });
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
      onChange: (s) => events.push({ ...s }),
      timers: { set: () => ({}), clear: () => {} },
      visible: () => true,
    });
    feed.follow("senado");
    feed.follow("governador");
    calls[1].resolve(data("gov"));
    await flush();
    expect(events.map((e) => e.status)).toEqual(["carregando", "carregando", "ok"]);
    expect(events.at(-1)).toMatchObject({ url: "governador", dados: data("gov") });
  });

  test("stop() cancels the timer and drops an answer still in flight", async () => {
    const r = rig();
    r.feed.follow("u1");
    r.feed.stop();
    r.calls[0].resolve(data(1));
    await flush();
    expect(r.events.at(-1).status).toBe("carregando");
    expect(r.timers).toHaveLength(0);
  });
});

describe("loadResultado", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const silent = (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const message = async (p) => { try { await p; return null; } catch (e) { return e; } };

  test("a file that never answers fails with a clear message instead of hanging the polling", async () => {
    globalThis.fetch = (_url, { signal }) => silent(signal);
    const e = await message(loadResultado("u", undefined, 20));
    expect(e.message).toBe("o TSE não respondeu a tempo");
  });

  test("a network failure says there is no connection, not the browser's English text", async () => {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    expect((await message(loadResultado("u"))).message).toBe("sem conexão com o TSE");
  });

  test("a body that is not JSON says the file is unreadable", async () => {
    globalThis.fetch = async () => new Response("<html>manutenção</html>");
    expect((await message(loadResultado("u"))).message).toBe("arquivo do TSE ilegível");
  });

  test("an HTTP error keeps its status so the feed can tell 404 from the rest", async () => {
    globalThis.fetch = async () => new Response("", { status: 503 });
    const e = await message(loadResultado("u"));
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(503);
    expect(e.message).toBe("o TSE respondeu HTTP 503");
  });

  test("a JSON that is not a results file is rejected", async () => {
    globalThis.fetch = async () => new Response("{}");
    expect((await message(loadResultado("u"))).message).toBe("formato do arquivo do TSE não reconhecido");
  });

  test("a results file is parsed", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ carg: [{ agr: [] }] }));
    expect((await loadResultado("u")).fase).toBe("aguardando");
  });

  test("the caller aborting (race switched) stays an AbortError, never reported as a timeout", async () => {
    globalThis.fetch = (_url, { signal }) => silent(signal);
    const ctl = new AbortController();
    const p = message(loadResultado("u", ctl.signal, 5_000));
    ctl.abort();
    expect((await p).name).toBe("AbortError");
  });
});
