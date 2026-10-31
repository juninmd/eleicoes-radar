// "Câmara" tab: HTML strings (no DOM, no network). Every name, sigla and sentence from the API goes through h(); images only enter as
// data: URIs of the expected type (the collector writes them; a hand-edited file cannot slip another URL into src). No party colour, no
// ranking of people, no word that says who will win: the tab describes how benches voted and what is on the agenda.
import { h, int, pct } from "./format.js";
import { BLOCOS_UF, emUrgencia, empacotarDia, norm, passos, saldo, VOTO_NOME } from "./camara-dados.js";
import type { Afinidade, Agrupar, Preparada, PorUf } from "./camara-dados.js";
import type { EventoPauta, FotosCamara, PainelCamara, PartidosCamara, Proposicao } from "../src/radar/camara/painel-tipos.js";

export type Sec = "votacao" | "deputado" | "pauta" | "tramitacao" | "afinidade";
export const SECOES: [Sec, string][] = [["votacao", "Votações"], ["deputado", "Deputados"], ["pauta", "Pauta"], ["tramitacao", "Tramitação"], ["afinidade", "Afinidade"]];
export interface Estado {
  sec: Sec; vi: number; agrupar: Agrupar; cor: "voto" | "orient"; foco: string | null; escala: "abs" | "pct";
  tipos: string[]; soPauta: boolean; soUrg: boolean; busca: string; ti: number; tt: string; to: string; ord: "alfa" | "prox"; sel: string | null; dq: string; dep: number | null;
}
export const estadoInicial = (): Estado => ({ sec: "votacao", vi: 0, agrupar: "partido", cor: "voto", foco: null, escala: "abs", tipos: [], soPauta: true, soUrg: false, busca: "", ti: 0, tt: "", to: "", ord: "alfa", sel: null, dq: "", dep: null });

export interface Ctx { fotos: FotosCamara; partidos: PartidosCamara; mostrarFotos: boolean }
const FOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, LOGO = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

/** Portrait (or the initials when photos are off, missing or not a JPEG data: URI). Never the only carrier of a name: the name is always beside it. */
export function foto(c: Ctx, id: number, nome: string, grande = false): string {
  const src = c.mostrarFotos ? c.fotos[String(id)] : undefined;
  const cls = `cm-foto${grande ? " g" : ""}`;
  return src && FOTO.test(src) ? `<img class="${cls}" src="${src}" alt="" width="${grande ? 72 : 36}" height="${grande ? 90 : 45}" loading="lazy" decoding="async">` : `<span class="${cls} ini" aria-hidden="true">${h(iniciais(nome))}</span>`;
}
/** Party logo with its sigla: the sigla is the label, the image is decoration. */
export function legenda(c: Ctx, sigla: string | null | undefined): string {
  if (!sigla) return ""; // the agenda sometimes lists a rapporteur without a party
  const l = c.partidos[sigla]?.logo;
  return `<span class="cm-part">${l && LOGO.test(l) ? `<img class="cm-logo" src="${l}" alt="" width="28" height="19" loading="lazy" decoding="async">` : `<span class="cm-logo mono" aria-hidden="true">${h(sigla.slice(0, 3))}</span>`}<b>${h(sigla)}</b></span>`;
}

export function dicaDeputado(l: { id: number; nome: string; uf: string; partido: string; voto: number; seg: "seguiu" | "diferente" | "sem"; orient: string | null }, c: Ctx): string {
  return `<div class="cm-dica">${foto(c, l.id, l.nome)}<div><b>${h(l.nome)}</b><br>${h(l.partido)}-${h(l.uf)} · votou <b>${h(VOTO_NOME[l.voto]!)}</b><br><span class="op">${h(SEG_NOME[l.seg])}${l.seg !== "sem" && l.orient ? ` (${h(l.orient)})` : ""}</span></div></div>`;
}
export const dataBr = (s: string) => s.split("-").reverse().join("/");
export const tituloVotacao = (v: Preparada["v"]) => (v.prop ? `${v.prop.sigla} ${v.prop.numero}/${v.prop.ano}` : v.descricao.slice(0, 36));
const diaLongo = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const VCOR = ["var(--cm-sim)", "var(--cm-nao)", "var(--cm-abs)", "var(--cm-obs)", "var(--cm-out)"];
export const corVoto = (i: number) => VCOR[i] ?? VCOR[4]!;
export const SEG_COR = { seguiu: "var(--cm-seg)", diferente: "var(--cm-dif)", sem: "var(--cm-out)" } as const;
export const SEG_NOME = { seguiu: "Seguiu a orientação", diferente: "Votou diferente da orientação", sem: "Sem orientação própria" } as const;

export const nav = (sec: Sec) => `<div class="pan-seg cm-nav" role="group" aria-label="Seção da Câmara">${SECOES.map(([k, n]) => `<button type="button" data-cm-sec="${k}" aria-pressed="${k === sec}">${h(n)}</button>`).join("")}</div>`;
export const aguardando = () => `<p class="empty" role="status">Carregando os dados da Câmara…</p>`;
export const semDados = () => `<p class="empty" role="status">Dados da Câmara ainda não gerados. Rode <code>bun run radar:camara</code> e publique <code>web/data/camara/</code>.</p>`;

// ---- shared bars ----
export interface LinhaBarra { id: string; nome: string; rotulo?: string; total: number; segs: { v: number; cor: string; rot: string }[]; html?: string }
export function barras(linhas: LinhaBarra[], o: { pct?: boolean; ativo?: string | null; clicavel?: boolean; max?: number; attr?: string } = {}): string {
  const M = o.max ?? Math.max(1, ...linhas.map((l) => l.total));
  const attr = o.attr ?? "data-cm-foco";
  return linhas.map((l, i) => {
    const den = o.pct ? Math.max(1, l.total) : M;
    const segs = l.segs.filter((s) => s.v > 0).map((s) => `<i style="width:${((s.v / den) * 100).toFixed(2)}%;background:${s.cor};--dl:${Math.min(i, 24) * 22}ms" data-tt="${h(`${l.nome} · ${s.rot}: ${int(s.v)}`)}"></i>`).join("");
    const rot = h(`${l.nome}: ${l.segs.map((s) => `${s.rot} ${s.v}`).join(", ")}`);
    const corpo = `<span class="n">${l.html ?? h(l.nome)}</span><span class="bar" role="img" aria-label="${rot}">${segs}</span><span class="t">${h(l.rotulo ?? int(l.total))}</span>`;
    return o.clicavel === false ? `<div class="cm-br">${corpo}</div>` : `<button type="button" class="cm-br" ${attr}="${h(l.id)}" aria-pressed="${o.ativo === l.id}">${corpo}</button>`;
  }).join("");
}

