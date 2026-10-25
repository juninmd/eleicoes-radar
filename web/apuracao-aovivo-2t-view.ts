// Ao vivo, 2º turno: the HTML of the four panels of apuracao-aovivo-2t.js. Every figure drawn is also printed beside it, and no line says who
// "will win": the words are "à frente", "precisa de" and "o que falta". The Previsão (estimate) keeps its own label; the TSE's text decides.
import { h, int, pct, titleName } from "./format.js";
import { delta } from "./apuracao-pesquisa.js";
import { NOMES } from "./apuracao-mapa.js";
import { dominio2t } from "./apuracao-aovivo-2t.js";
import type { Caminho, Finalista, Numeros, OndeFalta, Par, Pesquisas2T, SituacaoFalta } from "./apuracao-aovivo-2t.js";

type Cor = (partido: string) => string;
const curto = (nome: string) => titleName(nome).split(" ").slice(0, 2).join(" ");
const virgula = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
const pp = (x: number) => virgula(Math.abs(x) * 100);
const dia = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "–");
const nomeUf = (uf: string) => (uf === "ZZ" ? "Exterior" : (NOMES as Record<string, string>)[uf] ?? uf);
export const mi = (n: number) => (n >= 1e7 ? `${virgula(n / 1e6)} mi` : n >= 1e6 ? `${virgula(n / 1e6, 2)} mi` : int(Math.round(n)));

// ---- poll values of the pair, on the axis of the share of A among the valid votes of the two
export function renderPesquisas2t(p: Pesquisas2T, par: Par, cor: Cor): string {
  const [lo, hi] = dominio2t(p);
  const pos = (x: number) => (Math.min(1, Math.max(0, (x - lo) / (hi - lo))) * 100).toFixed(2);
  const lado = (f: Finalista, v: number | null, fim: boolean) => `<span class="pq-lado" style="--c:${h(cor(f.partido))}">${fim ? "" : `<i class="key"></i>`}<b>${h(curto(f.nome))}</b> ${v === null ? "–" : pct(v, 1)}${fim ? `<i class="key"></i>` : ""}</span>`;
  const d = p.dif === null ? null : delta(p.dif);
  const atual = p.atual === null ? "" : `<span class="pq-atual">${p.concluida ? "Apuração concluída" : "Apuração agora"} <b>${pct(p.atual, 1)}</b> de ${h(curto(par.a.nome))}${d ? ` <span class="pq-delta"><span aria-hidden="true">${d.seta} ${d.txt} da média</span><span class="sr">${h(d.sr)}</span></span>` : ""}</span>`;
  const ticks = [lo, 0.5, hi].map((x, i) => `<span class="${i === 1 ? "m" : ""}" style="left:${pos(x)}%">${Math.round(x * 100)}%</span>`).join("");
  const med = p.media === null ? "" : `<i class="pq-med" style="left:${pos(p.media)}%"></i>`;
  const ap = p.atual === null ? "" : `<i class="pq-ap" style="left:${pos(p.atual)}%"></i>`;
  const linhas = p.linhas.map((l) => {
    const lider = l.qa === 0.5 ? null : l.qa > 0.5 ? par.a : par.b;
    const n1 = (x: number) => virgula(x, x % 1 ? 1 : 0);
    const txt = `${l.instituto}, ${dia(l.fim)}: ${curto(par.a.nome)} ${pct(l.qa, 1)} dos votos válidos dos dois (${n1(l.a)} a ${n1(l.b)})`;
    const detalhe = [l.instituto, dia(l.fim), l.amostra ? `${int(l.amostra)} entrevistas` : "", l.margem ? `margem ±${n1(l.margem)} p.p.` : "", l.indecisos ? `${n1(l.indecisos)}% indecisos` : ""].filter(Boolean).join(" · ");
    const det = [l.amostra ? `${int(l.amostra)} entrev.` : "", l.margem ? `±${n1(l.margem)} pp` : ""].filter(Boolean).join(" · ");
    return `<li title="${h(detalhe)}"><span class="pq-inst"><b>${h(l.instituto)}</b><small>${dia(l.fim)}</small>${det ? `<small class="pq-det">${det}</small>` : ""}</span>
      <span class="pq-trk" role="img" aria-label="${h(txt)}"><i class="pq-50"></i>${med}${ap}<i class="pq-pt" style="left:${pos(l.qa)}%;--c:${h(lider ? cor(lider.partido) : "var(--muted)")}"></i></span>
      <span class="pq-val"><b>${pct(l.qa, 1)}</b><small>${n1(l.a)}×${n1(l.b)}</small></span></li>`;
  }).join("");
  const n = p.nMedia ?? p.linhas.length;
  return `<section class="live-pq" aria-labelledby="pq-t">
    <header><h3 id="pq-t">Pesquisas do 2º turno <small>% dos votos válidos dos dois</small></h3></header>
    <p class="pq-resumo">${lado(par.a, p.media, false)}<span class="pq-x" aria-hidden="true">×</span>${lado(par.b, p.media === null ? null : 1 - p.media, true)}</p>
    <p class="pq-sub">${p.media === null ? "Sem média das pesquisas deste par" : `Média de <b>${int(n)}</b> ${n === 1 ? "pesquisa" : "pesquisas"}`}${atual ? " · " : ""}${atual}</p>
    ${p.linhas.length ? `<details class="pq-det-lista"><summary>Ver as ${int(p.linhas.length)} ${p.linhas.length === 1 ? "pesquisa" : "pesquisas"}</summary><div class="pq-eixo" aria-hidden="true"><span></span><div><div class="pq-ext"><span>← ${h(curto(par.b.nome))}</span><span>${h(curto(par.a.nome))} →</span></div><div class="pq-ticks">${ticks}</div></div><span></span></div>
    <ul class="pq-lista" aria-label="Pesquisas do 2º turno, da mais recente para a mais antiga">${linhas}</ul>
    <ul class="pq-leg" aria-hidden="true"><li><i class="pq-pt"></i>cada pesquisa (cor de quem lidera nela)</li>${p.media === null ? "" : `<li><i class="pq-med"></i>média</li>`}${p.atual === null ? "" : `<li><i class="pq-ap"></i>${p.concluida ? "apuração concluída" : "apuração agora"}</li>`}</ul></details>` : `<p class="muted small">Nenhuma pesquisa só com os dois nomes foi encontrada.</p>`}
    <p class="muted small pq-nota">Indecisos, brancos e nulos ficam de fora: cada pesquisa vira a parcela dos dois entre quem escolheu um deles, a mesma base da apuração. Pesquisa não é resultado.</p>
  </section>`;
}

