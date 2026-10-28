import { describe, expect, test } from "bun:test";
import { CENARIOS, dec, maiorCurtose, media, paraConferir, pc, posicaoNoLocal, reducoes, sinal, sinaisGov, statusDe, TESTES, TESTES_COM_SINAL, totais } from "./auditoria-dados.js";
import { auditoria, eleicao, governador } from "./auditoria-fixtures.js";

describe("formatos pt-BR", () => {
  test("dec, pc e sinal", () => {
    expect(dec(1234.5, 1)).toBe("1.234,5");
    expect(dec(null)).toBe("–");
    expect(dec(Number.NaN)).toBe("–");
    expect(pc(0.5)).toBe("50%");
    expect(pc(undefined)).toBe("–");
    expect(sinal(-1.5)).toBe("−1,50");
    expect(sinal(2)).toBe("+2,00");
  });
  test("statusDe nunca devolve palavra de acusação", () => {
    expect([0, 1, 2, 9].map(statusDe)).toEqual(["sem sinal", "para conferir", "informativo", "informativo"]);
  });
});

describe("totais e paraConferir", () => {
  test("conta só os 8 testes com sinal; os dois descritivos ficam de fora", () => {
    expect(TESTES).toHaveLength(10);
    expect(TESTES_COM_SINAL.map((t) => t.k)).not.toContain("s_out");
    const t = totais(auditoria().eleicoes);
    expect(t.turnos).toBe(3);
    expect(t.testes).toBe(24); // 3 turnos x 8 testes
    expect(t.paraConferir).toBe(2); // s_zero 2022-2 e s_arit 2026-1
    expect(t.semSinal).toBe(22);
    expect(t.secoes).toBe(3000);
  });
  test("paraConferir lista na ordem da tabela de testes", () => {
    const l = paraConferir(auditoria().eleicoes);
    expect(l.map((x) => `${x.teste.k}:${x.e.id}`)).toEqual(["s_arit:2026-1", "s_zero:2022-2"]);
  });
  test("eleição só com informativos não gera item", () => {
    expect(paraConferir([eleicao("2022-1", { s_out: 1, s_mono: 1 })])).toEqual([]);
  });
});

describe("sinaisGov: exige efeito mínimo, não só p pequeno", () => {
  test("estado normal não acende nada", () => expect(sinaisGov(governador())).toEqual([]));
  test("aritmética: qualquer divergência", () => expect(sinaisGov(governador({ arit: 1 }))).toEqual(["arit"]));
  test("canto 90/90 exige 10+ seções e o dobro do esperado", () => {
    expect(sinaisGov(governador({ corner: 9, corner_lift: 5 }))).toEqual([]);
    expect(sinaisGov(governador({ corner: 10, corner_lift: 2 }))).toEqual([]);
    expect(sinaisGov(governador({ corner: 10, corner_lift: 2.1 }))).toEqual(["corner"]);
  });
  test("comparecimento ≥ 95%: 20+ seções e mais que o dobro do esperado", () => {
    expect(sinaisGov(governador({ t95: 19, t95_exp: 1 }))).toEqual([]);
    expect(sinaisGov(governador({ t95: 20, t95_exp: 10 }))).toEqual([]);
    expect(sinaisGov(governador({ t95: 20, t95_exp: 9 }))).toEqual(["t95"]);
  });
  test("uniformidade: 3+ locais e p < 0,001", () => {
    expect(sinaisGov(governador({ disp_low001: 2, disp_p: 1e-9 }))).toEqual([]);
    expect(sinaisGov(governador({ disp_low001: 3, disp_p: 0.001 }))).toEqual([]);
    expect(sinaisGov(governador({ disp_low001: 3, disp_p: 0.0009 }))).toEqual(["disp"]);
  });
  test("último dígito: p < 1e-6, V > 0,02 e 1,5x a simulação (o falso positivo de PE 2022)", () => {
    expect(sinaisGov(governador({ dig_p: 1e-9, dig_v: 0.03, dig_vsim: 0.025 }))).toEqual([]);
    expect(sinaisGov(governador({ dig_p: 1e-9, dig_v: 0.01, dig_vsim: 0 }))).toEqual([]);
    expect(sinaisGov(governador({ dig_p: 1e-9, dig_v: 0.03, dig_vsim: 0.01 }))).toEqual(["dig"]);
  });
  test("sem brancos/nulos: 10+ seções e p < 1e-6; nulos nos campos não quebram", () => {
    expect(sinaisGov(governador({ zero_obs: 9, zero_p: 1e-9 }))).toEqual([]);
    expect(sinaisGov(governador({ zero_obs: 10, zero_p: 1e-9 }))).toEqual(["zero"]);
    expect(sinaisGov(governador({ t95: null, t95_exp: null, corner: null, corner_lift: null, disp_low001: null, disp_p: null, dig_p: null, dig_v: null, dig_vsim: null, zero_obs: null, zero_p: null }))).toEqual([]);
  });
});

describe("investigações", () => {
  test("reducoes: parcela das seções |z|>5 que o perfil explica; sem base = 0", () => {
    const a = auditoria().ajuste_perfil[0];
    expect(reducoes([a, { ...a, bruto_z5: 0 }])).toEqual([0.75, 0]);
  });
  test("maiorCurtose e media", () => {
    const e = auditoria().entre_turnos[0];
    expect(maiorCurtose([e, { ...e, ano: 2018, curtose: 9 }, { ...e, ano: 2014, curtose: 1 }]).ano).toBe(2018);
    expect(media([1, 2, 3])).toBe(2);
    expect(media([])).toBe(0);
  });
  test("posicaoNoLocal", () => {
    expect(posicaoNoLocal(7, 7)).toBe("última de 7");
    expect(posicaoNoLocal(1, 7)).toBe("primeira de 7");
    expect(posicaoNoLocal(3, 7)).toBe("3ª de 7");
    expect(posicaoNoLocal(null, 7)).toBe("");
  });
  test("cenários do poder têm nome e descrição", () => {
    expect(CENARIOS.map((c) => c.k)).toEqual(["enchimento", "troca", "fabricado", "arredondado", "copia"]);
    for (const c of CENARIOS) expect(c.desc.length).toBeGreaterThan(20);
  });
});
