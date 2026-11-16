import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { historicoView, turnoDe, estadosView } from "./historico-view.js";
import { mountHistorico } from "./historico.js";
import { de1989, deMunicipal, eleitoDe, type HAno } from "../src/radar/hist/presidencial.js";

const c = (n: string, nome: string, partido: string, v: number, uf: Record<string, number>) => ({ n, nome, partido, v, uf });
const anos = (): HAno[] => [
  { ano: 1994, eleito: "45", turnos: [{ t: 1, total: 100, cands: [c("45", "FERNANDO HENRIQUE", "PSDB", 60, { SP: 40, BA: 20 }), c("13", "LULA", "PT", 40, { SP: 10, BA: 30 })] }] },
  { ano: 2022, eleito: "13", turnos: [
    { t: 1, total: 100, cands: [c("13", "LULA", "PT", 48, { SP: 20, BA: 28 }), c("22", "BOLSONARO", "PL", 43, { SP: 30, BA: 13 }), c("12", "CIRO", "PDT", 9, { SP: 5, BA: 4 })] },
    { t: 2, total: 100, cands: [c("13", "LULA", "PT", 51, { SP: 20, BA: 31 }), c("22", "BOLSONARO", "PL", 49, { SP: 30, BA: 19 })] }] },
];

let doc: unknown;
beforeEach(() => { doc = (globalThis as { document?: unknown }).document; (globalThis as { document?: unknown }).document = { activeElement: null }; });
afterEach(() => { (globalThis as { document?: unknown }).document = doc; });

describe("histórico", () => {
  test("o eleito é o líder do último turno, não o texto do TSE", () => {
    expect(eleitoDe(anos()[1].turnos)).toBe("13");
  });
  test("ano com turno único não oferece botão de 2º turno e o turno pedido cai no último", () => {
    const html = historicoView(anos(), { ano: 1994, turno: 2 });
    expect(html).not.toContain("data-his-turno");
    expect(html).toContain("turno único");
    expect(turnoDe(anos()[0], 2).t).toBe(1);
  });
  test("2022 mostra os dois turnos e marca o eleito só no último", () => {
    const html = historicoView(anos(), { ano: 2022, turno: 2 });
    expect(html).toContain('data-his-turno="1"');
    expect(html.match(/his-sel/g)?.length).toBe(1);
    expect(historicoView(anos(), { ano: 2022, turno: 1 })).not.toContain("his-sel\">eleito");
  });
  test("estados: líder e vantagem em pontos", () => {
    const html = estadosView(anos()[1].turnos[1]);
    expect(html).toContain("Bolsonaro"); // SP
    expect(html).toContain("+20,0 pp"); // SP 30 x 20 de 50
  });
  test("nome vindo do TSE é escapado", () => {
    const a = anos(); a[1].turnos[1].cands[0].nome = "<img onerror=x>";
    expect(historicoView(a, { ano: 2022, turno: 2 })).not.toContain("<img");
  });
  test("1989: os dois turnos vêm do código do turno (campo 4), não do campo 8", () => {
    const l = (turno: string, nr: string, urna: string, uf: string, v: number) => `"x";"y";"1989";"${turno}";"E";"${uf}";"BR";"1";"${nr}";"-3";"N";"${urna}";"PRESIDENTE";"-3";"#NE#";"2";"DEFERIDO";"3";"S";"${nr}";"P";"PN";"-3";"C";"CC";"${v}"`;
    const a = de1989([l("1", "20", "COLLOR", "SP", 5), l("1", "13", "LULA", "SP", 4), l("2", "20", "COLLOR", "SP", 6), l("2", "13", "LULA", "SP", 7)].join("\n"));
    expect(a.turnos.map((t) => t.total)).toEqual([9, 13]);
    expect(a.eleito).toBe("13");
  });
  test("deMunicipal soma por UF e só cria 2º turno se houve voto", () => {
    const race = { cargo: "Presidente" as const, uf: "BR", cands: [{ n: "1", nome: "A", partido: "X", sq: "", sit: "" }, { n: "2", nome: "B", partido: "Y", sq: "", sit: "" }], mun: { 1: { nome: "m", uf: "SP", v1: [3, 1] }, 2: { nome: "n", uf: "SP", v1: [2, 5] } } };
    const r = deMunicipal(race);
    expect(r.turnos.length).toBe(1);
    expect(r.turnos[0].cands[0]).toMatchObject({ n: "2", v: 6, uf: { SP: 6 } });
  });
  test("a aba carrega o JSON uma vez, troca de ano e mostra erro sem dados", async () => {
    let html = "", clique: ((e: unknown) => void) | null = null, pedidos = 0;
    const root = { get innerHTML() { return html; }, set innerHTML(v: string) { html = v; }, addEventListener: (_: string, f: (e: unknown) => void) => { clique = f; }, contains: () => false, querySelector: () => null } as unknown as HTMLElement;
    const m = mountHistorico(root, (async () => { pedidos++; return { anos: anos() }; }) as never);
    m.show(); m.show();
    await new Promise((r) => setTimeout(r, 0));
    expect(pedidos).toBe(1);
    expect(html).toContain("2022");
    clique!({ target: { closest: () => ({ dataset: { hisAno: "1994" } }) } });
    expect(m.estado.ano).toBe(1994);
    const vazio = { innerHTML: "", addEventListener() {}, contains: () => false, querySelector: () => null } as unknown as HTMLElement;
    const f = mountHistorico(vazio, (async () => { throw new Error("404"); }) as never);
    f.show(); await new Promise((r) => setTimeout(r, 0));
    expect(vazio.innerHTML).toContain("radar:presidencial");
  });
});
