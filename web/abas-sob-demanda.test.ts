import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, posix } from "node:path";
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

  test("prefetch só baixa: a montagem espera a primeira abertura", async () => {
    const m = modulo(0);
    let montagens = 0;
    const aba = abaSobDemanda(m.importar, () => ++montagens);
    aba.baixar();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.importes()).toBe(1);
    expect(montagens).toBe(0);
    expect(aba.get()).toBeNull();
    await aba.carregar();
    expect(montagens).toBe(1);
  });

  // The wrapper forgets the failure and calls importar again; the browser may still serve its cached failed import, which is why the tab offers a reload.
  test("falha de download não fica presa no wrapper: a próxima chamada importa de novo", async () => {
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

// A tab container with a fake button: the error path is checked without a DOM.
function contenedor(comBotao = true) {
  const botao = { foco: false, clique: null as (() => void) | null, focus() { this.foco = true; }, addEventListener(_tipo: string, f: () => void) { this.clique = f; } };
  const el = {
    html: "",
    set innerHTML(v: string) { this.html = v; },
    get innerHTML() { return this.html; },
    querySelector: (sel: string) => (comBotao && sel === "button" ? botao : null),
  };
  return { el: el as unknown as HTMLElement, botao, html: () => el.html };
}

describe("quandoPronta", () => {
  test("aba já pronta roda na hora, sem esperar", () => {
    const aba = abaSobDemanda(async () => ({}), () => "pronta");
    return aba.carregar().then(() => {
      let usada = "";
      quandoPronta(aba, contenedor().el, () => true, (x) => { usada = x; });
      expect(usada).toBe("pronta");
    });
  });

  test("resposta que chega depois de o usuário sair da aba não mexe na tela", async () => {
    const aba = abaSobDemanda(async () => ({}), () => "x");
    let usada = false;
    quandoPronta(aba, contenedor().el, () => false, () => { usada = true; });
    await aba.carregar();
    await new Promise((r) => setTimeout(r, 0));
    expect(usada).toBe(false);
  });

  test("aba pronta mas oculta não roda: o Ao vivo oculto não é repintado nem religa o TSE", async () => {
    const aba = abaSobDemanda(async () => ({}), () => "pronta");
    await aba.carregar();
    let usada = false;
    quandoPronta(aba, contenedor().el, () => false, () => { usada = true; });
    expect(usada).toBe(false);
  });

  test("aba oculta e ainda não carregada não baixa o módulo", async () => {
    const m = modulo(0);
    let montagens = 0;
    const aba = abaSobDemanda(m.importar, () => ++montagens);
    quandoPronta(aba, contenedor().el, () => false, () => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(m.importes()).toBe(0);
    expect(montagens).toBe(0);
  });

  // The browser caches a failed import, so a retry inside the page cannot succeed: the only way out offered is a reload.
  test("falha com a aba visível mostra 'Recarregar a página' com foco no botão, e o clique recarrega", async () => {
    const aba = abaSobDemanda(async () => { throw new Error("rede caiu"); }, () => "x");
    const { el, botao, html } = contenedor();
    const antes = (globalThis as unknown as { location?: unknown }).location;
    const recarregas: string[] = [];
    (globalThis as unknown as { location: unknown }).location = { reload: () => recarregas.push("reload") };
    try {
      quandoPronta(aba, el, () => true, () => {});
      await new Promise((r) => setTimeout(r, 0));
      expect(html()).toContain("Recarregar a página");
      expect(html()).toContain('role="status"');
      expect(botao.foco).toBe(true);
      botao.clique!();
      expect(recarregas).toEqual(["reload"]);
    } finally {
      (globalThis as unknown as { location: unknown }).location = antes;
    }
  });

  test("erro sem botão no DOM não lança", async () => {
    const aba = abaSobDemanda(async () => { throw new Error("rede caiu"); }, () => "x");
    quandoPronta(aba, contenedor(false).el, () => true, () => {});
    await new Promise((r) => setTimeout(r, 0));
  });
});

