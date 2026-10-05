// "Projeção" view: where the count is heading, in votes, with the arithmetic on the page. It never names a winner:
// it says what a candidate would need, how wide the simulation is, and that the number is the Radar's estimate.
import { h, int, pct, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { NOMES } from "./apuracao-mapa.js";
import { restanteDe } from "./apuracao-projecao.js";
import type { Analise, Parte } from "./apuracao-projecao.js";
import type { Nomes } from "./apuracao-projecao-estado.js";
import type { Cargo } from "./apuracao-tse.js";

// The tab's colour memory: one colour per key, and the same key always gets the same colour.
export type Cor = (chave: string) => string;
export interface ProjecaoProps {
  analise: Analise | null; nomes: Nomes; cor: Cor; partes: Parte[]; cargo: Cargo; esperadas?: number; defasadas?: string[];
}

const TOP = 3;
const PARTES_NO_GRAFICO = 12;

const nomeDe = (nomes: Nomes, id: string) => h(titleName(nomes[id]?.nome ?? id));
const partidoDe = (nomes: Nomes, id: string) => h(nomes[id]?.partido ?? "");
// The colour memory of the tab is keyed by party (map, charts, panel): the same key here keeps a party's colour across views.
const corDe = (cor: Cor, nomes: Nomes, id: string) => cor(nomes[id]?.partido ?? id);
// "ZZ" is the vote abroad; the other ids are state codes, with the full name on hover.
const rotuloUf = (id: string) => `<abbr title="${h((NOMES as Record<string, string>)[id] ?? id)}">${id === "ZZ" ? "Ext." : h(id)}</abbr>`;
const pp = (x: number) => (Math.abs(x) * 100).toFixed(1).replace(".", ",");
// Never a false 0 or 100: a simulation only says "less than 1 in 100".
const chance = (p: number) => (p < 0.01 ? "menos de 1%" : p > 0.99 ? "mais de 99%" : pct(p, 0));
const acima = (v: number) => (v > 1 ? "mais de 100%" : pct(v, 0));
const votosCurto = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} mi` : v >= 1000 ? `${int(Math.round(v / 1000))} mil` : int(Math.round(v)));

const aviso = `<p class="apu-aviso"><b>Estimativa do Radar, não é resultado.</b> Esta visão faz contas sobre os números que o TSE já publicou e mostra o que elas indicam. O resultado é o que o TSE divulga; o que ainda falta pode andar diferente do que a conta supõe.</p>`;

// One row per leading candidate: today's share, the projected end (a band for the two leaders) and the 50% line, on one scale.
function faixas(a: Analise, nomes: Nomes, cor: Cor) {
  const ids = a.base.ordem.slice(0, TOP);
  const hoje = (id: string) => (a.base.contados[id] ?? 0) / a.base.validos;
  const topo = Math.max(...ids.flatMap((id) => [hoje(id), a.base.final[id], ...(a.sim.faixa[id] ?? [])]));
  const max = Math.max(0.6, Math.ceil(topo / 0.05) * 0.05);
  const at = (x: number) => Math.max(0, Math.min(100, (x / max) * 100)).toFixed(2);
  return `<ul class="apu-proj">${ids.map((id) => {
    const f = a.sim.faixa[id];
    // The median of the draws, so the point sits inside its own band and carries the measured drift.
    const fim = f ? f[1] : a.base.final[id];
    const txt = `${titleName(nomes[id]?.nome ?? id)}: hoje ${pct(hoje(id), 1)}, projeção ${pct(fim, 1)}${f ? ` (faixa ${pct(f[0], 1)} a ${pct(f[2], 1)})` : ""}`;
    return `<li><span class="nome"><i class="key" style="background:${h(corDe(cor, nomes, id))}"></i>${nomeDe(nomes, id)} <small>${partidoDe(nomes, id)}</small></span>
      <div class="trilha" role="img" aria-label="${h(txt)}">
        ${f ? `<span class="faixa" style="left:${at(f[0])}%;width:${Math.max(0.5, (at(f[2]) as unknown as number) - (at(f[0]) as unknown as number)).toFixed(2)}%;background:${h(corDe(cor, nomes, id))}"></span>` : ""}
        <span class="ponto" style="left:${at(fim)}%;background:${h(corDe(cor, nomes, id))}"></span>
        <span class="hoje" style="left:${at(hoje(id))}%"></span>
        <span class="meta" style="left:${at(0.5)}%"></span>
      </div>
      <b>${pct(fim, 1)}</b><small>hoje ${pct(hoje(id), 1)}${f ? ` · faixa ${pct(f[0], 1)} a ${pct(f[2], 1)}` : ""}</small></li>`;
  }).join("")}</ul>
  <p class="muted small"><span class="leg"><i class="hoje"></i> hoje</span> <span class="leg"><i class="ponto"></i> projeção</span> <span class="leg"><i class="faixa"></i> faixa de 5% a 95% das simulações</span> <span class="leg"><i class="meta"></i> 50%</span></p>`;
}

function precisa(a: Analise, nomes: Nomes, id: string) {
  const n = a.precisa[id];
  const nome = nomeDe(nomes, id);
  const tem = pct((a.base.contados[id] ?? 0) / a.base.validos, 1);
  if (n === null) return `<li><b>${nome}</b>: não resta nada por apurar.</li>`;
  if (n <= 0) return `<li><b>${nome}</b> já tem mais de 50% do total projetado, mesmo sem receber nenhum dos votos que faltam.</li>`;
  if (n > 1) return `<li><b>${nome}</b> não chegaria a 50% nem com todos os votos válidos que faltam (hoje tem ${tem} do apurado).</li>`;
  return `<li><b>${nome}</b> precisaria de <b>${pct(n, 1)}</b> dos votos válidos que faltam para chegar a 50% (hoje tem ${tem} do apurado).</li>`;
}

function deslocamento(a: Analise, nomes: Nomes, cargo: Cargo) {
  const m = a.medida;
  // The country is the sum of states; a governor's race is one file: the words follow the unit that was measured.
  const unidade = cargo === "Presidente" ? "cada estado" : "a apuração";
  if (!m) {
    return `<p class="muted small">O Radar ainda não mediu o deslocamento dos votos que faltam em relação ao que ${unidade} já mostrou. Por isso a faixa usa uma incerteza larga (±${pp(a.params.sigmaUf)} p.p.) e diz pouco. A medida aparece depois de algumas atualizações do TSE, com esta aba aberta.</p>`;
  }
  const quem = m.mu < 0 ? nomeDe(nomes, a.b2) : nomeDe(nomes, a.a);
  const sem = pct(a.base.final[a.a], 1);
  return `<p class="muted small"><b>Deslocamento medido:</b> nos votos que chegaram entre uma versão e outra dos arquivos, a margem entre ${nomeDe(nomes, a.a)} e ${nomeDe(nomes, a.b2)} ficou <b>${pp(m.mu)} p.p. mais a favor de ${quem}</b> do que a margem que ${unidade} já tinha (${int(m.peso)} votos novos, ${int(m.n)} atualizações, ${pp(m.sigmaUf)} p.p. de variação entre as medidas). O que falta é simulado com esse deslocamento; sem ele, a conta daria ${sem} para ${nomeDe(nomes, a.a)}.</p>`;
}

function falta(partes: Parte[], nomes: Nomes, cor: Cor, totalRestante: number) {
  if (partes.length < 2) return "";
  const linhas = partes.map((p) => ({ p, r: restanteDe(p) })).filter((x) => x.r > 0).sort((x, y) => y.r - x.r).slice(0, PARTES_NO_GRAFICO);
  if (!linhas.length) return "";
  const maior = linhas[0].r;
  const soma = linhas.reduce((s, x) => s + x.r, 0);
  const li = linhas.map(({ p, r }) => {
    const ordem = Object.entries(p.votos).sort((x, y) => y[1] - x[1]).slice(0, 2);
    const lider = ordem.map(([id, v]) => `${nomeDe(nomes, id)} ${pct(v / p.validos, 0)}`).join(" · ");
    return `<li><span>${rotuloUf(p.id)}</span><span class="bar"><span class="fill" style="width:${((r / maior) * 100).toFixed(1)}%;background:${h(corDe(cor, nomes, ordem[0]?.[0]))}"></span></span><b>${votosCurto(r)}</b><small>${pct(avancoDe(p.secoes ?? { total: 0, totalizadas: 0 }), 0)} das seções · ${lider}</small></li>`;
  }).join("");
  return `<h3>O que falta apurar</h3>
    <p class="muted small">Votos válidos estimados que ainda vão entrar, por estado. A cor é a do candidato mais votado ali hoje. Os ${linhas.length} maiores somam ${pct(soma / totalRestante, 0)} do que falta no país.</p>
    <ul class="bancadas apu-falta">${li}</ul>`;
}

function segundoTurno(a: Analise, nomes: Nomes) {
  const [lo, hi] = a.segundo;
  if (lo === null || hi === null) return "";
  const resultado = lo > 1 ? `nem com todos os votos dos demais candidatos o segundo colocado alcançaria o primeiro: <b>não bastaria</b>.`
    : `${nomeDe(nomes, a.b2)} precisaria de <b>${acima(lo)} a ${acima(hi)}</b> dos votos dos demais candidatos que fossem votar.`;
  return `<h3>E se houver 2º turno entre ${nomeDe(nomes, a.a)} e ${nomeDe(nomes, a.b2)}?</h3>
    <p class="exp-read">Conta aberta: os dois finalistas mantêm os eleitores que tiveram no 1º turno e de 25% a 50% dos eleitores dos demais candidatos não votam. Nessas condições, ${resultado} Não é previsão: o 2º turno depende de campanha, abstenção e transferência de votos, e por isso o Radar não calcula quem vence.</p>`;
}

const formulas = `<details class="how" data-k="proj-como"><summary>Como calculamos (fórmulas)</summary><ol class="muted small">
  <li><b>Votos que faltam</b> em uma parte (um estado, no Presidente) = votos válidos apurados × (eleitorado das seções ainda não apuradas) ÷ (eleitorado das seções já apuradas). As seções que faltam têm os votos válidos por eleitor das que já entraram; o eleitorado é o publicado pelo TSE.</li>
  <li><b>Cenário base:</b> em cada parte, o que falta repete a % que cada candidato já tem ali. A projeção do país é a soma das partes, então estados grandes com pouco apurado pesam mais.</li>
  <li><b>Deslocamento:</b> entre duas versões do arquivo de uma parte, margem dos votos novos (A − B) menos a margem que a parte já tinha. A média, ponderada pelos votos novos, é aplicada ao que falta.</li>
  <li><b>Simulação:</b> 2.000 sorteios. A margem do que falta é a do cenário base + deslocamento + ruído comum a todas as partes (±1,5 p.p.) + ruído de cada parte (a variação medida, no mínimo 2 p.p.); o tamanho do que falta varia ±3%. A faixa é de 5% a 95% dos sorteios e só traz esse ruído, não o erro do próprio método.</li>
  <li><b>Para passar de 50%:</b> (0,5 × (votos apurados + votos que faltam) − votos do candidato) ÷ votos que faltam.</li>
  <li><b>2º turno:</b> o segundo colocado precisaria de ½ + (a − b) ÷ (2 × O′) dos votos dos demais, com a e b as % finais dos dois e O′ = (100% − a − b) × (1 − abstenção entre os demais).</li>
  <li><b>O que a conta não sabe:</b> em que ordem as urnas chegam (capital e interior, por exemplo, entram em momentos diferentes e isso muda a margem do que falta), nem o que acontece no 2º turno.</li>
