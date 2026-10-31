import { describe, expect, test } from "bun:test";
import { afinidade, preparar, porUf } from "./camara-dados.js";
import { afinidadeView, buscarDeputados, casaEvento, deputadoView, dicaDeputado, estadoInicial, fichaDeputado, foto, legenda, listaEventos, mapaBlocos, moldura, pautaView, registroProp, tramitacaoView, votacaoView } from "./camara-view.js";
import type { Ctx, Ficha } from "./camara-view.js";
import { EVENTOS, HOJE, INJETADO, painel, painelGrande, PROPOSICAO } from "./camara-fixtures.js";

const JPEG = "data:image/jpeg;base64,/9j/AAA=", PNG = "data:image/png;base64,iVBORw0KGgo=";
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ fotos: { "1": JPEG }, partidos: { AAA: { nome: "Alfa", logo: PNG }, BBB: { nome: "Beta", logo: null } }, mostrarFotos: true, ...o });
const p = painel(), preps = p.votacoes.map((v) => preparar(p, v));
const fichas: Ficha[] = [{ dep: 0, id: 1, nome: "Ana Alfa", uf: "SP", partido: "AAA" }, { dep: 5, id: 6, nome: INJETADO, uf: "BA", partido: "CCC" }];
const todas = () => {
  const e = estadoInicial(), pr = preps[0]!, g = painelGrande(), a = afinidade(g.votacoes.map((v) => preparar(g, v)));
  return [
    votacaoView(pr, preps, { ...e, foco: "AAA" }, ctx(), porUf(pr.linhas, "AAA")),
    deputadoView(fichas, { ...e, dep: 0, dq: "Ana" }, fichas, preps, ctx()),
    pautaView(p.pauta, e, ctx()), tramitacaoView(p.proposicoes, e, HOJE), afinidadeView(a, e, ctx()),
    moldura("votacao", "", p),
  ].join("\n");
};

describe("fotos e logos", () => {
  test("foto só entra como data: URI de JPEG; sem foto, sem pref ou com src estranho, vira iniciais", () => {
    expect(foto(ctx(), 1, "Ana Alfa")).toContain(`src="${JPEG}"`);
    expect(foto(ctx({ mostrarFotos: false }), 1, "Ana Alfa")).toContain("AA");
    expect(foto(ctx({ mostrarFotos: false }), 1, "Ana Alfa")).not.toContain("<img");
    expect(foto(ctx({ fotos: { "1": "https://evil.example/x.jpg" } }), 1, "Ana Alfa")).not.toContain("<img");
    expect(foto(ctx({ fotos: { "1": 'data:image/jpeg;base64,AA" onerror="x' } }), 1, "Ana Alfa")).not.toContain("onerror");
    expect(foto(ctx(), 2, "Bruno Alfa")).toContain('class="cm-foto ini"'); // no entry for this id
    const l = preps[0]!.linhas[0]!; expect(l.id).toBe(1); expect(dicaDeputado(l, ctx())).toContain(JPEG); // the photo is keyed by the Câmara id, not by the table index
  });
  test("logo só como PNG data:; sem logo o selo neutro leva as iniciais da sigla, e a sigla sempre aparece", () => {
    expect(legenda(ctx(), "AAA")).toContain(PNG);
    expect(legenda(ctx(), "BBB")).toContain("cm-logo mono");
    expect(legenda(ctx({ partidos: { AAA: { nome: "x", logo: "http://x/y.png" } } }), "AAA")).not.toContain("http://x");
    for (const s of ["AAA", "BBB", "CCC"]) expect(legenda(ctx(), s)).toContain(`<b>${s}</b>`);
  });
  test("a dica do hemiciclo mostra nome, partido, UF, voto e a orientação", () => {
    const l = preps[0]!.linhas.find((x) => x.partido === "AAA" && x.voto === 1)!;
    const html = dicaDeputado(l, ctx());
    expect(html).toContain("Bruno Alfa"); expect(html).toContain("AAA-SP"); expect(html).toContain("Votou diferente da orientação"); expect(html).toContain("(Sim)");
  });
});

