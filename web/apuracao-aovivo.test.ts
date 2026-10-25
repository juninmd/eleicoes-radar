import { describe, expect, test } from "bun:test";
import { BRASIL, TODOS, corridasDe, disputaDecidida, renderAoVivo, renderHero, resultadoDe } from "./apuracao-aovivo.js";
import { atualizar, vazio } from "./apuracao-eleitos.js";
import { registrar } from "./apuracao-graficos.js";
import { createCores } from "./apuracao-nacional.js";
import { parseApuracao } from "./apuracao-tse.js";
import { cand, dois, file } from "./apuracao-fixtures.js";
import type { Linha } from "./apuracao-aovivo.js";

const cor = createCores(["#111111", "#222222", "#333333"], "#999999");
const avatar = (c: { id: string }, size: string) => `<i class="av ${size}" data-foto="${c.id}"></i>`;
const snap = (d: ReturnType<typeof parseApuracao>) => ({ url: "x", status: "ok" as const, dados: d, buscadoEm: new Date("2026-10-04T22:45:00Z"), erro: null });
const linhaDe = (cargo: Linha["cargo"], uf: string, cands = dois): Linha => {
  const d = parseApuracao(file({ cands }));
  return { cargo, uf, snap: snap(d), eleitos: atualizar(vazio(), d, { cargo, uf }) };
};
const sem = (cargo: Linha["cargo"], uf: string): Linha => ({ cargo, uf, snap: null, eleitos: vazio() });
const heroDe = (uf = BRASIL, cands = dois) => {
  const d = parseApuracao(file({ cands }))!;
  return { uf, snap: snap(d), hist: registrar([], d), eleitos: atualizar(vazio(), d, { cargo: "Presidente", uf }) };
};
const props = (over = {}) => ({ hero: heroDe(), linhas: [linhaDe("Governador", "SP"), sem("Senador", "SP")], escopo: BRASIL, ufCartoes: "SP", nac: null, cargoTodos: "Presidente" as const, agora: new Date("2026-10-04T22:46:00Z"), avatar, cor, ...over });