// ---- the count in figures
export function renderNumeros(n: Numeros | null): string {
  if (!n) return "";
  const t = (rot: string, v: string, nota = "") => `<div><dt>${rot}</dt><dd>${v}${nota ? `<small>${nota}</small>` : ""}</dd></div>`;
  return `<dl class="live-kpis" aria-label="A contagem em números">
    ${t("Diferença", `${mi(Math.abs(n.diferenca))}`, n.lider ? `${h(curto(n.lider.nome))} ${n.concluida ? "mais votado" : "à frente"}` : "empate")}
    ${t("Votos válidos", mi(n.validos), n.candidatos === 2 ? "dos dois finalistas" : "em todos os candidatos")}
    ${t("Brancos", pct(n.brancosPct, 1), `${mi(n.brancos)} votos`)}
    ${t("Nulos", pct(n.nulosPct, 1), `${mi(n.nulos)} votos`)}
    ${t("Abstenção", pct(n.abstencaoPct, 1), "seções apuradas")}
    ${t("Seções por apurar", int(n.secoesFaltam), `${pct(Math.max(0, 1 - n.avanco), 1)} do total`)}
  </dl>`;
}

// ---- what the one behind needs from the votes still to come
export function renderCaminho(c: Caminho | null, cor: Cor): string {
  if (!c) return "";
  const nome = h(curto(c.atras.nome));
  const marcas = [c.tem, Math.min(1, c.precisa), c.esperado ?? c.tem];
  const lo = Math.max(0, Math.floor((Math.min(...marcas) - 0.06) / 0.05) * 0.05), hi = Math.min(1, Math.ceil((Math.max(...marcas) + 0.06) / 0.05) * 0.05);
  const pos = (x: number) => (Math.min(1, Math.max(0, (x - lo) / (hi - lo))) * 100).toFixed(2);
  const cc = h(cor(c.atras.partido));
  const frase = c.alcancavel
    ? `<b>${nome}</b> tem <b>${pct(c.tem, 1)}</b> dos votos válidos apurados. Para terminar com mais votos que ${h(curto(c.frente.nome))}, precisa de <b>${pct(c.precisa, 1)}</b> dos <b>${mi(c.faltam)}</b> que ainda faltam, isto é, ganhar o que falta por <b>${pp(2 * c.precisa - 1)} p.p.</b>`
    : `<b>${nome}</b> tem <b>${pct(c.tem, 1)}</b> dos votos válidos apurados. Mesmo com todos os <b>${mi(c.faltam)}</b> que faltam, não chegaria à frente de ${h(curto(c.frente.nome))}: precisaria de mais de 100% deles.`;
  const eixo = [lo, 0.5, hi].filter((x, i, a) => i !== 1 || (x > a[0]! && x < a[2]!)).map((x) => `<span style="left:${pos(x)}%">${Math.round(x * 100)}%</span>`).join("");
  return `<section class="live-cm" aria-labelledby="cm-t" style="--c:${cc}">
    <header><h3 id="cm-t">Caminho para a frente <small>conta sobre o que falta</small></h3></header>
    <p class="cm-txt">${frase}</p>
    <div class="cm-prog" role="img" aria-label="${h(`${mi(c.apurados)} votos válidos apurados e cerca de ${mi(c.faltam)} por apurar`)}"><i style="width:${(c.apurados / (c.apurados + c.faltam) * 100).toFixed(1)}%"></i></div>
    <p class="cm-prog-t"><span><b>${mi(c.apurados)}</b> apurados</span><span>≈ <b>${mi(c.faltam)}</b> a apurar</span></p>
    <div class="cm-trk" role="img" aria-label="${h(`Parcela dos votos que faltam: ${curto(c.atras.nome)} tem ${pct(c.tem, 1)} do apurado, precisa de ${c.alcancavel ? pct(c.precisa, 1) : "mais de 100%"}${c.esperado === null ? "" : ` e o modelo espera ${pct(c.esperado, 1)}`}`)}">
      ${c.alcancavel ? `<i class="cm-basta" style="left:${pos(c.precisa)}%;right:0"></i>` : ""}${lo < 0.5 && hi > 0.5 ? `<i class="cm-50" style="left:${pos(0.5)}%"></i>` : ""}
      <i class="cm-m cm-tem" style="left:${pos(c.tem)}%"></i>${c.alcancavel ? `<i class="cm-m cm-prec" style="left:${pos(c.precisa)}%"></i>` : ""}${c.esperado === null ? "" : `<i class="cm-m cm-esp" style="left:${pos(c.esperado)}%"></i>`}</div>
    <div class="cm-eixo" aria-hidden="true">${eixo}</div>
    <ul class="cm-leg"><li><i class="cm-tem"></i>tem hoje <b>${pct(c.tem, 1)}</b></li>${c.alcancavel ? `<li><i class="cm-prec"></i>precisa de <b>${pct(c.precisa, 1)}</b></li>` : ""}${c.esperado === null ? "" : `<li><i class="cm-esp"></i>modelo espera <b>${pct(c.esperado, 1)}</b></li>`}</ul>
    <p class="muted small">Votos que faltam = estimativa (mesma abstenção e mesma parcela de válidos das seções já apuradas). "Modelo espera" é a mediana da simulação da Previsão. Não é resultado.</p>
  </section>`;
}

