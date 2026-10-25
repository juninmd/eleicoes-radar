import { describe, expect, test } from "bun:test";
import { criarPush, criarVapid, endpointValido } from "./push";

async function chaves() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
  const publica = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  return { VAPID_PUBLIC: publica, VAPID_PRIVATE: jwk.d!, VAPID_SUBJECT: "mailto:ops@example.org", par };
}
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";

describe("endpointValido (the server POSTs here, so it must be a browser's push service)", () => {
  test("accepts the push services of the browsers", () => {
    for (const u of [FCM, "https://updates.push.services.mozilla.com/wpush/v2/xyz", "https://web.push.apple.com/Qabc", "https://wns2-par02p.notify.windows.com/w/?token=1"]) expect(endpointValido(u)).not.toBeNull();
  });
  test("refuses internal addresses, plain http, look-alikes, credentials, odd ports and junk", () => {
    for (const u of ["http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://localhost/x", "https://10.0.0.5/x", "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example/fcm.googleapis.com", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "not a url", "", 42, null, `https://fcm.googleapis.com/${"a".repeat(700)}`]) expect(endpointValido(u)).toBeNull();
  });
});

describe("VAPID", () => {
  test("the JWT is ES256, names the push service as audience, and verifies with the public key", async () => {
    const k = await chaves();
    const v = (await criarVapid(k, () => 1_700_000_000_000))!;
    const [h, c, s] = (await v.assinar("https://fcm.googleapis.com")).split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_000_000 + 12 * 3600, sub: "mailto:ops@example.org" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.par.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
  test("without keys, or with broken ones, push is off instead of failing at the first event", async () => {
    expect(await criarVapid({})).toBeNull();
    const k = await chaves();
    expect(await criarVapid({ ...k, VAPID_PUBLIC: "AAAA" })).toBeNull();
    expect(await criarVapid({ ...k, VAPID_PRIVATE: "AAAA" })).toBeNull();
  });
});

describe("push", () => {
  test("subscriptions are deduplicated and capped", async () => {
    const p = criarPush({ vapid: await criarVapid(await chaves()), max: 1 });
    expect(p.inscrever(FCM)).toBe("ok");
    expect(p.inscrever(FCM)).toBe("ok");
    expect(p.inscrever("https://fcm.googleapis.com/fcm/send/outra")).toBe("lotado");
    expect(p.inscrever("https://evil.example/x")).toBe("invalido");
    expect(p.total()).toBe(1);
    p.cancelar(FCM);
    expect(p.total()).toBe(0);
  });
  test("a notification carries the VAPID header, collapses on a topic, and forgets subscriptions the browser dropped", async () => {
    const vistos: { url: string; init: RequestInit }[] = [];
    const respostas = new Map([["a", 201], ["b", 410], ["c", 500]]);
    const enviar = (async (url: string, init: RequestInit) => { vistos.push({ url, init }); return new Response(null, { status: respostas.get(url.split("/").pop()!) }); }) as unknown as typeof fetch;
    const p = criarPush({ vapid: await criarVapid(await chaves()), enviar });
    for (const x of ["a", "b", "c"]) p.inscrever(`https://fcm.googleapis.com/fcm/send/${x}`);
    expect(await p.notificar()).toEqual({ enviados: 1, removidos: 1, falhas: 1 });
    expect(p.total()).toBe(2); // 410 gone, the 500 stays for the next event
    const h = vistos[0].init.headers as Record<string, string>;
    expect(h.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
    expect(h.Topic).toBe("radar-evento");
    expect(vistos[0].init.body).toBeUndefined();
  });
  test("a network error counts as a failure and does not stop the others", async () => {
    let n = 0;
    const enviar = (async () => { if (n++ === 0) throw new Error("rede"); return new Response(null, { status: 201 }); }) as unknown as typeof fetch;
    const p = criarPush({ vapid: await criarVapid(await chaves()), enviar, paralelo: 1 });
    p.inscrever(`${FCM}1`); p.inscrever(`${FCM}2`);
    expect(await p.notificar()).toEqual({ enviados: 1, removidos: 0, falhas: 1 });
  });
  test("without VAPID keys nothing is sent and the page is told push is off", async () => {
    const p = criarPush({ vapid: null });
    expect(p.ativo()).toBe(false);
    expect(p.chave()).toBeNull();
    expect(await p.notificar()).toEqual({ enviados: 0, removidos: 0, falhas: 0 });
  });
});
