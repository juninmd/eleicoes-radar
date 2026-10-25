import { describe, expect, test } from "bun:test";
import { cand, file } from "../../../web/apuracao-fixtures";
import { criarApi } from "./api";
import { criarMonitor } from "./monitor";
import { criarPresenca } from "./presenca";
import { criarPush, criarVapid } from "./push";

const ID = "visitante-00000001";
const FCM = "https://fcm.googleapis.com/fcm/send/abc";

async function montar(opts: { push?: boolean } = {}) {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  const vapid = opts.push === false ? null : await criarVapid({ VAPID_PUBLIC: pub, VAPID_PRIVATE: jwk.d!, VAPID_SUBJECT: "mailto:a@b.co" });
  const presenca = criarPresenca();
  const eventos: string[] = [];
  const arquivos = [file({ s: { ts: "100", st: "0" }, v: { tv: "0", vv: "0", vvc: "0" }, cands: [cand("a1", "13", "ANA SOUZA", "1", "0", "0"), cand("b2", "22", "BETO LIMA", "2", "0", "0")] })];
  const monitor = criarMonitor({ turno: 2, disputas: [{ cargo: "Presidente", uf: "BR", rotulo: "Presidente", marcos: true }], buscar: async () => arquivos[0], onEvento: (e) => eventos.push(e.id), onOpcoes: (c, o) => presenca.definirOpcoes(c, o) });
  await monitor.rodada();
  const push = criarPush({ vapid });
  return { api: criarApi({ presenca, push, monitor }), presenca, push, monitor, eventos, arquivos };
}
const post = (path: string, body: unknown, h: Record<string, string> = {}) =>
  new Request(`http://radar.test${path}`, { method: "POST", headers: { "content-type": "application/json", host: "radar.test", ...h }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (path: string) => new Request(`http://radar.test${path}`);

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
  test("cheering: only a listed candidate, and the answer carries my pick", async () => {
    const { api } = await montar();
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
  test("one address cannot flood the vote endpoint, another is unaffected", async () => {
    const { api } = await montar();
    const codigos: number[] = [];
    for (let i = 0; i < 25; i++) codigos.push((await api(post("/api/aovivo/torcida", { id: ID, opcao: "a1" }), "9.9.9.9"))!.status);
    expect(codigos.filter((c) => c === 429).length).toBe(5);
    expect((await api(post("/api/aovivo/torcida", { id: ID, opcao: "a1" }), "8.8.8.8"))!.status).toBe(200);
  });
  test("methods other than GET and POST are refused, unknown paths are 404, and no CORS header is ever sent", async () => {
    const { api } = await montar();
    expect((await api(new Request("http://radar.test/api/aovivo/ping", { method: "DELETE" }), "1.1.1.1"))!.status).toBe(405);
    const r = await api(get("/api/nada"), "1.1.1.1");
    expect(r!.status).toBe(404);
    expect(r!.headers.get("access-control-allow-origin")).toBeNull();
  });
  test("the latest event is what the service worker reads when a push wakes it", async () => {
    const { api, monitor, arquivos } = await montar();
    expect((await api(get("/api/aovivo/ultimo"), "1.1.1.1"))!.status).toBe(404);
    arquivos[0] = file({ s: { ts: "100", st: "3" }, v: { tv: "9", vv: "9", vvc: "9" }, cands: [cand("a1", "13", "ANA SOUZA", "1", "5", "55,55"), cand("b2", "22", "BETO LIMA", "2", "4", "44,44")] });
    arquivos[0].hg = "19:50:00";
    await monitor.rodada();
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
