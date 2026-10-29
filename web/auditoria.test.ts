import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mountAuditoria } from "./auditoria.js";
import { auditoria, governador, impressao, pontos } from "./auditoria-fixtures.js";

// Just enough DOM for the tab: one element with innerHTML, a click listener and the few queries it makes.
function fakeRoot() {
  let clique: ((e: unknown) => void) | null = null;
  const root = {
    innerHTML: "",
    addEventListener: (t: string, f: (e: unknown) => void) => { if (t === "click") clique = f; },
    contains: () => false,
    querySelector: () => null,
  };
  const clicar = (data: Record<string, string>) => clique?.({ target: { closest: () => ({ dataset: data }) } });
  return { root: root as unknown as HTMLElement, el: root, clicar };
}
const noMicrotasks = () => new Promise((r) => setTimeout(r, 0));

function leitor(falhas: Set<string> = new Set()) {
  const pedidos: string[] = [];
  const ler = async <T>(caminho: string): Promise<T> => {
    pedidos.push(caminho);
    if (falhas.has(caminho)) throw new Error(`404 ${caminho}`);
    if (caminho.endsWith("auditoria.json")) return auditoria() as T;
    if (caminho.endsWith("impressao.json")) return impressao() as T;
    if (caminho.endsWith("governadores.json")) return [governador()] as T;
    if (caminho.endsWith("mapa.json")) return pontos() as T;
    if (caminho === "mapa-uf.json") return { viewBox: [0, 0, 10, 10], ufs: { SP: { d: "M0 0" } } } as T;
    throw new Error(`inesperado ${caminho}`);
  };
  return { ler, pedidos };
}

let doc: unknown;
beforeEach(() => { doc = (globalThis as { document?: unknown }).document; (globalThis as { document?: unknown }).document = { activeElement: null }; });
afterEach(() => { (globalThis as { document?: unknown }).document = doc; });

describe("mountAuditoria", () => {
  test("nada é pedido antes de a aba abrir", async () => {
    const l = leitor();
    mountAuditoria(fakeRoot().root, l.ler);
    await noMicrotasks();
    expect(l.pedidos).toEqual([]);
  });

  test("abrir pede só o arquivo principal; os grandes esperam a seção deles", async () => {
    const l = leitor();
    const { root, el } = fakeRoot();
    const aba = mountAuditoria(root, l.ler);
    aba.show();
    expect(el.innerHTML).toContain("Carregando a auditoria");
    await noMicrotasks();
    expect(l.pedidos).toEqual(["data/auditoria/auditoria.json"]);
    expect(el.innerHTML).toContain("Cruzamos");
  });

  test("cada seção pede o seu arquivo uma vez só", async () => {
    const l = leitor();
    const { root, el, clicar } = fakeRoot();
    const aba = mountAuditoria(root, l.ler);
    aba.show();
    await noMicrotasks();
    clicar({ audSec: "governos" });
    clicar({ audSec: "resumo" });
    clicar({ audSec: "governos" });
    await noMicrotasks();
    clicar({ audSec: "eleicao" });
    clicar({ audSec: "populacao" });
    await noMicrotasks();
    expect(l.pedidos.sort()).toEqual(["data/auditoria/auditoria.json", "data/auditoria/governadores.json", "data/auditoria/impressao.json", "data/auditoria/mapa.json", "mapa-uf.json"].sort());
    expect(aba.secao).toBe("populacao");
    expect(el.innerHTML).toContain("au-pt");
  });

  test("a seção Sem biometria troca de turno pelo clique e não pede arquivo extra", async () => {
    const l = leitor();
    const { root, el, clicar } = fakeRoot();
    const aba = mountAuditoria(root, l.ler);
    aba.show();
    await noMicrotasks();
    clicar({ audSec: "biometria" });
    expect(el.innerHTML).toContain("<b>9.600</b>");
    clicar({ audBio: "2026-2" });
    expect(el.innerHTML).toContain("<b>10.000</b>");
    expect(l.pedidos).toEqual(["data/auditoria/auditoria.json"]);
  });

  test("clicar numa célula do resumo abre aquela eleição", async () => {
    const l = leitor();
    const { root, el, clicar } = fakeRoot();
    const aba = mountAuditoria(root, l.ler);
    aba.show();
    await noMicrotasks();
    clicar({ audGo: "2026-1" });
    await noMicrotasks();
    expect(aba.secao).toBe("eleicao");
    expect(el.innerHTML).toContain('aria-pressed="true"');
    expect(el.innerHTML).toContain("2026");
  });

  test("falha no arquivo principal vira aviso de dados não gerados e a próxima abertura tenta de novo", async () => {
    const falhas = new Set(["data/auditoria/auditoria.json"]);
    const l = leitor(falhas);
    const { root, el } = fakeRoot();
    const aba = mountAuditoria(root, l.ler);
    aba.show();
    await noMicrotasks();
    expect(el.innerHTML).toContain("radar:auditoria");
    falhas.clear();
    aba.show();
    await noMicrotasks();
    expect(el.innerHTML).toContain("Cruzamos");
    expect(l.pedidos.filter((p) => p.endsWith("auditoria.json"))).toHaveLength(2);
  });

  test("falha num arquivo de seção é esquecida: a próxima visita pede de novo, sem laço", async () => {
    const falhas = new Set(["data/auditoria/governadores.json"]);
    const l = leitor(falhas);
    const { root, clicar } = fakeRoot();
    const aba = mountAuditoria(root, l.ler);
    aba.show();
    await noMicrotasks();
    clicar({ audSec: "governos" });
    await noMicrotasks();
    await noMicrotasks();
    expect(l.pedidos.filter((p) => p.endsWith("governadores.json"))).toHaveLength(1);
    falhas.clear();
    clicar({ audSec: "resumo" });
    clicar({ audSec: "governos" });
    await noMicrotasks();
    expect(l.pedidos.filter((p) => p.endsWith("governadores.json"))).toHaveLength(2);
  });

  test("com a aba fechada a resposta que chega não redesenha", async () => {
    const l = leitor();
    const { root, el } = fakeRoot();
    const aba = mountAuditoria(root, l.ler);
    aba.show();
    aba.hide();
    el.innerHTML = "";
    await noMicrotasks();
    expect(el.innerHTML).toBe("");
  });
});
