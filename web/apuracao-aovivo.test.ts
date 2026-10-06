import { describe, expect, test } from "bun:test";
import { corridasDe, renderAoVivo } from "./apuracao-aovivo.js";
import { atualizar, vazio } from "./apuracao-eleitos.js";
import { parseApuracao } from "./apuracao-tse.js";
import { cand, dois, file } from "./apuracao-fixtures.js";
import type { Linha } from "./apuracao-aovivo.js";

const snap = (d: ReturnType<typeof parseApuracao>) => ({ url: "x", status: "ok" as const, dados: d, buscadoEm: new Date("2026-10-04T22:45:00Z"), erro: null });
const linhaDe = (cargo: Linha["cargo"], uf: string, cands = dois): Linha => {
  const d = parseApuracao(file({ cands }));
  return { cargo, uf, snap: snap(d), eleitos: atualizar(vazio(), d, { cargo, uf }) };
};

describe("Ao vivo", () => {
  test("as cinco disputas da cédula; no DF, deputado distrital", () => {
    expect(corridasDe("SP").map((c) => c.cargo)).toEqual(["Presidente", "Governador", "Senador", "Deputado Federal", "Deputado Estadual"]);
    expect(corridasDe("SP")[0].uf).toBe("BR");
    expect(corridasDe("DF")[4].cargo).toBe("Deputado Distrital");
  });

  test("um cartão por disputa, com a situação do TSE e a linha de quem foi eleito", () => {
    const html = renderAoVivo({ agora: new Date("2026-10-04T22:46:00Z"), linhas: [linhaDe("Governador", "SP"), { cargo: "Senador", uf: "SP", snap: null, eleitos: vazio() }] });
    expect(html.match(/class="live-card"/g)).toHaveLength(2);
    expect(html).toContain("Consultando o TSE…");
    expect(html).toContain('<time>19:41</time>');
    expect(html).toContain('O TSE marcou "Eleito"');
    expect(html).toContain("Governador · SP");
  });

  test("não chama ninguém de vencedor fora do que o TSE publica e avisa quando o arquivo é velho", () => {
    const l = linhaDe("Governador", "SP", [cand("a1", "10", "ANA SOUZA", "1", "6000", "60,00"), cand("b2", "20", "BETO LIMA", "2", "4000", "40,00")]);
    const velha = { ...l, snap: { ...l.snap!, status: "erro" as const, erro: "sem conexão com o TSE" } };
    const html = renderAoVivo({ agora: new Date("2026-10-04T22:46:00Z"), linhas: [velha] });
    expect(html).toContain("Números desatualizados");
    expect(html.split('<p class="muted small">Cada cartão')[0]).not.toMatch(/venceu|vencedor|vai vencer|será eleit/i);
    expect(html).toContain("Ninguém tem situação de eleito ainda");
  });
});
