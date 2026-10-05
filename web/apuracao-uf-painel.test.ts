import { describe, expect, test } from "bun:test";
import { createCores, linhasUf } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";
import { painelUf, tabelaUf } from "./apuracao-uf-painel.js";
import type { Apuracao, Candidato } from "./apuracao-tse.js";
import type { UfEstado } from "./apuracao-uf.js";

type UfOk = UfEstado & { dados: Apuracao };

const c = (id: string, nome: string, partido: string, votos: number, pct: number) => ({ id, nome, partido, num: `${id}0`, votos, pct, destaque: false, situacao: "" }) as Candidato;
const uf = ({ total = 100, feitas = 40, vagas = 1, cands = [] }: { total?: number; feitas?: number; vagas?: number; cands?: Candidato[] } = {}) => ({
  status: "ok", erro: null,
  dados: { fase: feitas === 0 ? "aguardando" : feitas >= total ? "concluida" : "parcial", secoes: { total, totalizadas: feitas }, cargo: { vagas }, candidatos: cands, versao: { data: "04/10/2026", hora: "19:41:07" } },
}) as UfOk;
const cands = [c("1", "ANA SOUZA", "AAA", 6000, 0.6), c("2", "BETO LIMA", "BBB", 3000, 0.3), c("3", "CRIS", "CCC", 1000, 0.1)];
const ufs = { SP: uf({ cands }), AC: uf({ feitas: 0, cands: [c("1", "ANA", "AAA", 0, 0)] }), AL: { status: "carregando", dados: null, erro: null } as UfEstado, ZZ: uf({ cands }) };
const linhas = linhasUf(ufs, "Governador");
const cor = createCores(PALETA);
const poll = { cargo: "Governador", uf: "SP", vagas: 1, lideres: [{ sq: "1", nome: "ANA SOUZA", partido: "AAA", media: 0.5, lo: 0.41, hi: 0.59 }] };
const row = (u: string) => linhas.find((l) => l.uf === u)!;

