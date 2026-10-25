// Expectativa wording shared by the Expectativa tab and the dossier: one place decides how a
// probability, a trend or a poll lead is put into words, so both views never disagree.
import { displayName, ELEICAO, h, int, moneyShort, pct } from "./format.js";
import type { Candidatura } from "./types.js";

// What the dossier reads of data/expectativa.json: only the fields prevBlock and porque use.
interface Corrida { cargo: string; uf: string; candidatos: string[]; ultima?: string | null }
export interface ExpPrev {
  corridas?: Corrida[];
  modelo?: { anterior?: number; treino?: string } | null;
  metodo?: { simulacoes?: number };
}
type Ranked = Pick<Candidatura, "urna" | "nome" | "prev">;
type Tendencia = { seta: string; txt: string; tom: string; sr: string };

export const chance = (p: number) => (p >= 0.995 ? ">99%" : p > 0 && p < 0.005 ? "<1%" : pct(p));
export const pp = (x: number) => Math.abs(x * 100).toFixed(1).replace(".", ",");

// Verbal band of a probability. The word always sits next to the number, never replaces it.
const BANDS: [number, string, string][] = [[0.85, "muito provável", "alta"], [0.6, "provável", "prov"], [0.3, "disputa aberta", "aberta"], [0.05, "possível", "poss"], [0, "improvável", "baixa"]];
export function rotulo(p: number) {
  const [, txt, tom] = BANDS.find(([min]) => p >= min) ?? BANDS.at(-1)!;
  return { txt, tom };
}
export const chip = (p: number) => `<span class="rot ${rotulo(p).tom}">${h(rotulo(p).txt)}</span>`;

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "–");
export const diasAntes = (iso: string) => Math.round(((ELEICAO as unknown as number) - (new Date(`${iso}T00:00:00`) as unknown as number)) / 864e5);
export function frescor(iso: string | null | undefined) {
  if (!iso) return "";
  const d = diasAntes(iso);
  return d < 0 ? "depois da eleição" : d === 0 ? "no dia da eleição" : d === 1 ? "1 dia antes da eleição" : `${d} dias antes da eleição`;
}

// Change of the poll average vs two weeks earlier; under half a point is noise, not movement.
export function tendencia(t: number | null | undefined): Tendencia | null {
  if (t === null || t === undefined) return null;
  if (Math.abs(t) < 0.005) return { seta: "▬", txt: "estável", tom: "flat", sr: "estável em relação a duas semanas antes" };
  const up = t > 0;
  return { seta: up ? "▲" : "▼", txt: `${up ? "+" : "−"}${pp(t)} p.p.`, tom: up ? "up" : "down", sr: `${up ? "subiu" : "caiu"} ${pp(t)} pontos percentuais em relação a duas semanas antes` };
}
export const tendCell = (t: number | null | undefined) => {
  const d = tendencia(t);
  return d ? `<span class="tend ${d.tom}" title="${h(d.sr)}"><span aria-hidden="true">${d.seta}</span> ${h(d.txt)}<span class="sr"> (${h(d.sr)})</span></span>` : `<span class="muted" title="Sem pesquisa de duas semanas antes para comparar">–</span>`;
};

// Plain reading of a gap between two neighbours on the ranking: do their 90% bands touch?
// kind "lead" compares the leader with the runner-up; "corte" the last seat in with the first out.
export function leitura(a: Ranked | null | undefined, b: Ranked | null | undefined, kind = "lead") {
  if (!a?.prev || !b?.prev) return "";
  const gap = a.prev.media! - b.prev.media!;
  const [na, nb] = [displayName(a), displayName(b)];
  const apart = a.prev.lo! > b.prev.hi!;
  const open = kind === "lead" ? `Vantagem de <b>${pp(gap)} p.p.</b> de ${h(na)} sobre ${h(nb)} na média.` : `Na última vaga, ${h(na)} (${pct(a.prev.media, 1)}) está <b>${pp(gap)} p.p.</b> à frente de ${h(nb)} (${pct(b.prev.media, 1)}).`;
  if (gap < 0) return kind === "lead" ? `${h(nb)} aparece à frente no 1º turno por ${pp(gap)} p.p., mas ${h(na)} vence mais simulações por causa dos cenários de 2º turno.` : `${h(nb)} tem média ${pp(gap)} p.p. maior, mas ${h(na)} termina entre os eleitos em mais simulações.`;
  return `${open} ${apart ? "As faixas de 90% dos dois não se cruzam: a diferença é maior que a incerteza das pesquisas." : "As faixas de 90% dos dois se cruzam: dentro do erro das pesquisas, a ordem pode se inverter."}`;
}

// The value sits beside the track, not on it: leaders reach the right edge and hid their own label.
export function rangeBar(p: { media?: number; lo?: number; hi?: number }, max: number, label: string) {
  return `<div class="rangewrap" title="${h(label)}: ${pct(p.media, 1)} (faixa ${pct(p.lo, 1)}–${pct(p.hi, 1)})">
    <div class="rangebar">
      <span class="range" style="left:${(p.lo! / max) * 100}%;width:${((p.hi! - p.lo!) / max) * 100}%"></span>
      <span class="mean" style="left:${(p.media! / max) * 100}%"></span>
    </div>
    <b class="rv">${pct(p.media, 1)}</b>
    <span class="sr">${h(label)}: média ${pct(p.media, 1)}, faixa de 90% de ${pct(p.lo, 1)} a ${pct(p.hi, 1)}</span>
  </div>`;
}

