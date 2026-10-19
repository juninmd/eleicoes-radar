import { describe, expect, test } from "bun:test";
import { renderMunicipios } from "./apuracao-municipios-view.js";
import type { MunProps } from "./apuracao-municipios-view.js";
import type { Erros, MunArquivo, MunIndice } from "./apuracao-municipios.js";
import { renderApuracao } from "./apuracao.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";

const erros: Erros = { cidade: 3.2, porTamanho: [{ ate: 5000, rmse: 4.4 }, { ate: null, rmse: 2.8 }], nacionalSemAncora: 3.6, nacionalSemAncoraRmse: 4.1, acertoVencedor: 95.3, erroVotos: 3, disputas: 6, anos: [2002, 2022] };
const params = { kappa: 0.9, eta: -0.5, ratio: 1 };
const fa = { n: "22", nome: "FLAVIO <b>X</b>", partido: "PL", sq: "A" }, fb = { n: "13", nome: "LULA", partido: "PT", sq: "B" };
const arquivo: MunArquivo = { cargo: "Presidente", uf: "BR", ano: 2026, a: fa, b: fb, cidades: [["1", "São Paulo", "SP", 6000, 3000, 1000], ["2", "Salvador", "BA", 1000, 7000, 1500], ["3", "Natal", "RN", 2000, 2200, 800]] };
const disputa = { cargo: "Presidente", uf: "BR", arquivo: "Presidente-BR.json", a: fa, b: fb };
const indice: MunIndice = { geradoEm: "x", modeloEm: "x", params: { Presidente: params, Governador: params }, erros: { Presidente: erros, Governador: erros }, disputas: [disputa] };
const cor = createCores(PALETA);
const base: MunProps = { cargo: "Presidente", uf: "BR", indice, arquivo, disputa, cenario: { modo: "neutro", alvo: 0.5 }, filtro: { uf: "", busca: "" }, limit: 40, cor };

