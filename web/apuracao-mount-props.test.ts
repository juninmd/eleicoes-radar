import { describe, expect, test } from "bun:test";
import { chanceProps, criarMunicipais, exteriorProps } from "./apuracao-mount-props.js";
import { createChance } from "./apuracao-chance.js";
import { file, cand } from "./apuracao-fixtures.js";
import { parseApuracao } from "./apuracao-tse.js";
import type { EstadoMun } from "./apuracao-mount-props.js";
import type { MunArquivo, MunIndice } from "./apuracao-municipios.js";
import type { Contexto } from "./apuracao-mount.js";

const arq: MunArquivo = { cargo: "Governador", uf: "AC", ano: 2026, a: { n: "11", nome: "REAL UM", partido: "RRR", sq: "r1" }, b: { n: "22", nome: "REAL DOIS", partido: "SSS", sq: "r2" }, cidades: [["1", "RIO BRANCO", "AC", 600, 400, 100]] };
const P = { kappa: 0.8, eta: -0.7, ratio: 1 };
const erros = { cidade: 5, porTamanho: [{ ate: null, rmse: 4.3 }], nacionalSemAncora: 5.1, nacionalSemAncoraRmse: 7.1, acertoVencedor: 90, erroVotos: 8, disputas: 74, anos: [2002, 2022] };
const indice = { geradoEm: "", modeloEm: "", params: { Presidente: P, Governador: P }, erros: { Presidente: erros, Governador: erros }, disputas: [{ cargo: "Governador", uf: "AC", arquivo: "Governador-AC.json", a: arq.a, b: arq.b }] } as MunIndice;
const ctx = { cargo: "Governador", uf: "AC", byId: new Map(), avatar: () => "", exp: { corridas: [{ cargo: "Governador", uf: "AC", pesquisas: 3, confrontos: [{ a: "r1", b: "r2", qa: 0.55 }] }] } } as unknown as Contexto;
const snapDe = (ids: [string, string], nomes: [string, string]) => ({ url: null, status: "ok" as const, buscadoEm: new Date(), erro: null,
  dados: parseApuracao(file({ cands: [cand(ids[0], "11", nomes[0], "1", "60", "60,00"), cand(ids[1], "22", nomes[1], "2", "40", "40,00")], v: { vv: "100", vvc: "100" } })) });
const estado = (over: Partial<EstadoMun> = {}): EstadoMun => ({ ctx, turno: 2, snap: snapDe(["r1", "r2"], ["REAL UM", "REAL DOIS"]), nac: null, indice, disputa: indice.disputas[0]!, arquivo: arq, simulado: false, idSim: () => null, ...over });

describe("props da chance", () => {
  test("real count: the TSE ids of the municipal file, the poll anchor of the pair, names from the count", () => {
    const p = chanceProps(estado(), createChance())!;
    expect(p.estado).toBe("ok");
    expect(p.a?.nome).toBe("REAL UM");
    expect(p.leitura?.ancora).toBe(0.55);
    expect(p.leitura?.chance?.a).toBeGreaterThan(0.5);
  });

  test("simulation: fictional ids, no poll anchor, and never a real name, even before the first file", () => {
    const sim = estado({ simulado: true, idSim: (_c, _u, n) => `sim-${n}`, snap: snapDe(["sim-11", "sim-22"], ["FICTÍCIA UM", "FICTÍCIA DOIS"]) });
    const p = chanceProps(sim, createChance())!;
    expect(p.a?.nome).toBe("FICTÍCIA UM");
    expect(p.leitura?.ancora).toBeNull();
    expect(JSON.stringify(p)).not.toContain("REAL");
    const cedo = chanceProps({ ...sim, snap: null }, createChance())!;
    expect(cedo.estado).toBe("carregando");
  });

  test("the 1st round has no chance; a race with no runoff says so; the president waits for every state", () => {
    expect(chanceProps(estado({ turno: 1 }), createChance())).toBeNull();
    expect(chanceProps(estado({ disputa: null }), createChance())!.estado).toBe("sem-disputa");
    expect(chanceProps(estado({ ctx: { ...ctx, cargo: "Presidente", uf: "BR" }, nac: { cargo: "Presidente", ciclo: 0, buscadoEm: null, ufs: {} } }), createChance())!.estado).toBe("carregando");
    expect(chanceProps(estado({ indice: undefined }), createChance())!.estado).toBe("carregando");
  });

  test("the exterior is the president's only; its city table loads with the municipal file", () => {
    expect(exteriorProps(estado())).toBeNull();
    const pres = estado({ ctx: { ...ctx, cargo: "Presidente", uf: "BR" } });
    expect(exteriorProps({ ...pres, indice: undefined })!.mun).toBeUndefined();
    expect(exteriorProps({ ...pres, indice: null })!.mun).toBeNull();
    expect(exteriorProps(pres)!.mun).toBe(arq);
  });
});

describe("arquivos municipais", () => {
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

  test("loads the index, then the file of the open race, once", async () => {
    const pedidos: string[] = [];
    const getJson = <T>(url: string) => { pedidos.push(url); return Promise.resolve((url.endsWith("index.json") ? indice : arq) as T); };
    const m = criarMunicipais(getJson, () => {});
    m.carregar(ctx);
    await flush();
    m.carregar(ctx);
    await flush();
    expect(pedidos).toEqual(["data/municipal/index.json", "data/municipal/Governador-AC.json"]);
    expect(m.arquivo(ctx)).toBe(arq);
  });

  test("a failed index is not asked again in a loop, only on the next visit", async () => {
    const pedidos: string[] = [];
    const getJson = <T>(url: string): Promise<T> => { pedidos.push(url); return Promise.reject(new Error("HTTP 404")); };
    const m = criarMunicipais(getJson, () => {});
    m.carregar(ctx);
    await flush();
    expect(pedidos.length).toBe(1);
    expect(m.indice()).toBeNull();
    m.carregar(ctx);
    await flush();
    expect(pedidos.length).toBe(2);
  });
});