// ---- Votações ----
export function cartoesVotacao(preps: Preparada[], vi: number): string {
  return `<div class="cm-pick">${preps.map((p, i) => {
    const c = p.contagem, v = p.v;
    const tipo = v.descricao.split(/\. (?=\p{Lu})|, de |Sim:/u)[0]!.slice(0, 80);
    return `<button type="button" class="cm-pk" data-cm-vi="${i}" aria-pressed="${i === vi}"><span class="d">${dataBr(v.data)}${v.aprovada === null ? "" : v.aprovada ? " · aprovada" : " · rejeitada"}</span><b>${h(tituloVotacao(v))}</b><span class="k">${h(tipo)}</span>
      <span class="cm-mini" aria-hidden="true"><i style="flex:${c.sim};background:var(--cm-sim)"></i><i style="flex:${c.nao};background:var(--cm-nao)"></i><i style="flex:${c.abs + c.outros};background:var(--cm-abs)"></i></span></button>`;
  }).join("")}</div>`;
}
export function indicadores(p: Preparada): string {
  const c = p.contagem, t = p.linhas.length, o = c.abs + c.outros;
  const k = (l: string, v: number, cor: string, f: number, suf = "") => `<div class="cm-kpi"><div class="l">${cor ? `<i style="background:${cor}"></i>` : ""}${h(l)}</div><div class="v">${int(v)}${suf}</div><div class="b"><i style="width:${(f * 100).toFixed(1)}%;background:${cor || "var(--ink)"}"></i></div></div>`;
  return `<div class="cm-kpis">${k("Votaram Sim", c.sim, "var(--cm-sim)", c.sim / t)}${k("Votaram Não", c.nao, "var(--cm-nao)", c.nao / t)}${k("Abstenção e outros", o, "var(--cm-abs)", o / t)}${k("Votos registrados", t, "", t / 513)}${k("Dos 513 deputados", Math.round((t / 513) * 100), "", t / 513, "%")}</div>`;
}
export function legendaHemi(p: Preparada, cor: "voto" | "orient"): string {
  const cont: Record<string, number> = {};
  for (const l of p.linhas) { const k = cor === "voto" ? String(l.voto) : l.seg; cont[k] = (cont[k] ?? 0) + 1; }
  const chaves = cor === "voto" ? ["0", "1", "2", "3", "4"] : ["seguiu", "diferente", "sem"];
  return chaves.filter((k) => cont[k]).map((k) => `<span><i style="background:${cor === "voto" ? corVoto(Number(k)) : SEG_COR[k as keyof typeof SEG_COR]}"></i>${h(cor === "voto" ? VOTO_NOME[Number(k)]! : SEG_NOME[k as keyof typeof SEG_NOME])} <b class="num">${cont[k]}</b></span>`).join("");
}
export function centroHemi(p: Preparada, foco: string | null): string {
  const c = p.contagem;
  return `<div class="cm-big num">${c.sim} <span class="muted">×</span> ${c.nao}</div>${p.v.aprovada === null ? "" : `<span class="cm-res">${p.v.aprovada ? "Aprovada" : "Rejeitada"}${foco ? ` · destaque: ${h(foco)}` : ""}</span>`}`;
}

