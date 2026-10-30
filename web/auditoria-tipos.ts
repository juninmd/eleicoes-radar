// Shapes of web/data/auditoria/*.json, written by docs/forense/scripts/build_app.py (see docs/forense/README.md).
// Every row is a plain object of numbers and short texts; nothing here names a person other than the two
// finalists of a presidential contest, and no row carries a voter or a section's voters.

export interface Eleicao {
  id: string; ano: number; turno: number; rotulo: string;
  a_nome: string; b_nome: string; a_votos: number; b_votos: number; margem: number;
  secoes: number; aptos: number; comp: number; validos: number;
  comp_gt_aptos: number; comp_excesso: number; detalhe_nao_fecha: number; abst_nao_fecha: number; votos_vs_nom: number;
  branco_vs_det: number; nulo_vs_det: number; so_votos: number; so_detalhe: number; comp_zero: number;
  t95: number; t99: number; corner90: number; corr_t_a: number; turnout_medio: number;
  disp_locais: number; disp_ratio: number; disp_low001: number; disp_low001_esp: number; disp_low01: number; disp_low01_esp: number; disp_bh: number; disp_high001: number;
  dig_mad: number; dig_mad_sim: number; dig_V: number; dig_n: number; dig2_mad: number; dig2_mad_sim: number; dig05: number; digcomp_mad: number;
  zero_obs: number; zero_esp: number; zero_n: number;
  dup_obs: number; dup_sim: number; dup_ge150: number; dup_mun: number;
  out_testadas: number; out_alto: number; out_baixo: number; out_sim: number; out_normal: number; out_exc_pos: number; out_exc_neg: number; out_z8: number; outB_alto: number; outB_baixo: number;
  mono_obs: number; mono_esp: number;
  int_obs: number; int_sim: number; intt_obs: number; intt_sim: number;
  // 0 = sem sinal, 1 = para conferir, 2 = informativo
  s_arit: number; s_comp: number; s_imp: number; s_disp: number; s_dig: number; s_int: number; s_zero: number; s_dup: number; s_out: number; s_mono: number;
}
export type ChaveSinal = "s_arit" | "s_comp" | "s_imp" | "s_disp" | "s_dig" | "s_int" | "s_zero" | "s_dup" | "s_out" | "s_mono";

export interface Catalogo { id: string; grupo: string; nome: string; mede: string; como: string; limite: string; regra: string; ref: string }
export interface Fonte { id: number; nome: string; origem: string; conteudo: string; endereco: string }
export interface UfDispersao { id: string; uf: string; locais: number; ratio: number; low001: number }
export interface ParaConferir {
  id: string; rank: number; uf: string; mun: string; zona: number; secao: number; local: number; nm_local: string | null; tag: string | null;
  aptos: number; valid: number; z: number; shareA: number; k: number | null; pos: number | null;
}
export interface Subdispersao { id: string; rank: number; uf: string; mun: string; zona: number; local: number; k: number; ratio: number; p: number }
export interface CasoAritmetico { id: string; uf: string; mun: string; zona: number; secao: number; aptos: number; comp: number; nominais: number; brancos: number; nulos: number; a_votos: number; b_votos: number; comp_turno1: number }
export interface UltimaSecao { id: string; n: number; ultima: number; esperado: number; primeira: number; pct_ultima: number; pct_esperado: number }
export interface AjustePerfil {
  id: string; ano: number; turno: number; cobertura: number; testadas: number; r2: number;
  bruto_z5: number; bruto_pos: number; bruto_neg: number; adj_z5: number; adj_pos: number; adj_neg: number;
  idade1824_ultima: number; idade1824_primeira: number; edu_baixa_ultima: number; edu_baixa_primeira: number;
}
export interface EntreTurnos { ano: number; secoes: number; testadas: number; z4: number; z4_normal: number; z5: number; z5_normal: number; z6: number; curtose: number; beta10: number; r_mun: number; dt_media: number; phi: number }
export interface EntreTurnosTop { ano: number; rank: number; uf: string; mun: string; zona: number; secao: number; a1: number; b1: number; a2: number; b2: number; z: number }
export interface Urna {
  id: string; ano: number; turno: number; modelo: string; ref: boolean; secoes: number; share_a: number;
  mun_pp: number | null; mun_lo: number | null; mun_hi: number | null; zona_pp: number | null; zona_lo: number | null; zona_hi: number | null;
  local_pp: number | null; local_lo: number | null; local_hi: number | null; locais_2_modelos: number; locais: number;
}
export interface TempoBu { id: string; ano: number; turno: number; n: number; antes: number; mediana_min: number; p99_min: number; mais_6h: number; mais_24h: number; madrugada: number; red: number }
export interface ElResumo { ano: number; municipios: number; aptos: number; pop16: number; razao_nacional: number; gt1: number; gt105: number; gt110: number; q01: number; q05: number; mediana: number; q95: number; q99: number }
export interface ElTop { ano: number; rank: number; uf: string; mun: string; aptos: number; pop16: number; razao: number }
export interface ElUf { ano: number; uf: string; razao: number; gt1: number; n: number }
export interface ElPorte { porte: string; n: number; mediana: number; p_gt1: number }
export interface ElPersistencia { n_comum: number; corr_log: number; gt1_2010: number; gt1_2022: number; gt1_ambos: number; gt13_2022: number; gt13_ambos: number }
export interface ElVoto { id: string; ano: number; turno: number; q: number; razao_med: number; share_a: number; n: number; corr_mun: number; corr_uf: number }
export interface Crescimento { periodo: string; municipios: number; crescimento: number; z_alto: number; z_baixo: number }
export interface CrescimentoTop { periodo: string; rank: number; uf: string; mun: string; de: number; para: number; cresc: number; z: number }
// Eleitores "com biometria, mas que não foram habilitados por meio dela" (QT_ELEITORES_BIOMETRIA_NH do Boletim de Urna), Presidente.
export interface BioTurno {
  id: string; ano: number; turno: number; rotulo: string; ufs: number; ufs_faltando: string[];
  secoes: number; aptos: number; comp: number; nh: number; nh_pct: number; secoes_com_nh: number; secoes_sem_dado: number; nh_maior_que_comp: number;
  mediana_pct: number; p99_pct: number; secoes_gt50: number; hist: number[]; // hist[0] = seções sem nenhum; hist[1..20] = faixas de 5 pontos
}
export interface BioUf { id: string; uf: string; secoes: number; comp: number; nh: number; pct: number }
export interface BioModelo { id: string; modelo: string; secoes: number; comp: number; nh: number; pct: number }
export interface Biometria { turnos: BioTurno[]; uf: BioUf[]; modelo: BioModelo[] }
export interface Poder {
  cenario: string; f: number; unidades: number; desloc_margem: number; margem_real: number; alguma: number;
  d_corner: number; d_t95: number; d_low_rate: number; d_out_rate: number; d_V_last: number; d_dup: number;
}
export interface PoderBase { k: string; base: number; limiar: number }

