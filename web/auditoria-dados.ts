// Rules and arithmetic of the Auditoria tab, pure so they are testable. The tests themselves (the statistics) run in
// docs/forense/scripts; here a signal is only read, counted and worded. A signal is "para conferir": a fact to check, never an accusation.
import type { AjustePerfil, ChaveSinal, Eleicao, EntreTurnos, Governador } from "./auditoria-tipos.js";

export const TESTES: { k: ChaveSinal; nome: string; peq: string }[] = [
  { k: "s_arit", nome: "Aritmética do boletim", peq: "comparecimento ≤ aptos; votos somam" },
  { k: "s_comp", nome: "Comparecimento ≥ 95%", peq: "seções com quase todos votando" },
  { k: "s_imp", nome: "Impressão digital eleitoral", peq: "canto ≥ 90% / ≥ 90%" },
  { k: "s_disp", nome: "Uniformidade no local", peq: "subdispersão entre seções irmãs" },
  { k: "s_dig", nome: "Último dígito", peq: "dígito final dos votos" },
  { k: "s_int", nome: "Percentuais inteiros", peq: "% exato (ex.: 63,00%)" },
  { k: "s_zero", nome: "Sem brancos nem nulos", peq: "seções com 100+ votantes" },
  { k: "s_dup", nome: "Boletins idênticos", peq: "mesmo vetor de votos" },
  { k: "s_out", nome: "Seções atípicas", peq: "fora do padrão do local" },
  { k: "s_mono", nome: "Irmãs em sequência", peq: "tendência monótona" },
];
/** The eight tests that can raise a signal; the last two are descriptive only. */
export const TESTES_COM_SINAL = TESTES.slice(0, 8);

export const STATUS = ["sem sinal", "para conferir", "informativo"] as const;
export const statusDe = (s: number) => STATUS[s] ?? "informativo";

// ---- pt-BR number formats (the same style as format.ts, with the precision the statistics need)
const nf = new Map<number, Intl.NumberFormat>();
export const dec = (v: number | null | undefined, d = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (v === 0) v = 0; // -0 would print as "-0,0"
  let f = nf.get(d);
  if (!f) nf.set(d, (f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })));
  return f.format(v);
};
export const pc = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "–" : `${dec(v * 100, d)}%`);
export const sinal = (v: number, d = 2) => `${v < 0 ? "−" : "+"}${dec(Math.abs(v), d)}`;

export interface Totais { turnos: number; secoes: number; testes: number; semSinal: number; paraConferir: number }
export function totais(el: Eleicao[]): Totais {
  let semSinal = 0, paraConferir = 0, secoes = 0;
  for (const e of el) {
    secoes += e.secoes;
    for (const t of TESTES_COM_SINAL) { if (e[t.k] === 0) semSinal++; else if (e[t.k] === 1) paraConferir++; }
  }
  return { turnos: el.length, secoes, testes: semSinal + paraConferir, semSinal, paraConferir };
}

/** Every (test, contest) pair flagged "para conferir", in table order. */
export function paraConferir(el: Eleicao[]) {
  const out: { teste: (typeof TESTES)[number]; e: Eleicao }[] = [];
  for (const teste of TESTES_COM_SINAL) for (const e of el) if (e[teste.k] === 1) out.push({ teste, e });
  return out;
}

// ---- Governadores: the rules need a minimum effect, so a small state does not light up by chance.
export type ChaveGov = "arit" | "corner" | "t95" | "disp" | "dig" | "zero";
export const SINAIS_GOV: { k: ChaveGov; nome: string }[] = [
  { k: "arit", nome: "Aritmética" }, { k: "corner", nome: "Canto 90/90" }, { k: "t95", nome: "Comparecimento ≥ 95%" },
  { k: "disp", nome: "Uniformidade" }, { k: "dig", nome: "Último dígito" }, { k: "zero", nome: "Sem brancos/nulos" },
];
export function sinaisGov(r: Governador): ChaveGov[] {
  const s: ChaveGov[] = [];
  if (r.arit > 0) s.push("arit");
  if ((r.corner ?? 0) >= 10 && (r.corner_lift ?? 0) > 2) s.push("corner");
  if ((r.t95 ?? 0) >= 20 && (r.t95 ?? 0) > 2 * (r.t95_exp ?? 0)) s.push("t95");
  if ((r.disp_low001 ?? 0) >= 3 && (r.disp_p ?? 1) < 0.001) s.push("disp");
  if (r.dig_p != null && r.dig_p < 1e-6 && (r.dig_v ?? 0) > 0.02 && (r.dig_v ?? 0) > 1.5 * (r.dig_vsim ?? 0)) s.push("dig");
  if ((r.zero_obs ?? 0) >= 10 && r.zero_p != null && r.zero_p < 1e-6) s.push("zero");
  return s;
}
export const nomeSinalGov = (k: ChaveGov) => SINAIS_GOV.find((s) => s.k === k)?.nome ?? k;

// ---- Investigações
/** Share of the |z| > 5 sections that the profile adjustment removes, per contest. */
export const reducoes = (a: AjustePerfil[]) => a.map((x) => (x.bruto_z5 > 0 ? 1 - x.adj_z5 / x.bruto_z5 : 0));
/** The year with the heaviest tail between rounds (largest excess kurtosis). */
export const maiorCurtose = (e: EntreTurnos[]) => e.reduce((a, b) => (b.curtose > a.curtose ? b : a));
export const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
/** "última de 7" / "primeira de 7" / "3ª de 7" for a section's place among the sections of its polling place. */
export function posicaoNoLocal(pos: number | null, k: number | null) {
  if (pos == null || k == null) return "";
  if (pos === k) return `última de ${k}`;
  if (pos === 1) return `primeira de ${k}`;
  return `${pos}ª de ${k}`;
}
/** Scenario names of the power test, in the order the page shows them. */
export const CENARIOS: { k: string; nome: string; desc: string }[] = [
  { k: "enchimento", nome: "Enchimento de urna", desc: "Em uma fração das seções, o comparecimento sobe até 95–100% e os votos acrescentados vão para o primeiro colocado." },
  { k: "troca", nome: "Troca de votos entre candidatos", desc: "Em uma fração das seções, 15% dos votos do segundo colocado passam ao primeiro. O comparecimento não muda." },
  { k: "fabricado", nome: "Boletins fabricados (proporção fixa)", desc: "Locais inteiros ganham boletins com a proporção média do município, sem a variação natural entre seções." },
  { k: "arredondado", nome: "Números arredondados", desc: "Votos dos dois primeiros arredondados para múltiplos de 5 em uma fração das seções." },
  { k: "copia", nome: "Cópia de boletim", desc: "O boletim de uma seção é copiado de outra do mesmo município." },
];
export const COLUNAS_PODER: { k: "d_corner" | "d_t95" | "d_low_rate" | "d_out_rate" | "d_V_last" | "d_dup"; nome: string }[] = [
  { k: "d_corner", nome: "Canto 90/90" }, { k: "d_t95", nome: "Comparec. ≥95%" }, { k: "d_low_rate", nome: "Uniformidade" },
  { k: "d_out_rate", nome: "Atípicas" }, { k: "d_V_last", nome: "Último dígito" }, { k: "d_dup", nome: "Idênticos" },
];
