import { describe, expect, test } from "bun:test";
import { renderMaisVotados } from "./apuracao-maisvotados-view.js";
import type { Candidato } from "./apuracao-tse.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { UfEstado } from "./apuracao-uf.js";

const cand = (id: string, nome: string, votos: number, situacao = ""): Candidato =>
  ({ id, num: "1000", nome, partido: "PL", votos, pct: 0.1, destaque: situacao !== "", situacao, lista: "PL" });

const estado = (candidatos: Candidato[], { fase = "concluida", status = "ok" }: { fase?: string; status?: string } = {}): UfEstado =>
  ({
    status, erro: null, buscadoEm: null,
    dados: { versao: { data: "", hora: "" }, cargo: { codigo: "6", nome: "", vagas: 70 }, fase, secoes: { total: 100, totalizadas: 100 },
      eleitorado: { apto: 0, apurado: 0, comparecimento: 0, abstencao: 0 }, votos: { total: 0, validos: 0, brancos: 0, nulos: 0 }, quociente: null, candidatos, partidos: [] },
  }) as unknown as UfEstado;

// The 27 states, all answered and closed: the country is final.
const UFS27 = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const nacional = (ufs: Record<string, UfEstado>): BrasilSnapshot => ({ cargo: "Deputado Federal", ciclo: 1, buscadoEm: new Date("2026-10-25T20:00:00"), ufs });

describe("renderMaisVotados", () => {
  test("before the first file, it says the states are being consulted", () => {
    expect(renderMaisVotados({ nac: null, limite: 10 })).toContain("Consultando os 27 estados");
    expect(renderMaisVotados({ nac: nacional({ SP: { status: "carregando", dados: null, erro: null, buscadoEm: null } }), limite: 10 })).toContain("Consultando os 27 estados");
  });

  test("with fewer than 27 files it says how many answered and marks the ranking partial, never final", () => {
    const html = renderMaisVotados({ nac: nacional({ SP: estado([cand("a", "ANA", 5)], { fase: "parcial" }) }), limite: 10 });
    expect(html).toContain("Ranking parcial");
    expect(html).toContain("1 de 27 arquivos de estado responderam");
  });

  test("a stale state is named as stale in the warning", () => {
    const ufs = Object.fromEntries(UFS27.map((u) => [u, estado([cand(u, `C${u}`, 3)])]));
    ufs.SP = estado([cand("sp", "ZE", 9)], { status: "erro" });
    const html = renderMaisVotados({ nac: nacional(ufs), limite: 10 });
    expect(html).toContain("1 deles está com números de uma consulta anterior");
  });

  test("with all 27 files closed and none stale, there is no partial warning", () => {
    const ufs = Object.fromEntries(UFS27.map((u) => [u, estado([cand(u, `C${u}`, 3)])]));
    expect(renderMaisVotados({ nac: nacional(ufs), limite: 10 })).not.toContain("Ranking parcial");
  });

  test("the rows are a table with a caption and header scopes, and the bar is decorative", () => {
    const html = renderMaisVotados({ nac: nacional({ SP: estado([cand("a", "ANA", 5), cand("b", "BRUNO", 9)]) }), limite: 10 });
    expect(html).toContain("<caption");
    expect(html).toContain('<th scope="col"');
    expect(html).toMatch(/<th scope="row">[^<]*<span class="mv-pos">1º<\/span>/); // the top one is first
    expect(html.indexOf("BRUNO")).toBeLessThan(html.indexOf("ANA"));
    expect(html).toContain('class="apu-bar" aria-hidden="true"');
  });

  test("shows at most the limit, and offers 'Ver mais' until the 30 are on screen", () => {
    const ufs = { SP: estado(Array.from({ length: 35 }, (_, i) => cand(`c${i}`, `N${String(i).padStart(2, "0")}`, 100 - i))) };
    const dez = renderMaisVotados({ nac: nacional(ufs), limite: 10 });
    expect(dez.match(/class="mv-pos"/g)).toHaveLength(10);
    expect(dez).toContain('id="mv-mais"');
    const trinta = renderMaisVotados({ nac: nacional(ufs), limite: 30 });
    expect(trinta.match(/class="mv-pos"/g)).toHaveLength(30);
    expect(trinta).not.toContain('id="mv-mais"');
  });

  test("the TSE's situation text is shown only where the TSE gave one, and the Radar adds no word of its own about winners", () => {
    const html = renderMaisVotados({ nac: nacional({ SP: estado([cand("a", "ANA", 5, "Eleito por QP"), cand("b", "BRUNO", 4)]) }), limite: 10 });
    expect(html).toContain("Eleito por QP");
    expect(renderMaisVotados({ nac: nacional({ SP: estado([cand("b", "BRUNO", 4)]) }), limite: 10 })).not.toMatch(/eleit|vencedor/i);
  });

  test("no photo: the list is by name and party only", () => {
    expect(renderMaisVotados({ nac: nacional({ SP: estado([cand("a", "ANA", 5)]) }), limite: 10 })).not.toContain("<img");
  });
});
