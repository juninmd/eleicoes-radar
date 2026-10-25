// "Previsão do Radar" view for the Ao vivo tab: the leader of the Radar's simulation with the photo and the chance, then the three readings of
// each of the two (polls, count, Monte Carlo) on one ruler and the chance of the night. The words are "deve terminar à frente" and
// "chance", never a winner: the TSE's own text is the only one that says who was elected (the hero above shows it).
import { h, int, pct, titleName } from "./format.js";
import { curva, NIVEL_TXT } from "./apuracao-previsao.js";
import { chanceTxt } from "./apuracao-chance-view.js";
import type { LadoPrev, PontoPrev, Previsao } from "./apuracao-previsao.js";

export type AvatarPrev = (c: { id: string; nome: string }, size: string) => string;
export interface PrevProps {
  estado: "carregando" | "sem-disputa" | "concluida" | "ok";
  previsao?: Previsao | null; hist?: PontoPrev[]; avatar: AvatarPrev; cor: (partido: string) => string;
  arquivos?: { chegaram: number; esperados: number }; // 1st round: the 28 files must each answer once
}

export const AVISO_PREV = `<p class="apu-aviso"><b>Estimativa do Radar, não é resultado.</b> É uma simulação sobre os votos já apurados e as pesquisas. Quem foi eleito é o que o TSE marca.</p>`;
const curto = (nome: string) => titleName(nome).split(" ").slice(0, 2).join(" ");
const virgula = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
const votos = (n: number) => (n >= 1e6 ? `${virgula(n / 1e6)} mi` : int(Math.round(n)));

// The ruler of one candidate: the three readings on the same axis. The axis fits what is on it (with a margin), and the 50% line
// shows only when the axis reaches it.
export function dominio(l: LadoPrev): [number, number] {
  const v = [l.pesquisa?.lo, l.pesquisa?.media, l.pesquisa?.hi, l.apuracao, ...l.mc].filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  let lo = Math.max(0, Math.floor((Math.min(...v) - 0.04) / 0.02) * 0.02), hi = Math.min(1, Math.ceil((Math.max(...v) + 0.04) / 0.02) * 0.02);
  if (hi - lo < 0.16) { const c = (lo + hi) / 2; lo = Math.max(0, c - 0.08); hi = Math.min(1, c + 0.08); }
  return [lo, hi];
}

function regua(l: LadoPrev, cor: PrevProps["cor"]): string {
  const [lo, hi] = dominio(l);
  const pos = (x: number) => (Math.min(1, Math.max(0, (x - lo) / (hi - lo))) * 100).toFixed(2);
  const faixa = (a: number, b: number) => `left:${pos(a)}%;width:${(Number(pos(b)) - Number(pos(a))).toFixed(2)}%`;
  const p = l.pesquisa, [mlo, mmed, mhi] = l.mc;
  const tem50 = lo < 0.5 && hi > 0.5;
  const meio = tem50 ? `<span class="prev-50" style="left:${pos(0.5)}%"></span>` : "";
  const ticks = (() => { const passo = hi - lo > 0.3 ? 0.1 : hi - lo > 0.16 ? 0.04 : 0.02; const t: string[] = []; for (let x = Math.ceil(lo / passo - 1e-9) * passo; x <= hi + 1e-9; x += passo) if (Math.abs(x - 0.5) > passo * 0.45) t.push(`<span style="left:${pos(x)}%">${Math.round(x * 100)}</span>`); if (tem50) t.push(`<span class="m" style="left:${pos(0.5)}%">50%</span>`); return t.join(""); })();
  return `<article class="prev-leit" style="--lado:${h(cor(l.partido))}" aria-label="${h(titleName(l.nome))}: três leituras">
    <h5><i class="key" style="background:${h(cor(l.partido))}"></i>${h(titleName(l.nome))} <small>${h(l.partido)}</small></h5>
    <div class="prev-rg">
      <div class="prev-linha"><p><span class="prev-rot"><i class="ic pq"></i>Pesquisas</span> <b>${p ? pct(p.media, 1) : "–"}</b> <small>${p ? (p.lo !== undefined && p.hi !== undefined ? `faixa ${virgula(p.lo * 100)} a ${virgula(p.hi * 100)}` : "sem faixa") : "sem média de pesquisas"}</small></p>
        <div class="prev-trk pq">${meio}${p && p.lo !== undefined && p.hi !== undefined ? `<span class="faixa" style="${faixa(p.lo, p.hi)}"></span>` : ""}${p ? `<span class="pt" style="left:${pos(p.media)}%"></span>` : ""}</div></div>
      <div class="prev-linha"><p><span class="prev-rot"><i class="ic ap"></i>Apuração</span> <b>${l.apuracao === null ? "–" : pct(l.apuracao, 1)}</b> <small>${l.apuracao === null ? "sem votos" : "o que já foi contado"}</small></p>
        <div class="prev-trk ap">${meio}${l.apuracao === null ? "" : `<span class="pt" style="left:${pos(l.apuracao)}%"></span>`}</div></div>
      <div class="prev-linha"><p><span class="prev-rot"><i class="ic mc"></i>Monte Carlo</span> <b>${pct(mmed, 1)}</b> <small>faixa ${virgula(mlo * 100)} a ${virgula(mhi * 100)}</small></p>
        <div class="prev-trk mc">${meio}<span class="faixa" style="${faixa(mlo, mhi)}"></span><span class="pt" style="left:${pos(mmed)}%"></span></div></div>
      <div class="prev-eixo" aria-hidden="true">${ticks}</div>
    </div></article>`;
}

