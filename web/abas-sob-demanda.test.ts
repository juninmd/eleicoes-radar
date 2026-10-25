import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { abaSobDemanda, quandoPronta } from "./abas-sob-demanda.js";

// A module stand-in whose import can be made to fail once, so the retry rule is observable.
function modulo(falhas: number) {
  let importes = 0;
  let restantes = falhas;
  const importar = async () => { importes++; if (restantes-- > 0) throw new Error("rede caiu"); return { valor: importes }; };
  return { importar, importes: () => importes };
}

describe("abaSobDemanda", () => {
  test("importa e monta uma vez; chamadas seguintes reusam a mesma instância", async () => {
    const m = modulo(0);
    let montagens = 0;
    const aba = abaSobDemanda(m.importar, (x) => ({ n: ++montagens, de: x.valor }));
    expect(aba.get()).toBeNull();
    const [a, b] = await Promise.all([aba.carregar(), aba.carregar()]);
    expect(a).toBe(b);
    expect(m.importes()).toBe(1);
    expect(montagens).toBe(1);
    expect(aba.get()).toBe(a);
  });

  test("falha de download não fica em cache: a próxima abertura tenta de novo", async () => {
    const m = modulo(1);
    const aba = abaSobDemanda(m.importar, (x) => x.valor);
    await expect(aba.carregar()).rejects.toThrow("rede caiu");
    expect(aba.get()).toBeNull();
    expect(await aba.carregar()).toBe(2);
  });

  test("erro na montagem também não fica preso", async () => {
    let tentativas = 0;
    const aba = abaSobDemanda(async () => ({}), () => { if (++tentativas === 1) throw new Error("mount"); return "ok"; });
    await expect(aba.carregar()).rejects.toThrow("mount");
    expect(await aba.carregar()).toBe("ok");
  });
});

describe("quandoPronta", () => {
  const el = () => ({ innerHTML: "", querySelector: () => null }) as unknown as HTMLElement;

  test("aba já pronta roda na hora, sem esperar", () => {
    const aba = abaSobDemanda(async () => ({}), () => "pronta");
    return aba.carregar().then(() => {
      let usada = "";
      quandoPronta(aba, el(), () => true, (x) => { usada = x; }, () => {});
      expect(usada).toBe("pronta");
    });
  });

  test("resposta que chega depois de o usuário sair da aba não mexe na tela", async () => {
    const aba = abaSobDemanda(async () => ({}), () => "x");
    let usada = false;
    quandoPronta(aba, el(), () => false, () => { usada = true; }, () => {});
    await aba.carregar();
    await new Promise((r) => setTimeout(r, 0));
    expect(usada).toBe(false);
  });
});

// Pins the first-load win: the radar boot must not statically import the heavy tabs (their modules add ~120 KB gzip).
test("app.ts não importa estaticamente as abas pesadas", () => {
  const src = readFileSync("web/app.ts", "utf8");
  const pesadas = /^import (?!type )[^;]*from "\.\/(apuracao-mount|apuracao-aovivo|apuracao-link|apuracao-sim|panorama|expectativa|rede)\.js";/m;
  expect(src).not.toMatch(pesadas);
});
