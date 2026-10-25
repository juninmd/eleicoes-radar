import { describe, expect, test } from "bun:test";
import { renderChance, chanceTxt } from "./apuracao-chance-view.js";
import { renderExterior } from "./apuracao-exterior.js";
import { renderPainel } from "./apuracao-painel.js";
import { chance } from "./apuracao-chance.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";
import { file, cand } from "./apuracao-fixtures.js";
import { parseApuracao } from "./apuracao-tse.js";
import type { ChanceProps } from "./apuracao-chance-view.js";
import type { LeituraChance, ParteChance } from "./apuracao-chance.js";
import type { BrasilSnapshot, UfEstado } from "./apuracao-uf.js";
import type { MunArquivo } from "./apuracao-municipios.js";

const VENCEDOR = /\b(vencer[áa]?|venceu|vai ganhar|ser[áa] eleit[oa]s?|vencedor[ae]?s?)\b/i;
const cor = createCores(PALETA);
const partes: ParteChance[] = [{ id: "SP", a: 300, b: 200, restante: 500, prior: 0.5, esperado: 1000 }, { id: "ZZ", a: 0, b: 0, restante: 40, prior: 0.4, esperado: 40 }];
const leitura = (ps = partes): LeituraChance => ({ chance: chance(ps, { sigmaComum: 0.16, sigmaParte: 0.11 }), partes: ps, ancora: null, erros: { cidade: 3, porTamanho: [{ ate: null, rmse: 2.8 }], nacionalSemAncora: 3.6, nacionalSemAncoraRmse: 4.1, acertoVencedor: 95, erroVotos: 3, disputas: 6, anos: [2002, 2022] } });
const props = (over: Partial<ChanceProps> = {}): ChanceProps => ({ estado: "ok", leitura: leitura(), a: { id: "a1", nome: "ANA SOUZA", partido: "AAA" }, b: { id: "b2", nome: "BETO LIMA", partido: "BBB" }, cargo: "Presidente", cor, ...over });

describe("Chance ao vivo", () => {
  test("labelled as the Radar's estimate, with each chance and the band, and never a winner", () => {
    const html = renderChance(props());
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(html).toContain("Chance de terminar à frente");
    expect(html).toContain("Ana Souza");
    expect(html).toMatch(/de \d+,\d% a \d+,\d% em 90%/);
    expect(html).not.toMatch(VENCEDOR);
  });

  test("the measured deviation is said with its direction; the president gets a table by state", () => {
    const html = renderChance(props());
    expect(html).toMatch(/p\.p\. mais a favor de Ana Souza/);
    expect(html).toContain('data-k="chance-ufs"');
    expect(html).toContain("Ext.");
    expect(renderChance(props({ cargo: "Governador" }))).not.toContain('data-k="chance-ufs"');
  });

  test("before any vote it says the model alone speaks; with a poll anchor, the method names it", () => {
    const sem = [{ ...partes[0]!, a: 0, b: 0, restante: 1000 }];
    expect(renderChance(props({ leitura: leitura(sem) }))).toContain("por enquanto fala só o modelo");
    expect(renderChance(props({ leitura: { ...leitura(), ancora: 0.52 } }))).toContain("ancorado na média das pesquisas");
    expect(renderChance(props({ simulado: true }))).toContain("Na simulação não há pesquisa");
  });

  test("never a false 0% or 100%", () => {
    expect(chanceTxt(0)).toBe("menos de 1%");
    expect(chanceTxt(1)).toBe("mais de 99%");
    expect(chanceTxt(0.5)).toBe("50%");
  });

  test("states without a runoff, loading, and a finished count each have their own words", () => {
    expect(renderChance(props({ estado: "sem-disputa" }))).toContain("não tem 2º turno");
    expect(renderChance(props({ estado: "carregando", leitura: null }))).toContain("Carregando o modelo");
    const fim = renderChance(props({ concluida: true }));
    expect(fim).toContain("vale o resultado do TSE");
    expect(fim).not.toContain("Chance de terminar");
  });

  test("the compact form for the panel keeps the label", () => {
    const html = renderChance(props({ compacto: true }));
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(html).not.toContain("Como calculamos");
  });
});

