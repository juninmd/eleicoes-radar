import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createCores } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";
import { renderNacional } from "./apuracao-nacional-view.js";
import type { NacionalArgs } from "./apuracao-nacional-view.js";
import type { Apuracao, Candidato } from "./apuracao-tse.js";
import type { BrasilSnapshot, UfEstado } from "./apuracao-uf.js";
import type { UfMap } from "../src/radar/geo/uf-map";

const mapa: UfMap = JSON.parse(readFileSync("web/mapa-uf.json", "utf8"));
const c = (id: string, nome: string, partido: string, votos: number, pct: number) => ({ id, nome, partido, num: `${id}0`, votos, pct, destaque: false, situacao: "" }) as Candidato;
const ok = (over: Partial<Apuracao> = {}) => ({
  status: "ok", erro: null, buscadoEm: null,
  dados: { fase: "parcial", secoes: { total: 100, totalizadas: 40 }, cargo: { vagas: 1 }, versao: { data: "04/10/2026", hora: "19:41:07" }, candidatos: [c("1", "ANA SOUZA", "AAA", 600, 0.6), c("2", "BETO LIMA", "BBB", 400, 0.4)], ...over },
}) as UfEstado;
const nac = (ufs: Record<string, UfEstado>): BrasilSnapshot => ({ cargo: "Governador", ciclo: 1, buscadoEm: new Date("2026-10-04T20:00:00Z"), ufs });
const base: Omit<NacionalArgs, "nac"> = { cargo: "Governador", corridas: [], modo: "lider", sel: null, cor: createCores(PALETA), mapa };

describe("renderNacional", () => {
  test("before the first answer it says it is loading, and still draws the empty map", () => {
    const html = renderNacional({ ...base, nac: null });
    expect(html).toContain("Consultando os 27 estados");
    expect(html).toContain("<svg");
  });

  test("summarizes the state of the count: how many states are done, under way, waiting or unreachable", () => {
    const ufs = {
      SP: ok({ secoes: { total: 10, totalizadas: 10 }, fase: "concluida" }),
      RJ: ok(),
      AC: ok({ fase: "aguardando", secoes: { total: 10, totalizadas: 0 } }),
      BA: { status: "erro", erro: "sem conexão com o TSE", dados: null } as UfEstado,
      AL: { status: "carregando", dados: null, erro: null } as UfEstado,
    };
    const html = renderNacional({ ...base, nac: nac(ufs) });
    expect(html).toContain("1 concluído");
    expect(html).toContain("1 em andamento");
    expect(html).toContain("1 aguardando");
    expect(html).toContain("1 sem resposta");
  });

  test("president: the sum of the states and the exterior, labelled as a sum, with the exterior as its own button", () => {
    const html = renderNacional({ ...base, cargo: "Presidente", nac: nac({ SP: ok(), ZZ: ok({ candidatos: [c("1", "ANA SOUZA", "AAA", 50, 0.5), c("2", "BETO LIMA", "BBB", 50, 0.5)] }) }) });
    expect(html).toContain("Soma dos arquivos de estado e do exterior");
    expect(html).toContain("Ana Souza");
    expect(html).toContain("Exterior");
    expect(html).toMatch(/<button[^>]*data-uf="ZZ"/);
  });

  test("state races have no exterior button and no national sum", () => {
    const html = renderNacional({ ...base, nac: nac({ SP: ok() }) });
    expect(html).not.toMatch(/<button[^>]*data-uf="ZZ"/);
    expect(html).not.toContain("Soma dos arquivos");
  });

  test("small states that cannot hold a label on the map get a button of their own", () => {
    const html = renderNacional({ ...base, nac: nac({ DF: ok() }) });
    for (const u of ["DF", "SE", "AL"]) expect(html).toMatch(new RegExp(`<button[^>]*class="chip[^"]*"[^>]*data-uf="${u}"`));
  });

  test("the mode buttons say which is active, and the poll mode appears only with poll leaders", () => {
    const html = renderNacional({ ...base, modo: "margem", nac: nac({ SP: ok() }) });
    expect(html).toMatch(/data-modo-mapa="margem"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-modo-mapa="lider"[^>]*aria-pressed="false"/);
    expect(html).not.toContain('data-modo-mapa="pesquisa"');
    const com = renderNacional({ ...base, corridas: [{ cargo: "Governador", uf: "SP", vagas: 1, lideres: [{ sq: "1", nome: "ANA", partido: "AAA", media: 0.5, lo: 0.4, hi: 0.6 }] }], nac: nac({ SP: ok() }) });
    expect(com).toContain('data-modo-mapa="pesquisa"');
  });

  test("a mode that is not available for this office falls back to the first one", () => {
    expect(renderNacional({ ...base, modo: "pesquisa", nac: nac({ SP: ok() }) })).toMatch(/data-modo-mapa="lider"[^>]*aria-pressed="true"/);
  });

  test("while the map file is still loading the page says so, instead of calling it a failure", () => {
    const html = renderNacional({ ...base, mapa: undefined, nac: nac({ SP: ok() }) });
    expect(html).toContain("Carregando o mapa");
    expect(html).not.toContain("não carregou");
  });

  test("the selected state opens its panel; the table is always there as the text version", () => {
    const html = renderNacional({ ...base, sel: "SP", nac: nac({ SP: ok() }) });
    expect(html).toContain("São Paulo");
    expect(html).toContain("Ana Souza");
    expect(html).toContain('class="exp-bars apu-ufs"');
  });

  test("if the map file cannot be loaded the table still works and the page says so", () => {
    const html = renderNacional({ ...base, mapa: null, nac: nac({ SP: ok() }) });
    expect(html).not.toContain("<svg");
    expect(html).toContain("mapa não carregou");
    expect(html).toContain("apu-ufs");
  });

  test("a state that went silent after answering is counted as out of date, not as under way", () => {
    const html = renderNacional({ ...base, nac: nac({ SP: ok(), RJ: { ...ok(), status: "erro", erro: "sem conexão com o TSE" } }) });
    expect(html).toContain("1 desatualizado");
    expect(html).toContain("1 em andamento");
    expect(renderNacional({ ...base, nac: nac({ SP: ok() }) })).not.toContain("desatualizado");
  });

  test("the swatch of a state that disagrees with the polls uses the hatched class: a CSS image cannot use an SVG pattern", () => {
    const corridas = [{ cargo: "Governador", uf: "AL", vagas: 1, lideres: [{ sq: "9", nome: "OUTRA PESSOA", partido: "ZZZ", media: 0.5, lo: 0.4, hi: 0.6 }] }];
    const html = renderNacional({ ...base, modo: "pesquisa", corridas, nac: nac({ AL: ok() }) });
    const chip = html.match(/<button[^>]*class="chip"[^>]*data-uf="AL"[^]*?<\/button>/)![0];
    expect(chip).toContain('class="key dif"');
    expect(chip).not.toContain("url(#");
  });

  test("president: the progress of the sum is rounded down while the count is open", () => {
    const html = renderNacional({ ...base, cargo: "Presidente", nac: nac({ SP: ok({ secoes: { total: 10000, totalizadas: 9996 } }) }) });
    expect(html).toContain("(99,9%)");
    expect(html).not.toContain("100,0%");
  });

  test("a run of failures never hides the states that did answer", () => {
    const html = renderNacional({ ...base, nac: nac({ SP: { ...ok(), status: "erro", erro: "sem conexão com o TSE" } }) });
    expect(html).toContain("Ana Souza"); // SP keeps its last numbers
  });
});