describe("vista Cidades", () => {
  test("always says it is the Radar's estimate and never names a winner", () => {
    for (const cenario of [{ modo: "neutro", alvo: 0.5 }, { modo: "meu", alvo: 0.55 }] as const) {
      const html = renderMunicipios({ ...base, cenario });
      expect(html).toContain("Estimativa do Radar, não é resultado");
      expect(html).not.toMatch(/\b(vencer[áa]?|vai ganhar|ser[áa] eleit[oa]s?|vencedor)\b/i);
      expect(html).toContain("à frente na estimativa");
    }
  });

  test("names from the file are escaped", () => {
    const html = renderMunicipios(base);
    expect(html).not.toMatch(/<b>x<\/b>/i);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;"); // titleName lower-cases the ballot name; the markup is escaped
  });

  test("the shares of a city add to 100 and the total follows the chosen scenario", () => {
    const html = renderMunicipios({ ...base, cenario: { modo: "meu", alvo: 0.55 } });
    expect(html).toContain("55,0%");
    expect(html).toContain("45,0%");
    expect(html).toMatch(/id="mun-alvo"[^>]*value="55.0"/);
    expect(html).toContain('data-mun-modo="meu"');
  });

  test("the poll scenario needs a poll for this pair; with none the button is off and the page falls back to 'sem âncora'", () => {
    const sem = renderMunicipios({ ...base, cenario: { modo: "pesquisa", alvo: 0.5 } });
    expect(sem).toMatch(/data-mun-modo="pesquisa"[^>]*disabled/);
    expect(sem).toMatch(/data-mun-modo="neutro"[^>]*aria-pressed="true"/);
    const com = renderMunicipios({ ...base, cenario: { modo: "pesquisa", alvo: 0.5 }, confrontos: [{ a: "B", b: "A", qa: 0.52 }], ultimaPesquisa: "2026-10-17" });
    expect(com).not.toMatch(/data-mun-modo="pesquisa"[^>]*disabled/);
    expect(com).toMatch(/data-mun-modo="pesquisa"[^>]*aria-pressed="true"/);
    expect(com).toContain("48,0%"); // A's side of the poll average: 1 - 0,52
    expect(com).toContain("17/10/2026");
  });

  test("the first scenario shown is explained, and the neutral one says its total is the weak part", () => {
    expect(renderMunicipios(base)).toContain("a parte menos segura da conta");
  });

  test("the method text quotes the backtest numbers from the index, not from the page", () => {
    const html = renderMunicipios(base);
    expect(html).toContain("3,2 p.p.");
    expect(html).toContain("3,6 p.p.");
    expect(html).toContain("95%");
    expect(html).toContain("nos 6 segundos turnos de Presidente, de 2002 a 2022");
    expect(html).toContain("cidades que somam 95%");
  });

  test("a race with no runoff, loading and failed states each say so, without a table", () => {
    expect(renderMunicipios({ ...base, indice: undefined })).toContain("Carregando");
    expect(renderMunicipios({ ...base, indice: null })).toContain("Não foi possível");
    expect(renderMunicipios({ ...base, disputa: null })).toContain("não houve 2º turno");
    expect(renderMunicipios({ ...base, arquivo: undefined })).toContain("Carregando os municípios");
    expect(renderMunicipios({ ...base, arquivo: null })).toContain("Não foi possível");
    for (const p of [{ indice: undefined }, { indice: null }, { disputa: null }, { arquivo: undefined }, { arquivo: null }] as const) expect(renderMunicipios({ ...base, ...p })).not.toContain("<table");
  });

  test("a filter with no match says so; paging offers more only when there is more", () => {
    expect(renderMunicipios({ ...base, filtro: { uf: "", busca: "zzzz" } })).toContain("Nenhum município");
    expect(renderMunicipios({ ...base, limit: 2 })).toContain('id="mun-mais"');
    expect(renderMunicipios({ ...base, limit: 3 })).not.toContain('id="mun-mais"');
  });

  test("the state selector and the state table exist for the President only", () => {
    expect(renderMunicipios(base)).toContain('id="mun-uf"');
    expect(renderMunicipios(base)).toContain('data-mun-uf="SP"');
    const gov = { ...arquivo, cargo: "Governador", uf: "RN", cidades: [["1", "Natal", "RN", 2000, 2200, 800], ["2", "Mossoró", "RN", 900, 800, 200]] as MunArquivo["cidades"] };
    const html = renderMunicipios({ ...base, cargo: "Governador", uf: "RN", arquivo: gov, disputa: { ...disputa, cargo: "Governador", uf: "RN" } });
    expect(html).not.toContain('id="mun-uf"');
    expect(html).not.toContain("data-mun-uf");
  });

  test("the TSE count is shown beside the estimate and labelled as not used", () => {
    const html = renderMunicipios({ ...base, oficial: { a: 0.512, b: 0.488, secoes: 0.853 } });
    expect(html).toContain("85,3% das seções");
    expect(html).toContain("não usa esses números");
    expect(renderMunicipios(base)).not.toContain("Apuração do TSE neste momento");
  });

  test("column headers carry the party, so a phone's columns stay narrow, with the full name for screen readers", () => {
    const html = renderMunicipios(base);
    expect(html).toMatch(/<th scope="col" class="num">PL<span class="sr"> \(Flavio/);
  });

  test("inside the Apuração tab it is the 'Cidades' view of the runoff, and the tab asks for it only in the 2nd round", () => {
    const props = { cargo: "Presidente" as const, uf: "BR", byId: new Map(), avatar: () => "", limit: 40, snap: null };
    const html = renderApuracao({ ...props, turno: 2, vista: "municipios", mun: { ...base } });
    expect(html).toMatch(/data-vista="municipios"[^>]*aria-pressed="true"/);
    expect(html).toContain("Estimativa por estado");
    expect(renderApuracao({ ...props, turno: 2, vista: "municipios", mun: null })).toContain("Carregando a estimativa por município");
    expect(renderApuracao({ ...props, turno: 1, vista: "municipios", mun: { ...base } })).not.toContain("Estimativa por estado"); // falls back to the Placar
  });
});
