// Small synthetic data in the shape of web/data/auditoria/*.json, for the Auditoria tests. Not real election data.
import type { Auditoria, Eleicao, Governador, Impressao, MapaVoto, PontoMunicipio } from "./auditoria-tipos.js";

export function eleicao(id = "2022-1", sobre: Partial<Eleicao> = {}): Eleicao {
  const [ano, turno] = id.split("-").map(Number);
  return {
    id, ano, turno, rotulo: `${ano} · ${turno}º turno`, a_nome: "Candidato A", b_nome: "Candidato B", a_votos: 600, b_votos: 400, margem: 200,
    secoes: 1000, aptos: 150000, comp: 120000, validos: 110000, comp_gt_aptos: 0, comp_excesso: 0, detalhe_nao_fecha: 0, abst_nao_fecha: 0, votos_vs_nom: 0,
    branco_vs_det: 0, nulo_vs_det: 0, so_votos: 0, so_detalhe: 0, comp_zero: 0, t95: 3, t99: 0, corner90: 1, corr_t_a: 0.1, turnout_medio: 0.8,
    disp_locais: 400, disp_ratio: 1.1, disp_low001: 0, disp_low001_esp: 0.4, disp_low01: 2, disp_low01_esp: 4, disp_bh: 0, disp_high001: 1,
    dig_mad: 0.001, dig_mad_sim: 0.001, dig_V: 0.01, dig_n: 5000, dig2_mad: 0.002, dig2_mad_sim: 0.002, dig05: 0.4, digcomp_mad: 0.002,
    zero_obs: 0, zero_esp: 0.5, zero_n: 800, dup_obs: 1, dup_sim: 1, dup_ge150: 0, dup_mun: 0,
    out_testadas: 900, out_alto: 3, out_baixo: 3, out_sim: 3, out_normal: 2, out_exc_pos: 1, out_exc_neg: 1, out_z8: 0, outB_alto: 1, outB_baixo: 1,
    mono_obs: 10, mono_esp: 10, int_obs: 2, int_sim: 2, intt_obs: 3, intt_sim: 3,
    s_arit: 0, s_comp: 0, s_imp: 0, s_disp: 0, s_dig: 0, s_int: 0, s_zero: 0, s_dup: 0, s_out: 2, s_mono: 2,
    ...sobre,
  };
}

