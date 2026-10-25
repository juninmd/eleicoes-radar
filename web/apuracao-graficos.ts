// Charts for the Apuração tab. Pure functions returning HTML/SVG strings, no dependencies; every
// number a chart draws is also printed as text beside it.
import { h, int, pct, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { pp } from "./prev.js";
import type { Apuracao, Candidato, Fase } from "./apuracao-tse.js";
import type { Comparacao } from "./apuracao-pesquisa.js";

type Parte = "validos" | "brancos" | "nulos" | "abstencao";
const COMP: { key: Parte; nome: string; cls: string }[] = [
  { key: "validos", nome: "Votos válidos", cls: "c1" },
  { key: "brancos", nome: "Brancos", cls: "c2" },
  { key: "nulos", nome: "Nulos", cls: "c3" },
  { key: "abstencao", nome: "Abstenções", cls: "c4" },
];

// The electorate of the sections already counted, split into what became a valid vote and what did not.
export function composicao(d: Apuracao): string {
  const v: Record<Parte, number> = { validos: d.votos.validos, brancos: d.votos.brancos, nulos: d.votos.nulos, abstencao: d.eleitorado.abstencao };
  const total = COMP.reduce((a, s) => a + v[s.key], 0);
  if (d.eleitorado.apurado <= 0 || total <= 0) return "";
  const desc = COMP.map((s) => `${s.nome} ${pct(v[s.key] / total, 1)}`).join(", ");
  return `<div class="apu-comp" role="img" aria-label="Eleitorado das seções apuradas: ${h(desc)}">${COMP.map((s) => `<span class="seg ${s.cls}" style="flex-grow:${v[s.key]}" title="${h(s.nome)}: ${pct(v[s.key] / total, 1)}"></span>`).join("")}</div>
    <ul class="apu-legenda apu-comp-leg">${COMP.map((s) => `<li><i class="key ${s.cls}"></i>${h(s.nome)} <b>${pct(v[s.key] / total, 1)}</b> <small>${int(v[s.key])}</small></li>`).join("")}</ul>`;
}

// Count against the 90% band of the polls, on one shared scale. Rows without a poll are left out.
export interface LinhaFaixa { c: Pick<Candidato, "nome" | "partido" | "pct">; cmp: Comparacao | null }

export function faixaVsApuracao(rows: LinhaFaixa[], fase: Fase): string {
  const com = rows.filter((r) => r.cmp) as (LinhaFaixa & { cmp: Required<Comparacao> })[];
  if (!com.length) return "";
  const topo = Math.max(...com.flatMap((r) => [r.c.pct, r.cmp.hi, r.cmp.media]));
  const max = Math.max(0.1, Math.ceil((topo * 1.05) / 0.05) * 0.05);
  const at = (x: number) => Math.max(0, Math.min(100, (x / max) * 100));
  const por = fase === "concluida" ? "" : " por enquanto";
  return `<ul class="apu-dumb" aria-label="Apuração e faixa das pesquisas por candidato">${com.map(({ c, cmp }) => {
    const dentro = cmp.dentro === null ? "" : `${cmp.dentro ? "dentro" : "fora"} da faixa${por}`;
    return `<li class="apu-dumb-row"><span class="apu-nm">${h(titleName(c.nome))} <small>${h(c.partido)}</small></span>
      <span class="apu-dumb-track" aria-hidden="true"><span class="band" style="left:${at(cmp.lo).toFixed(2)}%;width:${(at(cmp.hi) - at(cmp.lo)).toFixed(2)}%"></span><span class="mean" style="left:${at(cmp.media).toFixed(2)}%"></span><span class="dot" style="left:${at(c.pct).toFixed(2)}%"></span></span>
      <span class="apu-dumb-txt">apuração <b>${pct(c.pct, 1)}</b> · pesquisa ${pct(cmp.media, 1)} <small>faixa ${pct(cmp.lo, 0)}–${pct(cmp.hi, 0)}${dentro ? ` · ${dentro}` : ""}</small></span></li>`;
  }).join("")}</ul>
  <ul class="apu-legenda"><li><i class="key band-k"></i>faixa de 90% das pesquisas</li><li><i class="key mean-k"></i>média das pesquisas</li><li><i class="key dot-k"></i>apuração (votos válidos)</li></ul>`;
}

const MAX_PONTOS = 120;
const TOP_SALVO = 8;

// One point per TSE file version, kept in memory only while the tab is open ("nothing is stored").
export interface Ponto { chave: string; rotulo: string; avanco: number; pcts: Record<string, number> }

export function registrar(hist: Ponto[], d: Apuracao): Ponto[] {
  if (d.secoes.totalizadas <= 0) return hist;
  const chave = `${d.versao.data} ${d.versao.hora}`;
  if (hist.some((p) => p.chave === chave)) return hist;
  const pcts = Object.fromEntries(d.candidatos.slice(0, TOP_SALVO).map((c) => [c.id, c.pct]));
  const ponto: Ponto = { chave, rotulo: d.versao.hora, avanco: avancoDe(d.secoes), pcts }; // rounded down like everywhere else: 99,96% is never "100%" while open
  return [...hist, ponto].slice(-MAX_PONTOS);
}

// Change of one candidate's share since the first file seen. Neutral arrow: a fall is not "bad" while the count is open.
function variacao(diff: number) {
  if (Math.abs(diff) < 0.0005) return { seta: "▬", txt: "0,0 p.p.", sr: "estável desde o primeiro arquivo visto" };
  const up = diff > 0;
  return { seta: up ? "▲" : "▼", txt: `${pp(diff)} p.p.`, sr: `${up ? "subiu" : "caiu"} ${pp(diff)} p.p. desde o primeiro arquivo visto` };
}

const W = 640;
const ALTURA = 250;
const ALTURA_LARGA = 170; // the compact columns of the Ao vivo: the same width, shorter, so the text keeps its size
const M = { l: 44, r: 12, t: 12, b: 34 };

type Leitura = Pick<Ponto, "rotulo" | "avanco" | "pcts">;

// What the polls expect for a candidate: the average and its 90% band, as shares of the valid votes (like the count).
export interface Esperado { media: number; lo?: number; hi?: number }

// The wave of the count: how a candidate's share has moved per point of sections over the last files (up to 3 waves), carried on to 100% of
// the sections. A straight-line reading of the recent past, not a forecast: sections do not arrive in random order. Null when the window
// is too short or covers less than 1% of the sections (the slope would be noise).
const JANELA = 4;
export function tendenciaFinal(hist: Leitura[], id: string): number | null {
  const w = hist.slice(-JANELA).filter((p) => id in p.pcts);
  if (w.length < 2) return null;
  const [a, b] = [w[0], w.at(-1)!];
  if (b.avanco >= 1 || b.avanco - a.avanco < 0.01) return null;
  const inclinacao = (b.pcts[id] - a.pcts[id]) / (b.avanco - a.avanco);
  return Math.max(0, Math.min(1, b.pcts[id] + inclinacao * (1 - b.avanco)));
}

export function evolucao(hist: Leitura[], quem: Record<string, Pick<Candidato, "nome" | "partido">>, cor: (key: string) => string, esperado: Record<string, Esperado> = {}, opcoes: { tendencia?: boolean; largo?: boolean } = {}): string {
  const H = opcoes.largo ? ALTURA_LARGA : ALTURA;
  if (hist.length < 2) return `<p class="muted small">A evolução aparece conforme chegam novos arquivos do TSE enquanto esta aba está aberta. Nada fica guardado: ao fechar a aba, o histórico some.</p>`;
  const ultimo = hist.at(-1)!;
  const ids = Object.keys(ultimo.pcts).sort((a, b) => ultimo.pcts[b] - ultimo.pcts[a]).filter((id) => quem[id]).slice(0, 4);
  const fim: Record<string, number> = {};
  if (opcoes.tendencia) for (const id of ids) { const v = tendenciaFinal(hist, id); if (v !== null) fim[id] = v; }
  const comTendencia = Object.keys(fim).length > 0;
  const maxPct = Math.max(...hist.flatMap((p) => ids.map((id) => p.pcts[id] ?? 0)), ...ids.map((id) => esperado[id]?.hi ?? esperado[id]?.media ?? 0), ...Object.values(fim), 0.1);
  const ymax = Math.ceil((maxPct * 1.1) / 0.1) * 0.1;
  // Evenly spaced by arrival order: files that report the same section count must not stack on one x.
  // With the trend on, the count takes 70% of the width and the rest is the stretch up to 100% of the sections.
  const xAgora = comTendencia ? M.l + 0.7 * (W - M.l - M.r) : W - M.r;
  const x = (p: Leitura) => M.l + (hist.indexOf(p) / (hist.length - 1)) * (xAgora - M.l);
  const y = (v: number) => H - M.b - (v / ymax) * (H - M.t - M.b);
  const grade = [0, ymax / 2, ymax].map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grade"/><text x="${M.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="eixo">${pct(v, 0)}</text>`).join("");
  const linhas = ids.map((id) => {
    const cor_ = cor(quem[id].partido);
    const pts = hist.filter((p) => id in p.pcts).map((p) => `${x(p).toFixed(1)},${y(p.pcts[id]).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${cor_}" stroke-width="2.5" stroke-linejoin="round"/>`;
  });
  // The dashed line is the polls' average for the candidate (the expectation), with its 90% band behind it: where the count would end if it behaved like the polls.
  const esp = ids.filter((id) => esperado[id]);
  const bandas = esp.filter((id) => Number.isFinite(esperado[id].lo) && Number.isFinite(esperado[id].hi)).map((id) => `<rect x="${M.l}" y="${y(esperado[id].hi!).toFixed(1)}" width="${W - M.l - M.r}" height="${Math.max(1, y(esperado[id].lo!) - y(esperado[id].hi!)).toFixed(1)}" fill="${cor(quem[id].partido)}" opacity="0.10" class="esperado-faixa"/>`);
  const tracos = esp.map((id) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(esperado[id].media).toFixed(1)}" y2="${y(esperado[id].media).toFixed(1)}" stroke="${cor(quem[id].partido)}" stroke-width="2" stroke-dasharray="7 5" class="esperado"/><text x="${M.l + 4}" y="${(y(esperado[id].media) - 4).toFixed(1)}" text-anchor="start" class="eixo">pesquisas ${pct(esperado[id].media, 1)}</text>`);
  // Dotted: the wave carried on to 100% of the sections, from the last point of each line.
  const ondas = ids.filter((id) => id in fim).map((id) => {
    const c = cor(quem[id].partido);
    const ult = hist.filter((p) => id in p.pcts).at(-1)!;
    return `<line x1="${x(ult).toFixed(1)}" y1="${y(ult.pcts[id]).toFixed(1)}" x2="${W - M.r}" y2="${y(fim[id]).toFixed(1)}" stroke="${c}" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round" class="tendencia"/><text x="${W - M.r - 2}" y="${(y(fim[id]) + (fim[id] >= ult.pcts[id] ? -6 : 14)).toFixed(1)}" text-anchor="end" class="eixo">onda até 100%: ${pct(fim[id], 1)}</text>`;
  });
  const divisor = comTendencia ? `<line x1="${xAgora.toFixed(1)}" x2="${xAgora.toFixed(1)}" y1="${M.t}" y2="${H - M.b}" class="grade" stroke-dasharray="3 3"/><text x="${(xAgora - 4).toFixed(1)}" y="${M.t + 10}" text-anchor="end" class="eixo">agora</text>` : "";
  const resumo = ids.map((id) => {
    const primeiro = hist.find((p) => id in p.pcts)!.pcts[id];
    const fim = ultimo.pcts[id];
    const dl = variacao(fim - primeiro);
    return `<li><i class="key" style="background:${cor(quem[id].partido)}"></i>${h(titleName(quem[id].nome))} <small>${h(quem[id].partido)}</small> <b>${pct(primeiro, 1)} → ${pct(fim, 1)}</b> <span class="dif"><span aria-hidden="true">${dl.seta}</span> ${dl.txt}</span><span class="sr"> (${h(dl.sr)})</span></li>`;
  }).join("");
  const aria = `Parcela dos votos válidos dos ${ids.length} primeiros colocados conforme chegam os arquivos do TSE, de ${pct(hist[0].avanco, 1)} a ${pct(ultimo.avanco, 1)} das seções`;
  return `<svg class="apu-evo" viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(aria)}">${grade}${bandas.join("")}${divisor}${linhas.join("")}${tracos.join("")}${ondas.join("")}
    <text x="${M.l}" y="${H - 8}" class="eixo">${h(hist[0].rotulo)} · ${pct(hist[0].avanco, 1)} das seções</text><text x="${comTendencia ? xAgora.toFixed(1) : W - M.r}" y="${H - 8}" text-anchor="end" class="eixo">${h(ultimo.rotulo)} · ${pct(ultimo.avanco, 1)}</text>${comTendencia ? `<text x="${W - M.r}" y="${H - 8}" text-anchor="end" class="eixo">100% das seções</text>` : ""}</svg>
    <ul class="apu-legenda apu-evo-txt">${resumo}</ul>${comTendencia ? `<p class="muted small">Linha pontilhada: a onda do momento. Pega o quanto cada candidato subiu ou caiu por ponto de seções nas últimas atualizações e leva essa variação até 100% das seções. É uma conta de tendência, não projeção nem resultado: as urnas não chegam em ordem aleatória e a onda muda a cada arquivo.</p>` : ""}${esp.length ? `<p class="muted small">Linha tracejada: média das pesquisas de cada candidato (a expectativa), em votos válidos como a apuração; a faixa clara é a faixa de 90%. Não é projeção do resultado: o Radar só mostra onde a contagem estaria se acompanhasse as pesquisas.</p>` : ""}
    <p class="muted small">Cada ponto é um arquivo do TSE visto desde que você abriu a aba. As linhas sobem e descem conforme as urnas chegam; isso mostra a ordem de chegada das seções, não uma projeção.</p>`;
}