describe("painelUf", () => {
  test("with nothing selected it says how to select", () => {
    expect(painelUf(null, { cor, cargo: "Governador" })).toContain("Toque em um estado");
  });

  test("shows the state, how much of the count is in, and the candidates with share and votes", () => {
    const html = painelUf(row("SP"), { cor, cargo: "Governador" });
    expect(html).toContain("São Paulo");
    expect(html).toContain("Apuração em andamento");
    expect(html).toContain("40 de 100 seções totalizadas (40,0%)");
    expect(html).toContain("Ana Souza");
    expect(html).toContain("60,00%");
    expect(html).toContain("6.000");
    expect(html).toContain("04/10/2026 19:41:07");
  });

  test("a state that has not started, not answered, or failed says exactly that", () => {
    expect(painelUf(row("AC"), { cor, cargo: "Governador" })).toContain("ainda não começou");
    expect(painelUf(row("AL"), { cor, cargo: "Governador" })).toContain("Consultando o TSE");
    const falha = linhasUf({ BA: { status: "erro", dados: null, erro: "sem conexão com o TSE" } as UfEstado }, "Governador")[0];
    expect(painelUf(falha, { cor, cargo: "Governador" })).toContain("sem conexão com o TSE");
  });

  test("puts the poll leader beside the count leader, in words, without calling either wrong", () => {
    const igual = painelUf(row("SP"), { cor, cargo: "Governador", corrida: poll });
    expect(igual).toContain("Pesquisas: <b>Ana Souza</b>");
    expect(igual).toContain("50,0%");
    expect(igual).toContain("41%–59%");
    expect(igual).toContain("mesmo líder");
    const outro = painelUf(row("SP"), { cor, cargo: "Governador", corrida: { ...poll, lideres: [{ ...poll.lideres[0], sq: "2", nome: "BETO LIMA" }] } });
    expect(outro).toContain("líder diferente");
    expect(outro).not.toMatch(/erro das pesquisas|errou/i);
  });

  test("the button to open the race exists for state races only, not for the exterior", () => {
    expect(painelUf(row("SP"), { cor, cargo: "Governador" })).toContain('data-abrir-uf="SP"');
    expect(painelUf(row("ZZ"), { cor, cargo: "Presidente" })).not.toContain("data-abrir-uf");
    expect(painelUf(row("SP"), { cor, cargo: "Presidente" })).not.toContain("data-abrir-uf"); // the president's ballot is national
  });

  test("names from the source are escaped", () => {
    const sujo = linhasUf({ SP: uf({ cands: [c("1", "<script>x</script>", "A&B", 5, 1)] }) }, "Governador")[0];
    const html = painelUf(sujo, { cor, cargo: "Governador" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("A&amp;B");
  });
});

describe("tabelaUf", () => {
  test("is the text version of the map: every state, in name order, exterior last", () => {
    const html = tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: null });
    const ordem = [...html.matchAll(/<tr data-uf="([A-Z]{2})"/g)].map((m) => m[1]);
    expect(ordem).toEqual(["AC", "AL", "SP", "ZZ"]);
  });

  test("the sections column reads short on a phone and complete to a screen reader", () => {
    const html = tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: null });
    expect(html).toContain('<th scope="col">Seções<span class="sr"> totalizadas</span></th>'); // "TOTALIZADAS" alone made the column wider than the leader's
  });

  test("shows the leader and the margin where there are numbers and a dash where there are none", () => {
    const html = tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: null });
    const sp = html.match(/<tr data-uf="SP"[^]*?<\/tr>/)![0];
    expect(sp).toContain("Ana Souza");
    expect(sp).toContain("30,0 p.p.");
    expect(sp).toContain("40,0%");
    const ac = html.match(/<tr data-uf="AC"[^]*?<\/tr>/)![0];
    expect(ac).toContain("–");
    expect(ac).not.toContain("Ana");
  });

  test("phones get the margin under the leader (the margin column is hidden there), so the table stays narrow", () => {
    const sp = tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: null }).match(/<tr data-uf="SP"[^]*?<\/tr>/)![0];
    expect(sp).toContain('class="mg-inline">margem 30,0 p.p.');
    expect(sp).toContain('class="num mg-col"');
  });

  test("the poll column appears only when polls with a leader exist for the office", () => {
    expect(tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: null })).not.toContain("Líder nas pesquisas");
    const html = tabelaUf(linhas, { cargo: "Governador", corridas: [poll], sel: null });
    expect(html).toContain("Líder nas pesquisas");
    expect(html.match(/<tr data-uf="SP"[^]*?<\/tr>/)![0]).toContain("mesmo líder");
  });

  test("with several seats the poll line lists the names compared and says so; it never says 'leader'", () => {
    const dois = linhasUf({ SP: uf({ vagas: 2, cands }) }, "Senador")[0];
    const corrida = { cargo: "Senador", uf: "SP", vagas: 2, lideres: [poll.lideres[0], { sq: "2", nome: "BETO LIMA", partido: "BBB", media: 0.3, lo: 0.2, hi: 0.4 }] };
    const html = painelUf(dois, { cor, cargo: "Senador", corrida });
    expect(html).toContain("mesmos nomes");
    expect(html).toContain("2 primeiros lugares");
    expect(html).toContain("Beto Lima");
    expect(html).not.toContain("mesmo líder");
    const tab = tabelaUf([dois], { cargo: "Senador", corridas: [corrida], sel: null });
    expect(tab).toContain("mesmos nomes");
    expect(tab).not.toContain("mesmo líder");
  });

  test("with several seats the margin is labelled as the margin at the last seat, in the header and under the name", () => {
    const dois = linhasUf({ SP: uf({ vagas: 2, cands }) }, "Senador");
    const html = tabelaUf(dois, { cargo: "Senador", corridas: [], sel: null });
    expect(html).toContain("Margem na última vaga");
    expect(html).toContain("margem na última vaga");
    expect(tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: null })).not.toContain("última vaga");
  });

  test("numbers from a file that was not refreshed say so, in the panel and in the table", () => {
    const velha = linhasUf({ SP: { ...ufs.SP, status: "erro", erro: "sem conexão com o TSE" } }, "Governador")[0];
    expect(painelUf(velha, { cor, cargo: "Governador" })).toContain("o TSE não respondeu na última consulta");
    expect(tabelaUf([velha], { cargo: "Governador", corridas: [], sel: null })).toContain("desatualizado");
    expect(tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: null })).not.toContain("desatualizado");
  });

  test("marks the selected row for assistive tech (aria-current: plain table rows have no selected state)", () => {
    const html = tabelaUf(linhas, { cargo: "Governador", corridas: [], sel: "SP" });
    expect(html.match(/<tr data-uf="SP"[^>]*>/)![0]).toContain('aria-current="true"');
  });
});

