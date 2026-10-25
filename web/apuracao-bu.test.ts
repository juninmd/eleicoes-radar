import { describe, expect, test } from "bun:test";
import { renderBu, type BuData } from "./apuracao-bu.js";
import type { SnapView } from "./apuracao.js";

const cand = (nr: string, nome: string, votos: number) => ({ nr, nome, partido: nr === "13" ? "PT" : "PL", votos });
const bu: BuData = {
  ano: 2026, turno: 1, uf: "AC", cargo: "Presidente",
  geradoEm: "2026-10-06T14:03:43Z", buGeradoEm: "05/10/2026 14:03:43", recebidoAte: "2026-10-04 18:25:49",
  fonte: "TSE — Boletim de Urna (dados abertos)", fonteUrl: "https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna",
  municipios: [
    { cd: "1", nome: "Alfa", secoes: 2, aptos: 200, comparecimento: 160, abstencoes: 40, brancos: 5, nulos: 5, candidatos: [cand("13", "Lula", 60), cand("22", "Flavio", 30)] },
    { cd: "2", nome: "Beta", secoes: 1, aptos: 100, comparecimento: 80, abstencoes: 20, brancos: 2, nulos: 3, candidatos: [cand("13", "Lula", 20), cand("22", "Flavio", 55)] },
  ],
  total: { secoes: 3, aptos: 300, comparecimento: 240, abstencoes: 60, brancos: 7, nulos: 8, candidatos: [cand("13", "Lula", 80), cand("22", "Flavio", 85)] },
};

const snap: SnapView = {
  status: "ok",
  dados: {
    versao: { data: "04/10/2026", hora: "18:30" }, cargo: { codigo: "1", nome: "Presidente", vagas: 1 }, fase: "concluida",
    secoes: { total: 3, totalizadas: 3 }, eleitorado: { apto: 300, apurado: 300, comparecimento: 240, abstencao: 60 },
    votos: { total: 240, validos: 225, brancos: 7, nulos: 8 }, quociente: null,
    candidatos: [
      { id: "a", num: "13", nome: "Lula", partido: "PT", votos: 80, pct: 0.356, destaque: true, situacao: "", lista: "" },
      { id: "b", num: "22", nome: "Flavio", partido: "PL", votos: 85, pct: 0.378, destaque: true, situacao: "", lista: "" },
    ],
  } as unknown as SnapView["dados"],
};

describe("Boletim de Urna por município", () => {
  test("oficial: tabela, total e candidatos principais", () => {
    const html = renderBu({ bu, cargo: "Presidente", uf: "AC", raceUf: "AC", turno: 1 });
    expect(html).toContain("Boletim de Urna");
    expect(html).toContain("Oficial");
    expect(html).toContain("Alfa");
    expect(html).toContain("Beta");
    expect(html).toContain("Total (2 municípios)");
    expect(html).toContain("Lula");
    expect(html).toContain("Flavio");
    expect(html).toContain('id="bu-busca"');
    expect(html).not.toMatch(/vai vencer|vencedor|será eleit/i);
  });

  test("busca filtra e o limite mostra Ver mais", () => {
    expect(renderBu({ bu, cargo: "Presidente", uf: "AC", raceUf: "AC", turno: 1, busca: "bet" })).not.toContain("Alfa");
    const curto = renderBu({ bu, cargo: "Presidente", uf: "AC", raceUf: "AC", turno: 1, limit: 1 });
    expect(curto).toContain("Mostrando 1 de 2 municípios");
    expect(curto).toContain('id="bu-mais"');
  });

  test("sem o BU do turno, mostra o parcial do TSE e não inventa municípios", () => {
    const html = renderBu({ bu: null, snap, cargo: "Presidente", uf: "SP", raceUf: "BR", turno: 2 });
    expect(html).toContain("Parcial");
    expect(html).toContain("O TSE ainda não publicou o BU por município deste turno");
    expect(html).toContain("Lula");
    expect(html).not.toContain("Total (2 municípios)");
    expect(html).not.toContain("Alfa");
  });

  test("BU de outro turno fica como referência, com aviso", () => {
    const html = renderBu({ bu, snap, cargo: "Presidente", uf: "AC", raceUf: "AC", turno: 2 });
    expect(html).toContain("referência");
    expect(html).toContain("não do 2º turno");
    expect(html).toContain("Alfa");
  });

  test("compara a soma do BU com o arquivo do TSE do mesmo turno", () => {
    expect(renderBu({ bu, snap, cargo: "Presidente", uf: "AC", raceUf: "AC", turno: 1 })).toContain("Confere com o TSE");
    const outro = { ...snap, dados: { ...snap.dados!, candidatos: snap.dados!.candidatos.map((c) => ({ ...c, votos: c.votos + 2 })) } } as SnapView;
    expect(renderBu({ bu, snap: outro, cargo: "Presidente", uf: "AC", raceUf: "AC", turno: 1 })).toContain("Difere do TSE");
  });

  test("Presidente recebe o seletor de UF; Governador não", () => {
    expect(renderBu({ bu, cargo: "Presidente", uf: "AC", raceUf: "BR", turno: 1, ufOpcoes: ["AC", "SP"] })).toContain('id="bu-uf"');
    expect(renderBu({ bu, cargo: "Governador", uf: "AC", raceUf: "AC", turno: 1 })).not.toContain('id="bu-uf"');
  });
});

