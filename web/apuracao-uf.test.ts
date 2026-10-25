import { describe, expect, test } from "bun:test";
import { HttpError, POLL_MS } from "./apuracao-feed.js";
import { POLL_LENTO_MS } from "./apuracao-ritmo.js";
import { createBrasilFeed, EXTERIOR, UFS, ufsDo } from "./apuracao-uf.js";
import type { BrasilFeed, BrasilSnapshot } from "./apuracao-uf.js";
import type { Apuracao } from "./apuracao-tse.js";

interface Call { url: string; uf: string; resolve: (v: Apuracao) => void; reject: (e: unknown) => void; signal: AbortSignal; done?: boolean }
interface FakeTimer { fn: () => void; ms: number }
interface Rig {
  visible: boolean; calls: Call[]; timers: FakeTimer[]; events: BrasilSnapshot[];
  inflight: () => Call[]; settle: (uf: string, v: Apuracao) => void; fail: (uf: string, e: unknown) => void;
  fire: () => Promise<void>; feed: BrasilFeed; cargo?: string;
}

// Fake network and clock, like apuracao-feed.test.js: loads settle when the test says so, timers run when fired.
function rig({ visible = true, concurrency = 3, cargo = "Governador" } = {}) {
  const calls: Call[] = [];
  const timers: FakeTimer[] = [];
  const events: BrasilSnapshot[] = [];
  const r: Rig = {
    visible, calls, timers, events,
    inflight: () => calls.filter((c) => !c.done),
    settle: (uf, v) => { const c = calls.find((x) => !x.done && x.uf === uf)!; c.done = true; c.resolve(v); },
    fail: (uf, e) => { const c = calls.find((x) => !x.done && x.uf === uf)!; c.done = true; c.reject(e); },
    fire: async () => { timers.shift()!.fn(); await flush(); },
    feed: null as unknown as BrasilFeed,
  };
  r.feed = createBrasilFeed({
    load: (url, signal) => new Promise<Apuracao>((resolve, reject) => calls.push({ url, uf: url.slice(-2).toUpperCase() === "ZZ" ? "ZZ" : url.split("#")[1], resolve, reject, signal })),
    url: (c, uf) => `${c}#${uf}`,
    onChange: (s) => events.push(s),
    concurrency,
    timers: { set: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clear: (t) => { const i = timers.indexOf(t as FakeTimer); if (i >= 0) timers.splice(i, 1); } },
    visible: () => r.visible,
    now: () => new Date("2026-10-04T20:00:00Z"),
  });
  r.cargo = cargo;
  return r;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const dados = (n: unknown) => ({ fase: "parcial", n }) as unknown as Apuracao;

describe("ufsDo", () => {
  test("the 27 states, plus the exterior only for president (no state race has votes abroad)", () => {
    expect(UFS).toHaveLength(27);
    expect(new Set(UFS).size).toBe(27);
    expect(ufsDo("Governador")).toEqual(UFS);
    expect(ufsDo("Senador")).not.toContain(EXTERIOR);
    expect(ufsDo("Presidente")).toEqual([...UFS, EXTERIOR]);
  });
});

describe("createBrasilFeed", () => {
  test("a cycle where the TSE fails everywhere backs off: one failure is tolerated, then the wait doubles up to 2 min, and one good state restores it", async () => {
    const r = rig();
    const ciclo = async (resposta: (c: Call) => void) => { while (r.inflight().length) { resposta(r.inflight()[0]); await flush(); } };
    r.feed.follow("Governador");
    await flush();
    const esperas: number[] = [];
    for (let i = 0; i < 3; i++) {
      await ciclo((c) => { c.done = true; c.reject(new TypeError("Failed to fetch")); });
      esperas.push(r.timers[0].ms);
      await r.fire();
    }
    expect(esperas).toEqual([POLL_MS, POLL_LENTO_MS, POLL_LENTO_MS]);
    // One state answers, the other 26 fail: a cycle with any answer is not a failure of the TSE.
    let primeiro = true;
    await ciclo((c) => { c.done = true; if (primeiro) { primeiro = false; c.resolve({ fase: "parcial", n: 1 } as unknown as Apuracao); } else c.reject(new TypeError("Failed to fetch")); });
    expect(r.timers[0].ms).toBe(POLL_MS);
  });

  test("a cycle where every state answers 404 is not a failure of the TSE and does not extend the wait", async () => {
    const r = rig();
    const ciclo = async (resposta: (c: Call) => void) => { while (r.inflight().length) { resposta(r.inflight()[0]); await flush(); } };
    r.feed.follow("Governador");
    await flush();
    for (let i = 0; i < 2; i++) {
      await ciclo((c) => { c.done = true; c.reject(new TypeError("Failed to fetch")); });
      await r.fire();
    }
    await ciclo((c) => { c.done = true; c.reject(new HttpError(404)); });
    expect(r.timers[0].ms).toBe(POLL_MS);
  });

  test("starts every state as loading and never has more requests in flight than the limit", async () => {
    const r = rig({ concurrency: 3 });
    r.feed.follow("Governador");
    expect(Object.keys(r.events[0].ufs)).toHaveLength(27);
    expect(Object.values(r.events[0].ufs).every((u) => u.status === "carregando" && u.dados === null)).toBe(true);
    expect(r.inflight()).toHaveLength(3);
    r.settle("AC", dados(1));
    await flush();
    expect(r.inflight()).toHaveLength(3); // the freed slot was refilled
  });

  test("each answer is published as it arrives, and one timer is armed only when the whole cycle ends", async () => {
    const r = rig({ concurrency: 27 });
    r.feed.follow("Governador");
    r.settle("SP", dados("sp"));
    await flush();
    expect(r.events.at(-1)!.ufs.SP).toMatchObject({ status: "ok", dados: dados("sp"), erro: null });
    expect(r.events.at(-1)!.ufs.AC.status).toBe("carregando");
    expect(r.timers).toHaveLength(0);
    for (const uf of UFS.filter((u) => u !== "SP")) r.settle(uf, dados(uf));
    await flush();
    expect(r.timers.map((t) => t.ms)).toEqual([POLL_MS]);
    expect(r.events.at(-1)!.ciclo).toBe(1);
    expect(r.events.at(-1)!.buscadoEm).toEqual(new Date("2026-10-04T20:00:00Z"));
  });

  test("one state failing does not stop the others, and it keeps its own last numbers", async () => {
    const r = rig({ concurrency: 27 });
    r.feed.follow("Governador");
    for (const uf of UFS) r.settle(uf, dados(uf));
    await flush();
    await r.fire();
    r.fail("BA", new Error("sem conexão com o TSE"));
    for (const uf of UFS.filter((u) => u !== "BA")) r.settle(uf, dados(`${uf}2`));
    await flush();
    const { ufs } = r.events.at(-1)!;
    expect(ufs.BA).toMatchObject({ status: "erro", erro: "sem conexão com o TSE", dados: dados("BA") });
    expect(ufs.SP).toMatchObject({ status: "ok", dados: dados("SP2") });
    expect(r.timers).toHaveLength(1); // still polling
  });

  test("a state answered with an older file than the one it shows keeps the newer numbers, the others update", async () => {
    const v = (hora: string, st: number) => ({ fase: "parcial", versao: { data: "04/10/2026", hora }, secoes: { total: 100, totalizadas: st } }) as unknown as Apuracao;
    const r = rig({ concurrency: 27 });
    r.feed.follow("Governador");
    for (const uf of UFS) r.settle(uf, v("17:25:49", 47));
    await flush();
    await r.fire();
    for (const uf of UFS) r.settle(uf, uf === "DF" ? v("17:24:39", 36) : v("17:26:22", 51));
    await flush();
    const { ufs } = r.events.at(-1)!;
    expect(ufs.DF).toMatchObject({ status: "ok", erro: null, dados: v("17:25:49", 47) });
    expect(ufs.SP.dados).toEqual(v("17:26:22", 51));
    expect(r.timers).toHaveLength(1);
  });

  test("a 404 on one state means not published yet, and keeps what it had", async () => {
    const r = rig({ concurrency: 27 });
    r.feed.follow("Governador");
    for (const uf of UFS.filter((u) => u !== "RR")) r.settle(uf, dados(uf));
    r.fail("RR", new HttpError(404));
    await flush();
    expect(r.events.at(-1)!.ufs.RR).toMatchObject({ status: "ausente", dados: null, erro: null });
  });

  test("switching office drops the old cycle: late answers are ignored and in-flight requests are aborted", async () => {
    const r = rig({ concurrency: 27 });
    r.feed.follow("Governador");
    const old = r.calls.slice();
    r.feed.follow("Senador");
    expect(old.every((c) => c.signal.aborted)).toBe(true);
    const before = r.events.length;
    old[0].resolve(dados("velho"));
    await flush();
    expect(r.events).toHaveLength(before);
    expect(r.events.at(-1)!).toMatchObject({ cargo: "Senador", ciclo: 0 });
  });

  test("following the same office twice does not double the polling", async () => {
    const r = rig({ concurrency: 27 });
    r.feed.follow("Governador");
    r.feed.follow("Governador");
    expect(r.calls).toHaveLength(27);
  });

  test("a hidden tab skips the requests but keeps the schedule, and refresh() catches up at once", async () => {
    const r = rig({ visible: false });
    r.feed.follow("Governador");
    expect(r.calls).toHaveLength(0);
    expect(r.timers).toHaveLength(1);
    await r.fire();
    expect(r.calls).toHaveLength(0);
    r.visible = true;
    r.feed.refresh();
    expect(r.calls.length).toBeGreaterThan(0);
    expect(r.timers).toHaveLength(0);
  });

  test("a renderer that throws is logged and never stops the cycle", async () => {
    const real = console.error;
    const logged: string[] = [];
    console.error = (...a) => logged.push(a.join(" "));
    try {
      const calls: { url: string; resolve: (v: Apuracao) => void }[] = [];
      const timers: FakeTimer[] = [];
      const feed = createBrasilFeed({
        load: (url) => new Promise<Apuracao>((resolve) => calls.push({ url, resolve })),
        url: (c, uf) => `${c}#${uf}`,
        onChange: () => { throw new Error("render boom"); },
        concurrency: 27,
        timers: { set: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clear: () => {} },
        visible: () => true,
      });
      feed.follow("Governador");
      for (const c of calls) c.resolve(dados(1));
      await flush();
      expect(timers).toHaveLength(1);
      expect(logged.join(" ")).toContain("render boom");
    } finally {
      console.error = real;
    }
  });

  test("stop() cancels the timer and in-flight requests", async () => {
    const r = rig({ concurrency: 27 });
    r.feed.follow("Governador");
    r.feed.stop();
    expect(r.calls.every((c) => c.signal.aborted)).toBe(true);
    for (const c of r.calls) c.resolve(dados(1));
    await flush();
    expect(r.timers).toHaveLength(0);
  });

  test("president also loads the exterior file", async () => {
    const r = rig({ concurrency: 40 });
    r.feed.follow("Presidente");
    expect(r.calls).toHaveLength(28);
    expect(Object.keys(r.events[0].ufs)).toContain(EXTERIOR);
  });
});