export function auditoria(): Auditoria {
  const e = [eleicao("2022-1"), eleicao("2022-2", { s_zero: 1, zero_obs: 12, zero_esp: 1 }), eleicao("2026-1", { s_arit: 1, comp_gt_aptos: 1 })];
  return {
    gerado: "2026-10-28", eleicoes: e,
    catalogo: [{ id: "arit", grupo: "Integridade", nome: "Aritmética", mede: "m", como: "c", limite: "l", regra: "r", ref: "x" }],
    fontes: [{ id: 1, nome: "Votação por seção", origem: "TSE", conteudo: "votos", endereco: "https://dadosabertos.tse.jus.br/" }],
    comparecimento: Object.fromEntries(e.map((x) => [x.id, Array.from({ length: 50 }, (_, i) => (i > 35 ? 100 + i : 5))])),
    digitos: Object.fromEntries(e.map((x) => [x.id, { A: Array(10).fill(500), B: Array(10).fill(400), comp: Array(10).fill(300), bran: Array(10).fill(30), nul: Array(10).fill(30) }])),
    uf_dispersao: [{ id: "2022-1", uf: "SP", locais: 100, ratio: 1.2, low001: 0 }, { id: "2022-1", uf: "ZZ", locais: 10, ratio: 0.7, low001: 0 }],
    para_conferir: [{ id: "2022-1", rank: 1, uf: "SP", mun: "Cidade X", zona: 1, secao: 10, local: 5, nm_local: "Escola Y", tag: null, aptos: 300, valid: 250, z: 6.1, shareA: 0.2, k: 5, pos: 5 }],
    subdispersao: [{ id: "2026-1", rank: 1, uf: "BA", mun: "Cidade Z", zona: 3, local: 9, k: 6, ratio: 0.1, p: 0.00001 }],
    aritmetica_caso: [{ id: "2026-2", uf: "SP", mun: "Cidade X", zona: 1, secao: 7, aptos: 300, comp: 301, nominais: 290, brancos: 5, nulos: 6, a_votos: 150, b_votos: 140, comp_turno1: 250 }],
    ultima_secao: [{ id: "2022-1", n: 100, ultima: 60, esperado: 20, primeira: 10, pct_ultima: 0.6, pct_esperado: 0.2 }],
    ajuste_perfil: [{ id: "2022-1", ano: 2022, turno: 1, cobertura: 0.9, testadas: 900, r2: 0.4, bruto_z5: 20, bruto_pos: 12, bruto_neg: 8, adj_z5: 5, adj_pos: 3, adj_neg: 2, idade1824_ultima: 0.2, idade1824_primeira: 0.1, edu_baixa_ultima: 0.3, edu_baixa_primeira: 0.4 }],
    entre_turnos: [{ ano: 2022, secoes: 1000, testadas: 900, z4: 3, z4_normal: 0.06, z5: 1, z5_normal: 0, z6: 0, curtose: 4, beta10: 0.9, r_mun: 0.8, dt_media: 0.1, phi: 0.02 }],
    entre_turnos_top: [{ ano: 2022, rank: 1, uf: "SP", mun: "Cidade X", zona: 1, secao: 7, a1: 100, b1: 100, a2: 150, b2: 50, z: 6 }],
    urna: [{ id: "2022-1", ano: 2022, turno: 1, modelo: "local", ref: true, secoes: 1000, share_a: 0.48, mun_pp: 0.1, mun_lo: 0, mun_hi: 0.2, zona_pp: 0.1, zona_lo: 0, zona_hi: 0.2, local_pp: 0.1, local_lo: 0, local_hi: 0.2, locais_2_modelos: 5, locais: 300 }],
    tempo_bu: [{ id: "2022-1", ano: 2022, turno: 1, n: 1000, antes: 0, mediana_min: 30, p99_min: 200, mais_6h: 2, mais_24h: 0, madrugada: 1, red: 0 }],
    eleitorado_resumo: [{ ano: 2022, municipios: 5570, aptos: 156e6, pop16: 160e6, razao_nacional: 0.97, gt1: 90, gt105: 20, gt110: 5, q01: 0.7, q05: 0.8, mediana: 0.97, q95: 1.05, q99: 1.1 }],
    eleitorado_top: [{ ano: 2022, rank: 1, uf: "RS", mun: "Cidade W", aptos: 1200, pop16: 900, razao: 1.33 }],
    eleitorado_uf: [{ ano: 2022, uf: "RS", razao: 1.02, gt1: 100, n: 497 }],
    eleitorado_porte: [{ porte: "até 5 mil", n: 1200, mediana: 1.01, p_gt1: 0.5 }],
    eleitorado_persistencia: [{ n_comum: 5000, corr_log: 0.9, gt1_2010: 100, gt1_2022: 100, gt1_ambos: 60, gt13_2022: 10, gt13_ambos: 6 }],
    eleitorado_voto: [{ id: "2022-1", ano: 2022, turno: 1, q: 1, razao_med: 0.9, share_a: 0.4, n: 1000, corr_mun: 0.1, corr_uf: 0.2 }],
    crescimento: [{ periodo: "2018-2022", municipios: 5570, crescimento: 0.05, z_alto: 3, z_baixo: 2 }],
    crescimento_top: [{ periodo: "2018-2022", rank: 1, uf: "PA", mun: "Cidade V", de: 1000, para: 1600, cresc: 0.6, z: 5 }],
    poder: [{ cenario: "enchimento", f: 0.01, unidades: 10, desloc_margem: 100, margem_real: 200, alguma: 1, d_corner: 0, d_t95: 1, d_low_rate: 0, d_out_rate: 1, d_V_last: 0, d_dup: 0 }],
    poder_base: [{ k: "t95", base: 5, limiar: 8 }],
    biometria: {
      turnos: [
        { id: "2022-1", ano: 2022, turno: 1, rotulo: "2022 · 1º turno", ufs: 28, ufs_faltando: [], secoes: 1000, aptos: 150000, comp: 120000, nh: 9600, nh_pct: 0.08, secoes_com_nh: 900, secoes_sem_dado: 0, nh_maior_que_comp: 0, mediana_pct: 0.07, p99_pct: 0.3, secoes_gt50: 2, hist: [100, ...Array.from({ length: 20 }, (_, i) => 50 - i * 2)] },
        { id: "2026-2", ano: 2026, turno: 2, rotulo: "2026 · 2º turno", ufs: 27, ufs_faltando: ["RR"], secoes: 1000, aptos: 150000, comp: 125000, nh: 10000, nh_pct: 0.08, secoes_com_nh: 950, secoes_sem_dado: 0, nh_maior_que_comp: 0, mediana_pct: 0.07, p99_pct: 0.3, secoes_gt50: 1, hist: [80, ...Array.from({ length: 20 }, () => 40)] },
      ],
      uf: [{ id: "2022-1", uf: "SP", secoes: 500, comp: 60000, nh: 3000, pct: 0.05 }, { id: "2022-1", uf: "BA", secoes: 500, comp: 60000, nh: 6600, pct: 0.11 }, { id: "2026-2", uf: "SP", secoes: 500, comp: 60000, nh: 5000, pct: 0.083 }],
      modelo: [{ id: "2022-1", modelo: "UE 2020", secoes: 800, comp: 100000, nh: 7000, pct: 0.07 }],
    },
  };
}

