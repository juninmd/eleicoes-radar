// "Noite no mapa" view of the Apuração tab: the map of the count as it comes in. A state lights up when its first file arrives, changes colour
// when the one ahead changes, and the map folds into a tile map where every state has the same size (one View Transition, one name per state).
// For the President a duel strip shows the two most voted nationally; for the governors, how many states each party leads. Colours are the tab's
// memory (by party) and the intensity is the margin; the Radar names no winner and the only "elected" text is the TSE's.
//
// Like the Corrida it keeps its own DOM and updates it in place (the tab's string redraws would throw away what has to animate). The pure
// functions are what the tests cover.
import { h, int, titleName } from "./format.js";
import { linhasUf, totalNacional, avancoDe } from "./apuracao-nacional.js";
import { NOMES } from "./apuracao-mapa.js";
import { pontosMundo, renderExterior } from "./apuracao-exterior.js";
import type { ExteriorProps, PontoMundo } from "./apuracao-exterior.js";
import { caixaDe, corDoPartido, decimos, depoisDoPrimeiroQuadro, elemento, iniciais, movimentoReduzido, odometro, pct1, reiniciaClasse } from "./apuracao-fx.js";
import type { Caixa } from "./apuracao-fx.js";
import { afimUfNoMundo, caixaBrasil, naCena, PROJ_PADRAO } from "./apuracao-cena.js";
import type { Retangulo } from "./apuracao-cena.js";
import { criarZoom, MUNDO_RETANGULO } from "./apuracao-zoom.js";
import type { Zoom } from "./apuracao-zoom.js";
import type { Cargo, Fase } from "./apuracao-tse.js";
import type { Cores, LinhaCom, LinhaUf } from "./apuracao-nacional.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Painel } from "./apuracao-corrida.js";
import type { UfMap } from "../src/radar/geo/uf-map";
import type { Candidatura } from "./types.js";

// ---- pure: the tile map. [column, row] of every state on a 7 x 7 grid, laid out roughly like the country.
export const TILES: Record<string, [number, number]> = {
  RR: [2, 0], AP: [4, 0],
  AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2],
  MS: [2, 3], GO: [3, 3], BA: [4, 3], AL: [5, 3], SE: [6, 3],
  SP: [2, 4], DF: [3, 4], MG: [4, 4], ES: [5, 4],
  PR: [2, 5], SC: [3, 5], RJ: [4, 5],
  RS: [3, 6],
};
export const COLUNAS = 7;
export interface Posicao { l: number; t: number; w: number; h: number } // % of the stage
// Where one state sits in each shape. The tile keeps the state's own proportions (the biggest side fills 84% of the cell), so folding the map is
// only a move and a scale, and the View Transition never has to stretch a snapshot.
export function posicoes(uf: string, c: Caixa, viewBox: readonly [number, number, number, number]): { mapa: Posicao; carto: Posicao } | null {
  const tile = TILES[uf];
  if (!tile) return null;
  const [vw, vh] = [viewBox[2], viewBox[3]];
  const [x0, y0, x1, y1] = c;
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0 || vw <= 0 || vh <= 0) return null;
  const cw = vw / COLUNAS, ch = vh / COLUNAS;
  const s = (Math.min(cw, ch) * 0.84) / Math.max(w, h);
  const [col, row] = tile;
  const pc = (v: number, total: number) => (v / total) * 100;
  return {
    mapa: { l: pc(x0, vw), t: pc(y0, vh), w: pc(w, vw), h: pc(h, vh) },
    carto: { l: pc(col * cw + (cw - w * s) / 2, vw), t: pc(row * ch + (ch - h * s) / 2, vh), w: pc(w * s, vw), h: pc(h * s, vh) },
  };
}

// ---- pure: what the page needs to know of a state, and what changed between two looks at the whole country
export interface ResumoUf { uf: string; id: string | null; nome: string; partido: string; pct: number; margem: number; avanco: number; fase: Fase | null; apto: number; velho: boolean }
export function resumoUf(l: LinhaUf): ResumoUf {
  const lider = l.lider;
  return {
    uf: l.uf, id: lider?.id ?? null, nome: lider?.nome ?? "", partido: lider?.partido ?? "", pct: lider?.pct ?? 0,
    margem: l.margem ?? 0, avanco: l.avanco ?? 0, fase: l.fase, apto: l.dados?.eleitorado.apto ?? 0, velho: l.defasada,
  };
}

