import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseApuracao } from "./apuracao-tse.js";
import { renderApuracao, semRelogio, vistasDe } from "./apuracao.js";
import type { RenderProps, SnapView } from "./apuracao.js";
import { registrar } from "./apuracao-graficos.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";
import { avatar, byId, cand, dois, file } from "./apuracao-fixtures.js";

const view = (json: unknown, over: Partial<SnapView> = {}) => renderApuracao({ snap: { status: "ok", dados: parseApuracao(json), buscadoEm: new Date("2026-10-04T20:15:30"), erro: null, ...over }, cargo: "Governador", uf: "SP", byId, avatar, limit: 40 });

describe("semRelogio", () => {
  test("two renders that differ only by the query time share a key, so the page is not redrawn for a clock tick", () => {
    const a = view(file({ cands: dois }), { buscadoEm: new Date("2026-10-04T20:15:30") });
    const b = view(file({ cands: dois }), { buscadoEm: new Date("2026-10-04T20:16:31") });
    expect(a).not.toBe(b);
    expect(semRelogio(a)).toBe(semRelogio(b));
  });
  test("new numbers change the key", () => {
    const a = view(file({ cands: dois }));
    const b = view(file({ cands: [{ ...dois[0], vap: "6001" }, dois[1]] }));
    expect(semRelogio(a)).not.toBe(semRelogio(b));
  });
});

