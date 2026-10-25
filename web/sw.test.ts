import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Runs the real sw.js against a fake worker scope: what the browser would do when a push wakes it.
function carregar(fetchImpl: (url: string, init?: unknown) => Promise<{ ok: boolean; json: () => Promise<unknown> }>, abertas: { url: string; focus: () => Promise<void>; navigate?: (u: string) => Promise<void> }[] = []) {
  const ouvintes = new Map<string, (e: unknown) => void>();
  const mostradas: { titulo: string; opts: Record<string, unknown> }[] = [];
  const aberturas: string[] = [];
  const self = {
    location: { origin: "https://radar.test" },
    skipWaiting: () => {},
    addEventListener: (t: string, f: (e: unknown) => void) => ouvintes.set(t, f),
    clients: { claim: async () => {}, matchAll: async () => abertas, openWindow: async (u: string) => { aberturas.push(u); } },
    registration: { showNotification: async (titulo: string, opts: Record<string, unknown>) => { mostradas.push({ titulo, opts }); } },
  };
  new Function("self", "fetch", "URL", readFileSync("web/sw.js", "utf8"))(self, fetchImpl, URL);
  const disparar = async (tipo: string, extra: Record<string, unknown> = {}) => {
    let espera: Promise<unknown> = Promise.resolve();
    ouvintes.get(tipo)!({ waitUntil: (p: Promise<unknown>) => { espera = p; }, ...extra });
    await espera;
  };
  return { disparar, mostradas, aberturas };
}

describe("sw.js", () => {
  test("a push shows the latest event the server holds, tagged by its id so a repeat replaces instead of stacking", async () => {
    const pedidos: string[] = [];
    const sw = carregar(async (u) => { pedidos.push(u); return { ok: true, json: async () => ({ id: "Presidente-BR:m50", titulo: "Presidente: 50% das seções apuradas", texto: "Ana 51,0% · Beto 49,0%" }) }; });
    await sw.disparar("push");
    expect(pedidos).toEqual(["/api/aovivo/ultimo"]);
    expect(sw.mostradas).toEqual([{ titulo: "Presidente: 50% das seções apuradas", opts: expect.objectContaining({ body: "Ana 51,0% · Beto 49,0%", tag: "Presidente-BR:m50", lang: "pt-BR" }) }]);
  });
  test("when the server cannot be reached the push still shows a notice (a browser requires one)", async () => {
    const sw = carregar(async () => { throw new Error("offline"); });
    await sw.disparar("push");
    expect(sw.mostradas).toHaveLength(1);
    expect(sw.mostradas[0].titulo).toBe("Radar do Voto");
    expect(sw.mostradas[0].opts.body).toContain("Abra o Radar");
  });
  test("a server error body is treated as no event, not shown as text", async () => {
    const sw = carregar(async () => ({ ok: false, json: async () => ({ erro: "sem eventos" }) }));
    await sw.disparar("push");
    expect(sw.mostradas[0].titulo).toBe("Radar do Voto");
  });
  test("clicking focuses an open Radar tab, or opens the live tab when there is none", async () => {
    let focou = 0;
    const navegou: string[] = [];
    const comAba = carregar(async () => { throw new Error("x"); }, [{ url: "https://radar.test/", focus: async () => { focou++; }, navigate: async (u) => { navegou.push(u); } }]);
    await comAba.disparar("notificationclick", { notification: { close: () => {}, data: { url: "/#aovivo" } } });
    expect(focou).toBe(1);
    expect(navegou).toEqual(["/#aovivo"]); // the open tab lands on the live tab, not wherever it was
    expect(comAba.aberturas).toEqual([]);
    const sem = carregar(async () => { throw new Error("x"); }, [{ url: "https://outro.test/", focus: async () => { focou++; } }]);
    await sem.disparar("notificationclick", { notification: { close: () => {}, data: { url: "/#aovivo" } } });
    expect(sem.aberturas).toEqual(["/#aovivo"]);
    expect(focou).toBe(1);
  });
  test("it never intercepts page requests or caches anything", () => {
    const src = readFileSync("web/sw.js", "utf8");
    expect(src).not.toContain('"fetch"');
    expect(src).not.toContain("caches.");
  });
});
