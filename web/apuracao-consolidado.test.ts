import { describe, expect, test } from "bun:test";
import { consolidar, renderConsolidado } from "./apuracao-consolidado.js";
import { parseApuracao } from "./apuracao-tse.js";
import { cand, file } from "./apuracao-fixtures.js";
import type { UfEstado } from "./apuracao-uf.js";

const par = (a: string, b: string) => [cand("a1", "10", "ANA SOUZA", "1", a, "50,00"), cand("b2", "20", "BETO LIMA", "2", b, "50,00")];
const arq = (a: string, b: string, s = {}) => parseApuracao(file({ cands: par(a, b), s }))!;
const uf = (d: ReturnType<typeof arq>, status: "ok" | "erro" | "ausente" = "ok"): UfEstado => ({ status, dados: d, erro: null, buscadoEm: new Date() });
const nacDe = (ufs: Record<string, UfEstado>) => ({ cargo: "Presidente" as const, ciclo: 1, buscadoEm: new Date(), ufs });
const cor = () => "#123456";

describe("Total consolidado (estados + exterior)", () => {
  test("soma os estados e o exterior por candidatura e mostra a parte do exterior", () => {
    const c = consolidar(nacDe({ SP: uf(arq("600", "400")), RJ: uf(arq("300", "200")), ZZ: uf(arq("50", "100")) }))!;
    const [a, b] = c.candidatos;
    expect([a.id, a.estados, a.exterior, a.total]).toEqual(["a1", 900, 50, 950]);
    expect([b.id, b.estados, b.exterior, b.total]).toEqual(["b2", 600, 100, 700]);
    expect(c.validos).toEqual({ estados: 1500, exterior: 150, total: 1650 });
    expect(c.exterior).toBe("ok");
    expect(a.pct + b.pct).toBeCloseTo(1, 10);
  });

  test("a soma é conferida com o arquivo nacional: igual ou com a diferença dita", () => {
    const nac = nacDe({ SP: uf(arq("600", "400")), ZZ: uf(arq("50", "100")) });
    expect(consolidar(nac, arq("650", "500"))!.confere).toEqual({ diferenca: 0 });
    const html = renderConsolidado(consolidar(nac, arq("640", "500")), cor);
    expect(html).toContain("difere do arquivo nacional do TSE em 10 votos");
    expect(renderConsolidado(consolidar(nac, arq("650", "500")), cor)).toContain("confere com o arquivo nacional");
  });

  test("exterior sem arquivo ou desatualizado é dito, sem inventar números", () => {
    const sem = renderConsolidado(consolidar(nacDe({ SP: uf(arq("600", "400")), ZZ: { status: "ausente", dados: null, erro: null, buscadoEm: null } })), cor);
    expect(sem).toContain("Exterior ainda sem arquivo do TSE");
    expect(sem).toContain("<td>–</td>");
    const velho = renderConsolidado(consolidar(nacDe({ SP: uf(arq("600", "400")), ZZ: uf(arq("50", "100"), "erro") })), cor);
    expect(velho).toContain("Exterior desatualizado");
  });

  test("sem nenhum arquivo não há bloco; nada é chamado de vencedor", () => {
    expect(consolidar(null)).toBeNull();
    expect(consolidar(nacDe({ SP: { status: "carregando", dados: null, erro: null, buscadoEm: null } }))).toBeNull();
    expect(renderConsolidado(null, cor)).toBe("");
    const html = renderConsolidado(consolidar(nacDe({ SP: uf(arq("600", "400")), ZZ: uf(arq("50", "100")) })), cor);
    expect(html).not.toMatch(/\beleit[oa]s?\b|vencedor|venceu|vai ganhar/i);
  });
});