describe("texto das telas", () => {
  test("nome vindo da API é escapado em todo lugar", () => {
    const html = todas() + deputadoView(buscarDeputados(fichas, "img"), { ...estadoInicial(), dq: "img" }, fichas, preps, ctx()) + fichaDeputado(fichas[1]!, preps, ctx()) + dicaDeputado(preps[0]!.linhas.find((l) => l.nome.startsWith("<"))!, ctx());
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
  test("invariantes de neutralidade: nada de fraude, previsão de resultado, ranking de pessoas ou lado político", () => {
    const html = todas();
    expect(html.replace("sem nota e sem ranking", "")).not.toMatch(/fraude|fantasma|vai (ser )?aprovad|ser[aá] aprovad|vai vencer|vencedor|vai ganhar|melhor deputado|pior deputado|ranking/i);
    expect(html.replace(/Não há classificação de esquerda ou direita/g, "")).not.toMatch(/esquerd|direita/i);
    expect(html).toContain("Não há classificação de esquerda ou direita");
  });
  test("sem CPF nem identificador pessoal além do id público da Câmara", () => {
    expect(todas()).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(todas()).not.toMatch(/(?<!\d)\d{11}(?!\d)/);
  });
  test("o hemiciclo diz que a posição é só agrupamento e o aviso explica a orientação", () => {
    const h = votacaoView(preps[0]!, preps, estadoInicial(), ctx(), porUf(preps[0]!.linhas, null));
    expect(h).toContain("só agrupamento, não posição política");
    expect(h).toContain("não um julgamento");
    expect(h).toContain("data-cm-hemi");
  });
});

describe("votações", () => {
  test("partido em destaque lista quem votou diferente e filtra o mapa de estados", () => {
    const h = votacaoView(preps[0]!, preps, { ...estadoInicial(), foco: "AAA" }, ctx(), porUf(preps[0]!.linhas, "AAA"));
    expect(h).toContain("1 deputado votou diferente");
    expect(h).toContain('data-cm-dep="1"');
    expect(h).toContain("Só a bancada do AAA");
    expect(mapaBlocos(porUf(preps[0]!.linhas, "AAA"), "AAA")).toContain("sem voto do AAA"); // RJ has no AAA deputy
  });
  test("partido sem orientação própria diz isso em vez de contar divergência", () => {
    const h = votacaoView(preps[1]!, preps, { ...estadoInicial(), vi: 1, foco: "BBB" }, ctx(), porUf(preps[1]!.linhas, "BBB"));
    expect(h).toContain("sem orientação própria nesta votação (Liberado)");
  });
});

describe("deputados", () => {
  test("a busca ignora acento e caixa, exige 2 letras e limita a 12", () => {
    expect(buscarDeputados(fichas, "a")).toEqual([]);
    expect(buscarDeputados(fichas, "ANA").map((f) => f.dep)).toEqual([0]);
    const muitos = Array.from({ length: 30 }, (_, i) => ({ dep: i, id: i, nome: `Maria ${i}`, uf: "SP", partido: "AAA" }));
    expect(buscarDeputados(muitos, "maria")).toHaveLength(12);
  });
  test("a ficha mostra o voto em cada votação, ausência como 'sem voto registrado' e nunca uma nota", () => {
    const f = fichaDeputado({ dep: 0, id: 1, nome: "Ana Alfa", uf: "SP", partido: "AAA" }, preps, ctx());
    expect((f.match(/class="cm-q/g) ?? []).length).toBe(3);
    expect(f).toContain("Sim"); expect(f).toContain("coincidiu em");
    const fora = fichaDeputado({ dep: 99, id: 99, nome: "Quem Saiu", uf: "SP", partido: "AAA" }, preps, ctx());
    expect(fora).toContain("3 sem voto registrado");
    expect(f).not.toMatch(/nota|pontos|score/i);
  });
});

describe("pauta", () => {
  test("filtros: tipo, só pauta publicada, só urgência e busca sem acento", () => {
    const base = { tipos: [] as string[], soPauta: false, soUrg: false, busca: "" };
    expect(EVENTOS.filter((e) => casaEvento(e, base))).toHaveLength(3);
    expect(EVENTOS.filter((e) => casaEvento(e, { ...base, soPauta: true }))).toHaveLength(1);
    expect(EVENTOS.filter((e) => casaEvento(e, { ...base, soUrg: true })).map((e) => e.id)).toEqual([900]);
    expect(EVENTOS.filter((e) => casaEvento(e, { ...base, tipos: ["Audiência Pública"] })).map((e) => e.id)).toEqual([901]);
    expect(EVENTOS.filter((e) => casaEvento(e, { ...base, busca: "constituicao justica" })).map((e) => e.id)).toEqual([900]);
    expect(EVENTOS.filter((e) => casaEvento(e, { ...base, busca: "carla" })).map((e) => e.id)).toEqual([900]);
  });
  test("a lista abre o evento pedido, mostra relator com a sigla do partido e liga só ao site da Câmara", () => {
    const html = listaEventos(EVENTOS, ctx(), 900);
    expect(html).toMatch(/id="cm-ev-900" open/);
    expect(html).toContain("Relator: Carla Beta");
    expect(html).toContain("https://www.camara.leg.br/evento-legislativo/900");
  });
});

describe("tramitação", () => {
  test("registro filtra por tipo e órgão e conta o intervalo desde a movimentação anterior", () => {
    const cores = { PLEN: "x", CCJC: "y" };
    expect(registroProp(PROPOSICAO, HOJE, cores, "", "").n).toBe(4);
    expect(registroProp(PROPOSICAO, HOJE, cores, "", "CCJC")).toMatchObject({ n: 2, total: 4 });
    expect(registroProp(PROPOSICAO, HOJE, cores, "Votação", "").html).toContain("+");
    expect(registroProp(PROPOSICAO, HOJE, cores, "Inexistente", "").html).toContain("Nada com esse filtro");
  });
  test("o link do inteiro teor só sai quando é do domínio da Câmara (a coleta já descarta o resto)", () => {
    expect(tramitacaoView([PROPOSICAO], estadoInicial(), HOJE)).toContain("Inteiro teor");
    expect(tramitacaoView([{ ...PROPOSICAO, inteiroTeor: null }], estadoInicial(), HOJE)).not.toContain("Inteiro teor");
  });
});

test("relator sem partido não quebra a pauta", () => {
  const ev = { ...EVENTOS[0]!, pauta: [{ ...EVENTOS[0]!.pauta[0]!, relator: { nome: "Sem Partido", partido: "", uf: "" } }] };
  expect(listaEventos([ev], ctx(), null)).toContain("Relator: Sem Partido");
  expect(legenda(ctx(), null)).toBe("");
});
