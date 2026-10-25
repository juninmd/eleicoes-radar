// "Chance ao vivo" view (runoff of President or Governor): the chance of each finalist ending ahead, from apuracao-chance.js. It is the
// Radar's estimate, said at the top; the words are "terminar à frente", never a winner. When the count ends the TSE's result is what counts.
import { h, int, pct, titleName } from "./format.js";
import { NOMES } from "./apuracao-mapa.js";
import type { LeituraChance, ParteChance } from "./apuracao-chance.js";
import type { Cargo } from "./apuracao-tse.js";

export interface Quem { id: string; nome: string; partido: string }
export interface ChanceProps {
  estado: "carregando" | "sem-disputa" | "ok";
  leitura?: LeituraChance | null;
  a?: Quem | null; b?: Quem | null; // the finalists as the TSE file names them (fictional names in the simulation)
  cargo: Cargo; cor: (chave: string) => string;
  concluida?: boolean; simulado?: boolean; compacto?: boolean; // compacto: the fullscreen panel, without the method and the table
}

export const ROTULO = `<p class="apu-aviso"><b>Estimativa do Radar, não é resultado.</b></p>`; // the short form, for the fullscreen panel
export const AVISO_CHANCE = `<p class="apu-aviso"><b>Estimativa do Radar, não é resultado.</b> A chance é uma conta sobre os votos já apurados e o modelo dos 2º turnos de 2002 a 2022. O resultado é o que o TSE divulga.</p>`;
// Never a false 0 or 100: a simulation only says "less than 1 in 100".
export const chanceTxt = (p: number) => (p < 0.01 ? "menos de 1%" : p > 0.99 ? "mais de 99%" : pct(p, 0));
const pp = (x: number) => (Math.abs(x) * 100).toFixed(1).replace(".", ",");
const nomeDe = (q: Quem) => h(titleName(q.nome));
const rotuloUf = (id: string) => `<abbr title="${h((NOMES as Record<string, string>)[id] ?? id)}">${id === "ZZ" ? "Ext." : h(id)}</abbr>`;

function barras(lista: { q: Quem; p: number }[], cor: ChanceProps["cor"]) {
  return `<ul class="bancadas apu-chance">${lista.map(({ q, p }) => `<li><span class="nome"><i class="key" style="background:${h(cor(q.partido))}"></i>${nomeDe(q)} <small>${h(q.partido)}</small></span>
    <span class="bar" role="img" aria-label="${h(`${titleName(q.nome)}: ${chanceTxt(p)} de chance de terminar à frente`)}"><span class="fill" style="width:${(p * 100).toFixed(1)}%;background:${h(cor(q.partido))}"></span></span><b>${chanceTxt(p)}</b></li>`).join("")}</ul>`;
}

function porParte(partes: ParteChance[], a: Quem) {
  const linhas = [...partes].sort((x, y) => y.esperado - x.esperado).map((p) => {
    const n = p.a + p.b;
    return `<tr><th scope="row">${rotuloUf(p.id)}</th><td class="num">${int(n)}</td><td class="num">${n > 0 ? pct(p.a / n, 1) : "–"}</td><td class="num">${pct(p.prior, 1)}</td><td class="num">${int(Math.round(p.restante))}</td></tr>`;
  }).join("");
  return `<details class="how" data-k="chance-ufs"><summary>Por estado: modelo e apuração</summary><div class="scroll"><table class="exp-bars">
    <caption class="sr">Por estado, votos apurados dos dois finalistas, a parcela de ${h(titleName(a.nome))} na apuração e no modelo, e os votos válidos que faltam</caption>
    <thead><tr><th scope="col">Estado</th><th scope="col" class="num">Apurados</th><th scope="col" class="num">${nomeDe(a)} na apuração</th><th scope="col" class="num">${nomeDe(a)} no modelo</th><th scope="col" class="num">Faltam (estimado)</th></tr></thead>
    <tbody>${linhas}</tbody></table></div></details>`;
}

