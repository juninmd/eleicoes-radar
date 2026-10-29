import { describe, expect, test } from "bun:test";
import { auditoria, governador, impressao, pontos } from "./auditoria-fixtures.js";
import { aguardando, biometriaView, faixasBio, eleicaoView, governosView, investigaView, metodoView, poderView, populacaoView, resumoView, SECOES, semDados } from "./auditoria-view.js";

const mapa = { pontos: pontos(), ufs: { SP: { d: "M0 0L10 10" } }, viewBox: [0, 0, 400, 400] };
const todas = (): string[] => {
  const a = auditoria();
  return [
    resumoView(a), eleicaoView(a, impressao(), "2022-1"), eleicaoView(a, null, "2026-1"), investigaView(a, "2022-1"), populacaoView(a, mapa, "2022"), populacaoView(a, null, "2022"),
    governosView([governador(), governador({ id: "g2", uf: "BA", arit: 1, corner: 12, corner_lift: 3, corner_top: "Cidade Q" })], 1, "g2"), biometriaView(a, "2022-1"), poderView(a), metodoView(a),
  ];
};

describe("linguagem: sinal é fato para conferir, nunca acusação", () => {
  test("nenhuma tela chama alguém ou algo de fraude, fantasma ou criminoso", () => {
    // The only allowed mentions are the disclaimers themselves ("não prova fraude", "não é sinal de fraude").
    for (const html of todas()) expect(html.replaceAll("não prova fraude", "").replaceAll("não é sinal de fraude", "")).not.toMatch(/\bfraud(e|ador|ulent)|fantasma|crimin|roubo|vai vencer|será eleito/i);
  });
  test("a moldura e o resumo repetem que inconsistência não é irregularidade", () => {
    const r = resumoView(auditoria());
    expect(r).toContain("para conferir");
    expect(r).toMatch(/não é irregularidade|Sem sinal não prova/);
  });
  test("o resumo conta o que foi testado e o que ficou para conferir", () => {
    const r = resumoView(auditoria());
    expect(r).toContain("<b>3</b> turnos");
    expect(r).toContain("<b>2</b> ficaram");
  });
});

describe("estrutura", () => {
  test("toda seção tem rótulo e a matriz do resumo abre a eleição pelo id", () => {
    expect(SECOES.map(([k]) => k)).toEqual(["resumo", "eleicao", "investiga", "populacao", "governos", "biometria", "poder", "metodo"]);
    expect(resumoView(auditoria())).toContain('data-aud-go="2026-1"');
  });
  test("a eleição sem o arquivo de impressão digital mostra carregando, não gráfico vazio", () => {
    expect(eleicaoView(auditoria(), null, "2022-1")).toContain("Carregando o gráfico");
    expect(eleicaoView(auditoria(), impressao(), "2022-1")).toContain("<svg");
  });
  test("eleição desconhecida cai na primeira em vez de quebrar", () => {
    expect(eleicaoView(auditoria(), null, "1999-1")).toContain("2022");
  });
  test("população sem o mapa pede o arquivo; com ele desenha os pontos", () => {
    expect(populacaoView(auditoria(), null, "2022")).toContain("Carregando");
    expect(populacaoView(auditoria(), mapa, "2022")).toContain("au-pt");
  });
  test("textos de dados vindos do arquivo são escapados", () => {
    const a = auditoria();
    a.para_conferir[0].nm_local = "<img src=x onerror=alert(1)>";
    a.para_conferir[0].mun = "A&B";
    const html = eleicaoView(a, null, "2022-1");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("A&amp;B");
  });
  test("estados vazios", () => {
    expect(aguardando("a auditoria")).toContain("role=\"status\"");
    expect(semDados()).toContain("radar:auditoria");
  });
});

describe("Governadores: sem nome de candidato", () => {
  test("a tela traz UF, ano e contagens, mas nenhum campo de nome", () => {
    const g = { ...governador({ id: "g1" }), a_nome: "NOME QUE NAO PODE", b_nome: "OUTRO NOME" };
    const html = governosView([g], 1, "g1");
    expect(html).not.toContain("NOME QUE NAO PODE");
    expect(html).not.toContain("OUTRO NOME");
    expect(html).toContain("Nenhum nome de candidato aparece");
  });
  test("turno 2 só lista disputas que houve; a seleção mostra o detalhe", () => {
    const g = [governador({ id: "a", turno: 1 }), governador({ id: "b", turno: 2, uf: "BA", arit: 1 })];
    const t2 = governosView(g, 2, "b");
    expect(t2).toContain('data-aud-gsel="b"');
    expect(t2).not.toContain('data-aud-gsel="a"');
    expect(t2).toContain("Aritmética");
  });
});

describe("Sem biometria", () => {
  test("diz o número, a base e o que o campo não conta", () => {
    const html = biometriaView(auditoria(), "2022-1");
    expect(html).toContain("<b>9.600</b>");
    expect(html).toContain("<b>8%</b>".replace("8%", "8,0%"));
    expect(html).toContain("não conta quem nem tinha biometria cadastrada");
    expect(html).toContain("não é irregularidade por si");
  });
  test("o seletor lista os turnos com dado e marca o aberto", () => {
    const html = biometriaView(auditoria(), "2026-2");
    expect(html).toContain('data-aud-bio="2022-1"');
    expect(html).toContain('data-aud-bio="2026-2" aria-pressed="true"');
    expect(html).toContain("RR");
  });
  test("turno desconhecido cai no último; sem o arquivo novo mostra como gerar", () => {
    expect(biometriaView(auditoria(), "1999-1")).toContain("2026");
    const velho = auditoria();
    delete velho.biometria;
    expect(biometriaView(velho, "2022-1")).toContain("bio.py agg");
  });
  test("as 21 faixas viram 7 barras sem perder nenhuma seção", () => {
    const h = [100, ...Array.from({ length: 20 }, (_, i) => i + 1)]; // 0 exato + 1..20
    const b = faixasBio(h);
    expect(b).toHaveLength(7);
    expect(b[0]).toBe(100);
    expect(b[1]).toBe(1 + 2); // 0–10%
    expect(b[5]).toBe(9 + 10); // 40–50%
    expect(b[6]).toBe(h.slice(11).reduce((x, y) => x + y, 0)); // mais de 50%
    expect(b.reduce((x, y) => x + y, 0)).toBe(h.reduce((x, y) => x + y, 0));
  });
  test("zero negativo não vira \"-0,0%\"", () => {
    const a = auditoria();
    a.biometria!.uf.push({ id: "2022-1", uf: "ZZ", secoes: 10, comp: 100, nh: 0, pct: -0 });
    expect(biometriaView(a, "2022-1")).not.toContain("-0,0");
  });
});