export interface Auditoria {
  gerado: string;
  eleicoes: Eleicao[]; catalogo: Catalogo[]; fontes: Fonte[];
  comparecimento: Record<string, number[]>; // 50 bins of 2 points
  digitos: Record<string, Record<string, number[]>>; // serie (A, B, comp, bran, nul) -> frequency of digits 0..9
  uf_dispersao: UfDispersao[]; para_conferir: ParaConferir[]; subdispersao: Subdispersao[]; aritmetica_caso: CasoAritmetico[]; ultima_secao: UltimaSecao[];
  ajuste_perfil: AjustePerfil[]; entre_turnos: EntreTurnos[]; entre_turnos_top: EntreTurnosTop[]; urna: Urna[]; tempo_bu: TempoBu[];
  eleitorado_resumo: ElResumo[]; eleitorado_top: ElTop[]; eleitorado_uf: ElUf[]; eleitorado_porte: ElPorte[]; eleitorado_persistencia: ElPersistencia[]; eleitorado_voto: ElVoto[];
  crescimento: Crescimento[]; crescimento_top: CrescimentoTop[]; poder: Poder[]; poder_base: PoderBase[];
  biometria?: Biometria; // ausente em arquivo gerado antes da seção existir
}
/** Sections of the fingerprint chart: contest id -> [turnout bin, share bin, sections], 40x40 grid. */
export type Impressao = Record<string, [number, number, number][]>;
export interface PontoMunicipio { uf: string; mun: string; x: number; y: number; aptos: number; pop16: number; r22: number | null; r10: number | null }
// Candidato mais votado por município (mapa-voto.json), linha a linha igual a mapa.json. Fatias em décimos de ponto percentual.
export interface MvCandidato { n: number; nome: string; pct: number; votos: number }
export type MvLinha = [number, number, number, number]; // [mais votado, sua fatia, fatia do 2º, índice do 2º]
export interface MvTurno {
  id: string; ano: number; turno: number; rotulo: string; cands: MvCandidato[]; outros_pct: number;
  ganhos: number[]; sem_dado: number; rows: (MvLinha | null)[];
}
export interface MapaVoto { municipios: number; turnos: MvTurno[] }
// Renda, Bolsa Família e voto por município (renda.json), linha a linha igual a mapa.json. Associação entre municípios; nunca voto de pessoa.
export interface RendaQuintil { med: number; n: number; pt: number }
export interface RendaAnalise {
  id: string; ano: number; candidato: string; n: number; corr_bf: number; corr_pib: number; corr_bf_pib: number; q_bf: RendaQuintil[]; q_pib: RendaQuintil[];
  fe_bf: number; fe_bf_ep: number; fe_pib: number; fe_pib_ep: number; fe_conj_bf: number; fe_conj_bf_ep: number; fe_conj_pib: number; fe_conj_pib_ep: number;
}
export interface RendaFonte { programa: string; mes: string; pessoas: number; casadas: number; municipios_sem_dado: number }
export interface Renda {
  municipios: number; pib_ano: number; pop_ano: number; bf: Record<string, RendaFonte>; pop: (number | null)[]; pibpc: (number | null)[];
  bf100: Record<string, (number | null)[]>; pt: Record<string, (number | null)[]>; analise: RendaAnalise[];
}
export interface Governador {
  id: string; ano: number; turno: number; uf: string; secoes: number; validos: number; share_a: number; margem: number; margem_pct: number; arit: number;
  t95: number | null; t95_exp: number | null; corner: number | null; corner_esp: number | null; corner_lift: number | null; corr_t_a: number | null;
  corner_top: string | null; corner_indig: number | null; corner_nl: number | null;
  disp_locais: number | null; disp_ratio: number | null; disp_low001: number | null; disp_p: number | null;
  dig_p: number | null; dig_v: number | null; dig_vsim: number | null; zero_obs: number | null; zero_esp: number | null; zero_p: number | null;
}
