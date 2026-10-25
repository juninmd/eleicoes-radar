import { describe, expect, test } from "bun:test";
import { criarLimite, ipDe } from "./limite";
import { criarPresenca, type Opcao } from "./presenca";

const id = (n: number) => `visitante-${String(n).padStart(8, "0")}`; // 18 chars, inside the accepted shape
const ana: Opcao = { id: "a1", nome: "Ana Souza", partido: "AAA" };
const beto: Opcao = { id: "b2", nome: "Beto Lima", partido: "BBB" };

describe("presença", () => {
  test("a browser pinging twice counts once, and a ping that stops expires", () => {
    let t = 0;
    const p = criarPresenca({ ttlMs: 60_000, agora: () => t });
    p.ping(id(1), "SP"); p.ping(id(1), "SP"); p.ping(id(2), "RJ");
    expect(p.resumo().online).toBe(2);
    t = 61_000;
    p.ping(id(2), "RJ");
    expect(p.resumo()).toMatchObject({ online: 1, porUf: { RJ: 1 } });
  });
  test("an unknown state is 'not informed' (the server never guesses a place) and a malformed id is refused", () => {
    const p = criarPresenca();
    expect(p.ping(id(1), "ZZ")).toBe(true);
    expect(p.ping("curto", "SP")).toBe(false);
    expect(p.ping("with space and too long ".repeat(4), "SP")).toBe(false);
    expect(p.resumo()).toMatchObject({ online: 1, semUf: 1, porUf: {} });
  });
  test("memory is bounded: a full table refuses new ids but keeps counting the ones it has", () => {
    const p = criarPresenca({ maxOnline: 2 });
    p.ping(id(1), "SP"); p.ping(id(2), "SP");
    expect(p.ping(id(3), "SP")).toBe(false);
    expect(p.ping(id(1), "SP")).toBe(true);
    expect(p.resumo().online).toBe(2);
  });
});

describe("torcida", () => {
  test("only the candidates the TSE file lists can be picked, and no race means no poll", () => {
    const p = criarPresenca();
    expect(p.resumo().torcida).toBeNull();
    expect(p.votar(id(1), "a1")).toBe("invalida");
    p.definirOpcoes("Presidente · 2º turno", [ana, beto]);
    expect(p.votar(id(1), "x9")).toBe("invalida");
    expect(p.votar("curto", "a1")).toBe("invalida");
    expect(p.votar(id(1), "a1")).toBe("ok");
  });
  test("one cheer per browser: changing the pick moves it, repeating it changes nothing", () => {
    const p = criarPresenca();
    p.definirOpcoes("Presidente", [ana, beto]);
    p.votar(id(1), "a1"); p.votar(id(1), "a1"); p.votar(id(2), "a1");
    expect(p.resumo().torcida).toMatchObject({ total: 2 });
    p.votar(id(1), "b2");
    const t = p.resumo().torcida!;
    expect(t.opcoes.map((o) => o.votos)).toEqual([1, 1]);
    expect(p.meuVoto(id(1))).toBe("b2");
    expect(p.meuVoto(id(9))).toBeNull();
  });
  test("a full poll refuses new voters but lets existing ones change their pick", () => {
    const p = criarPresenca({ maxVotos: 1 });
    p.definirOpcoes("Presidente", [ana, beto]);
    p.votar(id(1), "a1");
    expect(p.votar(id(2), "a1")).toBe("lotada");
    expect(p.votar(id(1), "b2")).toBe("ok");
  });
  test("the summary is shared for a few seconds (a thousand tabs do not recompute it), then refreshes", () => {
    let t = 0;
    const p = criarPresenca({ agora: () => t });
    p.ping(id(1), "SP");
    const a = p.resumo();
    expect(p.resumo()).toBe(a);
    t = 4000;
    expect(p.resumo()).not.toBe(a);
  });
});

describe("limite", () => {
  test("blocks past the max inside the window and opens again after it", () => {
    let t = 0;
    const ok = criarLimite({ max: 2, janelaMs: 1000, agora: () => t });
    expect([ok("a"), ok("a"), ok("a"), ok("b")]).toEqual([true, true, false, true]);
    t = 1001;
    expect(ok("a")).toBe(true);
  });
  test("the table of keys cannot grow without bound", () => {
    const ok = criarLimite({ max: 1, janelaMs: 1000, chaves: 2 });
    ok("a"); ok("b"); ok("c");
    expect(ok("a")).toBe(true); // 'a' was evicted: fail open, not out of memory
  });
});

describe("ipDe", () => {
  const req = (xff?: string) => new Request("http://x/", { headers: xff ? { "x-forwarded-for": xff } : {} });
  test("behind the cluster proxy the last X-Forwarded-For entry (the one the proxy added) is the client", () => {
    expect(ipDe(req("6.6.6.6, 200.1.2.3"), "10.42.0.1")).toBe("200.1.2.3");
  });
  test("a client that reaches the server directly cannot choose its own address with the header", () => {
    expect(ipDe(req("1.1.1.1"), "200.9.9.9")).toBe("200.9.9.9");
  });
});