describe("Ao vivo", () => {
  test("as quatro disputas da UF (a do Presidente é o destaque); no DF, deputado distrital", () => {
    expect(corridasDe("SP").map((c) => c.cargo)).toEqual(["Governador", "Senador", "Deputado Federal", "Deputado Estadual"]);
    expect(corridasDe("DF")[3].cargo).toBe("Deputado Distrital");
  });

  test("o destaque do Presidente é um duelo: dois lados com foto, diferença, barra dos 50% e curva", () => {
    const html = renderHero({ hero: heroDe(), avatar, cor });
    expect(html.match(/class="live-side /g)).toHaveLength(2);
    expect(html.match(/data-foto="/g)).toHaveLength(4);
    expect(html).toContain("live-vs");
    expect(html).toContain("apu-duelo");
    expect(html).toContain("Curva da apuração");
  });

  test("sem arquivo ou antes da apuração o duelo não inventa números", () => {
    expect(renderHero({ hero: { uf: BRASIL, snap: null, hist: [], eleitos: vazio() }, avatar, cor })).toContain("Consultando o TSE…");
    const d = parseApuracao(file({ cands: dois, s: { ts: "1000", st: "0" } }))!;
    const html = renderHero({ hero: { uf: BRASIL, snap: snap(d), hist: [], eleitos: vazio() }, avatar, cor });
    expect(html).toContain("ainda não começou");
    expect(html).not.toContain("live-side");
  });

  test("o mapa é o filtro: Brasil (total) por padrão, estado escolhido e botão de voltar", () => {
    const br = renderAoVivo(props());
    expect(br).not.toContain("live-escopo");
    expect(br).toContain("Mostrando <b>Brasil (total)</b>");
    expect(br).not.toContain("data-live-total"); // no "back" while already on the total
    const rj = renderAoVivo(props({ escopo: "RJ" }));
    expect(rj).toContain("Mostrando <b>RJ</b>");
    expect(rj).toContain("Voltar ao Brasil (total)");
    expect(rj).toContain("data-fx-host"); // the map stays as the picker in every scope
    expect(renderAoVivo(props({ escopo: "ZZ", hero: heroDe("ZZ"), linhas: [] }))).toContain("Mostrando <b>Exterior</b>");
  });

  test("todos os estados ao mesmo tempo: um quadro por UF e o exterior no Presidente", () => {
    const d = parseApuracao(file({ cands: dois }))!;
    const ufs = Object.fromEntries(["SP", "RJ", "ZZ"].map((u) => [u, { status: "ok" as const, dados: d, erro: null, buscadoEm: new Date() }]));
    const nac = { cargo: "Presidente" as const, ciclo: 1, buscadoEm: new Date(), ufs };
    const html = renderAoVivo(props({ escopo: TODOS, nac }));
    expect(html).toContain('data-live-escopo="SP"');
    expect(html).toContain('data-live-escopo="ZZ"');
    expect(html).toContain('data-live-cargo="Governador"');
    expect(html).toContain("Todos os estados");
  });

  test("o total consolidado fica no Brasil; o mapa em tempo real fica em todos os escopos", () => {
    const d = parseApuracao(file({ cands: dois }))!;
    const ufs = Object.fromEntries(["SP", "ZZ"].map((u) => [u, { status: "ok" as const, dados: d, erro: null, buscadoEm: new Date() }]));
    const nac = { cargo: "Presidente" as const, ciclo: 1, buscadoEm: new Date(), ufs };
    const brasil = renderAoVivo(props({ nacPrev: nac }));
    expect(brasil).toContain("Total consolidado");
    expect(brasil).toContain("data-fx-host");
    expect(brasil).toContain("Mapa em tempo real");
    expect(renderAoVivo(props({ escopo: TODOS, nac }))).toContain("Total consolidado");
    const rj = renderAoVivo(props({ escopo: "RJ" }));
    expect(rj).not.toContain("Total consolidado"); // the total is national; a state does not inherit it
    expect(rj).toContain("data-fx-host");
    const sen = renderAoVivo(props({ escopo: TODOS, nac: { ...nac, cargo: "Senador" as const }, cargoTodos: "Senador" as const }));
    expect(sen).toContain("data-fx-host"); // the map is the picker, so it stays even where the static map used to be
  });

  test("no exterior só há o Presidente: sem cartões de estado", () => {
    const html = renderAoVivo(props({ escopo: "ZZ", hero: heroDe("ZZ"), linhas: [] }));
    expect(html).not.toContain("live-card");
    expect(html).toContain("Presidente <small>Exterior</small>");
  });

  test("o resultado do TSE separa eleito, 2º turno e não eleito e anima o selo", () => {
    const html = renderAoVivo(props());
    expect(html).toContain("Resultado do TSE");
    expect(html).toContain('class="res eleito"');
    expect(html).toContain('class="res nao"');
    const itens = resultadoDe(heroDe(), []);
    expect(itens.map((x) => [x.tipo, x.situacao])).toEqual([["eleito", "Eleito"], ["nao", "Não eleito"]]);
    const dt = parseApuracao(file({ cands: [cand("a1", "10", "ANA", "1", "6000", "48,00", "s", "2º turno"), cand("b2", "20", "BETO", "2", "4000", "40,00", "s", "2º turno")] }))!;
    expect(resultadoDe({ uf: BRASIL, snap: snap(dt), hist: [], eleitos: vazio() }, []).map((x) => x.tipo)).toEqual(["turno", "turno"]);
  });

  test("the timeline is newest first across midnight: 00:05 of the next day is above 23:58 of the day before", () => {
    const eleito = (uf: string, dg: string, hg: string) => {
      const d = { ...parseApuracao(file({ cands: [cand("a1", "10", "ANA SOUZA", "1", "6000", "60,00", "s", "Eleito")] }))!, versao: { data: dg, hora: hg } };
      return { cargo: "Governador" as const, uf, snap: snap(d), eleitos: atualizar(vazio(), d, { cargo: "Governador", uf }) };
    };
    const html = renderAoVivo(props({ linhas: [eleito("SP", "04/10/2026", "23:58:00"), eleito("RJ", "05/10/2026", "00:05:00")] }));
    const horas = [...html.matchAll(/<time>([^<]+)<\/time>/g)].map((m) => m[1]);
    expect(horas.slice(0, 2)).toEqual(["00:05", "23:58"]);
  });

  test("cartões e a linha do tempo reúnem as disputas; arquivo velho é avisado; ninguém é chamado de vencedor", () => {
    const l = linhaDe("Governador", "SP");
    const velha = { ...l, snap: { ...l.snap!, status: "erro" as const, erro: "sem conexão com o TSE" } };
    const html = renderAoVivo(props({ escopo: "SP", linhas: [velha, sem("Senador", "SP")] }));
    expect(html.match(/class="live-card"/g)).toHaveLength(2);
    expect(html).toContain("Consultando o TSE…");
    expect(html).toContain("Números desatualizados");
    expect(html).toContain('O TSE marcou "Eleito"');
    expect(html.split('<p class="muted small">Cada bloco')[0]).not.toMatch(/venceu|vencedor|vai vencer|será eleit/i);
  });
});

describe("Previsão do Radar na aba", () => {
  const lado = (id: string, nome: string, c: number) => ({ id, nome, partido: "AAA", chance: c, pesquisa: { media: 0.45 }, apuracao: 0.47, mc: [0.46, 0.48, 0.5] as [number, number, number] });
  const previsao = { turno: 1 as const, favorito: lado("a1", "ANA SOUZA", 0.82), outro: lado("b2", "BETO LIMA", 0.18), nivel: "clara" as const, n: 2000, contados: 0.6, faltam: 3e6, decideNoPrimeiro: 0.2, segundoTurno: 0.8, defasadas: [] };
  const prev = { estado: "ok" as const, previsao, hist: [], avatar, cor };

  test("vem logo depois do duelo e antes da linha do tempo; sem ela a tela fica como era", () => {
    const html = renderAoVivo(props({ prev }));
    expect(html.indexOf("live-hero")).toBeLessThan(html.indexOf('class="prev'));
    expect(html.indexOf('class="prev')).toBeLessThan(html.indexOf("Quem foi eleito"));
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(renderAoVivo(props())).not.toContain('class="prev');
  });

  test("a previsão não chama ninguém de vencedor; o balão diz que só o TSE diz quem foi eleito", () => {
    const html = renderAoVivo(props({ prev }));
    expect(html).not.toMatch(/venceu|vencedor|vai vencer|vai ganhar|será eleit/i);
    expect(html).toContain("deve terminar à frente");
    expect(html).toContain("Só o texto do TSE diz quem foi eleito");
  });
});

describe("expectativa na curva", () => {
  const d1 = parseApuracao(file({ cands: dois }))!;
  const d2 = parseApuracao({ ...file({ cands: dois }), hg: "19:50:07" })!;
  const hero = { uf: BRASIL, snap: snap(d2), hist: registrar(registrar([], d1), d2), eleitos: vazio() };
  const esperado = { a1: { media: 0.5, lo: 0.45, hi: 0.55 }, b2: { media: 0.3 } };

  test("cada candidato com pesquisa ganha uma linha tracejada na cor dele e a faixa de 90%", () => {
    const html = renderHero({ hero, avatar, cor, esperado });
    expect(html.match(/class="esperado"/g)).toHaveLength(2);
    expect(html.match(/stroke-dasharray="7 5"/g)).toHaveLength(2);
    expect(html.match(/class="esperado-faixa"/g)).toHaveLength(1); // o b2 não tem faixa
    expect(html).toContain("pesquisas 50,0%");
    expect(html).toContain("expectativa (pesquisas): <b>50,0%</b>");
    expect(html).toContain("Linha tracejada: média das pesquisas");
  });

  test("sem pesquisa a curva fica como era, sem linha nem aviso", () => {
    const html = renderHero({ hero, avatar, cor });
    expect(html).not.toContain("esperado");
    expect(html).not.toContain("Linha tracejada");
  });
});

describe("efeitos de embate", () => {
  const eleitoSo = (a: "Eleito" | "", b: "Não eleito" | "") => [cand("a1", "10", "ANA SOUZA", "1", "6000", "60,00", a ? "s" : "n", a), cand("b2", "20", "BETO LIMA", "2", "4000", "40,00", "n", b)];
  const hero = (cands = dois) => heroDe(BRASIL, cands);

  test("três raios entre os retratos, na cor de cada lado, mais rápidos quanto mais apertada a disputa", () => {
    const html = renderHero({ hero: hero(), avatar, cor });
    expect(html.match(/class="raio r\d"/g)).toHaveLength(3);
    expect(html).toContain('aria-hidden="true" style="--raio-dur:');
    const apertada = renderHero({ hero: hero([cand("a1", "10", "ANA", "1", "5100", "51,00"), cand("b2", "20", "BETO", "2", "4900", "49,00")]), avatar, cor });
    const dur = (h: string) => Number(/--raio-dur:([\d.]+)s/.exec(h)![1]);
    expect(dur(apertada)).toBeLessThan(dur(html));
  });

  test("a entrada só toca quando pedida e o botão Efeitos desliga tudo", () => {
    expect(renderHero({ hero: hero(), avatar, cor })).not.toContain(" intro");
    expect(renderHero({ hero: hero(), avatar, cor, fx: { ligado: true, intro: true, ko: false } })).toContain("live-hero intro");
    expect(renderHero({ hero: hero(), avatar, cor, fx: { ligado: false, intro: false, ko: false } })).toContain("live-hero sem-fx");
    expect(renderAoVivo(props({ fx: { ligado: false, intro: false, ko: false } }))).toContain('data-live-fx aria-pressed="false" data-dica="Liga ou desliga as animações do duelo, do carimbo e do K.O.">Efeitos off');
    expect(renderAoVivo(props())).toContain(">Efeitos</button>");
  });

  test("K.O. só quando o TSE marca um dos dois como Eleito e o outro não", () => {
    expect(disputaDecidida(parseApuracao(file({ cands: dois })))?.derrotado.id).toBe("b2");
    expect(disputaDecidida(parseApuracao(file({ cands: eleitoSo("", "") })))).toBeNull(); // ninguém marcado
    const doisTurno = [cand("a1", "10", "ANA", "1", "6000", "48,00", "s", "2º turno"), cand("b2", "20", "BETO", "2", "4000", "40,00", "s", "2º turno")];
    expect(disputaDecidida(parseApuracao(file({ cands: doisTurno })))).toBeNull(); // "2º turno" não é eleição
    const ambos = [cand("a1", "10", "ANA", "1", "6000", "48,00", "s", "Eleito"), cand("b2", "20", "BETO", "2", "4000", "40,00", "s", "Eleito")];
    expect(disputaDecidida(parseApuracao(file({ cands: ambos })))).toBeNull();
  });

  test("a queda toca uma vez; depois fica o estado final (derrotado, selo K.O., sem animação de queda)", () => {
    const toca = renderHero({ hero: hero(), avatar, cor, fx: { ligado: true, intro: false, ko: true } });
    expect(toca).toContain("decidida ko-toca");
    expect(toca).not.toContain("live-ko-flash"); // o K.O. grande é desenhado fora da área que se redesenha
    expect(toca).toContain('class="live-side b derrotado"');
    expect(toca).toContain('class="live-selo-ko"');
    const depois = renderHero({ hero: hero(), avatar, cor });
    expect(depois).toContain("live-hero decidida");
    expect(depois).not.toContain("ko-toca");
    expect(depois).toContain("derrotado");
    expect(depois).toContain('O TSE marcou "Eleito"'); // o fato continua em texto
  });

  test("sem decisão não há K.O. nem derrotado", () => {
    const html = renderHero({ hero: hero(eleitoSo("", "")), avatar, cor, fx: { ligado: true, intro: false, ko: true } });
    expect(html).not.toContain("live-selo-ko");
    expect(html).not.toContain("derrotado");
  });
});

describe("botão Som", () => {
  test("liga e desliga o som sem mexer nos efeitos", () => {
    expect(renderAoVivo(props())).toContain('data-live-som aria-pressed="true" data-dica="Liga ou desliga os sons do duelo e do K.O.">Som</button>');
    const mudo = renderAoVivo(props({ fx: { ligado: true, intro: false, ko: false, som: false } }));
    expect(mudo).toContain('data-live-som aria-pressed="false" data-dica="Liga ou desliga os sons do duelo e do K.O.">Som off</button>');
    expect(mudo).toContain(">Efeitos</button>");
  });
});