export const impressao = (): Impressao => ({ "2022-1": [[39, 39, 4], [20, 20, 200]] });
export const pontos = (): PontoMunicipio[] => [{ uf: "SP", mun: "Cidade X", x: 100, y: 100, aptos: 1000, pop16: 900, r22: 1.1, r10: 1.0 }, { uf: "BA", mun: "Cidade Z", x: 150, y: 80, aptos: 500, pop16: 600, r22: null, r10: null }];

export function governador(sobre: Partial<Governador> = {}): Governador {
  return {
    id: "2022-1-SP", ano: 2022, turno: 1, uf: "SP", secoes: 5000, validos: 2e7, share_a: 42, margem: 1e6, margem_pct: 5, arit: 0,
    t95: 2, t95_exp: 2, corner: 1, corner_esp: 1, corner_lift: 1, corr_t_a: 0.1, corner_top: null, corner_indig: null, corner_nl: null,
    disp_locais: 800, disp_ratio: 1.1, disp_low001: 0, disp_p: 0.5, dig_p: 0.4, dig_v: 0.01, dig_vsim: 0.01, zero_obs: 0, zero_esp: 0.3, zero_p: 0.9,
    ...sobre,
  };
}

// alinhado a pontos(): 2 municípios; o 2º tem o primeiro turno sem dado
export const mapaVotoFx = (): MapaVoto => ({
  municipios: 2,
  turnos: [
    { id: "2022-2", ano: 2022, turno: 2, rotulo: "2022 · 2º turno", cands: [{ n: 13, nome: "Candidato A", pct: 50.9, votos: 60 }, { n: 22, nome: "Candidato B", pct: 49.1, votos: 58 }], outros_pct: 0, ganhos: [1, 1, 0, 0, 0, 0, 0], sem_dado: 0, rows: [[0, 620, 380, 1], [1, 540, 460, 0]] },
    { id: "2026-2", ano: 2026, turno: 2, rotulo: "2026 · 2º turno", cands: [{ n: 13, nome: "Candidato A", pct: 51, votos: 60 }, { n: 22, nome: "Candidato B", pct: 49, votos: 58 }], outros_pct: 0, ganhos: [1, 0, 0, 0, 0, 0, 0], sem_dado: 1, rows: [[0, 600, 400, 1], null] },
  ],
});
