import { describe, expect, test } from "bun:test";
import { atualizar, renderEleitos, vazio } from "./apuracao-eleitos.js";
import { parseApuracao } from "./apuracao-tse.js";
import { cand, file, dois } from "./apuracao-fixtures.js";

const ap = (hg: string, cands = dois, s = {}) => parseApuracao({ ...file({ cands, s }), hg });
const ctx = { cargo: "Governador" as const, uf: "SP" };

describe("linha do tempo dos eleitos", () => {
  test("registra o eleito do TSE uma vez só, mesmo com arquivos novos", () => {
    let est = atualizar(vazio(), ap("19:41:07"), ctx);
    expect(est.itens.map((i) => [i.nome, i.tipo, i.ja])).toEqual([["ANA SOUZA", "tse", true]]);
    est = atualizar(est, ap("19:45:00"), ctx);
    expect(est.itens).toHaveLength(1);
  });

  test("quem é marcado depois entra no topo, sem o aviso de já constar", () => {
    const antes = [cand("a1", "10", "ANA SOUZA", "1", "6000", "60,00"), cand("b2", "20", "BETO LIMA", "2", "4000", "40,00")];
    let est = atualizar(vazio(), ap("19:41:07", antes), ctx);
    est = atualizar(est, ap("19:50:00"), ctx);
    expect(est.itens.map((i) => [i.nome, i.ja])).toEqual([["ANA SOUZA", false]]);
  });

  test("a mesma versão do arquivo não muda nada e o aguardando também não", () => {
    const est = atualizar(vazio(), ap("19:41:07"), ctx);
    expect(atualizar(est, ap("19:41:07"), ctx)).toBe(est);
    expect(atualizar(vazio(), ap("19:41:07", dois, { ts: "1000", st: "0" }), ctx).itens).toEqual([]);
  });

  test("a tela diz quem marcou e não chama ninguém de vencedor sem o TSE", () => {
    const d = ap("19:41:07");
    const html = renderEleitos(atualizar(vazio(), d, ctx), d, "Governador");
    expect(html).toContain('O TSE marcou "Eleito"');
    expect(html).toContain("1</b> de 1 vaga");
    expect(html).toContain("já constava quando você abriu a aba");
  });

  test("sem ninguém eleito a linha explica e não inventa nome", () => {
    const d = ap("19:41:07", [cand("a1", "10", "ANA SOUZA", "1", "6000", "60,00"), cand("b2", "20", "BETO LIMA", "2", "4000", "40,00")]);
    const html = renderEleitos(atualizar(vazio(), d, ctx), d, "Deputado Federal");
    expect(html).toContain("Ninguém tem situação de eleito ainda");
    expect(html).not.toContain("ANA");
  });
});
