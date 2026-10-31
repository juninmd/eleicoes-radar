import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mountCamara } from "./camara.js";
import { painelGrande } from "./camara-fixtures.js";
import type { PainelCamara } from "../src/radar/camara/painel-tipos.js";

// Just enough DOM for the tab: innerHTML, delegated listeners by event type and the few queries it makes.
function fakeRoot() {
  const ouvintes: Record<string, (e: unknown) => void> = {};
  const root = { innerHTML: "", addEventListener: (t: string, f: (e: unknown) => void) => { ouvintes[t] = f; }, contains: () => false, querySelector: () => null };
  const clicar = (data: Record<string, string>) => ouvintes.click?.({ target: { closest: () => ({ dataset: data }) } });
  const digitar = (id: string, value: string) => ouvintes.input?.({ target: { id, value } });
  return { root: root as unknown as HTMLElement, el: root, clicar, digitar };
}
const aguarde = () => new Promise((r) => setTimeout(r, 0));

function leitor(falhas: Set<string> = new Set()) {
  const pedidos: string[] = [];
  const ler = async <T>(caminho: string): Promise<T> => {
    pedidos.push(caminho);
    if (falhas.has(caminho)) throw new Error(`404 ${caminho}`);
    if (caminho.endsWith("painel.json")) return painelGrande() as unknown as T;
    if (caminho.endsWith("partidos.json")) return { AAA: { nome: "Alfa", logo: null } } as T;
    if (caminho.endsWith("fotos.json")) return {} as T;
    throw new Error(`inesperado ${caminho}`);
  };
  return { ler, pedidos };
}

let doc: unknown;
beforeEach(() => { doc = (globalThis as { document?: unknown }).document; (globalThis as { document?: unknown }).document = { activeElement: null }; });
afterEach(() => { (globalThis as { document?: unknown }).document = doc; });

describe("mountCamara", () => {
  test("nada é baixado antes de abrir a aba", () => {
    const l = leitor(); mountCamara(fakeRoot().root, l.ler);
    expect(l.pedidos).toEqual([]);
  });
  test("ao abrir, mostra 'Carregando' e pede o painel, os logos e (com fotos ligadas) as fotos, uma vez cada", async () => {
    const l = leitor(), { root, el } = fakeRoot();
    const aba = mountCamara(root, l.ler, { mostrarFotos: () => true });
    aba.show();
    expect(el.innerHTML).toContain("Carregando os dados da Câmara");
    await aguarde(); await aguarde();
    expect(l.pedidos.sort()).toEqual(["data/camara/fotos.json", "data/camara/painel.json", "data/camara/partidos.json"]);
    expect(el.innerHTML).toContain("Como a Câmara votou".slice(0, 0) + "Votações"); // the section nav is on screen
    expect(el.innerHTML).toContain("data-cm-hemi");
    aba.show(); await aguarde();
    expect(l.pedidos).toHaveLength(3);
  });
  test('com "Mostrar fotos" desligado as fotos não são baixadas', async () => {
    const l = leitor(), aba = mountCamara(fakeRoot().root, l.ler, { mostrarFotos: () => false });
    aba.show(); await aguarde(); await aguarde();
    expect(l.pedidos).not.toContain("data/camara/fotos.json");
    expect(l.pedidos).toContain("data/camara/painel.json");
  });
  test("trocar de seção e de votação repinta sem pedir nada de novo", async () => {
    const l = leitor(), { root, el, clicar } = fakeRoot();
    const aba = mountCamara(root, l.ler); aba.show(); await aguarde(); await aguarde();
    const n = l.pedidos.length;
    clicar({ cmSec: "pauta" }); expect(aba.secao).toBe("pauta"); expect(el.innerHTML).toContain("Dia a dia");
    clicar({ cmSec: "tramitacao" }); expect(el.innerHTML).toContain("Linha do tempo por órgão");
    clicar({ cmSec: "afinidade" }); expect(el.innerHTML).toContain("Matriz de afinidade");
    clicar({ cmSec: "votacao" }); clicar({ cmVi: "2" }); expect(aba.estado.vi).toBe(2);
    clicar({ cmFoco: "AAA" }); expect(aba.estado.foco).toBe("AAA"); clicar({ cmFoco: "AAA" }); expect(aba.estado.foco).toBeNull();
    clicar({ cmVi: "1" }); expect(aba.estado.foco).toBeNull(); // another roll call clears the highlight
    expect(l.pedidos).toHaveLength(n);
  });
  test("seção inválida é ignorada; clicar num deputado abre a ficha dele", async () => {
    const { root, el, clicar } = fakeRoot(), aba = mountCamara(root, leitor().ler);
    aba.show(); await aguarde(); await aguarde();
    clicar({ cmSec: "../../x" }); expect(aba.secao).toBe("votacao");
    clicar({ cmDep: "3" }); expect(aba.secao).toBe("deputado"); expect(el.innerHTML).toContain("Dep 3");
  });
  test("falha no painel mostra como gerar os dados e a próxima abertura tenta de novo", async () => {
    const falhas = new Set(["data/camara/painel.json"]), l = leitor(falhas), { root, el } = fakeRoot();
    const aba = mountCamara(root, l.ler); aba.show(); await aguarde(); await aguarde();
    expect(el.innerHTML).toContain("radar:camara");
    falhas.clear(); aba.show(); await aguarde(); await aguarde();
    expect(l.pedidos.filter((p) => p.endsWith("painel.json"))).toHaveLength(2);
    expect(el.innerHTML).toContain("data-cm-hemi");
  });
  test("painel sem votações nominais ainda abre a pauta", async () => {
    const vazio: PainelCamara = { ...painelGrande(), votacoes: [] };
    const { root, el, clicar } = fakeRoot();
    const aba = mountCamara(root, (async <T>(c: string) => (c.endsWith("painel.json") ? vazio : {}) as T) as never);
    aba.show(); await aguarde(); await aguarde();
    expect(el.innerHTML).toContain("Nenhuma votação nominal coletada");
    clicar({ cmSec: "pauta" }); expect(el.innerHTML).toContain("Dia a dia");
  });
});
