import { describe, expect, test } from "bun:test";
import { cand, file } from "../../../web/apuracao-fixtures";
import { criarApi } from "./api";
import { criarMonitor } from "./monitor";
import { criarPresenca } from "./presenca";
import { criarPush, criarVapid } from "./push";

const ID = "visitante-00000001";
const FCM = "https://fcm.googleapis.com/fcm/send/abc";
const id = (n: number) => `visitante-${String(n).padStart(8, "0")}`;

async function montar(opts: { push?: boolean } = {}) {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  const vapid = opts.push === false ? null : await criarVapid({ VAPID_PUBLIC: pub, VAPID_PRIVATE: jwk.d!, VAPID_SUBJECT: "mailto:a@b.co" });
  let relogio = Date.now();
  const presenca = criarPresenca({ agora: () => relogio });
  const eventos: string[] = [];
  const arquivos = [file({ s: { ts: "100", st: "0" }, v: { tv: "0", vv: "0", vvc: "0" }, cands: [cand("a1", "13", "ANA SOUZA", "1", "0", "0"), cand("b2", "22", "BETO LIMA", "2", "0", "0")] })];
  const monitor = criarMonitor({ turno: 2, disputas: [{ cargo: "Presidente", uf: "BR", rotulo: "Presidente", marcos: true }], buscar: async () => arquivos[0], onEventos: (es) => eventos.push(...es.map((e) => e.id)), onOpcoes: (c, o) => presenca.definirOpcoes(c, o) });
  await monitor.rodada();
  const push = criarPush({ vapid });
  return { api: criarApi({ presenca, push, monitor }), avancar: (ms: number) => { relogio += ms; }, presenca, push, monitor, eventos, arquivos };
}
const post = (path: string, body: unknown, h: Record<string, string> = {}) =>
  new Request(`http://radar.test${path}`, { method: "POST", headers: { "content-type": "application/json", host: "radar.test", ...h }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (path: string) => new Request(`http://radar.test${path}`);

describe("cartão do aviso", () => {
  test("serves a cacheable PNG for valid steps and refuses anything else", async () => {
    const { api } = await montar();
    const ok = (await api(get("/api/aovivo/cartao.png?a=120&s=25"), "1.1.1.1"))!;
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toContain("immutable");
    expect([...new Uint8Array(await ok.arrayBuffer()).subarray(1, 4)]).toEqual([80, 78, 71]);
    for (const q of ["", "a=120", "a=-1&s=5", "a=201&s=5", "a=5&s=101", "a=1e2&s=5", "a=abcd&s=5", "a=1000&s=5"]) expect((await api(get(`/api/aovivo/cartao.png?${q}`), "1.1.1.1"))!.status).toBe(400);
  });
  test("the operator test push carries a sample picture the service worker can show", async () => {
    const { monitor } = await montar();
    const e = monitor.testar();
    expect(e.cartao).toBe("/api/aovivo/cartao.png?a=100&s=50");
  });
});

describe("api", () => {
  test("only /api/ paths are taken; everything else goes on to the static server", async () => {
    const { api } = await montar();
    expect(await api(get("/app.js"), "1.1.1.1")).toBeNull();
  });
  test("a ping counts the browser once and answers with the same state everyone sees", async () => {
    const { api } = await montar();
    const r = await api(post("/api/aovivo/ping", { id: ID, uf: "SP" }), "1.1.1.1");
    expect(r!.status).toBe(200);
    expect(r!.headers.get("cache-control")).toBe("no-store");
    const j = await r!.json();
    expect(j).toMatchObject({ online: 1, porUf: { SP: 1 }, meu: null, push: true });
    expect(j.torcida.opcoes.map((o: { nome: string }) => o.nome)).toEqual(["Ana Souza", "Beto Lima"]); // the options come from the TSE file
    expect((await (await api(get("/api/aovivo/estado"), "2.2.2.2"))!.json()).online).toBe(1); // reading registers nobody
  });
  test("cheering: online visitors only, only a listed candidate, and the answer carries my pick", async () => {
    const { api } = await montar();
    expect((await api(post("/api/aovivo/torcida", { id: ID, opcao: "b2" }), "1.1.1.1"))!.status).toBe(409); // an invented id that never pinged
    await api(post("/api/aovivo/ping", { id: ID, uf: "" }), "1.1.1.1");
    expect((await api(post("/api/aovivo/torcida", { id: ID, opcao: "zzz" }), "1.1.1.1"))!.status).toBe(400);
    const r = await api(post("/api/aovivo/torcida", { id: ID, opcao: "b2" }), "1.1.1.1");
    expect(await r!.json()).toMatchObject({ meu: "b2", torcida: { total: 1 } });
  });
  test("writes need JSON, a same-origin Origin, a small well-formed body and a valid id", async () => {
    const { api } = await montar();
    const sem = new Request("http://radar.test/api/aovivo/ping", { method: "POST", headers: { "content-type": "text/plain", host: "radar.test" }, body: "{}" });
    expect((await api(sem, "1.1.1.1"))!.status).toBe(415);
    expect((await api(post("/api/aovivo/ping", { id: ID }, { origin: "https://evil.example" }), "1.1.1.1"))!.status).toBe(403);
    expect((await api(post("/api/aovivo/ping", { id: ID }, { origin: "https://radar.test" }), "1.1.1.1"))!.status).toBe(200); // https page behind a proxy that speaks http
    expect((await api(post("/api/aovivo/ping", "{nope"), "1.1.1.1"))!.status).toBe(400);
    expect((await api(post("/api/aovivo/ping", "[]"), "1.1.1.1"))!.status).toBe(400);
    expect((await api(post("/api/aovivo/ping", { id: "x" }), "1.1.1.1"))!.status).toBe(400);
    expect((await api(post("/api/aovivo/ping", { id: ID, pad: "x".repeat(2000) }), "1.1.1.1"))!.status).toBe(413);
  });
  test("behind the load balancer every visitor shares one address: many real visitors from it all get through", async () => {
    const { api, avancar } = await montar();
    const codigos = new Set<number>();
    for (let i = 0; i < 400; i++) codigos.add((await api(post("/api/aovivo/ping", { id: id(i), uf: "SP" }), "10.42.0.133"))!.status);
    expect([...codigos]).toEqual([200]);
    avancar(4000); // the shared summary is at most a few seconds old
    expect((await (await api(get("/api/aovivo/estado"), "10.42.0.133"))!.json()).online).toBe(400);
  });
  test("the limits that matter are per visitor: one browser cannot spam pings or votes, the others are unaffected", async () => {
    const { api } = await montar();
    const pings: number[] = [];
    for (let i = 0; i < 12; i++) pings.push((await api(post("/api/aovivo/ping", { id: ID, uf: "SP" }), "10.42.0.133"))!.status);
    expect(pings.filter((c) => c === 429).length).toBe(4); // 8 a minute
    expect((await api(post("/api/aovivo/ping", { id: id(2), uf: "SP" }), "10.42.0.133"))!.status).toBe(200);
    await api(post("/api/aovivo/ping", { id: id(3), uf: "SP" }), "10.42.0.133");
    const votos: number[] = [];
    for (let i = 0; i < 14; i++) votos.push((await api(post("/api/aovivo/torcida", { id: id(3), opcao: i % 2 ? "a1" : "b2" }), "10.42.0.133"))!.status);
    expect(votos.filter((c) => c === 429).length).toBe(4); // 10 a minute
  });
  test("a flood from one address is still bounded by its ceiling, not just by visitor ids", async () => {
    const { api } = await montar();
    let primeiro429 = 0;
    for (let i = 0; i < 1300 && !primeiro429; i++) if ((await api(post("/api/aovivo/torcida", { id: id(i), opcao: "a1" }), "9.9.9.9"))!.status === 429) primeiro429 = i;
    expect(primeiro429).toBe(1200);
  });
  test("unknown paths and methods are refused before the body is read or any limit is spent, and no CORS header is ever sent", async () => {
    const { api } = await montar();
    expect((await api(new Request("http://radar.test/api/aovivo/ping", { method: "DELETE" }), "1.1.1.1"))!.status).toBe(405);
    for (let i = 0; i < 300; i++) expect((await api(post(`/api/aleatorio-${i}`, "x".repeat(5000)), "1.1.1.1"))!.status).toBe(404); // not 413, not 429: never read
    const r = await api(get("/api/nada"), "1.1.1.1");
    expect(r!.status).toBe(404);
    expect(r!.headers.get("access-control-allow-origin")).toBeNull();
  });
  test("what a woken service worker asks for has no limit and is the most important event, not whatever came last", async () => {
    const { api, monitor, arquivos } = await montar();
    expect((await api(get("/api/aovivo/ultimo"), "1.1.1.1"))!.status).toBe(404);
    arquivos[0] = file({ s: { ts: "100", st: "3" }, v: { tv: "9", vv: "9", vvc: "9" }, cands: [cand("a1", "13", "ANA SOUZA", "1", "5", "55,55"), cand("b2", "22", "BETO LIMA", "2", "4", "44,44")] });
    arquivos[0].hg = "19:50:00";
    await monitor.rodada();
    for (let i = 0; i < 400; i++) expect((await api(get("/api/aovivo/ultimo"), "10.42.0.133"))!.status).toBe(200); // a fan-out wakes thousands at once
    const j = await (await api(get("/api/aovivo/ultimo"), "1.1.1.1"))!.json();
    expect(j).toMatchObject({ id: "Presidente-BR:inicio", titulo: "Presidente: a apuração começou" });
  });
  test("push: the key is public, the subscription must be a browser's push service, and it can be cancelled", async () => {
    const { api, push } = await montar();
    expect((await (await api(get("/api/push/chave"), "1.1.1.1"))!.json()).chave).toHaveLength(87);
    expect((await api(post("/api/push/inscrever", { endpoint: "https://169.254.169.254/x" }), "1.1.1.1"))!.status).toBe(400);
    expect((await api(post("/api/push/inscrever", { endpoint: FCM }), "1.1.1.1"))!.status).toBe(200);
    expect(push.total()).toBe(1);
    await api(post("/api/push/cancelar", { endpoint: FCM }), "1.1.1.1");
    expect(push.total()).toBe(0);
  });
  test("without VAPID keys the page learns push is off and nobody can subscribe", async () => {
    const { api } = await montar({ push: false });
    expect((await api(get("/api/push/chave"), "1.1.1.1"))!.status).toBe(404);
    expect((await api(post("/api/push/inscrever", { endpoint: FCM }), "1.1.1.1"))!.status).toBe(400);
    expect((await (await api(get("/api/aovivo/estado"), "1.1.1.1"))!.json()).push).toBe(false);
  });
});
