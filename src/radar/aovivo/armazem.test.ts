import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirArmazem as abrirReal, armazemMemoria, type AbrirOpts, type Armazem } from "./armazem";
import { criarApi } from "./api";
import { criarMonitor } from "./monitor";
import { criarPresenca, type Opcao } from "./presenca";
import { criarPush, criarVapid } from "./push";

const pastas: string[] = [];
const abertos: Armazem[] = [];
const abrirArmazem = (caminho: string, o?: AbrirOpts) => { const a = abrirReal(caminho, o); abertos.push(a); return a; };
const novaPasta = () => { const p = mkdtempSync(join(tmpdir(), "radar-armazem-")); pastas.push(p); return p; };
afterEach(() => { for (const a of abertos.splice(0)) a.fechar(); for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); });

const id = (n: number) => `visitante-${String(n).padStart(8, "0")}`;
const ana: Opcao = { id: "a1", nome: "Ana Souza", partido: "AAA" };
const beto: Opcao = { id: "b2", nome: "Beto Lima", partido: "BBB" };
const FCM = "https://fcm.googleapis.com/fcm/send/abc";

describe("armazém SQLite", () => {
  test("the poll survives a restart: same votes, same counts, my pick is still mine", () => {
    const arq = join(novaPasta(), "radar.db");
    const a1 = abrirArmazem(arq);
    const p1 = criarPresenca({ armazem: a1 });
    p1.definirOpcoes("Presidente · 2º turno", [ana, beto]);
    for (const n of [1, 2, 3]) p1.ping(id(n), "SP");
    p1.votar(id(1), "a1"); p1.votar(id(2), "a1"); p1.votar(id(3), "b2"); p1.votar(id(3), "a1");
    a1.fechar();

    const p2 = criarPresenca({ armazem: abrirArmazem(arq) }); // the next pod
    p2.definirOpcoes("Presidente · 2º turno", [ana, beto]);
    expect(p2.resumo().torcida?.opcoes.map((o) => o.votos)).toEqual([3, 0]);
    expect(p2.meuVoto(id(3))).toBe("a1");
    p2.ping(id(1), "SP");
    expect(p2.votar(id(1), "b2")).toBe("ok"); // and a change after the restart moves the stored count too
    expect(p2.resumo().torcida?.opcoes.map((o) => o.votos)).toEqual([2, 1]);
  });
  test("each race has its own poll: the first-round cheers do not leak into the runoff", () => {
    const arq = join(novaPasta(), "radar.db");
    const a = abrirArmazem(arq);
    const p = criarPresenca({ armazem: a });
    p.definirOpcoes("Presidente", [ana, beto]);
    p.ping(id(1), "SP"); p.votar(id(1), "a1");
    p.definirOpcoes("Presidente · 2º turno", [ana, beto]);
    expect(p.resumo().torcida?.total).toBe(0);
    p.definirOpcoes("Presidente", [ana, beto]);
    expect(p.resumo().torcida?.total).toBe(1);
  });
  test("what lands on disk is a salted hash: the browser's code is not in the file, and another database hashes it differently", () => {
    const pasta = novaPasta();
    const unico = "codigo-secreto-do-navegador-XYZ123";
    const a = abrirArmazem(join(pasta, "a.db"));
    const p = criarPresenca({ armazem: a });
    p.definirOpcoes("Presidente", [ana, beto]);
    p.ping(unico, "MG"); p.votar(unico, "a1");
    a.fechar();
    for (const f of readdirSync(pasta)) expect(readFileSync(join(pasta, f)).includes(unico)).toBe(false);
    const b = abrirArmazem(join(pasta, "b.db"));
    expect(b.hash(unico)).not.toBe(abrirArmazem(join(pasta, "a.db")).hash(unico)); // different salt, so the hashes cannot be matched across databases
    expect(a.hash === b.hash).toBe(false);
  });
  test("the salt is stable across restarts of the same file (or no vote would be recognised again)", () => {
    const arq = join(novaPasta(), "radar.db");
    const a = abrirArmazem(arq);
    const h = a.hash(id(1));
    a.fechar();
    expect(abrirArmazem(arq).hash(id(1))).toBe(h);
  });
  test("push subscriptions survive a restart, a dead one is removed from disk, and a row that is not a browser push address is not trusted", async () => {
    const arq = join(novaPasta(), "radar.db");
    const a = abrirArmazem(arq);
    a.gravarEndpoint("https://internal.example/steal"); // as if the file had been tampered with
    const p1 = criarPush({ vapid: null, armazem: a });
    expect(p1.total()).toBe(0);
    p1.inscrever(FCM); p1.inscrever(`${FCM}2`);
    p1.cancelar(`${FCM}2`);
    a.fechar();
    const b = abrirArmazem(arq);
    expect(b.endpoints()).toEqual([FCM]);
    expect(criarPush({ vapid: null, armazem: b }).total()).toBe(1);

    // a 410 from the push service deletes the row, not just the memory
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
    const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
    const vapid = await criarVapid({ VAPID_PUBLIC: pub, VAPID_PRIVATE: jwk.d!, VAPID_SUBJECT: "https://exemplo.test" });
    const morto = (async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
    const p2 = criarPush({ vapid, enviar: morto, armazem: b });
    expect((await p2.notificar()).removidos).toBe(1);
    expect(b.endpoints()).toEqual([]);
  });
  test("votes and subscriptions nobody renewed within the retention are dropped at open", () => {
    const arq = join(novaPasta(), "radar.db");
    let t = 1_000_000_000_000;
    const a = abrirArmazem(arq, { agora: () => t, retencaoMs: 1000 });
    a.gravarVoto("Presidente", a.hash(id(1)), "a1");
    a.gravarEndpoint(FCM);
    a.gravarEndpoint(`${FCM}2`);
    t += 600;
    a.gravarEndpoint(`${FCM}2`); // renewed
    a.fechar();
    t += 700;
    const b = abrirArmazem(arq, { agora: () => t, retencaoMs: 1000 });
    expect(b.votosDe("Presidente")).toEqual([]);
    expect(b.endpoints()).toEqual([`${FCM}2`]);
  });
  test("a store that fails does not break the live tab: writes are swallowed (logged once) and reads come back empty", () => {
    const arq = join(novaPasta(), "radar.db");
    const a = abrirArmazem(arq);
    a.fechar(); // every later call hits a closed database
    const erros = console.error;
    const vistos: string[] = [];
    console.error = (m: string) => { vistos.push(m); };
    try {
      expect(a.votosDe("x")).toEqual([]);
      a.gravarVoto("x", "h", "o");
      a.gravarEndpoint(FCM);
      expect(a.endpoints()).toEqual([]);
    } finally { console.error = erros; }
    expect(vistos).toHaveLength(1);
  });
  test("without a configured path nothing persists, and the API says so", async () => {
    const m = armazemMemoria();
    m.gravarEndpoint(FCM);
    expect(m.persistente).toBe(false);
    const presenca = criarPresenca({ armazem: m });
    const monitor = criarMonitor({ turno: 2, disputas: [], buscar: async () => ({}), onEventos: () => {} });
    const api = criarApi({ presenca, push: criarPush({ vapid: null, armazem: m }), monitor });
    expect((await (await api(new Request("http://x/api/aovivo/estado"), "1.1.1.1"))!.json()).persistente).toBe(false);
    const api2 = criarApi({ presenca, push: criarPush({ vapid: null }), monitor, persistente: true });
    expect((await (await api2(new Request("http://x/api/aovivo/estado"), "1.1.1.1"))!.json()).persistente).toBe(true);
  });
});