export interface Duelo { a: { id: string; nome: string; partido: string; num: string; votos: number; pct: number }; b: { id: string; nome: string; partido: string; num: string; votos: number; pct: number }; parcelaA: number }
export interface Topo { duelo: Duelo | null; avanco: number; fase: Fase | null; secoes: { total: number; totalizadas: number }; arquivos: { com: number; de: number } }
// The two most voted nationally (the sum of the state files, the exterior included for the President). `parcelaA` is A's share of the two.
export function topoNacional(linhas: LinhaUf[]): Topo {
  const t = totalNacional(linhas);
  const [a, b] = t.candidatos;
  return {
    duelo: a && b && a.votos + b.votos > 0 ? { a, b, parcelaA: a.votos / (a.votos + b.votos) } : null,
    avanco: avancoDe(t.secoes), fase: t.fase as Fase | null, secoes: t.secoes, arquivos: t.cobertura,
  };
}

// For the races that are one per state (governors): how many states each party leads.
export function contagemLideres(resumos: Iterable<ResumoUf>): { partido: string; n: number }[] {
  const por = new Map<string, number>();
  for (const r of resumos) if (r.id) por.set(r.partido || "–", (por.get(r.partido || "–") ?? 0) + 1);
  return [...por].map(([partido, n]) => ({ partido, n })).sort((x, y) => y.n - x.n || x.partido.localeCompare(y.partido, "pt-BR"));
}

export interface EventoNoite { tipo: "abre" | "virou" | "conclui" | "total"; uf?: string; id?: string; texto: string }
export const AVANCO_MINIMO = 0.1; // below this share of sections a "turn" is noise: the first urns come from a few places
export const ESTADO_GRANDE = 4_000_000; // electorate: only the big ones get a line for finishing
export const AVANCO_NACIONAL_MINIMO = 0.04;
const nomeUf = (uf: string) => (NOMES as Record<string, string>)[uf] ?? uf;

export function eventosNoite(antes: ReadonlyMap<string, ResumoUf> | null, depois: ReadonlyMap<string, ResumoUf>, topoAntes: Topo | null, topoDepois: Topo | null): EventoNoite[] {
  if (!antes) return []; // the first look says where the count stands, not that something happened
  const out: EventoNoite[] = [];
  for (const [uf, d] of depois) {
    const a = antes.get(uf);
    if (!a) continue;
    if (!a.id && d.id) out.push({ tipo: "abre", uf, id: d.id, texto: `${nomeUf(uf)} começou a apurar.` });
    else if (a.id && d.id && a.id !== d.id && a.avanco >= AVANCO_MINIMO) out.push({ tipo: "virou", uf, id: d.id, texto: `${uf} virou: ${titleName(d.nome)} passa à frente (${pct1(d.pct)}, ${Math.floor(d.avanco * 100)}% apurado).` });
    if (a.fase !== "concluida" && d.fase === "concluida" && d.apto >= ESTADO_GRANDE && d.id) out.push({ tipo: "conclui", uf, id: d.id, texto: `${uf} concluído: ${titleName(d.nome)} com ${pct1(d.pct)}.` });
  }
  const x = topoAntes?.duelo, y = topoDepois?.duelo;
  if (x && y && x.a.id !== y.a.id && (topoDepois?.avanco ?? 0) >= AVANCO_NACIONAL_MINIMO) {
    out.push({ tipo: "total", id: y.a.id, texto: `No total do país, ${titleName(y.a.nome)} passa à frente (${pct1(y.a.pct)} com ${Math.floor((topoDepois?.avanco ?? 0) * 100)}% das seções).` });
  }
  return out;
}

// Intensity of a state's colour: from a pale tint at a dead heat to the full colour at a 25-point margin.
export const intensidade = (margem: number): number => 0.28 + 0.72 * Math.min(Math.max(margem, 0) / 0.25, 1);

// ---- pure: the world map of the vote abroad. Equirectangular (see src/radar/geo/world-map.ts): the map's top edge is 84°N.
export interface MundoMap { fonte: string; viewBox: [number, number, number, number]; d: string }
export const LAT_TOPO_MUNDO = 84;
export const pontoNoMundo = (lat: number, lon: number, vb: readonly [number, number, number, number]): [number, number] => { const k = vb[2] / 360; return [(lon + 180) * k, (LAT_TOPO_MUNDO - lat) * k]; };
// Area-true bubbles (radius by the square root of the valid votes), the biggest first so the small ones stay on top; coloured by the finalist ahead.
export function bolhasMundo(pontos: PontoMundo[], vb: readonly [number, number, number, number], corA: string, corB: string, rMax = 22): string {
  const maior = Math.max(1, ...pontos.map((x) => x.votos));
  return pontos.map((x) => {
    const [cx, cy] = pontoNoMundo(x.lat, x.lon, vb), r = Math.max(2.5, rMax * Math.sqrt(x.votos / maior)), lider = x.a === x.b ? "var(--vazio)" : x.a > x.b ? corA : corB;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${h(lider)}"><title>${h(titleName(x.nome))}: ${int(x.votos)} votos válidos</title></circle>`;
  }).join("");
}

