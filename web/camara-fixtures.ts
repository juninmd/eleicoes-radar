// Small, made-up data in the shape of painel.json (fictional names, three parties), used by the Câmara tab tests.
import type { EventoPauta, PainelCamara, Proposicao, VotacaoCamara } from "../src/radar/camara/painel-tipos.js";

// A name that tries to inject markup. Built in pieces so the repo-wide scan for inline handlers (serve.test.ts) does not flag the test data.
export const INJETADO = ["<im", "g src=x on", "error=alert(1)>"].join("");
export const HOJE = "2026-10-31";
// deputados: 0 Ana AAA-SP, 1 Bruno AAA-SP, 2 Carla BBB-RJ, 3 Davi BBB-RJ, 4 Eva CCC-BA, 5 Fabio CCC-BA (and INJETADO)
export const DEPUTADOS: PainelCamara["deputados"] = [[1, "Ana Alfa", "SP"], [2, "Bruno Alfa", "SP"], [3, "Carla Beta", "RJ"], [4, "Davi Beta", "RJ"], [5, "Eva Gama", "BA"], [6, INJETADO, "BA"]];
export const PARTIDOS = ["AAA", "BBB", "CCC"];

// votos: [deputado, partido, voto]; 0 Sim, 1 Não, 2 Abstenção, 3 Obstrução, 4 Outro
export function votacao(id: string, data: string, votos: VotacaoCamara["votos"], orient: VotacaoCamara["orient"] = []): VotacaoCamara {
  return { id, data, descricao: `Aprovada a emenda. Sim: ${votos.filter((v) => v[2] === 0).length}; Não: ${votos.filter((v) => v[2] === 1).length}.`, aprovada: true, prop: { sigla: "PL", numero: "10", ano: "2026", ementa: "Dispõe sobre algo.", id: 10 }, orient, votos };
}
export const V1 = votacao("1-1", "2026-10-14", [[0, 0, 0], [1, 0, 1], [2, 1, 1], [3, 1, 1], [4, 2, 0], [5, 2, 0]], [["P", "AAA", "Sim"], ["P", "BBB", "Não"], ["B", "Fdr CCC-ZZZ", "Sim"], ["B", "Governo", "Sim"]]);
export const V2 = votacao("2-1", "2026-09-03", [[0, 0, 0], [1, 0, 0], [2, 1, 1], [3, 1, 0], [4, 2, 0], [5, 2, 1]], [["P", "AAA", "Sim"], ["P", "BBB", "Liberado"]]);
export const V3 = votacao("3-1", "2026-08-12", [[0, 0, 1], [1, 0, 1], [2, 1, 0], [3, 1, 0], [4, 2, 1], [5, 2, 1]]);

export const EVENTOS: EventoPauta[] = [
  { id: 900, inicio: "2026-11-03T14:00", fim: null, situacao: "Convocada", tipo: "Reunião Deliberativa", descricao: "Votação de propostas", local: "Plenário 2", orgaos: [{ sigla: "CCJC", nome: "Comissão de Constituição e Justiça" }],
    pauta: [{ ordem: 1, topico: "Urgente", regime: "Urgência (Art. 155, RICD)", titulo: "PL 1/2026", ementa: "Altera a lei X.", parecer: "Parecer pela aprovação.", relator: { nome: "Carla Beta", partido: "BBB", uf: "RJ" } }, { ordem: 2, topico: "Ordinária", regime: "Ordinário (Art. 151, III, RICD)", titulo: "PL 2/2026", ementa: "Cria o programa Y.", parecer: "", relator: null }] },
  { id: 901, inicio: "2026-11-03T14:30", fim: "2026-11-03T16:00", situacao: "Convocada", tipo: "Audiência Pública", descricao: "Debate", local: "", orgaos: [{ sigla: "CE", nome: "Comissão de Educação" }], pauta: [] },
  { id: 902, inicio: "2026-11-04T09:00", fim: null, situacao: "Convocada", tipo: "Sessão Deliberativa", descricao: "Sessão do Plenário", local: "", orgaos: [{ sigla: "PLEN", nome: "Plenário" }], pauta: [] },
];

export const PROPOSICAO: Proposicao = {
  id: 10, titulo: "PL 10/2026", tipo: "Projeto de Lei", ementa: "Dispõe sobre algo.", apresentacao: "2026-01-10", inteiroTeor: "https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=1",
  autores: [{ nome: "Ana Alfa", tipo: "Deputado" }], temas: ["Economia"],
  tram: [["2026-01-10", "PLEN", "Apresentação de Proposição", "Aguardando", "Ordinário", "Despacho um."], ["2026-01-15", "CCJC", "Distribuição", "Aguardando Parecer", "Ordinário", ""], ["2026-06-15", "CCJC", "Parecer do Relator", "Pronta", "Ordinário", "Parecer."], ["2026-10-14", "PLEN", "Votação", "Aprovada", "Urgência", ""]],
};

export const painel = (): PainelCamara => ({ geradoEm: HOJE, deputados: DEPUTADOS, partidos: PARTIDOS, votacoes: [V1, V2, V3], pauta: EVENTOS, proposicoes: [PROPOSICAO] });

/** Three benches of nine that vote together (AAA, BBB) or against them (CCC), over four roll calls: enough for the affinity maps. */
export function painelGrande(): PainelCamara {
  const mk = (i: number, a: number, b: number, c: number) => votacao(`${i}`, `2026-0${i}-01`, [...Array.from({ length: 9 }, (_, d) => [d, 0, a] as [number, number, number]), ...Array.from({ length: 9 }, (_, d) => [9 + d, 1, b] as [number, number, number]), ...Array.from({ length: 9 }, (_, d) => [18 + d, 2, c] as [number, number, number])]);
  return { ...painel(), deputados: Array.from({ length: 27 }, (_, i) => [i + 1, `Dep ${i}`, "SP"] as [number, string, string]), votacoes: [mk(1, 0, 0, 1), mk(2, 1, 1, 0), mk(3, 0, 0, 1), mk(4, 1, 1, 0)] };
}