</ol></details>`;

// A state with no numbers is not in the sum: say so, because the country's projection then rests on fewer files.
const cobertura = (n: number, esperadas: number) => (n < esperadas
  ? `<p class="apu-aviso"><b>A projeção usa ${int(n)} de ${int(esperadas)} arquivos do TSE com números.</b> Os outros ainda não têm votos totalizados ou falharam na consulta; o que fica de fora não entra na conta.</p>` : "");

// A file the TSE stopped answering keeps its last numbers in the feed: the screen says which ones, like the map does.
const velhos = (ids: string[]) => (ids.length
  ? `<p class="apu-aviso"><b>${ids.length === 1 ? "1 arquivo está" : `${ids.length} arquivos estão`} com números desatualizados: ${ids.map(h).join(", ")}.</b> O TSE não respondeu ou o arquivo sumiu na última consulta; a projeção usa o último que o Radar recebeu.</p>` : "");

export function renderProjecao({ analise, nomes, cor, partes, cargo, esperadas = partes.length, defasadas = [] }: ProjecaoProps) {
  if (!analise) return `${aviso}<p class="empty">Aguardando votos suficientes do TSE para projetar.</p>`;
  const a = analise;
  const p1 = a.sim.p1turno[a.a] + a.sim.p1turno[a.b2];
  const onde = cargo === "Presidente" ? "do país" : "desta disputa";
  return `${aviso}
    ${cobertura(partes.length, esperadas)}
    ${velhos(defasadas)}
    <h3>Onde a apuração deve terminar</h3>
    ${faixas(a, nomes, cor)}
    <ul class="apu-precisa">${precisa(a, nomes, a.a)}${precisa(a, nomes, a.b2)}</ul>
    <dl class="apu-chances"><div><dt>Chance de decidir no 1º turno</dt><dd>${chance(p1)}</dd></div><div><dt>Vai a 2º turno</dt><dd>${chance(a.sim.segundoTurno)}</dd></div></dl>
    <p class="muted small">Faltam estimados ${int(Math.round(a.base.restante))} votos válidos ${onde} (${pct(a.base.restante / (a.base.validos + a.base.restante), 1)} do total projetado). As chances vêm da simulação descrita abaixo; ${p1 < 0.01 ? "quando dão 'menos de 1%' é porque o que falta não basta nem no pior caso simulado." : "valem só enquanto as hipóteses abaixo valerem."}</p>
    ${deslocamento(a, nomes, cargo)}
    ${falta(partes, nomes, cor, a.base.restante)}
    ${segundoTurno(a, nomes)}
    ${formulas}`;
}
