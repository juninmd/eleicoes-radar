import { describe, expect, test } from "bun:test";
import { createFornecedores, ufsPendentes } from "./fornecedores-carga.js";
import { estadoFornecedores, fornecedoresBlock } from "./fornecedores.js";
import type { Candidatura } from "./types.js";

const forn = { nome: "EMPRESA LTDA", cnpj: "11.222.333/0001-81", valor: 100, via: ["campanha"], cnae: "", empresa: null, nova: false, outros: 0, outrosTop: [], flags: [] };
const cand = (id: string, uf: string, extra: Partial<Candidatura> = {}) => ({ id, uf, nome: "X", cargo: "Deputado Federal", partido: "P", fin: {}, ...extra }) as unknown as Candidatura;

// A fake network: one response per URL, counting requests so a retry loop would show.
function rede(respostas: Record<string, Response | Error>) {
  const pedidos: string[] = [];
  const get = async (url: string) => {
    pedidos.push(url);
    const r = respostas[url];
    if (r instanceof Error) throw r;
    return r ?? new Response("not found", { status: 404 });
  };
  return { get, pedidos };
}

describe("supplier sidecar client", () => {
  test("a candidate that already carries the field (data from before the split) keeps it and never asks for the sidecar", async () => {
    const { get, pedidos } = rede({});
    const f = createFornecedores(get);
    const antigo = cand("1", "SP", { fornecedores: [forn] as never });
    const sem = [antigo];
    expect(ufsPendentes(sem, ["SP"])).toEqual([]);
    expect(pedidos).toEqual([]);
    f.aplicar(sem, "SP");
    expect(sem[0]!.fornecedores).toHaveLength(1);
  });

  test("merges the sidecar into candidates still missing the field; ids without an entry become null", async () => {
    const { get } = rede({ "data/uf/SP-forn.json": Response.json({ "10": [forn] }) });
    const f = createFornecedores(get);
    const cands = [cand("10", "SP"), cand("11", "SP"), cand("20", "BR")];
    expect(ufsPendentes(cands, ["SP", "BR"])).toEqual(["SP", "BR"]);
    await f.carregar("SP");
    f.aplicar(cands, "SP");
    expect(cands[0]!.fornecedores).toEqual([forn] as never);
    expect(cands[1]!.fornecedores).toBeNull(); // known to have none, not "not loaded"
    expect(cands[2]!.fornecedores).toBeUndefined(); // another UF: untouched
  });

  test("a missing sidecar (404: a deploy that shipped the new data without it) is a failure, never an empty list", async () => {
    const { get } = rede({});
    const f = createFornecedores(get);
    await expect(f.carregar("AC")).rejects.toThrow();
    expect(f.estado("AC")).toBe("erro"); // the dossier offers "Tentar de novo" instead of claiming there are none
    const cands = [cand("1", "AC")];
    f.aplicar(cands, "AC");
    expect(cands[0]!.fornecedores).toBeUndefined();
  });

  test("a network failure is an error state, not retried by itself; tentar() asks again", async () => {
    let falhas = 1;
    const pedidos: string[] = [];
    const f = createFornecedores(async (url) => {
      pedidos.push(url);
      if (falhas-- > 0) throw new Error("offline");
      return Response.json({ "1": [forn] });
    });
    await expect(f.carregar("SP")).rejects.toThrow();
    expect(f.estado("SP")).toBe("erro");
    await expect(f.carregar("SP")).rejects.toThrow(); // a dossier asking again must not loop the network
    expect(pedidos).toHaveLength(1);
    await f.tentar("SP");
    expect(f.estado("SP")).toBe("pronto");
    expect(pedidos).toHaveLength(2);
  });

  test("estadoDe heals a candidate that loaded after its UF's sidecar: 'pronto' only once the field is really there", async () => {
    const { get } = rede({ "data/uf/SP-forn.json": Response.json({ "10": [forn] }) });
    const f = createFornecedores(get);
    await f.carregar("SP");
    const tarde = cand("10", "SP"); // came in after the sidecar was read (e.g. a list reloaded from a new UF file)
    expect(f.estadoDe(tarde)).toBe("pronto");
    expect(tarde.fornecedores).toEqual([forn] as never);
    const semUf = cand("11", "AC");
    expect(f.estadoDe(semUf)).toBe("carregando"); // not asked yet: says loading, never pronto without the field
    expect(semUf.fornecedores).toBeUndefined();
  });

  test("concurrent requests for one UF share a single download", async () => {
    const { get, pedidos } = rede({ "data/uf/SP-forn.json": Response.json({}) });
    const f = createFornecedores(get);
    await Promise.all([f.carregar("SP"), f.carregar("SP")]);
    expect(pedidos).toHaveLength(1);
  });

  test("an HTTP error other than 404 is a failure, not an empty list", async () => {
    const f = createFornecedores(async () => new Response("boom", { status: 500 }));
    await expect(f.carregar("SP")).rejects.toThrow();
    expect(f.estado("SP")).toBe("erro");
  });
});

describe("dossier supplier block while the sidecar is unknown", () => {
  test("in flight: says it is loading, in a status region, and does not claim there are none", () => {
    const html = fornecedoresBlock(cand("1", "SP"), "carregando");
    expect(html).toContain("Carregando fornecedores…");
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/sem fornecedores|Nenhum/i);
  });

  test("failed: says it could not load and offers a retry for that UF", () => {
    const html = estadoFornecedores(cand("1", "SP"), "erro");
    expect(html).toContain("Não foi possível carregar os fornecedores");
    expect(html).toContain('data-forn-retry="SP"');
    expect(html).toContain("Tentar de novo");
  });

  test("loaded with none (null) draws nothing, as before; a list draws its section", () => {
    expect(fornecedoresBlock(cand("1", "SP", { fornecedores: null }))).toBe("");
    expect(fornecedoresBlock(cand("1", "SP", { fornecedores: [forn] as never }))).toContain("Principais fornecedores");
  });
});
