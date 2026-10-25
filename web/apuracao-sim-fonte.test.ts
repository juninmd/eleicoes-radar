import { describe, expect, test } from "bun:test";
import { criarFonteSim } from "./apuracao-sim-fonte.js";
import { PASSOS } from "./apuracao-sim.js";
import { HttpError } from "./apuracao-feed.js";
import { ufsDo } from "./apuracao-uf.js";
import { file, cand } from "./apuracao-fixtures.js";
import { parseApuracao } from "./apuracao-tse.js";
import type { Apuracao } from "./apuracao-tse.js";

const P = { Presidente: { kappa: 0.95, eta: -0.5, ratio: 1 }, Governador: { kappa: 0.8, eta: -0.7, ratio: 1 } };
const fim = PASSOS - 1;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const completo = (cands: ReturnType<typeof cand>[]) => {
  const tv = String(cands.reduce((s, c) => s + Number(c.vap), 0));
  return parseApuracao(file({ s: { ts: "100", st: "100" }, v: { tv, vv: tv, vvc: tv, vb: "0", tvn: "0" }, cands }))!;
};
const pres = (a: number, b: number, c: number) => completo([cand("r13", "13", "REAL TREZE", "1", String(a), "0"), cand("r22", "22", "REAL VINTE", "2", String(b), "0"), cand("r30", "30", "REAL TRINTA", "3", String(c), "0")]);
const gov2t = completo([cand("g1", "11", "REAL UM", "1", "450", "0", "s", "2º turno"), cand("g2", "22", "REAL DOIS", "2", "350", "0", "s", "2º turno"), cand("g3", "33", "REAL TRES", "3", "200", "0", "n", "Não eleito")]);
const govEleito = completo([cand("h1", "11", "REAL ELEITO", "1", "700", "0", "s", "Eleito"), cand("h2", "22", "REAL OUTRO", "2", "300", "0", "n", "Não eleito")]);

// A loader over fixed files, keyed by "cargo|uf"; a file can be held back to see the loading state.
function fonte({ arquivos = {} as Record<string, Apuracao | Error>, params = async () => P as Record<string, typeof P.Presidente> | null } = {}) {
  const pedidos: string[] = [];
  const presos = new Map<string, () => void>();
  const load = (url: string, signal: AbortSignal) => {
    pedidos.push(url);
    return new Promise<Apuracao>((ok, falha) => {
      const solta = () => { const a = arquivos[url] ?? (url.startsWith("Presidente|") ? pres(60, 30, 10) : new HttpError(404)); a instanceof Error ? falha(a) : ok(structuredClone(a)); };
      signal.addEventListener("abort", () => falha(Object.assign(new Error("abortado"), { name: "AbortError" })));
      if (url === "Presidente|SP" && arquivos.prender) presos.set(url, solta); else solta();
    });
  };
  let prontos = 0;
  const f = criarFonteSim({ load, url: (c, uf) => `${c}|${uf}`, params, onPronto: () => { prontos++; } });
  return { f, pedidos, presos, prontos: () => prontos };
}
const nomes = (d: Apuracao | null) => JSON.stringify(d);

