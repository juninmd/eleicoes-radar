import { describe, expect, test } from "bun:test";
import { ARTIGO_17, formarEvento, formarProposicao, formarVotacao, indiceVoto, NOMINAL, novoDicionario, propDaVotacao } from "./painel-forma.js";

const dep = (id: number, nome: string, partido: string, uf: string) => ({ id, nome, siglaPartido: partido, siglaUf: uf });

describe("formarVotacao", () => {
  const det = { id: "1-2", data: "2026-10-14", descricao: "  Aprovada   a emenda.\n Sim: 2; Não: 1. ", aprovacao: "1", proposicoesAfetadas: [{ id: 5, siglaTipo: "REQ", numero: 1, ano: 2026, ementa: "x" }, { id: 7, siglaTipo: "PLP", numero: 281, ano: 2019, ementa: "Dispõe  sobre\nalgo" }] };
  test("tabelas compactas: deputado e partido viram índices, voto vira número, Art. 17 sai", () => {
    const dic = novoDicionario();
    const v = formarVotacao(det, [
      { tipoVoto: "Sim", deputado_: dep(10, "Ana", "AAA", "SP") }, { tipoVoto: "Não", deputado_: dep(11, "Bia", "AAA", "RJ") },
      { tipoVoto: "Abstenção", deputado_: dep(12, "Cris", "BBB", "BA") }, { tipoVoto: ARTIGO_17, deputado_: dep(99, "Presidente", "CCC", "MG") }, { tipoVoto: "Sei lá", deputado_: dep(13, "Davi", "BBB", "BA") },
    ], [{ codTipoLideranca: "P", siglaPartidoBloco: "AAA", orientacaoVoto: "Sim" }], dic)!;
    expect(v.votos).toEqual([[0, 0, 0], [1, 0, 1], [2, 1, 2], [3, 1, 4]]);
    expect(dic.siglas).toEqual(["AAA", "BBB"]); expect(dic.lista.map((d) => d[1])).toEqual(["Ana", "Bia", "Cris", "Davi"]);
    expect(v.descricao).toBe("Aprovada a emenda. Sim: 2; Não: 1."); expect(v.aprovada).toBe(true);
    expect(v.prop).toEqual({ sigla: "PLP", numero: "281", ano: "2019", ementa: "Dispõe sobre algo", id: 7 });
    expect(v.orient).toEqual([["P", "AAA", "Sim"]]);
  });
  test("o mesmo deputado em duas votações usa o mesmo índice; votação sem voto válido é descartada", () => {
    const dic = novoDicionario(), vt = [{ tipoVoto: "Sim", deputado_: dep(10, "Ana", "AAA", "SP") }];
    formarVotacao(det, vt, [], dic); formarVotacao({ ...det, id: "2" }, vt, [], dic);
    expect(dic.lista).toHaveLength(1);
    expect(formarVotacao(det, [], [], dic)).toBeNull();
    expect(formarVotacao(det, [{ tipoVoto: ARTIGO_17, deputado_: dep(1, "P", "A", "SP") }], [], dic)).toBeNull();
  });
  test("aprovacao ausente vira null e sem proposição afetada não quebra", () => {
    const dic = novoDicionario(), v = formarVotacao({ ...det, aprovacao: undefined, proposicoesAfetadas: null }, [{ tipoVoto: "Sim", deputado_: dep(1, "A", "X", "SP") }], [], dic)!;
    expect(v.aprovada).toBeNull(); expect(v.prop).toBeNull();
    expect(propDaVotacao([{ id: 1, siglaTipo: "REQ", numero: 3, ano: 2026, ementa: "r" }])?.sigla).toBe("REQ"); // no project among them: the first
  });
  test("indiceVoto e o filtro de votação nominal", () => {
    expect([indiceVoto("Sim"), indiceVoto("Não"), indiceVoto("Abstenção"), indiceVoto("Obstrução"), indiceVoto("Artigo 17"), indiceVoto("")]).toEqual([0, 1, 2, 3, 4, 4]);
    expect(NOMINAL.test("Aprovado. Sim: 320; Não: 67")).toBe(true);
    expect(NOMINAL.test("Aprovado, por unanimidade, o Requerimento de Urgência.")).toBe(false);
  });
});

describe("formarEvento e formarProposicao", () => {
  test("evento: pauta com relator, textos aparados e local da Câmara como reserva", () => {
    const e = formarEvento({ id: 1, dataHoraInicio: "2026-11-03T14:00", descricaoTipo: "Reunião", descricao: " a  b ", localCamara: { nome: "Plenário 2" }, orgaos: [{ sigla: "CCJC", nome: "Comissão" }] },
      [{ ordem: 1, topico: "Urgente", regime: "Urgência (Art. 155, RICD)", titulo: "PL 1/2026", proposicao_: { ementa: "x".repeat(900) }, relator: { nome: "Ana", siglaPartido: "AAA", siglaUf: "SP" } }]);
    expect(e.local).toBe("Plenário 2"); expect(e.descricao).toBe("a b"); expect(e.fim).toBeNull();
    expect(e.pauta[0]!.ementa).toHaveLength(400); expect(e.pauta[0]!.relator).toEqual({ nome: "Ana", partido: "AAA", uf: "SP" });
  });
  test("proposição: só link do domínio da Câmara, despacho com no máximo 240 caracteres", () => {
    const p = (url: string | null) => formarProposicao({ id: "7", siglaTipo: "PL", numero: 1, ano: 2026, descricaoTipo: "Projeto de Lei", ementa: "e", dataApresentacao: "2026-01-10T10:00", urlInteiroTeor: url },
      [{ dataHora: "2026-01-10T00:00", siglaOrgao: "PLEN", descricaoTramitacao: "Apresentação", despacho: "d".repeat(500) }], [{ nome: "Ana" }], [{ tema: "Economia" }]);
    expect(p("https://www.camara.leg.br/x").inteiroTeor).toBe("https://www.camara.leg.br/x");
    expect(p("https://evil.example/x").inteiroTeor).toBeNull(); expect(p("javascript:alert(1)").inteiroTeor).toBeNull(); expect(p(null).inteiroTeor).toBeNull();
    const q = p(null); expect(q.titulo).toBe("PL 1/2026"); expect(q.apresentacao).toBe("2026-01-10"); expect(q.tram[0]![5]).toHaveLength(240); expect(q.tram[0]![3]).toBe("");
  });
});