// The chance of the leader over the night as a line: 0 to 100% on the vertical, the hours the tab has seen on the horizontal.
function curvaSvg(p: Previsao, hist: PontoPrev[]): string {
  const c = curva(hist, p);
  if (c.length < 2) return `<p class="muted small">A curva aparece a partir da segunda atualização do TSE. Ela guarda só o que esta aba viu, desde que foi aberta.</p>`;
  const W = 300, H = 92, L = 30, R = 34, T = 8, B = 20, iw = W - L - R, ih = H - T - B;
  const X = (i: number) => L + (c.length === 1 ? 0 : i / (c.length - 1)) * iw, Y = (v: number) => T + (1 - v) * ih;
  const linha = c.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(x.p).toFixed(1)}`).join("");
  const ult = c[c.length - 1]!, ini = c[0]!;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance de ${h(curto(p.favorito.nome))} terminar à frente, de ${chanceTxt(ini.p)} às ${h(ini.hora.slice(0, 5))} a ${chanceTxt(ult.p)} às ${h(ult.hora.slice(0, 5))}">
    ${[0, 0.5, 1].map((v) => `<line x1="${L}" x2="${L + iw}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0.5 ? "m50" : "gr"}"/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join("")}
    <path d="${linha}" class="linha" style="stroke:var(--lado)"/>
    <circle cx="${X(c.length - 1)}" cy="${Y(ult.p)}" r="4.5" style="fill:var(--lado)"/>
    <text x="${X(c.length - 1) + 8}" y="${Y(ult.p) + 4}" class="fim">${h(chanceTxt(ult.p).replace("menos de ", "<").replace("mais de ", ">"))}</text>
    <text x="${L}" y="${H - 5}">${h(ini.hora.slice(0, 5))}</text><text x="${L + iw}" y="${H - 5}" text-anchor="end">${h(ult.hora.slice(0, 5))}</text></svg>`;
}

function metodo(p: Previsao): string {
  return `<details class="how" data-k="prev-como"><summary>Como calculamos</summary><ol class="muted small">
    <li><b>Pesquisas:</b> a média das pesquisas que o Radar já usa na aba Expectativa${p.turno === 2 ? " (confronto direto dos dois, quando há)" : ""}, em parcela dos votos válidos. Sem média, a linha fica vazia: não se inventa pesquisa.</li>
    <li><b>Apuração:</b> a soma dos arquivos do TSE, como estão agora. É fato, mas só das seções que já chegaram.</li>
    <li><b>Monte Carlo:</b> ${p.turno === 1
      ? "a mesma simulação da vista Projeção (2.000 sorteios do que falta, com o deslocamento medido nesta aba)"
      : "a mesma simulação da vista Chance ao vivo (modelo dos 2º turnos de 2002 a 2022, ajustado pela contagem)"}. A faixa vai de 5% a 95% dos sorteios; o ponto é a mediana.</li>
    <li><b>Chance:</b> a fração dos sorteios em que ele termina com mais votos válidos que o outro. Nunca mostra 0% nem 100%: nas pontas diz "menos de 1%" ou "mais de 99%".</li>
    <li><b>O que a conta não sabe:</b> em que ordem as urnas chegam, abstenção diferente entre regiões, erros do TSE ainda por corrigir. Os parâmetros do ruído não foram calibrados durante uma apuração. Quando a contagem termina, vale o TSE.</li>
  </ol></details>`;
}

export function renderPrevisao({ estado, previsao: p, hist = [], avatar, cor, arquivos }: PrevProps): string {
  const topo = (turno?: number) => `<header><h3 id="prev-t">Previsão do Radar <small>Presidente · Brasil${turno === 2 ? " · 2º turno" : ""}</small></h3></header>`;
  const casca = (corpo: string, turno?: number) => `<section class="prev" aria-labelledby="prev-t">${topo(turno)}${corpo}</section>`;
  if (estado === "sem-disputa") return casca(`<p class="empty">Esta disputa não tem 2º turno: não há previsão a calcular.</p>`, 2);
  if (estado === "concluida") return casca(`<p class="exp-read">A apuração terminou: vale o resultado do TSE, e a previsão deixa de fazer sentido.</p>`);
  if (estado === "carregando") {
    const q = arquivos && arquivos.esperados > 0 ? ` ${arquivos.chegaram} de ${arquivos.esperados} arquivos do TSE responderam.` : "";
    return casca(`${AVISO_PREV}<p class="empty">Carregando os arquivos de todos os estados e o modelo…${q}</p>`);
  }
  if (!p) return casca(`${AVISO_PREV}<p class="empty">Ainda não há votos apurados para simular. A previsão aparece com o primeiro arquivo que tenha votos.</p>`);
  const f = p.favorito, o = p.outro;
  const aberta = p.nivel === "aberta";
  const sorteios = Math.round(f.chance * p.n);
  const stats = [
    `<div><dt>Final esperado de ${h(curto(f.nome))}</dt><dd>${pct(f.mc[1], 1)}<small>faixa ${virgula(f.mc[0] * 100)} a ${virgula(f.mc[2] * 100)}</small></dd></div>`,
    p.decideNoPrimeiro !== null && p.segundoTurno !== null ? `<div><dt>Chance de 2º turno</dt><dd>${chanceTxt(p.segundoTurno)}<small>de ser decidido no 1º: ${chanceTxt(p.decideNoPrimeiro)}</small></dd></div>` : "",
    `<div><dt>Votos por apurar</dt><dd>${votos(p.faltam)}<small>${pct(p.contados, 1)} dos votos esperados já entraram</small></dd></div>`,
  ].join("");
  return casca(`${AVISO_PREV}
    <div class="prev-main" style="--lado:${h(cor(f.partido))}">
      <div class="prev-who">
        <div class="prev-anel" style="--v:${(f.chance * 100).toFixed(1)}">${avatar({ id: f.id, nome: f.nome }, "lg")}<b class="prev-pct">${h(f.chance > 0.99 ? ">99%" : pct(f.chance, 0))}</b></div>
        <div class="prev-txt"><span class="rot ${aberta ? "aberta" : "alta"}">${NIVEL_TXT[p.nivel]}</span>
          <h4>${h(titleName(f.nome))} <span>${aberta ? "aparece à frente, por pouco" : "deve terminar à frente"}</span></h4>
          <p>Em ${int(sorteios)} dos ${int(p.n)} sorteios do Monte Carlo, ${h(curto(f.nome))} termina com mais votos válidos que ${h(curto(o.nome))}.</p></div>
      </div>
      <div class="prev-chance"><p class="prev-rot2">Chance de terminar à frente</p>
        <div class="prev-bar" role="img" aria-label="${h(`${curto(f.nome)} ${chanceTxt(f.chance)}, ${curto(o.nome)} ${chanceTxt(o.chance)}`)}"><span style="width:${(f.chance * 100).toFixed(1)}%;background:${h(cor(f.partido))}"></span><span style="width:${(o.chance * 100).toFixed(1)}%;background:${h(cor(o.partido))}"></span><u></u></div>
        <p class="prev-nums"><span><b>${h(curto(f.nome))}</b> ${chanceTxt(f.chance)}</span><span>${chanceTxt(o.chance)} <b>${h(curto(o.nome))}</b></span></p></div>
    </div>
    ${p.defasadas.length ? `<p class="apu-aviso small"><b>Números desatualizados:</b> ${int(p.defasadas.length)} ${p.defasadas.length === 1 ? "arquivo" : "arquivos"} (${h(p.defasadas.join(", "))}) ${p.defasadas.length === 1 ? "usa" : "usam"} o último recebido do TSE.</p>` : ""}
    <dl class="prev-stats">${stats}</dl>
    <h4 class="prev-h">As três leituras <small>de cada um, na mesma régua</small></h4>
    <div class="prev-leituras">${regua(f, cor)}${regua(o, cor)}</div>
    <h4 class="prev-h">Como a chance de ${h(curto(f.nome))} mudou <small>desde que você abriu a aba</small></h4>
    <div class="prev-hist" style="--lado:${h(cor(f.partido))}">${curvaSvg(p, hist)}</div>
    ${metodo(p)}`, p.turno);
}