describe("fonte da simulação", () => {
  test("a governor's file comes from the real final file, renamed, and closes at the real numbers", async () => {
    const { f } = fonte({ arquivos: { "Governador|RJ": govEleito } });
    const p = { cargo: "Governador" as const, uf: "RJ", turno: 1 as const };
    f.preparar(p);
    expect(f.quadro(p, 30).status).toBe("carregando");
    await flush();
    expect(f.pronto(p)).toBe(true);
    const d = f.quadro(p, fim).dados!;
    expect(d.candidatos.map((c) => c.votos)).toEqual([700, 300]);
    expect(d.candidatos[0]!.situacao).toBe("Eleito");
    expect(nomes(d)).not.toContain("REAL");
    expect(d.versao.data).toBe("04/10/2026");
  });

  test("the president's national file is the sum of the 28 files and waits for all of them", async () => {
    const { f, pedidos, presos } = fonte({ arquivos: { prender: new Error("x") } });
    const br = { cargo: "Presidente" as const, uf: "BR", turno: 1 as const };
    f.preparar(br);
    await flush();
    expect(new Set(pedidos)).toEqual(new Set(ufsDo("Presidente").map((uf) => `Presidente|${uf}`)));
    expect(f.quadro(br, fim).status).toBe("carregando");
    presos.get("Presidente|SP")!();
    await flush();
    const d = f.quadro(br, fim).dados!;
    expect(d.candidatos[0]!.votos).toBe(60 * 28);
    expect(d.candidatos[0]!.situacao).toBe("Eleito");
    // a state slice never says "Eleito"
    expect(f.quadro({ ...br, uf: "BA" }, fim).dados!.candidatos.every((c) => c.situacao === "")).toBe(true);
  });

  test("the president's runoff takes the two first of the country, in every state", async () => {
    const arquivos: Record<string, Apuracao> = { "Presidente|SP": pres(10, 20, 70) }; // SP alone leans to 30; the country to 13 and 22
    const { f } = fonte({ arquivos });
    const br = { cargo: "Presidente" as const, uf: "BR", turno: 2 as const };
    f.preparar(br);
    await flush();
    const sp = f.quadro({ ...br, uf: "SP" }, fim).dados!;
    expect(sp.candidatos.map((c) => c.id).sort()).toEqual([f.idDe("Presidente", "SP", "13")!, f.idDe("Presidente", "SP", "22")!].sort());
    const d = f.quadro(br, fim).dados!;
    expect(d.candidatos.length).toBe(2);
    expect(d.candidatos.map((c) => c.situacao)).toEqual(["Eleito", "Não eleito"]);
    expect(d.versao.data).toBe("25/10/2026");
  });

  test("a governor's runoff exists only where the TSE sent two candidates to it", async () => {
    const { f } = fonte({ arquivos: { "Governador|SP": gov2t, "Governador|RJ": govEleito } });
    const sp = { cargo: "Governador" as const, uf: "SP", turno: 2 as const };
    f.preparar(sp); f.preparar({ ...sp, uf: "RJ" });
    await flush();
    const d = f.quadro(sp, fim).dados!;
    expect(d.candidatos.map((c) => c.id).sort()).toEqual([f.idDe("Governador", "SP", "11")!, f.idDe("Governador", "SP", "22")!].sort());
    expect(d.candidatos.map((c) => c.situacao)).toEqual(["Eleito", "Não eleito"]);
    expect(f.quadro(sp, 30).dados!.candidatos.every((c) => c.situacao === "")).toBe(true);
    expect(f.quadro({ ...sp, uf: "RJ" }, fim).status).toBe("ausente");
  });

  test("a race whose file is missing or broken says so instead of inventing one", async () => {
    const { f } = fonte({ arquivos: { "Senador|AC": new Error("sem conexão com o TSE") } });
    const ac = { cargo: "Senador" as const, uf: "AC", turno: 1 as const };
    f.preparar(ac); f.preparar({ ...ac, uf: "AM" });
    await flush();
    expect(f.quadro(ac, 10)).toEqual({ status: "erro", dados: null, erro: "sem conexão com o TSE" });
    expect(f.quadro({ ...ac, uf: "AM" }, 10).status).toBe("ausente");
  });

  test("without the runoff parameters the runoff is an error, and leaving the simulation lets it try again", async () => {
    let falhar = true;
    const { f } = fonte({ arquivos: { "Governador|SP": gov2t }, params: async () => (falhar ? null : P) });
    const sp = { cargo: "Governador" as const, uf: "SP", turno: 2 as const };
    f.preparar(sp);
    await flush();
    expect(f.quadro(sp, fim).status).toBe("erro");
    f.parar(); falhar = false;
    f.preparar(sp);
    await flush();
    expect(f.quadro(sp, fim).status).toBe("ok");
  });

  test("leaving mid-load drops what was loading; coming back loads it again", async () => {
    const { f, pedidos, presos } = fonte({ arquivos: { prender: new Error("x") } });
    const sp = { cargo: "Presidente" as const, uf: "SP", turno: 1 as const };
    f.preparar(sp);
    await flush();
    f.parar();
    await flush();
    expect(f.pronto(sp)).toBe(false);
    presos.clear();
    const antes = pedidos.length;
    f.preparar(sp);
    await flush();
    expect(pedidos.length).toBeGreaterThan(antes);
    expect(pedidos.filter((u) => u === "Presidente|SP").length).toBe(2);
  });

  test("a national view of another office loads every state", async () => {
    const { f, pedidos } = fonte();
    f.preparar({ cargo: "Senador", uf: "SP", turno: 1 }, true);
    await flush();
    expect(pedidos.length).toBe(27);
    expect(f.pronto({ cargo: "Senador", uf: "SP", turno: 1 }, true)).toBe(true);
  });
});