// ---- where the valid votes still to come are, coloured by who leads each state today
const SEM_LIDER: Record<SituacaoFalta, string> = { contando: "", aguardando: "aguardando votos", carregando: "carregando", "sem-arquivo": "sem arquivo", erro: "erro ao ler" };
export function renderOndeFalta(f: OndeFalta | null, ids: Par, cor: Cor, max = 6): string {
  const casca = (corpo: string) => `<section class="live-fa" aria-labelledby="fa-t"><h3 id="fa-t">Onde está o que falta</h3>${corpo}</section>`;
  // Until the feed has finished one cycle a state without a file only means the request is still on its way.
  if (!f || !f.pronto) return casca(`<p class="muted small">Lendo os arquivos dos estados…</p>`);
  const nomes = new Map([[ids.a.id, ids.a], [ids.b.id, ids.b]]);
  const comFalta = f.linhas.filter((l) => l.faltam > 0);
  const topo = comFalta.slice(0, max), demais = comFalta.slice(max);
  const resto = demais.reduce((s, l) => s + l.faltam, 0);
  const todos = f.total;
  if (!(todos > 0)) return casca(`<p class="muted small">${f.linhas.some((l) => l.lider) ? "Não há mais votos a apurar nos arquivos de estado." : "Aparece quando os primeiros arquivos de estado tiverem votos."}</p>`);
  const parte = (v: number) => (v / todos);
  const cinza = "var(--line)";
  const soModelo = comFalta.every((l) => l.estimado), algumModelo = comFalta.some((l) => l.estimado);
  const seg = topo.map((l) => `<span style="flex:${l.faltam.toFixed(0)} 1 0;background:${l.lider ? h(cor(l.lider.partido)) : cinza}" title="${h(`${nomeUf(l.uf)}: ${l.estimado ? "≈ " : ""}${mi(l.faltam)} votos válidos por apurar`)}"></span>`).join("") + (resto > 0 ? `<span style="flex:${resto.toFixed(0)} 1 0;background:${cinza}" title="${h(`demais: ${mi(resto)}`)}"></span>` : "");
  const lista = topo.map((l) => {
    const lid = l.lider ? `<span class="fa-lid" style="--c:${h(cor(l.lider.partido))}"><i class="key"></i><b>${h(curto(l.lider.nome))}</b>${l.margem === null ? "" : ` +${pp(l.margem)}`}</span>` : `<span class="fa-lid muted">${SEM_LIDER[l.situacao]}</span>`;
    const av = l.avanco === null ? "sem arquivo" : `${pct(l.avanco, 1)} das seções`;
    return `<li${l.defasada ? ` class="vel"` : ""}><b class="fa-uf"><abbr title="${h(nomeUf(l.uf))}">${l.uf === "ZZ" ? "Ext." : h(l.uf)}</abbr></b>${lid}
      <span class="fa-av" role="img" aria-label="${h(av)}"><i style="width:${((l.avanco ?? 0) * 100).toFixed(1)}%"></i></span>
      <span class="fa-n"><b${l.estimado ? ` title="estimativa do modelo: o arquivo ainda não tem votos"` : ""}>${l.estimado ? "≈ " : ""}${mi(l.faltam)}</b><small>${pct(parte(l.faltam), 0)}</small></span>${l.defasada ? `<span class="sr">arquivo desatualizado</span>` : ""}</li>`;
  }).join("");
  const placar = f.placar.map((x) => { const q = nomes.get(x.id); return q ? `<li style="--c:${h(cor(q.partido))}"><i class="key"></i><b>${h(curto(q.nome))}</b> ${int(x.n)} ${x.n === 1 ? "lugar" : "lugares"}</li>` : ""; }).join("");
  const notas = [
    `Largura e cor: votos válidos por apurar e quem lidera o lugar hoje${demais.length ? `; ${demais.length === 1 ? "o menor fica" : `os ${int(demais.length)} menores ficam`} em cinza` : ""}. Líder e margem em p.p. do arquivo do TSE.`,
    algumModelo ? `≈ marca o lugar que ainda não tem votos: o valor é o que o modelo da Previsão espera.` : "",
    f.aguardando > 0 ? `${int(f.aguardando)} ${f.aguardando === 1 ? "lugar" : "lugares"} sem votos nos arquivos até agora.` : "",
  ].filter(Boolean).join(" ");
  return `<section class="live-fa" aria-labelledby="fa-t">
    <header><h3 id="fa-t">Onde está o que falta <small>≈ ${mi(todos)} votos válidos${soModelo ? " · estimativa do modelo" : ""}</small></h3></header>
    ${placar ? `<ul class="fa-placar" aria-label="À frente hoje, por estado e exterior">${placar}</ul>` : ""}
    <div class="fa-bar" role="img" aria-label="${h(`Votos válidos por apurar: ${topo.map((l) => `${nomeUf(l.uf)} ${mi(l.faltam)}`).join(", ")}${resto > 0 ? `, demais ${mi(resto)}` : ""}`)}">${seg}</div>
    <ol class="fa-lista">${lista}</ol>
    ${f.defasadas.length ? `<p class="fa-vel-txt small"><b>${int(f.defasadas.length)} ${f.defasadas.length === 1 ? "arquivo está" : "arquivos estão"} com números desatualizados:</b> ${h(f.defasadas.map(nomeUf).join(", "))}.</p>` : ""}
    <p class="muted small">${notas}</p>
  </section>`;
}

// ---- the two names of the runoff, always on screen (before the first vote the Presidente card has nothing to draw)
export function renderFinalistas(par: Par, avatar: (c: { id: string; nome: string }, size: string) => string, cor: Cor, media: number | null, rotulo = "Presidente"): string {
  const lado = (f: Finalista, v: number | null, cls: string) => `<div class="fin-lado ${cls}" style="--c:${h(cor(f.partido))}">${avatar({ id: f.id, nome: f.nome }, "sm")}<b>${h(curto(f.nome))}</b><small>${h(f.partido)}</small><span>${v === null ? "–" : pct(v, 1)}</span></div>`;
  return `<section class="live-fin" aria-label="Candidatos do 2º turno"><h3>${h(rotulo)} <small>2º turno · candidatos</small></h3>
    <div class="fin-par">${lado(par.a, media, "a")}<span class="fin-x" aria-hidden="true">×</span>${lado(par.b, media === null ? null : 1 - media, "b")}</div>
    ${media === null ? "" : `<p class="muted small">% = média das pesquisas (votos válidos dos dois).</p>`}</section>`;
}