// Federation names come as "Federação Brasil da Esperança - FE BRASIL": keep the acronym.
export const listName = (c: Pick<Candidatura, "ficha" | "partido">) => (c.ficha?.federacao ? c.ficha.federacao.split(" - ").pop() : c.partido);

// What the deputy model looked at, as checkable facts. The build attaches `ex` only from the
// chance that chance() would show as 1% or more, so under 0,5% we say so instead.
export function porque(c: Pick<Candidatura, "prev" | "fin" | "num" | "cargo" | "ficha" | "partido">, ano: number | string = 2022) {
  const ex = c.prev?.ex;
  if (c.prev && c.prev.p < 0.005) return [`O modelo dá menos de 1%: com a arrecadação e a lista de hoje, os sinais que ele usa ficam longe dos de quem se elegeu em ${h(ano)}.`];
  if (!ex) return ["O detalhe deste cálculo não veio nesta versão dos dados."];
  const lista = h(listName(c));
  return [
    c.fin.total > 0
      ? `<b>${int(ex.r)}ª maior arrecadação</b> entre ${int(ex.g)} candidaturas (${moneyShort(c.fin.total)}).`
      : "Sem receita declarada até o retrato do TSE: no modelo, isso reduz a chance.",
    `A lista <b>${lista}</b> tem a fatia de dinheiro de cerca de <b>${ex.vl.toFixed(1).replace(".", ",")}</b> vaga(s) do estado, e a pessoa é a <b>${int(ex.lr)}ª</b> que mais arrecadou na lista (de ${int(ex.ln)}).`,
    ...(ex.dep ? ["Declara ocupação de deputado: quem já tem mandato costuma se reeleger mais, e o modelo conta isso."] : []),
    ...(ex.rep ? [`O número <b>${h(c.num)}</b> repete o do partido: é o mais fácil de lembrar na urna, e o modelo dá um peso maior a isso.`] : []),
    ...(ex.el ? [`Foi eleito(a) deputado(a) em ${h(ano)}: quem já tem mandato costuma se reeleger, e o modelo conta isso.`] : []),
    ...(ex.ps != null ? [`Teve <b>${pct(ex.ps, 1)}</b> dos votos para ${h(c.cargo)} no estado em ${h(ano)}.`] : []),
    ...(ex.lp > 0 ? [`Os partidos da lista somaram <b>${pct(ex.lp, 1)}</b> dos votos para o cargo no estado em ${h(ano)}.`] : []),
  ];
}

const howPoll = (sims: number | undefined) => `Chance = em quantas das ${int(sims ?? 20000)} simulações a pessoa termina eleita. Cada simulação sorteia o resultado dentro do erro das pesquisas. Não é a % de votos que ela terá.`;

// Dossier block: the number first, then the facts behind it, then how to read it.
export function prevBlock(c: Candidatura, exp?: ExpPrev | null) {
  const p = c.prev;
  if (!p) return "";
  const poll = p.fonte === "pesquisas";
  const r = (poll && exp?.corridas?.find((x) => x.cargo === c.cargo && x.uf === c.uf)) as Corrida | undefined;
  const pos = r ? r.candidatos.indexOf(c.id) + 1 : 0;
  const t = tendencia(p.tend);
  const facts = poll
    ? `<p class="muted small">${pos ? `<b>${pos}º de ${r!.candidatos.length}</b> em chance de vencer. ` : ""}${pct(p.media, 1)} dos votos válidos (faixa de 90%: ${pct(p.lo, 1)}–${pct(p.hi, 1)}).${t ? ` Em 2 semanas: ${tendCell(p.tend)}.` : ""}${p.p2t !== null && p.p2t !== undefined ? ` Chance de ir ao 2º turno: <b>${chance(p.p2t)}</b>.` : ""}</p>
       ${rangeBar(p, Math.max(p.hi! * 1.25, 0.1), displayName(c))}${r?.ultima ? `<p class="muted small">Pesquisa mais recente: ${fmtDate(r.ultima)} (${frescor(r.ultima)}).</p>` : ""}`
    : `<p class="muted small">Por que o modelo chegou nisso:</p><ul class="porque">${porque(c, exp?.modelo?.anterior).map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const how = poll ? howPoll(exp?.metodo?.simulacoes) : `Chance = probabilidade, segundo um modelo treinado nas eleições de ${h(exp?.modelo?.treino ?? "2022")}, de ficar entre os eleitos do estado. As chances de todos os candidatos somam aproximadamente o número de vagas. Não existe pesquisa pública por deputado.`;
  return `<section id="d-prev"><h3>Expectativa <small>não é pesquisa eleitoral</small></h3>
    <div class="prevline"><span class="big">${chance(p.p)}</span>${chip(p.p)}<span class="muted">de chance de ser eleito(a)</span></div>
    ${facts}
    <details class="how"><summary>Como ler este número</summary><p class="muted small">${how}</p></details></section>`;
}