// ---- the view
export type Lugar = "brasil" | "exterior";
export interface NoiteProps {
  nac: BrasilSnapshot | null;
  cargo: Cargo;
  mapa: UfMap | null | undefined; // undefined while loading, null when it failed
  mundo?: MundoMap | null | undefined; // same, for the world map of the "Exterior" choice (President only)
  exterior?: Omit<ExteriorProps, "cor" | "turno" | "compacto"> | null;
  byId: Map<string, Candidatura>;
  avatar: (c: Candidatura, size: string) => string;
  cor: Cores;
  efeitos: boolean;
  salto?: boolean;
  simulado?: boolean;
  lugar?: Lugar; // forces the Brazil/Exterior choice (the Ao vivo filter); undefined leaves it to the reader
  onUf?: (uf: string) => void; // a state was clicked: the caller may filter the tab to it
  onLugar?: (lugar: Lugar) => void;
  semAbrir?: boolean; // embedded in a tab that already acts on the state click: no "open" button
  anunciar?: (txt: string) => void;
  som?: { vira(): void };
}
interface Uf { b: HTMLButtonElement; sm: HTMLElement }

const LEGENDA_BRASIL = "A cor é a do partido de quem está à frente no estado; quanto mais forte, maior a diferença para o segundo. Cinza: ainda sem arquivo. No cartograma todos os estados têm o mesmo tamanho.";
const ESQUELETO = `<section class="nt-duelo" aria-label="Os dois mais votados no total"></section>
  <div class="nt-corpo">
    <section class="nt-palco" aria-label="Mapa dos estados">
      <div class="nt-barra">
        <div class="apu-vistas nt-lugar" role="group" aria-label="Mapa" hidden><button type="button" data-nt-lugar="brasil" aria-pressed="true">Brasil</button><button type="button" data-nt-lugar="exterior" aria-pressed="false">Exterior</button></div>
        <div class="apu-vistas nt-forma" role="group" aria-label="Forma do mapa"><button type="button" data-nt-forma="mapa" aria-pressed="true">Mapa</button><button type="button" data-nt-forma="carto" aria-pressed="false">Cartograma</button></div>
        <span class="muted small nt-contagem"></span>
      </div>
      <p class="empty nt-msg" hidden></p>
      <div class="nt-mapa" role="group" aria-label="Mapa interativo: arraste para mover; use os botões, a rolagem do mouse ou a pinça para ampliar">
        <div class="nt-cena"><div class="nt-mundo"></div></div>
        <canvas class="nt-fx" aria-hidden="true"></canvas>
        <div class="nt-zoom" role="group" aria-label="Zoom do mapa"><button type="button" data-nt-zoom="mais" aria-label="Ampliar o mapa">+</button><button type="button" data-nt-zoom="menos" aria-label="Reduzir o mapa">−</button><button type="button" data-nt-zoom="ajustar" aria-label="Voltar ao enquadramento">⤢</button></div>
      </div>
      <p class="muted small nt-dica">Arraste para mover. Para ampliar: rolagem do mouse, botões, pinça ou as teclas + e −; 0 volta ao enquadramento.</p>
      <p class="muted small nt-leg">${LEGENDA_BRASIL}</p>
    </section>
    <aside class="nt-lado" aria-label="Detalhes da apuração">
      <section class="nt-cartao"><h3>Seções totalizadas</h3><div class="nt-prog" role="img"></div><p class="nt-prog-t muted small"></p></section>
      <section class="nt-cartao nt-foco" aria-live="off"></section>
      <section class="nt-cartao nt-ext" hidden></section>
      <section class="nt-cartao"><h3>Manchetes</h3><ul class="nt-manchetes"><li class="nt-vazia muted small">Aparecem quando um estado vira, um estado grande termina ou o total do país muda de lado.</li></ul></section>
    </aside>
  </div>`;