export function mapaBlocos(porUf: Record<string, PorUf>, foco: string | null): string {
  return `<div class="cm-tiles">${Object.entries(BLOCOS_UF).map(([uf, [c, r]], k) => {
    const u = porUf[uf];
    if (!u || !u.n) return `<button type="button" class="cm-tile vazio" data-cm-uf="${uf}" style="grid-column:${c + 1};grid-row:${r + 1}" aria-label="${uf}: sem voto${foco ? ` do ${h(foco)}` : ""}">${uf}</button>`;
    const m = saldo(u), forte = Math.abs(m);
    return `<button type="button" class="cm-tile" data-cm-uf="${uf}" style="grid-column:${c + 1};grid-row:${r + 1};background:color-mix(in oklab, ${m >= 0 ? "var(--cm-sim)" : "var(--cm-nao)"} ${(10 + forte * 82).toFixed(0)}%, var(--line));color:${forte > 0.5 ? "#fff" : "var(--ink)"};--dl:${k * 14}ms" aria-label="${uf}: ${u.sim} Sim, ${u.nao} Não">${uf}<small>${u.sim}–${u.nao}</small></button>`;
  }).join("")}</div>`;
}

export function barrasPartido(p: Preparada, c: Ctx, foco: string | null, escala: "abs" | "pct"): string {
  const L: LinhaBarra[] = p.partidos.map((q) => ({
    id: q.partido, nome: q.partido, html: legenda(c, q.partido), total: q.n, rotulo: escala === "pct" ? `${pct(q.sim / q.n)} Sim` : String(q.n),
    segs: [{ v: q.sim, cor: "var(--cm-sim)", rot: "Sim" }, { v: q.nao, cor: "var(--cm-nao)", rot: "Não" }, { v: q.abs, cor: "var(--cm-abs)", rot: "Abstenção" }, { v: q.outros, cor: "var(--cm-out)", rot: "Outro" }],
  }));
  return barras(L, { pct: escala === "pct", ativo: foco });
}
export function barrasOrientacao(p: Preparada, c: Ctx, foco: string | null): string {
  const L: LinhaBarra[] = p.partidos.filter((q) => q.orient !== null && q.seguiu + q.diferente > 0).sort((a, b) => b.seguiu / b.n - a.seguiu / a.n || b.n - a.n).map((q) => ({
    id: q.partido, nome: q.partido, html: legenda(c, q.partido), total: q.n, rotulo: pct(q.seguiu / q.n),
    segs: [{ v: q.seguiu, cor: "var(--cm-seg)", rot: "Seguiu" }, { v: q.diferente, cor: "var(--cm-dif)", rot: "Votou diferente" }, { v: q.n - q.seguiu - q.diferente, cor: "var(--cm-out)", rot: "Outro" }],
  }));
  return L.length ? barras(L, { pct: true, ativo: foco }) : `<p class="muted">Nenhuma orientação por partido registrada nesta votação.</p>`;
}
export function divergentes(p: Preparada, c: Ctx, foco: string | null): string {
  if (!foco) return `<p class="muted small">Escolha um partido para ver quem votou diferente da orientação.</p>`;
  const q = p.partidos.find((x) => x.partido === foco);
  if (!q || q.orient === null || !(q.seguiu + q.diferente)) return `<p class="muted small">${h(foco)}: sem orientação própria nesta votação${q?.orient ? ` (${h(q.orient)})` : ""}.</p>`;
  const d = p.linhas.filter((l) => l.partido === foco && l.seg === "diferente");
  return `<p class="small"><b>${h(foco)}</b> orientou <b>${h(q.orient)}</b>${q.federacao ? " (via federação)" : ""}. ${d.length ? `${d.length} ${d.length === 1 ? "deputado votou" : "deputados votaram"} diferente:` : "Ninguém votou diferente."}</p>
    <ul class="cm-lista">${d.slice(0, 40).map((l) => `<li><button type="button" data-cm-dep="${l.dep}">${foto(c, l.id, l.nome)}<span><b>${h(l.nome)}</b> <small>${h(l.uf)} · votou ${h(VOTO_NOME[l.voto]!)}</small></span></button></li>`).join("")}</ul>`;
}

export function votacaoView(p: Preparada, preps: Preparada[], e: Estado, c: Ctx, porUf: Record<string, PorUf>): string {
  return `${cartoesVotacao(preps, e.vi)}${indicadores(p)}
  <div class="cm-grid">
    <div class="cm-card c8"><div class="cm-h"><div><h3>Hemiciclo</h3><p class="sub">${h(tituloVotacao(p.v))} · ${dataBr(p.v.data)} · ${h(p.v.descricao.slice(0, 110))}${p.v.descricao.length > 110 ? "…" : ""}</p></div>
      <div class="cm-ctl"><div class="pan-seg" role="group" aria-label="Agrupar por">${([["partido", "Partido"], ["uf", "Estado"], ["voto", "Voto"]] as const).map(([k, n]) => `<button type="button" data-cm-agrupar="${k}" aria-pressed="${e.agrupar === k}">${n}</button>`).join("")}</div>
      <div class="pan-seg" role="group" aria-label="Colorir por">${([["voto", "Cor: voto"], ["orient", "Cor: orientação"]] as const).map(([k, n]) => `<button type="button" data-cm-cor="${k}" aria-pressed="${e.cor === k}">${n}</button>`).join("")}</div></div></div>
      <div class="cm-hemi-wrap"><div data-cm-hemi></div><div class="cm-hemi-c" id="cm-centro">${centroHemi(p, e.foco)}</div></div>
      <div class="cm-leg" id="cm-leg">${legendaHemi(p, e.cor)}</div>
      <p class="muted small">Passe o mouse ou toque num ponto. Clique para fixar o destaque no partido. A posição no desenho é só agrupamento, não posição política.</p></div>
    <div class="cm-card c4"><h3>Por estado</h3><p class="sub">${e.foco ? `Só a bancada do ${h(e.foco)}.` : "Saldo de Sim e Não entre os deputados de cada estado."}</p>${mapaBlocos(porUf, e.foco)}
      <div class="cm-ramp"></div><div class="cm-ramp-l"><span>mais Não</span><span>empate</span><span>mais Sim</span></div></div>
    <div class="cm-card c6"><div class="cm-h"><div><h3>Voto por partido</h3><p class="sub">Clique num partido para destacá-lo em todos os gráficos.</p></div>
      <div class="pan-seg" role="group" aria-label="Escala">${([["abs", "Votos"], ["pct", "%"]] as const).map(([k, n]) => `<button type="button" data-cm-escala="${k}" aria-pressed="${e.escala === k}">${n}</button>`).join("")}</div></div>
      <div class="cm-bars" id="cm-pbars">${barrasPartido(p, c, e.foco, e.escala)}</div></div>
    <div class="cm-card c6"><h3>Seguiu a orientação?</h3><p class="sub">Parcela de cada bancada que votou como a liderança orientou. Só partidos com orientação Sim, Não, Abstenção ou Obstrução.</p>
      <div class="cm-bars" id="cm-cbars">${barrasOrientacao(p, c, e.foco)}</div>
      <div class="cm-leg"><span><i style="background:var(--cm-seg)"></i>Seguiu</span><span><i style="background:var(--cm-dif)"></i>Votou diferente</span></div>
      <div id="cm-difs">${divergentes(p, c, e.foco)}</div></div>
  </div>
  <p class="cm-aviso">Orientação é o que a liderança registrou; o deputado pode votar diferente por motivos que a API não informa. "Votou diferente" é um fato do painel, não um julgamento. Voto do presidente da sessão (Art. 17) e ausências não entram. Partido dentro de bloco sem nome completo na API aparece como "sem orientação própria".</p>`;
}

// ---- Deputados ----
export interface Ficha { dep: number; id: number; nome: string; uf: string; partido: string }
export function buscarDeputados(fichas: Ficha[], q: string): Ficha[] {
  const n = norm(q);
  return n.length < 2 ? [] : fichas.filter((f) => norm(f.nome).includes(n)).slice(0, 12);
}
export function resultadosBusca(rs: Ficha[], q: string, c: Ctx): string {
  if (q.trim().length < 2) return `<p class="muted small">Digite ao menos duas letras do nome.</p>`;
  if (!rs.length) return `<p class="muted small">Nenhum deputado com "${h(q)}".</p>`;
  return `<ul class="cm-lista">${rs.map((f) => `<li><button type="button" data-cm-dep="${f.dep}">${foto(c, f.id, f.nome)}<span><b>${h(f.nome)}</b> <small>${h(f.partido)}-${h(f.uf)}</small></span></button></li>`).join("")}</ul>`;
}
export function fichaDeputado(f: Ficha, preps: Preparada[], c: Ctx): string {
  const passou = preps.map((p) => ({ p, l: p.linhas.find((x) => x.dep === f.dep) ?? null }));
  const c5 = [0, 0, 0, 0, 0]; let sem = 0, seguiu = 0, dif = 0;
  for (const { l } of passou) { if (!l) { sem++; continue; } c5[l.voto]!++; if (l.seg === "seguiu") seguiu++; if (l.seg === "diferente") dif++; }
  const faixa = passou.map(({ p, l }) => {
    const t = `${dataBr(p.v.data)} · ${tituloVotacao(p.v)}: ${l ? `${VOTO_NOME[l.voto]}${l.seg === "sem" ? "" : l.seg === "seguiu" ? " (como a orientação)" : ` (orientação: ${l.orient})`}` : "sem voto registrado"}`;
    return `<i class="cm-q${l ? "" : " vazio"}" style="${l ? `background:${corVoto(l.voto)}` : ""}" data-tt="${h(t)}" role="img" aria-label="${h(t)}"></i>`;
  }).join("");
  const comOri = seguiu + dif;
  return `<div class="cm-ficha">${foto(c, f.id, f.nome, true)}<div><h3>${h(f.nome)}</h3><p>${legenda(c, f.partido)} <span class="muted">· ${h(f.uf)}</span></p>
    <p class="muted small">Nas ${preps.length} votações nominais coletadas: ${c5[0]} Sim, ${c5[1]} Não, ${c5[2]! + c5[3]! + c5[4]!} abstenção ou outro, ${sem} sem voto registrado (ausência ou fora do exercício).</p></div></div>
    <div class="cm-faixa" role="group" aria-label="Voto em cada votação, da mais antiga para a mais recente">${faixa}</div>
    <div class="cm-leg">${[0, 1, 2].map((i) => `<span><i style="background:${corVoto(i)}"></i>${VOTO_NOME[i]}</span>`).join("")}<span><i style="background:var(--line)"></i>sem voto registrado</span></div>
    <p class="small">${comOri ? `Em ${comOri} votações o partido tinha orientação própria; o voto coincidiu em ${seguiu} e diferiu em ${dif}.` : "Nenhuma das votações teve orientação própria do partido."}</p>`;
}
export function deputadoView(rs: Ficha[], e: Estado, fichas: Ficha[], preps: Preparada[], c: Ctx): string {
  const f = e.dep !== null ? fichas.find((x) => x.dep === e.dep) : null;
  return `<div class="cm-grid"><div class="cm-card c5"><h3>Buscar deputado</h3><p class="sub">Todos os que registraram voto nas votações coletadas.</p>
    <input type="search" id="cm-dq" class="cm-in" placeholder="Nome do deputado" aria-label="Buscar deputado" value="${h(e.dq)}" autocomplete="off"><div id="cm-dres">${resultadosBusca(rs, e.dq, c)}</div></div>
    <div class="cm-card c7" id="cm-ficha">${f ? fichaDeputado(f, preps, c) : `<p class="muted">Escolha um deputado para ver como votou em cada votação.</p>`}</div></div>
  <p class="cm-aviso">A faixa mostra voto a voto, sem nota e sem ranking. Ausência pode ter muitos motivos (licença, missão, suplência) e não é lida como posição. Coincidir ou não com a orientação do partido não diz se o voto foi certo ou errado.</p>`;
}

// ---- Pauta ----
export const TIPOS_COR = ["var(--cm-sim)", "var(--cm-seg)", "var(--cm-nao)", "var(--cm-obs)", "var(--cm-abs)"];
export function corTipos(eventos: EventoPauta[]): Record<string, string> {
  const n = new Map<string, number>(); for (const e of eventos) n.set(e.tipo, (n.get(e.tipo) ?? 0) + 1);
  const out: Record<string, string> = {};
  [...n].sort((a, b) => b[1] - a[1]).forEach(([t], i) => { out[t] = TIPOS_COR[Math.min(i, TIPOS_COR.length - 1)]!; });
  return out;
}
export function resumoPauta(eventos: EventoPauta[]): string {
  const itens = eventos.flatMap((e) => e.pauta);
  const k = (l: string, v: number) => `<div class="cm-kpi"><div class="l">${h(l)}</div><div class="v">${int(v)}</div></div>`;
  return `<div class="cm-kpis">${k("Reuniões e sessões", eventos.length)}${k("Com pauta publicada", eventos.filter((e) => e.pauta.length).length)}${k("Itens em pauta", itens.length)}${k("Em regime de urgência", itens.filter((i) => emUrgencia(i.regime)).length)}${k("Órgãos", new Set(eventos.flatMap((e) => e.orgaos.map((o) => o.sigla))).size)}</div>`;
}
export function ganttPauta(eventos: EventoPauta[], cores: Record<string, string>): string {
  const dias = [...new Set(eventos.map((e) => e.inicio.slice(0, 10)))].sort();
  const pr = dias.map((d) => empacotarDia(eventos.filter((e) => e.inicio.startsWith(d))));
  const todos = pr.flatMap((x) => x.barras);
  if (!todos.length) return `<p class="muted">Nenhuma reunião marcada nos próximos dias.</p>`;
  const h0 = Math.floor(Math.min(...todos.map((b) => b.ini)) - 0.25), h1 = Math.ceil(Math.max(...todos.map((b) => b.fim))) + 0.25, span = h1 - h0;
  const ticks: number[] = []; for (let t = Math.ceil(h0); t <= h1; t += 2) ticks.push(t);
  const x = (t: number) => (((t - h0) / span) * 100).toFixed(2);
  return dias.map((d, i) => {
    const g = pr[i]!;
    return `<h4 class="cm-dia">${h(diaLongo(d))} <small class="muted num">· ${g.barras.length} reuniões</small></h4><div class="cm-gantt"><div class="cm-g-grid">${ticks.map((t) => `<i style="left:${x(t)}%"></i>`).join("")}</div>
      <div class="cm-g-body" style="height:${g.linhas * 26}px">${g.barras.map((b) => `<button type="button" class="cm-g-bar" data-cm-evento="${b.e.id}" style="left:${x(b.ini)}%;width:${(((b.fim - b.ini) / span) * 100).toFixed(2)}%;top:${b.linha * 26}px;background:${cores[b.e.tipo] ?? "var(--cm-abs)"}" data-tt="${h(`${b.e.tipo} · ${b.e.inicio.slice(11, 16)} · ${b.e.orgaos.map((o) => o.nome).join(", ")} · ${b.e.pauta.length ? `${b.e.pauta.length} itens` : "sem pauta publicada"}`)}">${h(b.e.orgaos.map((o) => o.sigla).join(", "))}</button>`).join("")}</div>
      <div class="cm-g-axis">${ticks.map((t) => `<span style="left:${x(t)}%">${String(t).padStart(2, "0")}h</span>`).join("")}</div></div>`;
  }).join("");
}
export function agregadosPauta(eventos: EventoPauta[]): string {
  const cont = (f: (e: EventoPauta) => [string, number][]) => { const m = new Map<string, number>(); for (const e of eventos) for (const [k, v] of f(e)) m.set(k, (m.get(k) ?? 0) + v); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 7); };
  const lin = (rs: [string, number][], cor: string) => barras(rs.map(([nome, v]) => ({ id: nome, nome, total: v, segs: [{ v, cor, rot: "itens" }] })), { clicavel: false });
  const regime = cont((e) => e.pauta.map((i) => [(i.regime || "—").replace(/ \(.*\)$/, ""), 1]));
  const tipo = cont((e) => [[e.tipo || "—", 1]]);
  const org = cont((e) => (e.pauta.length ? [[e.orgaos[0]?.sigla ?? "—", e.pauta.length]] : []));
  return `<div class="cm-card c4"><h3>Itens por regime</h3><p class="sub">Como a matéria tramita (Art. 151 e 155 do Regimento).</p><div class="cm-bars">${lin(regime, "var(--cm-sim)")}</div></div>
    <div class="cm-card c4"><h3>Reuniões por tipo</h3><p class="sub">&nbsp;</p><div class="cm-bars">${lin(tipo, "var(--cm-seg)")}</div></div>
    <div class="cm-card c4"><h3>Órgãos com mais itens</h3><p class="sub">&nbsp;</p><div class="cm-bars">${lin(org, "var(--cm-obs)")}</div></div>`;
}
export function casaEvento(e: EventoPauta, f: { tipos: string[]; soPauta: boolean; soUrg: boolean; busca: string }): boolean {
  if (f.tipos.length && !f.tipos.includes(e.tipo)) return false;
  if (f.soPauta && !e.pauta.length) return false;
  if (f.soUrg && !e.pauta.some((i) => emUrgencia(i.regime))) return false;
  if (f.busca.trim()) {
    const palha = norm([e.tipo, e.descricao, e.local, ...e.orgaos.map((o) => `${o.sigla} ${o.nome}`), ...e.pauta.flatMap((i) => [i.titulo, i.ementa, i.parecer, i.relator?.nome ?? "", i.topico])].join(" "));
    if (!f.busca.split(/\s+/).filter(Boolean).every((t) => palha.includes(norm(t)))) return false;
  }
  return true;
}
export function listaEventos(eventos: EventoPauta[], c: Ctx, abrir: number | null): string {
  if (!eventos.length) return `<p class="muted">Nada com esses filtros.</p>`;
  let dia = "", out = "";
  for (const e of [...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const d = e.inicio.slice(0, 10);
    if (d !== dia) { dia = d; out += `<h4 class="cm-dia">${h(diaLongo(d))}</h4>`; }
    const nu = e.pauta.filter((i) => emUrgencia(i.regime)).length;
    out += `<details class="cm-ev" id="cm-ev-${e.id}"${abrir === e.id ? " open" : ""}><summary><span class="num hora">${h(e.inicio.slice(11, 16))}</span><div><b>${h(e.tipo)} · ${h(e.orgaos.map((o) => o.sigla).join(", "))}</b><div class="muted small">${h(e.descricao)}${e.local ? ` · ${h(e.local)}` : ""}</div></div><span class="cm-pill${nu ? " u" : ""}">${e.pauta.length ? `${e.pauta.length} itens${nu ? ` · ${nu} urg.` : ""}` : "sem pauta"}</span></summary><div class="cm-ev-b">${corpoEvento(e, c)}</div></details>`;
  }
  return out;
}
function corpoEvento(e: EventoPauta, c: Ctx): string {
  const ln = `<a class="cm-ext" href="https://www.camara.leg.br/evento-legislativo/${e.id}" target="_blank" rel="noopener noreferrer">Abrir no site da Câmara ↗</a>`;
  if (!e.pauta.length) return `<p class="muted">Pauta ainda não publicada.</p>${ln}`;
  const por = new Map<string, typeof e.pauta>(); for (const i of e.pauta) { const k = i.topico || "Outros"; (por.get(k) ?? por.set(k, []).get(k)!).push(i); }
  let out = "";
  for (const [t, is] of por) {
    out += `<div class="cm-topico">${h(t)} (${is.length})</div>${is.slice(0, 30).map((i) => `<div class="cm-it"><span class="muted num">${i.ordem}</span><div><b>${h(i.titulo)}</b> <span class="cm-pill${emUrgencia(i.regime) ? " u" : ""}">${h(i.regime)}</span><br><span class="muted">${h(i.parecer || i.ementa)}</span>${i.relator ? `<br><span class="muted small">Relator: ${h(i.relator.nome)} ${legenda(c, i.relator.partido)}-${h(i.relator.uf)}</span>` : ""}</div></div>`).join("")}${is.length > 30 ? `<p class="muted small">… e mais ${is.length - 30} neste tópico.</p>` : ""}`;
  }
  return out + ln;
}
export function pautaView(eventos: EventoPauta[], e: Estado, c: Ctx): string {
  const cores = corTipos(eventos), tipos = Object.keys(cores);
  return `${resumoPauta(eventos)}<div class="cm-grid">
    <div class="cm-card c12"><h3>Dia a dia</h3><p class="sub">Cada barra é uma reunião ou sessão, no horário de início. Quando a Câmara não informa o fim, a barra usa 1h30 como duração estimada.</p>${ganttPauta(eventos, cores)}
      <div class="cm-leg">${tipos.map((t) => `<span><i style="background:${cores[t]};border-radius:3px"></i>${h(t)}</span>`).join("")}</div></div>
    ${agregadosPauta(eventos)}
    <div class="cm-card c12"><h3>Pautas completas</h3><p class="sub">Abra uma reunião para ver os itens.</p>
      <div class="cm-ctl" style="margin-bottom:10px"><input type="search" id="cm-pq" class="cm-in" placeholder="Buscar projeto, tema, órgão ou relator" aria-label="Buscar na pauta" value="${h(e.busca)}"><button type="button" class="cm-chip" data-cm-pauta="1" aria-pressed="${e.soPauta}">Só com pauta publicada</button><button type="button" class="cm-chip" data-cm-urg="1" aria-pressed="${e.soUrg}">Só urgência</button></div>
      <div class="cm-ctl" style="margin-bottom:12px">${tipos.map((t) => `<button type="button" class="cm-chip" data-cm-tipo="${h(t)}" aria-pressed="${e.tipos.includes(t)}">${h(t)}</button>`).join("")}</div>
      <div id="cm-evs" aria-live="polite">${listaEventos(eventos.filter((x) => casaEvento(x, e)), c, null)}</div></div></div>
    <p class="cm-aviso">Pauta é a previsão publicada pela Câmara; pode mudar, ser retirada ou nem chegar à votação. Estar na pauta não diz como cada deputado votará. "Urgência" é um regime regimental (Art. 155), não uma avaliação do tema.</p>`;
}

// ---- Tramitação ----
export const ORGAO_COR = ["var(--cm-sim)", "var(--cm-nao)", "var(--cm-seg)", "var(--cm-obs)", "var(--cm-abs)"];
export function coresOrgao(props: Proposicao[], hoje: string): Record<string, string> {
  const tot: Record<string, number> = {};
  for (const p of props) for (const [o, d] of Object.entries(passos(p, hoje).porOrgao)) tot[o] = (tot[o] ?? 0) + d;
  const out: Record<string, string> = {};
  Object.entries(tot).sort((a, b) => b[1] - a[1]).forEach(([o], i) => { out[o] = ORGAO_COR[Math.min(i, ORGAO_COR.length - 1)]!; });
  return out;
}
export function cartoesProp(props: Proposicao[], ti: number): string {
  return `<div class="cm-pick">${props.map((p, i) => `<button type="button" class="cm-pk" data-cm-ti="${i}" aria-pressed="${i === ti}"><span class="d">${dataBr(p.apresentacao)} · ${p.tram.length} movimentações</span><b>${h(p.titulo)}</b><span class="k">${h(p.ementa)}</span></button>`).join("")}</div>`;
}
export function cabecaProp(p: Proposicao, hoje: string): string {
  const { passos: ps, porOrgao } = passos(p, hoje);
  const ult = ps[ps.length - 1];
  const maior = Object.entries(porOrgao).sort((a, b) => b[1] - a[1])[0];
  const k = (l: string, v: string, s = "") => `<div class="cm-kpi"><div class="l">${h(l)}</div><div class="v">${v}</div>${s ? `<div class="muted small num">${s}</div>` : ""}</div>`;
  const d = (a: string, b: string) => int(Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5));
  return `<div class="cm-card"><h3>${h(p.titulo)} <span class="cm-tag">${h(p.tipo)}</span></h3><p>${h(p.ementa)}</p>
    <p class="muted small">Apresentado em ${dataBr(p.apresentacao)} por ${p.autores.length ? p.autores.map((a) => h(a.nome)).join(", ") : "—"}.</p>
    <div class="cm-ctl">${p.temas.map((t) => `<span class="cm-tag">${h(t)}</span>`).join("")}${p.inteiroTeor ? `<a class="cm-ext" href="${h(p.inteiroTeor)}" target="_blank" rel="noopener noreferrer">Inteiro teor ↗</a>` : ""}</div></div>
    <div class="cm-kpis">${k("Dias desde a apresentação", d(p.apresentacao, hoje))}${k("Movimentações", int(ps.length))}${k("Órgãos", int(Object.keys(porOrgao).length))}${ult ? k("Dias desde a última", d(ult.data, hoje)) : ""}${maior ? k("Mais tempo em", h(maior[0]), `${int(maior[1])} dias`) : ""}</div>`;
}
export function ganttProp(p: Proposicao, hoje: string, cores: Record<string, string>): string {
  const { passos: ps, porOrgao } = passos(p, hoje);
  const t0 = p.apresentacao, total = Math.max(1, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${t0}T12:00:00Z`)) / 864e5));
  const X = (d: string) => (Math.max(0, Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${t0}T12:00:00Z`)) / 864e5)) / total) * 100;
  const anos: number[] = []; for (let y = Number(t0.slice(0, 4)) + 1; y <= Number(hoje.slice(0, 4)); y++) anos.push(y);
  return `<div class="cm-gantt">${Object.keys(porOrgao).map((o) => `<div class="cm-lane"><b>${h(o)}</b><div class="cm-track">${ps.filter((s) => s.orgao === o).map((s) => `<i class="cm-seg-b" style="left:${X(s.data).toFixed(2)}%;width:${Math.max(0.35, X(s.fim) - X(s.data)).toFixed(2)}%;background:${cores[o] ?? "var(--cm-abs)"}" data-tt="${h(`${o} · ${dataBr(s.data)} → ${dataBr(s.fim)} · ${s.dias} dias · ${s.tipo}`)}"></i>`).join("")}${ps.filter((s) => s.orgao === o).map((s) => `<i class="cm-dot" style="left:${X(s.data).toFixed(2)}%"></i>`).join("")}</div></div>`).join("")}
    <div class="cm-lane"><b></b><div class="cm-g-axis"><span style="left:0;transform:none">${t0.slice(0, 4)}</span>${anos.filter((y) => X(`${y}-01-01`) > 5).map((y) => `<span style="left:${X(`${y}-01-01`).toFixed(2)}%">${y}</span>`).join("")}</div></div></div>`;
}
export function porAno(p: Proposicao, hoje: string): string {
  const ya: Record<string, number> = {}; for (const t of p.tram) ya[t[0].slice(0, 4)] = (ya[t[0].slice(0, 4)] ?? 0) + 1;
  const ys: number[] = []; for (let y = Number(p.apresentacao.slice(0, 4)); y <= Number(hoje.slice(0, 4)); y++) ys.push(y);
  const mx = Math.max(1, ...Object.values(ya));
  return `<div class="cm-anos">${ys.map((y, i) => `<div><span class="num muted small">${ya[y] ?? ""}</span><i data-tt="${y}: ${ya[y] ?? 0} movimentações" style="height:${ya[y] ? Math.max(4, (ya[y]! / mx) * 100) : 0}%;--dl:${i * 60}ms"></i><span class="num small${ya[y] ? "" : " muted"}">${y}</span></div>`).join("")}</div>`;
}
export function comparaProps(props: Proposicao[], hoje: string, cores: Record<string, string>): string {
  const L: LinhaBarra[] = props.map((p) => { const { porOrgao } = passos(p, hoje), tot = Object.values(porOrgao).reduce((a, b) => a + b, 0); return { id: p.titulo, nome: p.titulo, total: tot, rotulo: `${int(tot)} d`, segs: Object.entries(porOrgao).sort((a, b) => b[1] - a[1]).map(([o, v]) => ({ v, cor: cores[o] ?? "var(--cm-abs)", rot: `${o} (dias)` })) }; });
  return `<div class="cm-bars">${barras(L, { clicavel: false })}</div><div class="cm-leg">${Object.keys(cores).map((o) => `<span><i style="background:${cores[o]};border-radius:3px"></i>${h(o)}</span>`).join("")}</div>`;
}
export function registroProp(p: Proposicao, hoje: string, cores: Record<string, string>, tt: string, to: string): { html: string; n: number; total: number } {
  const { passos: ps } = passos(p, hoje);
  let ano = "", out = "", n = 0;
  ps.forEach((s, k) => {
    if ((tt && s.tipo !== tt) || (to && s.orgao !== to)) return;
    n++;
    if (s.data.slice(0, 4) !== ano) { ano = s.data.slice(0, 4); out += `<li class="ano">${ano}</li>`; }
    const g = k ? Math.round((Date.parse(`${s.data}T12:00:00Z`) - Date.parse(`${ps[k - 1]!.data}T12:00:00Z`)) / 864e5) : null;
    out += `<li style="--c:${cores[s.orgao] ?? "var(--cm-abs)"}"><div class="d num">${dataBr(s.data)} · <span class="cm-tag">${h(s.orgao)}</span>${g !== null ? ` <span class="cm-gap${g >= 90 ? " long" : ""}">+${g} d</span>` : ""}</div><div class="t">${h(s.tipo)}</div><div class="muted small">${h(s.situacao)}${s.regime ? ` · ${h(s.regime)}` : ""}</div>${s.despacho ? `<details class="cm-desp"><summary>Despacho</summary><p>${h(s.despacho)}</p></details>` : ""}</li>`;
  });
  return { html: out || `<li class="muted">Nada com esse filtro.</li>`, n, total: ps.length };
}
export function tramitacaoView(props: Proposicao[], e: Estado, hoje: string): string {
  if (!props.length) return `<p class="muted">Sem proposições coletadas.</p>`;
  const p = props[Math.min(e.ti, props.length - 1)]!, cores = coresOrgao(props, hoje), reg = registroProp(p, hoje, cores, e.tt, e.to);
  const tipos = [...new Set(p.tram.map((t) => t[2]))], orgs = [...new Set(p.tram.map((t) => t[1]))];
  return `${cartoesProp(props, e.ti)}${cabecaProp(p, hoje)}<div class="cm-grid">
    <div class="cm-card c12"><h3>Linha do tempo por órgão</h3><p class="sub">Cada faixa é o período em que o projeto esteve sob um órgão; os círculos são as movimentações.</p>${ganttProp(p, hoje, cores)}</div>
    <div class="cm-card c6"><h3>Movimentações por ano</h3><p class="sub">Anos sem barra são anos sem movimentação.</p>${porAno(p, hoje)}</div>
    <div class="cm-card c6"><h3>Dias por órgão, lado a lado</h3><p class="sub">Os projetos coletados, na mesma escala.</p>${comparaProps(props, hoje, cores)}</div>
    <div class="cm-card c12"><div class="cm-h"><h3>Registro completo</h3><div class="cm-ctl"><label for="cm-tt">Tipo</label><select id="cm-tt" class="cm-in"><option value="">Todas</option>${tipos.map((t) => `<option${t === e.tt ? " selected" : ""}>${h(t)}</option>`).join("")}</select><label for="cm-to">Órgão</label><select id="cm-to" class="cm-in"><option value="">Todos</option>${orgs.map((o) => `<option${o === e.to ? " selected" : ""}>${h(o)}</option>`).join("")}</select><span class="muted small num" id="cm-cnt">${reg.n} de ${reg.total}</span></div></div>
      <ol class="cm-tl" id="cm-tl">${reg.html}</ol></div></div>
    <p class="cm-aviso">Tempo parado em um órgão não é, por si, bom ou ruim: pode refletir pauta, prazo regimental ou espera por parecer. O painel mostra o que está registrado, sem julgar o ritmo. "Hoje" é a data da coleta.</p>`;
}

// ---- Afinidade ----
const abrevia = (p: string) => (p.length > 8 ? `${p.slice(0, 7)}…` : p);
export function matriz(a: Afinidade, ord: "alfa" | "prox", sel: number | null): string {
  const ordem = ord === "alfa" ? a.ps.map((_, i) => i) : a.proxima, N = a.ps.length;
  let out = `<div></div>${ordem.map((j) => `<div class="hh${sel === j ? " sel" : ""}" title="${h(a.ps[j]!)}">${h(abrevia(a.ps[j]!))}</div>`).join("")}`;
  ordem.forEach((i, r) => {
    out += `<button type="button" class="hr${sel === i ? " sel" : ""}" data-cm-par="${i}" title="${h(a.ps[i]!)}">${h(abrevia(a.ps[i]!))}</button>`;
    ordem.forEach((j, c) => {
      const v = a.A[i]![j]!, t = i === j ? 100 : 6 + ((v - a.minimo) / (1 - a.minimo || 1)) * 90;
      out += `<div class="cm-c" data-cm-i="${i}" data-cm-j="${j}" style="background:${i === j ? "var(--ink)" : `color-mix(in oklab, var(--cm-sim) ${t.toFixed(0)}%, var(--line))`};--dl:${(r + c) * 8}ms" data-tt="${h(i === j ? a.ps[i]! : `${a.ps[i]} × ${a.ps[j]} · afinidade ${pct(v)} em ${a.comum[i]![j]} votações`)}"></div>`;
    });
  });
  return `<div class="cm-mx" style="grid-template-columns:50px repeat(${N},minmax(0,1fr))">${out}</div>`;
}
export function vizinhos(a: Afinidade, i: number, c: Ctx): string {
  const outros = a.ps.map((_, j) => j).filter((j) => j !== i && a.comum[i]![j]! >= 3).sort((x, y) => a.A[i]![y]! - a.A[i]![x]!);
  const bl = (js: number[], cor: string, t: string) => `<h4 class="cm-sub">${t}</h4><div class="cm-bars">${barras(js.map((j) => ({ id: a.ps[j]!, nome: a.ps[j]!, html: legenda(c, a.ps[j]!), total: 1, rotulo: pct(a.A[i]![j]!), segs: [{ v: a.A[i]![j]!, cor, rot: "afinidade" }] })), { max: 1, clicavel: false })}</div>`;
  return bl(outros.slice(0, 5), "var(--cm-sim)", "Votaram mais parecido") + bl(outros.slice(-5).reverse(), "var(--cm-nao)", "Votaram menos parecido");
}
export function dispersao(a: Afinidade, sel: number | null, c: Ctx): string {
  const outros = sel === null ? [] : a.ps.map((_, j) => j).filter((j) => j !== sel && a.comum[sel]![j]! >= 3).sort((x, y) => a.A[sel]![y]! - a.A[sel]![x]!);
  const perto = new Set(outros.slice(0, 3)), longe = new Set(outros.slice(-3));
  return a.ps.map((p, j) => {
    const d = 30 + Math.sqrt(a.tamanho[j]!) * 3.4, logo = c.partidos[p]?.logo;
    return `<button type="button" class="cm-bub${j === sel ? " sel" : perto.has(j) ? " near" : longe.has(j) ? " far" : ""}" data-cm-par="${j}" style="left:${a.X[j]!.toFixed(1)}%;top:${a.Y[j]!.toFixed(1)}%;width:${d.toFixed(0)}px;height:${d.toFixed(0)}px;--dl:${j * 35}ms" data-tt="${h(`${p} · ${a.tamanho[j]} deputados · coesão ${pct(a.coesao[j]!)}`)}" aria-label="${h(p)}">${logo && LOGO.test(logo) ? `<img src="${logo}" alt="" width="${(d * 0.62).toFixed(0)}" height="${(d * 0.42).toFixed(0)}">` : h(abrevia(p))}</button>`;
  }).join("");
}
export function afinidadeView(a: Afinidade, e: Estado, c: Ctx): string {
  if (a.ps.length < 3) return `<p class="muted">Poucas votações nominais para comparar partidos.</p>`;
  const sel = e.sel !== null ? a.ps.indexOf(e.sel) : -1, i = sel >= 0 ? sel : a.tamanho.indexOf(Math.max(...a.tamanho));
  const ord = a.ps.map((_, j) => j).sort((x, y) => a.coesao[y]! - a.coesao[x]!);
  return `<div class="cm-grid">
    <div class="cm-card c7"><div class="cm-h"><div><h3>Matriz de afinidade</h3><p class="sub">${a.votacoes} votações nominais. Quanto mais forte o azul, mais parecido o voto. Clique num partido para ver os mais próximos e os mais distantes.</p></div>
      <div class="pan-seg" role="group" aria-label="Ordem">${([["alfa", "A–Z"], ["prox", "Por proximidade"]] as const).map(([k, n]) => `<button type="button" data-cm-ord="${k}" aria-pressed="${e.ord === k}">${n}</button>`).join("")}</div></div>
      <div class="cm-scroll">${matriz(a, e.ord, i)}</div>
      <div class="cm-leg"><span>menos parecido</span><span class="cm-grad"></span><span>mais parecido</span></div></div>
    <div class="cm-card c5"><h3>${legenda(c, a.ps[i]!)}</h3><p class="sub">Até ${a.tamanho[i]} deputados votaram · coesão média ${pct(a.coesao[i]!)}</p>${vizinhos(a, i, c)}</div>
    <div class="cm-card c7"><h3>Mapa de proximidade</h3><p class="sub">Partidos que votaram parecido ficam perto. Os eixos não têm significado político, só a distância conta. Tamanho = deputados que votaram.</p>
      <div class="cm-scat">${dispersao(a, i, c)}</div>
      <div class="cm-leg"><span><i style="background:var(--cm-sim)"></i>3 mais próximos do escolhido</span><span><i style="background:var(--cm-nao)"></i>3 mais distantes</span></div></div>
    <div class="cm-card c5"><h3>Coesão interna</h3><p class="sub">Média, nas votações, da fatia da bancada que ficou do lado majoritário dela (Sim ou Não).</p>
      <div class="cm-bars">${barras(ord.map((j) => ({ id: a.ps[j]!, nome: a.ps[j]!, html: legenda(c, a.ps[j]!), total: 1, rotulo: pct(a.coesao[j]!), segs: [{ v: a.coesao[j]! - 0.5, cor: "var(--cm-seg)", rot: "coesão acima de 50%" }] })), { max: 0.5, clicavel: false })}</div></div></div>
    <p class="cm-aviso">A afinidade vale para as votações nominais coletadas, não para o mandato inteiro. Não há classificação de esquerda ou direita: a medida é a distância entre os votos de cada par. Votação quase unânime aproxima todo mundo.</p>`;
}

export function moldura(sec: Sec, corpo: string, painel: PainelCamara | null): string {
  return `<section class="exp-card pan cm-root" aria-labelledby="cm-t"><h2 id="cm-t">Câmara <small>votações, pauta e tramitação${painel ? `, dados de ${dataBr(painel.geradoEm)}` : ""}</small></h2>
    <p class="muted cm-intro">Como os partidos e deputados votaram e o que está na pauta. Descreve fatos dos dados abertos da Câmara; não dá nota, não recomenda voto e não prevê resultado.</p>${nav(sec)}<div class="cm-corpo">${corpo}</div></section>`;
}