describe("renderApuracao", () => {
  test("before the count starts it says so and shows no ranking", () => {
    const html = view(file({ s: { st: "0" }, v: { tv: "0", vvc: "0", vv: "0", vb: "0", tvn: "0" }, cands: dois }));
    expect(html).toContain("Aguardando início");
    expect(html).toContain("ainda não começou");
    expect(html).toContain("0 de 1.000 seções totalizadas");
    expect(html).not.toContain("<table");
  });

  test("partial count: leader, lead in points, section progress and the warning that the order can change", () => {
    const html = view(file({ cands: dois }));
    expect(html).toContain("Apuração em andamento");
    expect(html).toContain("<b>Ana Souza</b> lidera com <b>60,00%</b>");
    expect(html).toContain("<b>20,0 p.p.</b> à frente de Beto Lima");
    expect(html).toContain("400 de 1.000 seções totalizadas (40,0%)");
    expect(html).toContain('<progress class="apu-prog" max="1000" value="400"');
    expect(html).toContain("os números ainda mudam e a ordem pode se inverter");
  });

  test("a partial count never shows 100% of the sections, and a complete one does", () => {
    const parcial = view(file({ s: { ts: "10000", st: "9996" }, cands: dois }));
    expect(parcial).toContain("9.996 de 10.000 seções totalizadas (99,9%)");
    expect(parcial).not.toContain("100,0%");
    expect(view(file({ s: { ts: "10000", st: "10000" }, cands: dois }))).toContain("10.000 de 10.000 seções totalizadas (100,0%)");
  });

  test("turnout is measured on the electorate of the sections already counted, and blanks/nulls on the votes counted", () => {
    const html = view(file({ cands: dois }));
    expect(html).toContain("<b>80,0%</b><span>comparecimento nas seções totalizadas"); // 160.000 / 200.000, not / 500.000
    expect(html).toContain("8.000 <small>5,0%</small>"); // 8.000 / 160.000
    expect(html).toContain("12.000 <small>7,5%</small>");
  });

  test("the status text is the TSE's own; a highlighted row without text gets no invented label", () => {
    const html = view(file({ cands: [cand("a1", "10", "ANA", "1", "6000", "60,00", "s", "2º turno"), cand("b2", "20", "BETO", "2", "4000", "40,00", "s", "")] }));
    expect(html).toContain(">2º turno</span>");
    expect(html.match(/class="rot (alta|baixa)"/g)).toHaveLength(2); // one row with text, printed under the name and in its column; the empty row has none
    expect(html.split("<details")[0]).not.toMatch(/venceu|vencedor|\beleit[oa]s?\b/i); // the how-to-read text below may mention them; "eleitores" (voters) is not a winner
  });

  test("the status column exists only once the TSE has marked someone", () => {
    expect(view(file({ cands: dois.map((c) => ({ ...c, st: "", e: "n" })) }))).not.toContain("Situação (TSE)");
    expect(view(file({ cands: dois }))).toContain("Situação (TSE)");
  });

  test("only candidates we know link to a dossier, and the link id comes from our data", () => {
    const html = view(file({ cands: dois }));
    expect(html).toContain('data-open="a1"');
    expect(html).not.toContain('data-open="b2"');
  });

  test("source text is escaped", () => {
    const html = view(file({ cands: [cand("x", "<b>1", "<img src=x onerror=alert(1)>", "1", "10", "100,00")] }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("&lt;b&gt;1");
  });

  test("concluded count is labelled as such and drops the 'can still change' warning", () => {
    const html = view(file({ s: { st: "1000" }, cands: dois }));
    expect(html).toContain("Apuração concluída");
    expect(html).not.toContain("os números ainda mudam");
  });

  test("senate shows the top two as the seats", () => {
    const html = renderApuracao({ snap: { status: "ok", dados: parseApuracao(file({ cargo: { cd: "5", nmn: "Senador", nv: "2" }, cands: [...dois, cand("c3", "30", "CLARA", "3", "1000", "10,00")] })), buscadoEm: new Date(), erro: null }, cargo: "Senador", uf: "SP", byId, avatar, limit: 40 });
    expect(html).toContain("2 vagas. Mais votados até agora: <b>Ana Souza</b> (60,00%) e <b>Beto Lima</b> (40,00%)");
  });

  describe("proportional offices", () => {
    const agr = [
      { n: "1", nm: "Federação X", com: "PT/PC do B/PV", vag: "9", par: [{ n: "13", sg: "PT", cand: dois.map((c) => ({ ...c })) }] },
      { n: "2", nm: "Partido Y", com: "PL", vag: "0", par: [{ n: "22", sg: "PL", cand: [cand("c3", "2200", "CARLA", "3", "100", "1,00")] }] },
    ];
    const prop = (over = {}) => renderApuracao({ snap: { status: "ok", dados: parseApuracao(file({ cargo: { cd: "6", nmn: "Deputado Federal", nv: "70", qe: "210123" }, agr })), buscadoEm: new Date(), erro: null }, cargo: "Deputado Federal", uf: "SP", byId, avatar, limit: 40, ...over });

    test("seats per list (only lists with seats), electoral quotient and the rule that explains it", () => {
      const html = prop();
      expect(html).toContain("70 vagas em disputa. Segundo o TSE, 1 já tem situação de eleito");
      expect(html).toContain("Quociente eleitoral: <b>210.123</b> votos");
      expect(html).toContain("PT/PC do B/PV");
      expect(html).not.toMatch(/<li><span>PL<\/span>/);
      expect(html).toContain("quociente eleitoral, e só depois entre os candidatos");
    });

    test("the list is paged: the button appears only when there is more to show", () => {
      expect(prop({ limit: 2 })).toContain('id="apu-mais"');
      expect(prop({ limit: 2 }).match(/<th scope="row">/g)).toHaveLength(2);
      expect(prop({ limit: 40 })).not.toContain('id="apu-mais"');
    });
  });

  describe("states without numbers", () => {
    const empty = (snap: SnapView) => renderApuracao({ snap, cargo: "Governador", uf: "SP", byId, avatar, limit: 40 });
    test("loading, not published, and failed", () => {
      expect(empty({ status: "carregando", dados: null })).toContain("Consultando o TSE");
      expect(empty({ status: "ausente", dados: null })).toContain("ainda não publicou o arquivo");
      expect(empty({ status: "erro", dados: null, erro: "sem conexão com o TSE" })).toContain("Não foi possível consultar o TSE agora: sem conexão com o TSE");
    });
    test("a failed refresh keeps the last numbers on screen and says from when they are", () => {
      const html = view(file({ cands: dois }), { status: "erro", erro: "HTTP 503" });
      expect(html).toContain("Falha ao atualizar (HTTP 503)");
      expect(html).toContain("lidera com <b>60,00%</b>");
      expect(html).toContain("Mostrando os números de 20:15:30");
    });
    test("a file that disappears after good numbers keeps them, says so and from when they are", () => {
      const html = view(file({ cands: dois }), { status: "ausente" });
      expect(html).toContain("O TSE não está entregando este arquivo agora");
      expect(html).toContain("Mostrando os números de 20:15:30");
      expect(html).toContain("lidera com <b>60,00%</b>");
    });
    test("the error text from the network is escaped", () => {
      expect(empty({ status: "erro", dados: null, erro: "<script>x</script>" })).not.toContain("<script>x");
    });
  });

  describe("comparison with the polls", () => {
    const prev = (media: number, lo: number, hi: number) => ({ fonte: "pesquisas", media, lo, hi });
    const exp = { corridas: [{ cargo: "Governador", uf: "SP", pesquisas: 7, ultima: "2026-10-03" }] };
    const ids = new Map([["a1", { id: "a1", prev: prev(0.5, 0.45, 0.55) }], ["b2", { id: "b2", prev: prev(0.4, 0.35, 0.45) }]]) as unknown as RenderProps["byId"];
    const withPolls = (json: unknown, over: Partial<RenderProps> = {}) => renderApuracao({ snap: { status: "ok", dados: parseApuracao(json), buscadoEm: new Date(), erro: null }, cargo: "Governador", uf: "SP", byId: ids, avatar, limit: 40, exp, ...over });

    test("each row gets the poll average, the signed difference and whether the count is inside the 90% band", () => {
      const html = withPolls(file({ cands: dois })); // Ana counts 60% vs poll 50% [45-55]; Beto 40% vs 40% [35-45]
      expect(html).toContain('<th scope="col" class="pq-col">Pesquisa (média)</th>');
      expect(html).toContain('<th scope="col" class="pq-col">Diferença</th>');
      expect(html).toContain("50,0%<small>faixa 45%–55%</small>");
      expect(html).toContain("▲</span> 10,0 p.p.");
      expect(html).toContain("fora da faixa");
      expect(html).toContain("▬</span> 0,0 p.p.");
      expect(html).toContain("dentro da faixa");
      expect(html).toContain("10,0 pontos percentuais acima da média das pesquisas");
    });

    test("above or below the polls is never painted good or bad", () => {
      expect(withPolls(file({ cands: dois }))).not.toMatch(/class="tend|class="dif (up|down)/);
    });

    test("phones get the same comparison under the name", () => {
      expect(withPolls(file({ cands: dois }))).toMatch(/class="row-inline">[^]*pesquisa <b>50,0%<\/b>/);
    });

    test("a partial count warns that the gap is about which ballots are in, not about poll error", () => {
      const html = withPolls(file({ cands: dois }));
      expect(html).toContain("Comparação com as pesquisas");
      expect(html).toContain("7 pesquisas");
      expect(html).toContain("pode refletir quais urnas já entraram, além do erro das pesquisas");
      expect(html).toContain("fora da faixa por enquanto");
      expect(html).toContain("dentro da faixa por enquanto");
      expect(html).toContain("1 de 2 candidatos com 3% ou mais nas pesquisas está dentro da faixa de 90%");
      expect(html).toContain('<span class="faixa-txt">dentro da faixa por enquanto</span>'); // its own line under the name on a phone
    });

    test("a concluded count reads the gap as the result against the polls", () => {
      const html = withPolls(file({ s: { st: "1000" }, cands: dois }));
      expect(html).toContain("o quanto o resultado ficou acima ou abaixo da média das pesquisas");
      expect(html).not.toContain("quais urnas já entraram");
      expect(html).not.toContain("por enquanto");
      expect(html).toContain("fora da faixa");
    });

    test("the senate explains that each voter has up to two votes, so shares are of votes, not of voters", () => {
      const sen = { cargo: { cd: "5", nmn: "Senador", nv: "2" }, cands: dois };
      const nota = "Cada eleitor vota em até 2 nomes";
      expect(withPolls(file(sen), { cargo: "Senador", exp: { corridas: [{ cargo: "Senador", uf: "SP", pesquisas: 3 }] } })).toContain(nota);
      expect(withPolls(file({ cands: dois }))).not.toContain(nota);
    });

    test("without poll data there are no poll columns and no comparison text", () => {
      const html = withPolls(file({ cands: dois }), { byId: new Map([["a1", { id: "a1", prev: { fonte: "modelo", p: 0.7 } }]]) as unknown as RenderProps["byId"], exp: null });
      expect(html).not.toContain("pq-col");
      expect(html).not.toContain("Comparação com as pesquisas");
    });

    test("deputies have no polls, and the screen says so instead of leaving a gap", () => {
      const html = renderApuracao({ snap: { status: "ok", dados: parseApuracao(file({ cargo: { cd: "6", nmn: "Deputado Federal", nv: "70" }, cands: dois })), buscadoEm: new Date(), erro: null }, cargo: "Deputado Federal", uf: "SP", byId: ids, avatar, limit: 40, exp });
      expect(html).toContain("Não há pesquisa por candidato a deputado");
      expect(html).not.toContain("pq-col");
    });
  });

  test("every state explains how to read a partial count and credits the TSE", () => {
    const html = view(file({ cands: dois }));
    expect(html).toContain("Parcial não é resultado");
    expect(html).toContain("O Radar não projeta vencedor");
    expect(html).toContain("resultados.tse.jus.br");
  });
});

describe("vistas (Placar, Mapa, Gráficos)", () => {
  const mapa = JSON.parse(readFileSync("web/mapa-uf.json", "utf8"));
  const parsed = () => parseApuracao(file({ cands: dois }));
  const ver = (over: Partial<RenderProps> = {}) => renderApuracao({ snap: { status: "ok", dados: parsed(), buscadoEm: new Date("2026-10-04T20:15:30"), erro: null }, cargo: "Governador", uf: "SP", byId, avatar, limit: 40, cor: createCores(PALETA), mapa, ...over });

  test("the map exists for the offices that have a state-by-state race, and the charts for all", () => {
    expect(vistasDe("Presidente")).toEqual(["placar", "mapa", "projecao", "graficos"]);
    expect(vistasDe("Governador")).toEqual(["placar", "mapa", "projecao", "graficos"]);
    expect(vistasDe("Senador")).toEqual(["placar", "mapa", "graficos"]); // two votes per voter: the one-seat arithmetic does not apply
    expect(vistasDe("Deputado Federal")).toEqual(["placar", "cadeiras", "camara", "graficos"]); // the Chamber is the one national picture for deputies
    expect(vistasDe("Deputado Estadual")).toEqual(["placar", "cadeiras", "graficos"]);
    expect(vistasDe("Deputado Distrital")).toEqual(["placar", "cadeiras", "graficos"]);
  });

  test("the sub-navigation marks the open view; the default is the scoreboard", () => {
    const html = ver();
    expect(html).toMatch(/data-vista="placar"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-vista="mapa"[^>]*aria-pressed="false"/);
    expect(html).toContain("<table"); // the scoreboard table
  });

  test("the Chamber view shows the hemicycle for federal deputies and loads the 27 states", () => {
    const html = ver({ cargo: "Deputado Federal", vista: "camara", nac: null });
    expect(html).toMatch(/data-vista="camara"[^>]*aria-pressed="true"/);
    expect(html).toContain("Consultando os 27 estados");
  });

  test("a view the office does not have falls back to the scoreboard", () => {
    const html = ver({ cargo: "Deputado Estadual", vista: "camara" });
    expect(html).toMatch(/data-vista="placar"[^>]*aria-pressed="true"/);
    expect(html).not.toContain('data-vista="mapa"');
  });

  test("the map view shows the national picture and not the single-race table", () => {
    const html = ver({ vista: "mapa", nac: null });
    expect(html).toContain("Consultando os 27 estados");
    expect(html).toContain("<svg");
    expect(html).not.toContain('class="exp-bars"'); // the candidate table of the scoreboard
  });

  test("the charts view explains who voted, compares with the polls and promises the evolution", () => {
    const ids = new Map([["a1", { id: "a1", prev: { fonte: "pesquisas", media: 0.5, lo: 0.45, hi: 0.55 } }], ["b2", { id: "b2", prev: { fonte: "pesquisas", media: 0.4, lo: 0.35, hi: 0.45 } }]]) as unknown as RenderProps["byId"];
    const html = ver({ vista: "graficos", byId: ids });
    expect(html).toContain("Votos válidos");
    expect(html).toContain("Apuração e faixa das pesquisas");
    expect(html).toContain("apu-dumb");
    expect(html).toContain("novos arquivos do TSE");
  });

  test("the evolution chart appears once two files have been seen", () => {
    let hist = registrar([], parsed()!);
    const depois = parseApuracao(file({ s: { st: "600" }, cands: dois }));
    depois!.versao = { data: "04/10/2026", hora: "20:00:00" };
    hist = registrar(hist, depois!);
    expect(ver({ vista: "graficos", hist })).toContain("apu-evo");
  });

  test("before the count starts the charts say so instead of drawing empty ones", () => {
    const html = ver({ vista: "graficos", snap: { status: "ok", dados: parseApuracao(file({ s: { st: "0" }, v: { tv: "0", vvc: "0", vv: "0", vb: "0", tvn: "0" }, cands: dois })), buscadoEm: new Date(), erro: null } });
    expect(html).toContain("quando o TSE começar a totalizar");
    expect(html).not.toContain("apu-comp");
  });

  test("a state race shows no poll chart when there is no poll for the race", () => {
    expect(ver({ vista: "graficos" })).not.toContain("Apuração e faixa das pesquisas");
  });
});
