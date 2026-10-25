import { describe, expect, test } from "bun:test";
import { linhasUf } from "./apuracao-nacional.js";
import { maisVotados, resumoArquivos } from "./apuracao-maisvotados.js";
import type { Candidato } from "./apuracao-tse.js";
import type { UfEstado } from "./apuracao-uf.js";

const cand = (id: string, nome: string, partido: string, votos: number, pct = 0, situacao = ""): Candidato =>
  ({ id, num: "1000", nome, partido, votos, pct, destaque: false, situacao, lista: partido });

const uf = (candidatos: Candidato[], { fase = "parcial", status = "ok", total = 100, feitas = 50 }: { fase?: string; status?: string; total?: number; feitas?: number } = {}) =>
  ({
    status, erro: null, buscadoEm: null,
    dados: {
      versao: { data: "", hora: "" }, cargo: { codigo: "6", nome: "Deputado Federal", vagas: 70 }, fase, secoes: { total, totalizadas: feitas },
      eleitorado: { apto: 0, apurado: 0, comparecimento: 0, abstencao: 0 }, votos: { total: 0, validos: 0, brancos: 0, nulos: 0 },
      quociente: null, candidatos, partidos: [],
    },
  }) as unknown as UfEstado;

const ufs = {
  SP: uf([cand("s1", "TIRIRICA", "PL", 900, 0.05, "Eleito"), cand("s2", "ANA", "PT", 500, 0.03), cand("s3", "ZE", "PSD", 0)], { fase: "parcial" }),
  RJ: uf([cand("r1", "BRUNO", "PT", 900, 0.2, "Eleito por QP"), cand("r2", "CARLA", "UNIÃO", 700, 0.15)], { fase: "concluida", feitas: 100 }),
  AC: uf([cand("a1", "DUDA", "MDB", 0)], { fase: "aguardando", feitas: 0 }),
};
const linhas = linhasUf(ufs, "Deputado Federal");

describe("maisVotados", () => {
  test("ranks the candidates of every state together, by votes, and keeps the state each one ran in", () => {
    const top = maisVotados(linhas, 10);
    expect(top.map((c) => [c.nome, c.uf, c.votos])).toEqual([["BRUNO", "RJ", 900], ["TIRIRICA", "SP", 900], ["CARLA", "RJ", 700], ["ANA", "SP", 500]]);
  });

  test("a tie in votes goes to the name in Portuguese order, and a tie in name goes to the id, so the order is the same on every read", () => {
    const empate = linhasUf({
      SP: uf([cand("z", "ZE", "PL", 10), cand("b", "ANA", "PL", 10)]),
      MG: uf([cand("a", "ANA", "PT", 10), cand("c", "ÁLVARO", "PT", 10)]),
    }, "Deputado Federal");
    expect(maisVotados(empate, 10).map((c) => c.id)).toEqual(["c", "a", "b", "z"]); // ÁLVARO, ANA (a), ANA (b), ZE
    expect(maisVotados([...empate].reverse(), 10).map((c) => c.id)).toEqual(["c", "a", "b", "z"]);
  });

  test("a candidate with no votes yet is not ranked: before the count every name sits at zero and would only fill the list", () => {
    const top = maisVotados(linhas, 30);
    expect(top.some((c) => c.votos === 0)).toBe(false);
    expect(top.map((c) => c.nome)).not.toContain("DUDA");
    expect(top.map((c) => c.nome)).not.toContain("ZE");
  });

  test("the limit cuts the list, and asking for more than there is returns every candidate that has votes", () => {
    expect(maisVotados(linhas, 2).map((c) => c.nome)).toEqual(["BRUNO", "TIRIRICA"]);
    expect(maisVotados(linhas, 30)).toHaveLength(4);
    expect(maisVotados(linhas, 0)).toEqual([]);
  });

  test("a state that has not answered adds nothing, and an empty country has no ranking", () => {
    const parcial = linhasUf({ ...ufs, MG: { status: "carregando", dados: null, erro: null, buscadoEm: null } as UfEstado }, "Deputado Federal");
    expect(maisVotados(parcial, 30)).toHaveLength(4);
    expect(maisVotados([], 10)).toEqual([]);
  });

  test("the share of the state and the TSE's situation text come from the state file as they are", () => {
    const [bruno] = maisVotados(linhas, 1);
    expect(bruno).toMatchObject({ id: "r1", partido: "PT", pct: 0.2, situacao: "Eleito por QP" });
    expect(maisVotados(linhas, 30).find((c) => c.nome === "CARLA")?.situacao).toBe("");
  });
});

describe("resumoArquivos", () => {
  test("counts the states that answered, and the ones whose last numbers are from an earlier read", () => {
    const com = linhasUf({ ...ufs, MG: uf([cand("m1", "X", "PL", 1)], { status: "erro" }) }, "Deputado Federal");
    expect(resumoArquivos(com)).toMatchObject({ lidos: 4, desatualizados: 1, de: 27 }); // 27 states in the country, not in the file
    expect(resumoArquivos(linhasUf({ SP: { status: "carregando", dados: null, erro: null, buscadoEm: null } as UfEstado }, "Deputado Federal"))).toMatchObject({ lidos: 0, de: 27 });
  });

  test("the ranking is final only when all 27 states answered, none is stale and every count is closed", () => {
    expect(resumoArquivos(linhas).definitivo).toBe(false); // SP still counting, AC not started
    const dois = linhasUf({ RJ: ufs.RJ, SP: uf([cand("s1", "X", "PL", 1)], { fase: "concluida", feitas: 100 }) }, "Deputado Federal");
    expect(resumoArquivos(dois, 2).definitivo).toBe(true);
    expect(resumoArquivos(dois, 27).definitivo).toBe(false); // 25 states are missing
    expect(resumoArquivos(linhasUf({ RJ: ufs.RJ, SP: uf([cand("s1", "X", "PL", 1)], { fase: "concluida", feitas: 100, status: "ausente" }) }, "Deputado Federal"), 2).definitivo).toBe(false);
  });
});