export function criarNoite(): Painel<NoiteProps> & { raiz: HTMLElement | null; adotar(alvo: HTMLElement): void } {
  let raiz: HTMLElement | null = null;
  let host: HTMLElement | null = null;
  let ufs = new Map<string, Uf>();
  let mapaDe: UfMap | null = null;
  let antes: Map<string, ResumoUf> | null = null;
  let topoAntes: Topo | null = null;
  let sel = "SP"; // the state in focus survives a redraw of the tab
  let forma: "mapa" | "carto" = "mapa";
  let lugar: Lugar = "brasil";
  let zoom: Zoom | null = null;
  let caixaBr: Retangulo | null = null; // Brazil's box in world units, once the state map is here
  let enquadrado = ""; // what the zoom was last aimed at: a poll must not undo the reader's own zoom
  let ultimo: NoiteProps | null = null;
  let ultimasLinhas: LinhaUf[] = [];
  let observador: ResizeObserver | null = null;
  const fx: Array<{ t: "anel" | "faisca"; x: number; y: number; r0?: number; r1?: number; vx?: number; vy?: number; cor: string; t0: number; dur: number }> = [];
  let raf = 0;
  let disparos: number[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const depois = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const q = <T extends Element>(s: string) => raiz!.querySelector<T>(s)!;

  // ---- canvas effects: a ring where a state opens, sparks where it turns. At most three bursts a second, never a flash.
  function ajustar() {
    const c = q<HTMLCanvasElement>(".nt-fx"), r = q<HTMLElement>(".nt-mapa").getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
    c.getContext("2d")?.setTransform(d, 0, 0, d, 0, 0);
  }
  function centro(uf: string): [number, number, number] | null {
    const e = ufs.get(uf)?.b;
    if (!e || !raiz) return null;
    const r = e.getBoundingClientRect(), m = q<HTMLElement>(".nt-mapa").getBoundingClientRect();
    return [r.left - m.left + r.width / 2, r.top - m.top + r.height / 2, Math.max(r.width, r.height)];
  }
  function explosao(tipo: "abre" | "virou", uf: string, cor: string) {
    if (!ultimo?.efeitos) return;
    const agora = performance.now();
    disparos = disparos.filter((t) => agora - t < 1000);
    const c = centro(uf);
    if (!c || disparos.length >= 3) return;
    disparos.push(agora);
    const [x, y, tam] = c;
    if (tipo === "abre") fx.push({ t: "anel", x, y, r0: tam * 0.2, r1: tam * 1.1, cor, t0: agora, dur: 900 });
    else {
      fx.push({ t: "anel", x, y, r0: tam * 0.15, r1: tam * 1.6, cor, t0: agora, dur: 1100 });
      for (let j = 0; j < 26; j++) { const a = (j / 26) * Math.PI * 2 + Math.random() * 0.4, v = 60 + Math.random() * 120; fx.push({ t: "faisca", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, cor, t0: agora, dur: 700 + Math.random() * 500 }); }
    }
    if (!raf) raf = requestAnimationFrame(laco);
  }
  function laco(agora: number) {
    const cv = raiz?.querySelector<HTMLCanvasElement>(".nt-fx");
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) { raf = 0; return; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let j = fx.length - 1; j >= 0; j--) {
      const e = fx[j]!, t = (agora - e.t0) / e.dur;
      if (t >= 1) { fx.splice(j, 1); continue; }
      ctx.globalAlpha = 1 - t;
      if (e.t === "anel") { const r = e.r0! + (e.r1! - e.r0!) * (1 - Math.pow(1 - t, 3)); ctx.strokeStyle = e.cor; ctx.lineWidth = 3 * (1 - t) + 0.5; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.stroke(); }
      else { const s = (agora - e.t0) / 1000; ctx.fillStyle = e.cor; ctx.beginPath(); ctx.arc(e.x + e.vx! * s, e.y + e.vy! * s + 160 * s * s, 2.4 * (1 - t) + 0.6, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    raf = fx.length ? requestAnimationFrame(laco) : 0;
  }

  function construirMapa(m: UfMap) {
    const vp = q<HTMLElement>(".nt-mapa"), palco = q<HTMLElement>(".nt-cena");
    caixaBr = caixaBrasil(m.viewBox, afimUfNoMundo(m.proj ?? PROJ_PADRAO));
    ufs.forEach((u) => u.b.remove());
    ufs = new Map();
    Object.entries(m.ufs).forEach(([uf, forma_], k) => {
      const c = caixaDe(forma_.d), pos0 = c && posicoes(uf, c, m.viewBox);
      if (!c || !pos0 || !caixaBr) return;
      const pos = { mapa: naCena(pos0.mapa, caixaBr), carto: naCena(pos0.carto, caixaBr) };
      const [x0, y0, x1, y1] = c;
      const b = elemento("button", `nt-uf zero${forma_.a >= 650 ? " grande" : ""}`);
      b.type = "button"; b.dataset.ntUf = uf;
      b.style.cssText = `--ml:${pos.mapa.l}%;--mt:${pos.mapa.t}%;--mw:${pos.mapa.w}%;--mh:${pos.mapa.h}%;--cl:${pos.carto.l}%;--ct:${pos.carto.t}%;--cw:${pos.carto.w}%;--ch:${pos.carto.h}%;--vtn:uf-${uf};--sibling-index:${k + 1};--m:0`;
      b.setAttribute("aria-pressed", String(uf === sel));
      b.innerHTML = `<svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="none" aria-hidden="true"><path d="${forma_.d}"/></svg><span class="lb" aria-hidden="true">${uf}<small></small></span>`;
      palco.append(b);
      ufs.set(uf, { b, sm: b.querySelector("small")! });
    });
    mapaDe = m;
    vp.classList.toggle("cartograma", forma === "carto");
    observador?.disconnect();
    if (typeof ResizeObserver !== "undefined") { observador = new ResizeObserver(ajustar); observador.observe(vp); }
    enquadrado = "";
    ajustar();
  }

  function trocarForma(nova: "mapa" | "carto") {
    if (nova === forma) return;
    const aplica = () => {
      forma = nova;
      if (zoom && caixaBr) { zoom.irPara(caixaBr, false); enquadrado = "brasil"; } // the tiles live in Brazil's box: show it whole
      q<HTMLElement>(".nt-mapa").classList.toggle("cartograma", nova === "carto");
      raiz!.querySelectorAll<HTMLElement>("[data-nt-forma]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ntForma === nova)));
      depoisDoPrimeiroQuadro(ajustar);
    };
    const vt = (document as Document & { startViewTransition?: (fn: () => void) => unknown }).startViewTransition;
    if (typeof vt !== "function" || !ultimo?.efeitos || movimentoReduzido() || q<HTMLElement>(".nt-mapa").classList.contains("ampliado")) aplica(); // the snapshots of a zoomed map would leave the viewport
    else vt.call(document, aplica);
  }

  // Brazil or abroad: the choice only exists for the President (the vote abroad is only in that race). It is one map: this only changes
  // what the zoom frames and what is lit; the reader's own zoom and pan are left alone until the choice changes.
  function aplicarLugar(p: NoiteProps) {
    const ext = p.cargo === "Presidente" && lugar === "exterior";
    q<HTMLElement>(".nt-lugar").hidden = p.cargo !== "Presidente";
    raiz!.querySelectorAll<HTMLElement>("[data-nt-lugar]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ntLugar === (ext ? "exterior" : "brasil"))));
    raiz!.classList.toggle("exterior", ext);
    q<HTMLElement>(".nt-mapa").classList.toggle("exterior", ext);
    for (const [s, v] of [[".nt-forma", !ext], [".nt-foco", !ext], [".nt-ext", ext]] as const) q<HTMLElement>(s).hidden = !v;
    ufs.forEach(({ b }) => { b.inert = ext; }); // faded states are out of the Tab order and the reader's tree too
    const alvo = ext ? "mundo" : "brasil";
    if (zoom && enquadrado !== alvo && (ext || caixaBr)) { zoom.irPara(ext ? MUNDO_RETANGULO : caixaBr!, enquadrado !== ""); enquadrado = alvo; }
    const msg = q<HTMLElement>(".nt-msg"), leg = q<HTMLElement>(".nt-leg");
    const vb = p.mundo?.viewBox, arq = p.exterior?.mun, pts = pontosMundo(arq && !p.simulado && ext ? arq : null);
    if (vb && p.mundo) {
      const corA = arq ? corDoPartido(p.cor, arq.a.partido) : "", corB = arq ? corDoPartido(p.cor, arq.b.partido) : "";
      const html = `<svg viewBox="${vb.join(" ")}" role="img" aria-label="Mapa-múndi: contornos dos países e, no Exterior, os votos do 1º turno por cidade"><path class="terra" d="${p.mundo.d}"/><g class="bolhas">${arq && ext ? bolhasMundo(pts.pontos, vb, corA, corB) : ""}</g></svg>`;
      const alvoHtml = q<HTMLElement>(".nt-mundo");
      if (alvoHtml.dataset.h !== html) { alvoHtml.innerHTML = html; alvoHtml.dataset.h = html; }
    }
    if (!ext) {
      msg.hidden = !!p.mapa;
      if (!p.mapa) msg.textContent = p.mapa === null ? "Não foi possível carregar a malha dos estados." : "Carregando o mapa…";
      leg.textContent = LEGENDA_BRASIL;
      return;
    }
    msg.hidden = !!p.mundo;
    if (!msg.hidden) msg.textContent = p.mundo === null ? "Não foi possível carregar o mapa-múndi." : "Carregando o mapa-múndi…";
    leg.textContent = p.simulado ? "Na simulação o mapa-múndi fica sem as cidades: elas trazem as candidaturas reais."
      : `Cada círculo é uma cidade com seções eleitorais no exterior, com área proporcional aos votos válidos do 1º turno (resultado final) e a cor do finalista mais votado ali. Os estados ficam esmaecidos.${pts.semPosicao ? ` ${int(pts.semPosicao)} cidades sem posição conhecida ficam só na tabela.` : ""}`;
    q<HTMLElement>(".nt-ext").innerHTML = p.exterior ? renderExterior({ ...p.exterior, cor: (k) => corDoPartido(p.cor, k), turno: 1, compacto: true }) : "";
  }

  function duelo(p: NoiteProps, topo: Topo, linhas: LinhaUf[]) {
    const el = q<HTMLElement>(".nt-duelo");
    if (p.cargo === "Presidente") {
      const d = topo.duelo;
      if (!d) { el.innerHTML = `<p class="muted nt-duelo-vazio">Aguardando os primeiros arquivos dos estados.</p>`; return; }
      if (!el.querySelector(".nt-barra-duelo")) {
        el.innerHTML = `<div class="nt-lado-c a"><span class="nt-rosto"></span><span class="nt-id"><b class="nt-nm"></b><small class="nt-sg"></small></span><span class="nt-big pct"><span class="pt"></span></span><span class="vt"><span class="odo" aria-hidden="true"></span><span class="sr"></span></span></div>
          <div class="nt-cabo"><div class="nt-barra-duelo" role="img"><span class="sa"></span><span class="sb"></span><span class="meta"></span><span class="junta"></span></div><p class="nt-lidera"></p></div>
          <div class="nt-lado-c b"><span class="nt-rosto"></span><span class="nt-id"><b class="nt-nm"></b><small class="nt-sg"></small></span><span class="nt-big pct"><span class="pt"></span></span><span class="vt"><span class="odo" aria-hidden="true"></span><span class="sr"></span></span></div>`;
      }
      const lados = [...el.querySelectorAll<HTMLElement>(".nt-lado-c")];
      [[lados[0]!, d.a], [lados[1]!, d.b]].forEach(([l, c]) => {
        const x = c as Duelo["a"], e = l as HTMLElement;
        e.style.setProperty("--c", corDoPartido(p.cor, x.partido));
        e.querySelector(".nt-nm")!.textContent = titleName(x.nome);
        e.querySelector(".nt-sg")!.textContent = `${x.partido} · ${x.num}`;
        const own = p.byId.get(x.id);
        const rosto = e.querySelector<HTMLElement>(".nt-rosto")!;
        const html = own ? p.avatar(own, "lg") : `<span class="av lg ini" aria-hidden="true">${h(iniciais(x.nome))}</span>`;
        if (rosto.dataset.h !== html) { rosto.innerHTML = html; rosto.dataset.h = html; }
        const pc = e.querySelector<HTMLElement>(".pct")!;
        pc.style.setProperty("--v", decimos(x.pct));
        pc.querySelector(".pt")!.textContent = pct1(x.pct);
        odometro(e.querySelector<HTMLElement>(".odo")!, x.votos);
        e.querySelector<HTMLElement>(".vt .sr")!.textContent = `${int(x.votos)} votos`;
      });
      const barra = el.querySelector<HTMLElement>(".nt-barra-duelo")!;
      el.style.setProperty("--ca", corDoPartido(p.cor, d.a.partido));
      el.style.setProperty("--cb", corDoPartido(p.cor, d.b.partido));
      barra.style.setProperty("--pa", d.parcelaA.toFixed(4));
      barra.setAttribute("aria-label", `Entre os dois mais votados: ${titleName(d.a.nome)} ${pct1(d.parcelaA)}, ${titleName(d.b.nome)} ${pct1(1 - d.parcelaA)}`);
      const dif = Math.abs(d.a.pct - d.b.pct) * 100;
      el.querySelector<HTMLElement>(".nt-lidera")!.textContent = `${titleName(d.a.nome)} à frente por ${dif.toFixed(1).replace(".", ",")} p.p. com ${Math.floor(topo.avanco * 100)}% das seções. A barra mostra a parcela de cada um entre os dois.`;
    } else {
      el.innerHTML = `<p class="muted small nt-placar-t">À frente em cada estado, por partido:</p><ul class="nt-placar">${contagemLideres(linhas.map(resumoUf)).slice(0, 8).map((x) => `<li style="--c:${h(corDoPartido(p.cor, x.partido))}"><i></i><b>${h(x.partido)}</b> <span>${int(x.n)} ${x.n === 1 ? "estado" : "estados"}</span></li>`).join("")}</ul>`;
    }
  }

  function foco(p: NoiteProps) {
    const el = q<HTMLElement>(".nt-foco");
    const l = ultimasLinhas.find((x) => x.uf === sel) as LinhaCom | undefined;
    if (!l || !l.dados) {
      el.innerHTML = `<h3>Estado em foco</h3><p class="nt-foco-uf">${h(sel)}</p><p class="muted small">${h(nomeUf(sel))}: ainda sem arquivo do TSE.</p>`;
      return;
    }
    const linhas = l.top.slice(0, 3).map((c) => {
      const own = p.byId.get(c.id);
      const av = own ? p.avatar(own, "xs") : `<span class="av xs ini" aria-hidden="true">${h(iniciais(c.nome))}</span>`;
      return `<li style="--c:${h(corDoPartido(p.cor, c.partido))}">${av}<span class="nm"><b>${h(titleName(c.nome))}</b><small>${h(c.partido)}</small></span><b class="rv">${pct1(c.pct)}</b></li>`;
    });
    el.innerHTML = `<h3>Estado em foco</h3><p class="nt-foco-uf">${h(sel)} <small>${h(nomeUf(sel))}</small></p>
      <p class="muted small">${int(l.secoes.totalizadas)} de ${int(l.secoes.total)} seções (${pct1(l.avanco ?? 0)})${l.defasada ? " · desatualizado: o TSE não respondeu na última consulta" : ""}</p>
      <ol class="nt-foco-lista">${linhas.join("")}</ol>
      ${p.semAbrir ? "" : `<button type="button" class="ghost" data-abrir-uf="${h(sel)}">Abrir ${h(sel)} na apuração</button>`}`;
  }

  function manchete(e: EventoNoite, cor: string) {
    const lista = q<HTMLElement>(".nt-manchetes");
    lista.querySelector(".nt-vazia")?.remove();
    const li = elemento("li", `nt-lt ${e.tipo}`);
    li.style.setProperty("--c", cor || "var(--confirma)");
    const t = elemento("time"); t.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const s = elemento("span"); s.textContent = e.texto;
    li.append(t, s);
    lista.prepend(li);
    // Three lines at most; an older one leaves with a short exit, and every line leaves on its own after a while
    while (lista.children.length > 3) { const ult = lista.lastElementChild as HTMLElement; ult.classList.add("sai"); depois(() => ult.remove(), 450); if (lista.children.length > 5) ult.remove(); else break; }
    depois(() => { if (li.isConnected && lista.children.length > 3) { li.classList.add("sai"); depois(() => li.remove(), 450); } }, 12000);
  }

  return {
    get raiz() { return raiz; },
    montar(alvo) {
      if (host === alvo && raiz && alvo.contains(raiz)) return;
      const guardada = { sel, forma, lugar };
      this.parar();
      sel = guardada.sel; forma = guardada.forma; lugar = guardada.lugar;
      host = alvo;
      raiz = elemento("div", "fx nt", ESQUELETO);
      alvo.replaceChildren(raiz);
      raiz.addEventListener("click", (e) => {
        const t = e.target as Element;
        const lg = t.closest<HTMLElement>("[data-nt-lugar]");
        if (lg) { lugar = lg.dataset.ntLugar === "exterior" ? "exterior" : "brasil"; if (ultimo) { aplicarLugar(ultimo); depoisDoPrimeiroQuadro(ajustar); ultimo.onLugar?.(lugar); } return; }
        const f = t.closest<HTMLElement>("[data-nt-forma]");
        if (f) { trocarForma(f.dataset.ntForma === "carto" ? "carto" : "mapa"); return; }
        const u = t.closest<HTMLElement>("[data-nt-uf]");
        if (u) {
          ufs.get(sel)?.b.setAttribute("aria-pressed", "false");
          sel = u.dataset.ntUf!;
          u.setAttribute("aria-pressed", "true");
          if (ultimo) { foco(ultimo); ultimo.onUf?.(sel); }
        }
      });
      zoom = criarZoom({ vp: q<HTMLElement>(".nt-mapa"), cena: q<HTMLElement>(".nt-cena"), reduzido: () => movimentoReduzido() || !ultimo?.efeitos });
      depoisDoPrimeiroQuadro(() => raiz?.classList.add("pronto"));
    },
    // The host was thrown away by a redraw of the page around the view (the Ao vivo tab redraws as a string): move the view into the new one,
    // keeping its state (focus state, the facts of the night, the map already built).
    adotar(alvo) {
      if (!raiz || host === alvo) return;
      host = alvo;
      alvo.replaceChildren(raiz);
    },
    atualizar(p) {
      if (!raiz) return;
      ultimo = p;
      raiz.classList.toggle("sem-fx", !p.efeitos);
      raiz.classList.toggle("simulado", !!p.simulado);
      if (p.mapa && mapaDe !== p.mapa) construirMapa(p.mapa);
      const linhas = linhasUf(p.nac?.ufs ?? {}, p.cargo);
      ultimasLinhas = linhas;
      const resumos = new Map(linhas.map((l) => [l.uf, resumoUf(l)]));
      const topo = topoNacional(linhas);
      const cores = p.cor;

      let com = 0, velhos = 0;
      for (const l of linhas) {
        const e = ufs.get(l.uf), r = resumos.get(l.uf)!;
        if (r.id) com++;
        if (r.velho) velhos++;
        if (!e) continue;
        const novo = !!r.id;
        e.b.classList.toggle("zero", !novo);
        e.b.classList.toggle("velho", r.velho);
        e.b.style.setProperty("--c", novo ? corDoPartido(cores, r.partido) : "transparent");
        e.b.style.setProperty("--m", novo ? intensidade(r.margem).toFixed(3) : "0");
        e.sm.textContent = novo ? `${Math.round(r.pct * 100)}%` : "";
        e.b.setAttribute("aria-label", novo ? `${nomeUf(l.uf)}: ${titleName(r.nome)} (${r.partido}) à frente com ${pct1(r.pct)}, ${pct1(r.avanco)} apurado${r.velho ? ", desatualizado" : ""}` : `${nomeUf(l.uf)}: aguardando`);
      }
      q<HTMLElement>(".nt-contagem").textContent = `${int(com)} de ${int(linhas.length)} arquivos com números${velhos ? ` · ${int(velhos)} desatualizado${velhos > 1 ? "s" : ""}` : ""}`;

      duelo(p, topo, linhas);
      const prog = q<HTMLElement>(".nt-prog");
      prog.style.setProperty("--value", (topo.avanco * 100).toFixed(2));
      prog.setAttribute("aria-label", `${pct1(topo.avanco)} das seções totalizadas`);
      q<HTMLElement>(".nt-prog-t").textContent = topo.secoes.total ? `${int(topo.secoes.totalizadas)} de ${int(topo.secoes.total)} seções (${pct1(topo.avanco)}), soma dos ${int(topo.arquivos.com)} arquivos lidos` : "Aguardando os primeiros arquivos.";
      foco(p);
      if (p.lugar && p.lugar !== lugar) { lugar = p.lugar; enquadrado = ""; } // the Ao vivo filter chose Brazil or Exterior: frame it once
      aplicarLugar(p);

      if (!p.salto) {
        for (const e of eventosNoite(antes, resumos, topoAntes, topo)) {
          const partido = e.uf ? resumos.get(e.uf)?.partido : topo.duelo?.a.partido;
          const cor = partido ? corDoPartido(cores, partido) : "";
          if (e.tipo === "abre" && e.uf) explosao("abre", e.uf, cor);
          else if (e.tipo === "virou" && e.uf) { manchete(e, cor); explosao("virou", e.uf, cor); const b = ufs.get(e.uf)?.b; if (b && p.efeitos) reiniciaClasse(b, "pisca", 900, depois); p.som?.vira(); }
          else if (e.tipo === "total") { manchete(e, cor); p.som?.vira(); p.anunciar?.(e.texto); }
          else if (e.tipo === "conclui") manchete(e, cor);
        }
      } else q<HTMLElement>(".nt-manchetes").replaceChildren(elemento("li", "nt-vazia muted small", "Aparecem quando um estado vira, um estado grande termina ou o total do país muda de lado."));
      antes = resumos;
      topoAntes = topo;
    },
    parar() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (raf) cancelAnimationFrame(raf);
      raf = 0; fx.length = 0;
      observador?.disconnect(); observador = null;
      zoom?.destruir(); zoom = null; caixaBr = null; enquadrado = "";
      raiz?.remove();
      raiz = null; host = null; ufs = new Map(); mapaDe = null; antes = null; topoAntes = null; ultimo = null; ultimasLinhas = [];
    },
  };
}
