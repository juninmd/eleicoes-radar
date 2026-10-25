import { describe, expect, test } from "bun:test";
import { cand, file } from "../../../web/apuracao-fixtures";
import { criarMonitor } from "./monitor";
import type { Disputa } from "./eventos";

const PRES: Disputa = { cargo: "Presidente", uf: "BR", rotulo: "Presidente", marcos: true };
const GOV: Disputa = { cargo: "Governador", uf: "AC", rotulo: "Governo AC", marcos: false };
const arq = (st: string, a: string, b: string, hg: string) => ({ ...file({ s: { ts: "100", st }, v: { tv: String(+a + +b), vv: String(+a + +b), vvc: String(+a + +b) }, cands: [cand("a1", "13", "ANA SOUZA", "1", a, "50,00"), cand("b2", "22", "BETO LIMA", "2", b, "50,00")] }), hg });

describe("monitor", () => {
  test("asks the runoff file of each race, announces what changes after the first read, and hands the candidates to the poll", async () => {
    const urls: string[] = [];
    const fila = [arq("0", "0", "0", "17:00:00"), arq("3", "5", "4", "19:01:00")];
    const eventos: string[] = [];
    const opcoes: string[][] = [];
    const m = criarMonitor({ turno: 2, disputas: [PRES], buscar: async (u) => { urls.push(u); return fila.shift(); }, onEventos: (es) => eventos.push(...es.map((e) => e.id)), onOpcoes: (c, o) => opcoes.push([c, ...o.map((x) => x.nome)]) });
    await m.rodada();
    expect(eventos).toEqual([]); // the first read only seeds
    await m.rodada();
    expect(eventos).toEqual(["Presidente-BR:inicio"]);
    expect(urls[0]).toBe("https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json");
    expect(opcoes[0]).toEqual(["Presidente · 2º turno", "Ana Souza", "Beto Lima"]);
    expect(m.ultimo()?.id).toBe("Presidente-BR:inicio");
  });
  test("a file older than one already seen is ignored (the TSE serves them out of order)", async () => {
    const fila = [arq("0", "0", "0", "17:00:00"), arq("30", "50", "40", "19:30:00"), arq("0", "0", "0", "17:00:00"), arq("31", "51", "41", "19:31:00")];
    const eventos: string[] = [];
    const m = criarMonitor({ turno: 2, disputas: [PRES], buscar: async () => fila.shift(), onEventos: (es) => eventos.push(...es.map((e) => e.id)) });
    for (let i = 0; i < 4; i++) await m.rodada();
    expect(eventos).toEqual(["Presidente-BR:inicio"]); // the zeroed file in the middle did not reset anything or repeat the start
  });
  test("one race failing does not silence the others", async () => {
    const fila = [arq("0", "0", "0", "17:00:00"), arq("3", "5", "4", "19:01:00")];
    const eventos: string[] = [];
    const m = criarMonitor({ turno: 2, disputas: [GOV, PRES], buscar: async (u) => { if (u.includes("/ac/")) throw new Error("HTTP 503"); return fila.shift(); }, onEventos: (es) => eventos.push(...es.map((e) => e.id)) });
    const erros = console.error;
    console.error = () => {};
    try { expect(await m.rodada()).toBe(true); await m.rodada(); } finally { console.error = erros; }
    expect(eventos).toEqual(["Presidente-BR:inicio"]);
  });
  test("a file that is not a results file is an error, never an event", async () => {
    const m = criarMonitor({ turno: 2, disputas: [PRES], buscar: async () => ({ html: "<p>manutenção</p>" }), onEventos: () => { throw new Error("não deveria"); } });
    const erros = console.error;
    console.error = () => {};
    try { expect(await m.rodada()).toBe(false); } finally { console.error = erros; }
  });
  test("keeps only the most recent events, newest first", async () => {
    const fila = [["0", "0", "0", "17:00:00"], ["3", "5", "4", "19:01:00"], ["55", "50", "40", "19:30:00"], ["95", "55", "40", "20:30:00"]].map((x) => arq(x[0], x[1], x[2], x[3]));
    const m = criarMonitor({ turno: 2, disputas: [PRES], guardar: 2, buscar: async () => fila.shift(), onEventos: () => {} });
    for (let i = 0; i < 4; i++) await m.rodada();
    expect(m.eventos().map((e) => e.id.split(":")[1])).toEqual(["m90", "m50"]); // "inicio" was pushed out
  });

  test("one push per round, and what a woken service worker reads is the most important event of that round, not the last one", async () => {
    // A governor's race ends with the TSE's mark in the same round the President only moves; the governor is listed after.
    const fim = (hg: string) => ({ ...file({ s: { ts: "100", st: "100" }, v: { tv: "9", vv: "9", vvc: "9" }, cands: [cand("a1", "13", "ANA SOUZA", "1", "6", "66,67", "s", "Eleito"), cand("b2", "22", "BETO LIMA", "2", "3", "33,33")] }), e: { te: "100", est: "100", c: "9", a: "1" }, hg });
    const meio = (hg: string) => arq("50", "5", "4", hg);
    let rodadaN = 0;
    const rodadas: string[][] = [];
    const m2 = criarMonitor({ turno: 2, disputas: [PRES, GOV], buscar: async (u) => (rodadaN === 0 ? meio("17:00:00") : u.includes("/ac/") ? fim("21:00:00") : meio("19:00:00")), onEventos: (es) => rodadas.push(es.map((e) => e.id)) });
    await m2.rodada();
    rodadaN = 1;
    await m2.rodada();
    expect(rodadas).toHaveLength(1); // a single call, hence a single push
    expect(rodadas[0]).toEqual(["Governador-AC:prova:a1", "Governador-AC:tse:a1", "Governador-AC:fim"]);
    expect(m2.ultimo()?.id).toBe("Governador-AC:tse:a1"); // the TSE's own mark outranks "concluída"
  });
  test("a listener that throws does not stop the next round", async () => {
    const fila = [arq("0", "0", "0", "17:00:00"), arq("3", "5", "4", "19:01:00"), arq("55", "50", "40", "19:30:00")];
    let chamadas = 0;
    const m3 = criarMonitor({ turno: 2, disputas: [PRES], buscar: async () => fila.shift(), onEventos: () => { chamadas++; throw new Error("ouvinte"); } });
    const erros = console.error;
    console.error = () => {};
    try { for (let i = 0; i < 3; i++) await m3.rodada(); } finally { console.error = erros; }
    expect(chamadas).toBe(2);
  });

  test("the operator test replaces what a woken worker reads for a while, stays out of the panel list, and gives way to the previous event", async () => {
    const fila = [arq("0", "0", "0", "17:00:00"), arq("3", "5", "4", "19:01:00")];
    const m4 = criarMonitor({ turno: 2, disputas: [PRES], testeMs: 30, buscar: async () => fila.shift(), onEventos: () => {} });
    await m4.rodada();
    await m4.rodada();
    const real = m4.ultimo();
    const e = m4.testar();
    expect(e.titulo).toBe("Teste de aviso do Radar");
    expect(e.texto).toContain("Não é um evento da apuração");
    expect(m4.ultimo()).toBe(e);
    expect(m4.eventos().some((x) => x.tipo === "teste")).toBe(false);
    await new Promise((ok) => setTimeout(ok, 80));
    expect(m4.ultimo()).toBe(real);
  });
});