const uf = (dados: ReturnType<typeof parseApuracao>, status: UfEstado["status"] = "ok"): UfEstado => ({ status, dados, erro: null, buscadoEm: new Date() });
const zz = parseApuracao(file({ s: { ts: "100", st: "50" }, cands: [cand("a1", "13", "ANA SOUZA", "1", "300", "60,00"), cand("b2", "22", "BETO LIMA", "2", "200", "40,00")], v: { vv: "500", vvc: "500" } }))!;
const sp = parseApuracao(file({ cands: [cand("a1", "13", "ANA SOUZA", "1", "60000", "60,00"), cand("b2", "22", "BETO LIMA", "2", "40000", "40,00")], v: { vv: "100000", vvc: "100000" } }))!;
const nac = (z: UfEstado | undefined = uf(zz)): BrasilSnapshot => ({ cargo: "Presidente", ciclo: 1, buscadoEm: new Date(), ufs: { SP: uf(sp), ...(z ? { ZZ: z } : {}) } });
const mun: MunArquivo = {
  cargo: "Presidente", uf: "BR", ano: 2026, a: { n: "13", nome: "ANA SOUZA", partido: "AAA", sq: "a1" }, b: { n: "22", nome: "BETO LIMA", partido: "BBB", sq: "b2" },
  cidades: [...Array.from({ length: 20 }, (_, i): MunArquivo["cidades"][number] => [`${i}`, `CIDADE ${i}`, "ZZ", 100 + i, 50, 10]), ["99", "SÃO PAULO", "SP", 1000, 900, 100]],
};

describe("Exterior", () => {
  test("the live file abroad against the country, and the 1st round by city", () => {
    const html = renderExterior({ nac: nac(), br: sp, mun, cor, turno: 2 });
    expect(html).toContain("Votos do exterior");
    expect(html).toMatch(/no país 60,0%/);
    expect(html).toContain("1º turno por cidade no exterior");
    expect(html).toContain("Cidade 19"); // the largest abroad comes first
    expect(html).not.toContain("São Paulo"); // a city in Brazil is not abroad
    expect(html).toContain("Todas as 20 cidades");
  });

  test("in the simulation the table by city stays out: it names the real candidacies", () => {
    const html = renderExterior({ nac: nac(), br: sp, mun, cor, turno: 2, simulado: true });
    expect(html).not.toContain("1º turno por cidade");
    expect(html).toContain("fica de fora");
  });

  test("a missing, failed or stale file abroad says so", () => {
    expect(renderExterior({ nac: nac({ status: "ausente", dados: null, erro: null, buscadoEm: null }), cor, turno: 1, mun: null })).toContain("ainda não publicou o arquivo do exterior");
    expect(renderExterior({ nac: nac(uf(zz, "erro")), cor, turno: 1, mun: null })).toContain("Números desatualizados");
    expect(renderExterior({ nac: null, cor, turno: 1 })).toContain("Consultando o arquivo do exterior");
  });
});

describe("Tela cheia", () => {
  const base = { cargo: "Presidente" as const, uf: "BR", turno: 2 as const, snap: { status: "ok" as const, dados: sp, buscadoEm: new Date("2026-10-25T21:00:00Z"), erro: null }, nac: nac(), mapa: null, cor, novidades: [], simulado: false, proj: null };

  test("the runoff panel has the duel, the labelled chance, the exterior and the sections", () => {
    const html = renderPainel({ ...base, chance: props({ compacto: true }), exterior: { nac: nac(), br: sp, cor, turno: 2 } });
    expect(html).toContain("apu-duelo");
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(html).toContain("Exterior");
    expect(html).toContain("seções totalizadas");
    expect(html).toContain('id="apu-quando"');
    expect(html).not.toMatch(VENCEDOR);
  });

  test("a 1st-round panel shows the projection summary, labelled; the simulation is marked", () => {
    const html = renderPainel({ ...base, turno: 1, chance: null, exterior: null, simulado: true });
    expect(html).toContain("Projeção do Radar");
    expect(html).toContain("Estimativa do Radar, não é resultado");
    expect(html).toContain('<span class="rot baixa">Simulação</span>');
  });

  test("a proportional race shows the first ones with the TSE's status text, without any estimate", () => {
    const dep = parseApuracao(file({ cargo: { cd: "6", nmn: "Deputado Federal", nv: "70" }, cands: [cand("a1", "1111", "ANA", "1", "900", "9,00", "s", "Eleito por QP")] }))!;
    const html = renderPainel({ ...base, cargo: "Deputado Federal", uf: "SP", turno: 1, snap: { ...base.snap, dados: dep }, chance: null, exterior: null });
    expect(html).toContain("Eleito por QP (TSE)");
    expect(html).not.toContain("Estimativa do Radar");
  });

  test("no file yet: the panel says what it is waiting for", () => {
    expect(renderPainel({ ...base, snap: { status: "ausente", dados: null }, chance: null, exterior: null })).toContain("ainda não publicou");
  });
});