describe("decided races", () => {
  // 900 of 1.000 electors counted and 800 valid votes: at most 100 votes can still arrive.
  const quase = (cs: Candidato[], vagas = 1) => {
    const u = uf({ vagas, cands: cs });
    u.dados.eleitorado = { apto: 1000, apurado: 900 } as Apuracao["eleitorado"];
    u.dados.votos = { validos: 800 } as Apuracao["votos"];
    return u;
  };
  const dois = [c("1", "ANA SOUZA", "AAA", 600, 0.75), c("2", "BETO LIMA", "BBB", 200, 0.25)];
  const decidida = linhasUf({ SP: quase(dois), RJ: uf({ cands }) }, "Governador");
  const de = (u: string) => decidida.find((l) => l.uf === u)!;

  test("the panel tints the winner's line, labels it, and says whose arithmetic it is", () => {
    const html = painelUf(de("SP"), { cor, cargo: "Governador" });
    expect(html.match(/<li class="eleito">/g)).toHaveLength(1);
    expect(html).toContain("Matematicamente eleito(a)</span>");
    expect(html).toContain("conta do Radar sobre os números do TSE");
    expect(html).toContain("Não é a marcação do TSE");
  });

  test("an undecided state gets neither the tint, the label nor the explanation", () => {
    const html = painelUf(de("RJ"), { cor, cargo: "Governador" });
    expect(html).not.toContain("eleito");
    expect(html).not.toContain("Matematicamente");
  });

  test("the table row of a decided state is tinted and labelled; the others are untouched", () => {
    const html = tabelaUf(decidida, { cargo: "Governador", corridas: [], sel: null });
    expect(html.match(/<tr data-uf="SP" class="eleito">/g)).toHaveLength(1);
    expect(html.match(/<tr data-uf="RJ">/g)).toHaveLength(1);
    expect(html.match(/Matematicamente eleito\(a\)/g)).toHaveLength(1);
  });

  test("with two seats decided the table says so in the plural", () => {
    const tres = [c("1", "ANA", "AAA", 300, 0.43), c("2", "BETO", "BBB", 280, 0.4), c("3", "CRIS", "CCC", 100, 0.14), c("4", "DUDU", "DDD", 20, 0.03)];
    const sen = linhasUf({ SP: quase(tres, 2) }, "Senador");
    expect(tabelaUf(sen, { cargo: "Senador", corridas: [], sel: null })).toContain("Matematicamente eleitos");
    expect(painelUf(sen[0], { cor, cargo: "Senador" }).match(/<li class="eleito">/g)).toHaveLength(2);
  });

  test("the president's state rows never carry it", () => {
    const pres = linhasUf({ SP: quase(dois) }, "Presidente");
    expect(tabelaUf(pres, { cargo: "Presidente", corridas: [], sel: null })).not.toContain("Matematicamente");
    expect(painelUf(pres[0], { cor, cargo: "Presidente" })).not.toContain("Matematicamente");
  });
});
