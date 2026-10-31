import { describe, expect, test } from "bun:test";
import { afinidade, assentos, DURACAO_PADRAO, empacotarDia, lugares, mds, orientacaoDe, passos, porUf, preparar, saldo } from "./camara-dados.js";
import { EVENTOS, HOJE, painel, painelGrande, PROPOSICAO, V1 } from "./camara-fixtures.js";

describe("orientacaoDe", () => {
  test("usa a entrada do próprio partido e, sem ela, a da federação", () => {
    expect(orientacaoDe("AAA", V1.orient)).toEqual({ voto: "Sim", federacao: false });
    expect(orientacaoDe("CCC", V1.orient)).toEqual({ voto: "Sim", federacao: true });
  });
  test("bloco com nome cortado e partido sem entrada não viram orientação", () => {
    expect(orientacaoDe("ZZZ", [["B", "Bl UniPpPsd...", "Sim"]])).toBeNull();
    expect(orientacaoDe("PCdoB", [["B", "Fdr PT-PCdoB-PV", "Não"]])?.voto).toBe("Não");
  });
});

describe("preparar", () => {
  const p = painel(), pr = preparar(p, V1);
  test("conta os votos e marca se seguiu a orientação", () => {
    expect(pr.contagem).toEqual({ sim: 3, nao: 3, abs: 0, outros: 0 });
    const por = Object.fromEntries(pr.partidos.map((q) => [q.partido, q]));
    expect(por.AAA).toMatchObject({ n: 2, seguiu: 1, diferente: 1, orient: "Sim", federacao: false });
    expect(por.BBB).toMatchObject({ seguiu: 2, diferente: 0 });
    expect(por.CCC).toMatchObject({ seguiu: 2, orient: "Sim", federacao: true });
  });
  test('"Liberado" e partido sem entrada ficam sem orientação própria', () => {
    const pr2 = preparar(p, painel().votacoes[1]!);
    expect(pr2.partidos.find((q) => q.partido === "BBB")).toMatchObject({ seguiu: 0, diferente: 0, orient: "Liberado" });
    expect(pr2.linhas.filter((l) => l.partido === "BBB").every((l) => l.seg === "sem")).toBe(true);
    const pr3 = preparar(p, painel().votacoes[2]!);
    expect(pr3.linhas.every((l) => l.seg === "sem")).toBe(true);
  });
});

describe("hemiciclo", () => {
  test("um assento por voto, ordenados do ângulo maior para o menor, e raio positivo", () => {
    for (const n of [6, 120, 428, 513]) {
      const a = assentos(n);
      expect(a.pts).toHaveLength(n);
      expect(a.raio).toBeGreaterThanOrEqual(3);
      expect(a.pts.every((s, i) => i === 0 || s.t <= a.pts[i - 1]!.t + 1e-9)).toBe(true);
    }
  });
  test("agrupar por partido segue a ordem alfabética, por voto segue Sim, Não, outros", () => {
    const pr = preparar(painel(), V1), a = assentos(pr.linhas.length);
    const porPartido = lugares(pr.linhas, "partido", a.pts), porVoto = lugares(pr.linhas, "voto", a.pts);
    const sim = pr.linhas.map((l, i) => [l.voto, a.pts.indexOf(porVoto[i]!)] as const).filter(([v]) => v === 0).map(([, k]) => k);
    const nao = pr.linhas.map((l, i) => [l.voto, a.pts.indexOf(porVoto[i]!)] as const).filter(([v]) => v === 1).map(([, k]) => k);
    expect(Math.max(...sim)).toBeLessThan(Math.min(...nao));
    const aaa = pr.linhas.map((l, i) => [l.partido, a.pts.indexOf(porPartido[i]!)] as const).filter(([p]) => p === "AAA").map(([, k]) => k);
    expect(Math.max(...aaa)).toBe(1); // AAA is first alphabetically: seats 0 and 1
  });
  test("mapa de estados: saldo vai de -1 a 1 e o partido em destaque filtra", () => {
    const pr = preparar(painel(), V1), todos = porUf(pr.linhas, null), so = porUf(pr.linhas, "AAA");
    expect(todos.SP).toMatchObject({ n: 2, sim: 1, nao: 1 });
    expect(saldo(todos.SP!)).toBe(0);
    expect(saldo(todos.RJ!)).toBe(-1);
    expect(so.RJ!.n).toBe(0);
  });
});

describe("afinidade", () => {
  // two parties that always vote the same, one that always votes the opposite, over enough roll calls
  const p = painelGrande();
  const a = afinidade(p.votacoes.map((v) => preparar(p, v)));
  test("pares que votam igual têm afinidade 1 e opostos têm 0", () => {
    const i = a.ps.indexOf("AAA"), j = a.ps.indexOf("BBB"), k = a.ps.indexOf("CCC");
    expect(a.A[i]![j]).toBeCloseTo(1); expect(a.A[i]![k]).toBeCloseTo(0);
    expect(a.A[i]![i]).toBe(1);
    expect(a.comum[i]![j]).toBe(4);
    expect(a.coesao[i]).toBeCloseTo(1);
  });
  test("mapa 2D mantém iguais juntos e opostos longe, dentro da caixa", () => {
    const i = a.ps.indexOf("AAA"), j = a.ps.indexOf("BBB"), k = a.ps.indexOf("CCC");
    const d = (x: number, y: number) => Math.hypot(a.X[x]! - a.X[y]!, a.Y[x]! - a.Y[y]!);
    expect(d(i, j)).toBeLessThan(d(i, k));
    expect([...a.X, ...a.Y].every((x) => x >= 0 && x <= 100)).toBe(true);
    expect(a.proxima).toHaveLength(a.ps.length);
    expect(new Set(a.proxima).size).toBe(a.ps.length);
  });
  test("poucas votações em comum viram afinidade neutra e poucos partidos não quebram o mds", () => {
    const poucos = afinidade([preparar(painel(), V1)]);
    expect(poucos.ps.length).toBeLessThan(3); // benches smaller than 8: not enough to compare
    expect(mds([[0, 1], [1, 0]]).X).toHaveLength(2);
  });
});

describe("pauta e tramitação", () => {
  test("barras que se sobrepõem vão para linhas diferentes e as que não, dividem a linha", () => {
    const { barras, linhas } = empacotarDia(EVENTOS.filter((e) => e.inicio.startsWith("2026-11-03")));
    expect(linhas).toBe(2);
    expect(barras.map((b) => b.linha)).toEqual([0, 1]);
    const fim = barras[0]!.fim - barras[0]!.ini;
    expect(fim).toBe(DURACAO_PADRAO);
    const sozinho = empacotarDia([EVENTOS[0]!, { ...EVENTOS[0]!, id: 1, inicio: "2026-11-03T18:00" }]);
    expect(sozinho.linhas).toBe(1);
  });
  test("dias por órgão somam o intervalo até hoje", () => {
    const { passos: ps, porOrgao } = passos(PROPOSICAO, HOJE);
    expect(ps).toHaveLength(4);
    expect(Object.values(porOrgao).reduce((a, b) => a + b, 0)).toBe(Math.round((Date.parse("2026-10-31") - Date.parse("2026-01-10")) / 864e5));
    expect(porOrgao.CCJC).toBe(Math.round((Date.parse("2026-10-14") - Date.parse("2026-01-15")) / 864e5));
  });
});
