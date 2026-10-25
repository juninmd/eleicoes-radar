import { describe, expect, test } from "bun:test";
import { observar, renderNoticias, vazio } from "./apuracao-aovivo-noticias.js";
import type { Apuracao } from "./apuracao-tse.js";

const arq = (votos: number[], tot: number, hora: string, situacao: string[] = []): Apuracao => {
  const soma = votos.reduce((a, v) => a + v, 0);
  return {
    fase: tot >= 1000 ? "concluida" : "parcial", versao: { data: "25/10/2026", hora }, secoes: { totalizadas: tot, total: 1000 },
    candidatos: votos.map((v, i) => ({ id: `c${i}`, nome: `CAND ${i}`, partido: "P", votos: v, pct: v / soma, situacao: situacao[i] ?? "" })),
  } as unknown as Apuracao;
};
const f = (dados: Apuracao) => [{ cargo: "Governador" as const, uf: "SP", dados }];
const txt = (e: ReturnType<typeof vazio>) => e.itens.map((i) => `${i.tipo}:${i.texto.replace(/<[^>]+>/g, "")}`);

describe("acontecimentos do ao vivo", () => {
  test("o primeiro arquivo só fixa a referência", () => {
    expect(observar(vazio(), f(arq([60, 40], 500, "20:00:00"))).itens).toEqual([]);
  });
  test("virada e marco entre dois arquivos", () => {
    let e = observar(vazio(), f(arq([60, 40], 500, "20:00:00")));
    e = observar(e, f(arq([50, 55], 620, "20:05:00")));
    expect(txt(e).some((t) => t.startsWith("virada:") && t.includes("Cand 1"))).toBe(true);
    expect(txt(e).some((t) => t.startsWith("marco:") && t.includes("60%"))).toBe(true);
  });
  test("mesmo arquivo duas vezes não repete", () => {
    let e = observar(vazio(), f(arq([60, 40], 500, "20:00:00")));
    e = observar(e, f(arq([50, 55], 620, "20:05:00")));
    const n = e.itens.length;
    expect(observar(e, f(arq([50, 55], 620, "20:05:00"))).itens.length).toBe(n);
  });
  test("eleito marcado pelo TSE aparece mesmo no primeiro arquivo, uma vez", () => {
    let e = observar(vazio(), f(arq([60, 40], 1000, "21:00:00", ["Eleito", ""])));
    expect(txt(e)[0]).toContain("eleito:");
    e = observar(e, f(arq([61, 39], 1000, "21:01:00", ["Eleito", ""])));
    expect(e.itens.filter((i) => i.tipo === "eleito").length).toBe(1);
  });
  test("deputado não tem virada", () => {
    const d = (v: number[], t: number, h: string) => [{ cargo: "Deputado Federal" as const, uf: "SP", dados: arq(v, t, h) }];
    let e = observar(vazio(), d([60, 40], 500, "20:00:00"));
    e = observar(e, d([40, 60], 510, "20:01:00"));
    expect(e.itens.some((i) => i.tipo === "virada")).toBe(false);
  });
  test("vazio mostra aviso e escapa HTML", () => {
    expect(renderNoticias([])).toContain("aparecem aqui");
  });
});