function metodo(l: LeituraChance, simulado: boolean, a: Quem) {
  const e = l.erros;
  const prior = simulado ? "Na simulação não há pesquisa: o modelo usa só o 1º turno (α = 0)."
    : l.ancora !== null ? `O modelo está ancorado na média das pesquisas de 2º turno deste par: ${nomeDe(a)} com ${pct(l.ancora, 1)} dos votos de um ou outro.`
    : "Não há média de pesquisas deste par: o modelo usa só o 1º turno (α = 0).";
  const back = e ? ` No teste com ${int(e.disputas)} disputas de ${e.anos[0]} a ${e.anos.at(-1)}, o erro do total da disputa sem pesquisa foi de ${pp(e.nacionalSemAncoraRmse / 100)} p.p. (RMSE).` : "";
  return `<details class="how" data-k="chance-como"><summary>Como calculamos</summary><ol class="muted small">
    <li><b>Antes do primeiro voto:</b> o modelo dos 2º turnos de 2002 a 2022 (o mesmo da visão Cidades) aplica a cada cidade o resultado do 1º turno desta eleição e soma por estado. ${prior}${back}</li>
    <li><b>Desvio:</b> média, ponderada pelos votos já apurados, da diferença (em logit) entre a parcela de ${nomeDe(a)} na apuração e no modelo, nas mesmas partes. Ele vale mais à medida que os votos chegam: peso = apurados ÷ (apurados + 5% dos votos esperados).</li>
    <li><b>O que falta:</b> em cada parte, o modelo deslocado pelo desvio, misturado com a parcela que a própria parte já mostra na proporção do que dela já foi apurado. Votos que faltam = válidos apurados × (eleitorado não apurado ÷ eleitorado apurado), como na Projeção.</li>
    <li><b>Simulação:</b> 2.000 sorteios com semente fixa. Ruído comum a todas as partes do tamanho do erro medido do modelo (encolhe com o peso do desvio, mas nunca abaixo de cerca de 1,5 p.p. enquanto falta voto, porque as urnas não chegam em ordem aleatória), ruído próprio de cada parte que some quando ela termina, e ±3% no tamanho do que falta. A chance é a fração dos sorteios em que cada um termina com mais votos válidos.</li>
    <li><b>O que a conta não sabe:</b> em que ordem as urnas chegam dentro de cada estado (capital e interior entram em momentos diferentes), nem erros do TSE que ainda serão corrigidos. A calibração dessa chance durante uma apuração não foi testada: o teste do modelo é sobre o resultado final.</li>
  </ol></details>`;
}

export function renderChance({ estado, leitura, a, b, cargo, cor, concluida, simulado = false, compacto = false }: ChanceProps): string {
  if (estado === "sem-disputa") return `<p class="empty">Esta disputa não tem 2º turno: não há chance a calcular.</p>`;
  if (estado === "carregando" || !leitura || !a || !b) return `${compacto ? ROTULO : AVISO_CHANCE}<p class="empty">Carregando o modelo e os arquivos do TSE…</p>`;
  if (concluida) return `<p class="exp-read">A apuração terminou: vale o resultado do TSE, e a chance deixa de fazer sentido.</p>`;
  const c = leitura.chance;
  if (!c) return `${compacto ? ROTULO : AVISO_CHANCE}<p class="empty">Ainda não há votos nem modelo suficientes para estimar.</p>`;
  const lista = [{ q: a, p: c.a }, { q: b, p: c.b }].sort((x, y) => y.p - x.p);
  const quem = c.desvio >= 0 ? a : b;
  const desvio = c.peso > 0 && Math.abs(c.desvio) >= 0.0005
    ? `Os votos já apurados estão <b>${pp(c.desvio)} p.p. mais a favor de ${nomeDe(quem)}</b> do que o modelo previa nas mesmas partes; o que falta é simulado com esse desvio.`
    : "Ainda não há votos para medir o desvio: por enquanto fala só o modelo.";
  // Said about the one with the larger chance: the band of B is the mirror of A's.
  const [lo, med, hi] = lista[0]!.q === a ? c.faixa : [1 - c.faixa[2], 1 - c.faixa[1], 1 - c.faixa[0]];
  const resumo = `<p class="exp-read">Na mediana das 2.000 simulações, ${nomeDe(lista[0]!.q)} termina com <b>${pct(med, 1)}</b> dos votos válidos (de ${pct(lo, 1)} a ${pct(hi, 1)} em 90% delas). Já entrou ${pct(c.contados, 1)} dos votos válidos esperados.</p>`;
  if (compacto) return `${ROTULO}${barras(lista, cor)}${resumo}`;
  return `${AVISO_CHANCE}
    <h3>Chance de terminar à frente</h3>
    ${barras(lista, cor)}
    ${resumo}
    <dl class="apu-chances"><div><dt>${nomeDe(a)} no modelo, antes do 1º voto</dt><dd>${pct(c.previa, 1)}</dd></div><div><dt>Peso do desvio medido</dt><dd>${pct(c.peso, 0)}</dd></div></dl>
    <p class="muted small">${desvio}${c.empate > 0 ? ` Em ${pct(c.empate, 1)} dos sorteios os dois empatam.` : ""}</p>
    ${cargo === "Presidente" && leitura.partes.length > 1 ? porParte(leitura.partes, a) : ""}
    ${metodo(leitura, simulado, a)}`;
}
