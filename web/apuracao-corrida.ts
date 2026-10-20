// "Corrida" view of the Apuração tab: the count as a race. The candidates are rows that slide past each other (a spring on `translate`), their
// votes roll like an odometer, the share is counted by CSS alone, and an overtake leaves a streak. It shows the TSE's numbers and the TSE's own
// status text; the Radar names no winner. What it adds is motion, and the facts of the session (overtakes, milestones of the count, marks of
// the TSE) in a short list.
//
// Unlike the other views it is not an HTML string: the tab redraws strings, and a redraw would throw away the rows that have to slide. This
// view builds its DOM once and updates it in place (`atualizar`); the pure parts above the controller are what the tests cover.
import { h, int, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { corDoPartido, decimos, depoisDoPrimeiroQuadro, eixoMax, elemento, iniciais, marcosCruzados, odometro, pct1, reiniciaClasse, ultrapassagens } from "./apuracao-fx.js";
import type { Apuracao, Cargo, Candidato } from "./apuracao-tse.js";
import type { Cores } from "./apuracao-nacional.js";
import type { Ponto } from "./apuracao-graficos.js";
import type { Candidatura } from "./types.js";
import type { FeedStatus } from "./apuracao-feed.js";

export const MAX_LINHAS = 8;

// ---- pure
export interface LinhaCorrida { id: string; nome: string; partido: string; num: string; votos: number; pct: number; situacao: string; destaque: boolean }
export function linhasCorrida(d: Apuracao, max = MAX_LINHAS): LinhaCorrida[] {
  return [...d.candidatos]
    .sort((a, b) => b.votos - a.votos)
    .slice(0, max)
    .map((c) => ({ id: c.id, nome: c.nome, partido: c.partido, num: c.num, votos: c.votos, pct: c.pct, situacao: c.situacao, destaque: c.destaque }));
}

export interface FatoCorrida { tipo: "passou" | "marco" | "tse"; texto: string; id?: string }
const nomeCurto = (c: Pick<Candidato, "nome">) => titleName(c.nome);

// What is new in `depois` against the file before it. Without a file before it there is nothing new: the first one seen only says where the
// count stands.
export function fatosCorrida(antes: Apuracao | null, depois: Apuracao): FatoCorrida[] {
  if (!antes) return [];
  const out: FatoCorrida[] = [];
  const ordem = (d: Apuracao) => linhasCorrida(d, 99).map((l) => l.id);
  const por = new Map(depois.candidatos.map((c) => [c.id, c]));
  const lugar = new Map(ordem(depois).map((id, i) => [id, i + 1]));
  for (const { sobe, desce } of ultrapassagens(ordem(antes), ordem(depois))) {
    const a = por.get(sobe), b = por.get(desce);
    if (a && b) out.push({ tipo: "passou", id: sobe, texto: `${nomeCurto(a)} (${a.partido}) passou ${nomeCurto(b)} (${b.partido}) e agora é ${lugar.get(sobe)}º.` });
  }
  const m = marcosCruzados(avancoDe(antes.secoes), avancoDe(depois.secoes));
  if (m.length) out.push({ tipo: "marco", texto: `${Math.round(m[m.length - 1]! * 100)}% das seções totalizadas.` });
  const antesSit = new Map(antes.candidatos.map((c) => [c.id, c.situacao]));
  for (const c of depois.candidatos) if (c.situacao && c.situacao !== antesSit.get(c.id)) out.push({ tipo: "tse", id: c.id, texto: `${nomeCurto(c)}: o TSE marcou "${c.situacao}".` });
  return out;
}

// ---- the view
export interface CorridaProps {
  dados: Apuracao | null;
  status: FeedStatus;
  cargo: Cargo;
  byId: Map<string, Candidatura>;
  avatar: (c: Candidatura, size: string) => string;
  cor: Cores;
  hist: Ponto[];
  efeitos: boolean;
  salto?: boolean; // the reader moved to another moment (simulation): show it as it is, with no overtakes or lines about "what just happened"
  simulado?: boolean;
  anunciar?: (txt: string) => void;
  som?: { passou(): void };
}
export interface Painel<P> { montar(host: HTMLElement): void; atualizar(p: P): void; parar(): void }

interface Linha { li: HTMLElement; rk: HTMLElement; av: HTMLElement; nm: HTMLElement; sg: HTMLElement; chip: HTMLElement; fill: HTMLElement; odo: HTMLElement; vsr: HTMLElement; pct: HTMLElement; pt: HTMLElement; dlt: HTMLElement; avHtml: string; sit: string; selo: HTMLElement | null }

const ESQUELETO = `<div class="cr-quadro">
    <div class="cr-eixo" aria-hidden="true"><span></span><span></span><div class="cr-escala"></div><span class="r">Votos válidos</span><span class="r">%</span></div>
    <ol class="cr-linhas" aria-label="Candidaturas por votos válidos"></ol>
    <p class="sr cr-resumo"></p>
  </div>
  <p class="empty cr-vazio" hidden></p>
  <aside class="cr-lado" aria-label="Instrumentos da apuração">
    <section class="cr-cartao"><h3>Seções totalizadas</h3>
      <div class="cr-relogio"><div class="cr-anel" role="img"><div class="orbita"></div><div class="arco"></div><div><b class="cr-anel-n">0%</b></div></div>
      <div><p class="cr-arq"><span class="ponto"></span><span class="cr-arq-t"></span></p><p class="cr-sec muted small"></p></div></div></section>
    <section class="cr-cartao"><h3>Parcela de cada um desde que você abriu a aba</h3>
      <div class="cr-grafico"><svg viewBox="0 0 300 120" class="cr-grade" aria-hidden="true"></svg><svg viewBox="0 0 300 120" class="cr-curvas" role="img" aria-label="Parcela dos votos válidos de cada candidatura, por avanço da apuração"></svg><svg viewBox="0 0 300 120" class="cr-pontas" aria-hidden="true"></svg></div>
      <p class="muted small cr-grafico-nota"></p></section>
    <section class="cr-cartao"><h3>Fatos desta sessão</h3><ol class="cr-fatos" aria-label="Fatos da apuração desde que você abriu a aba"></ol><p class="muted small cr-fatos-vazio">Ultrapassagens, marcos da apuração e marcações do TSE aparecem aqui conforme chegam arquivos novos.</p></section>
  </aside>`;

const GW = 300, GH = 120, PX = 6, PY = 10;

export function criarCorrida(): Painel<CorridaProps> & { raiz: HTMLElement | null } {
  let raiz: HTMLElement | null = null;
  let host: HTMLElement | null = null;
  let prev: Apuracao | null = null;
  let eixo = 0;
  const linhas = new Map<string, Linha>();
  const curvas = new Map<string, SVGGElement>();
  const pontas = new Map<string, SVGCircleElement>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const depois = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const q = <T extends Element>(s: string) => raiz!.querySelector<T>(s)!;

  function criarLinha(id: string): Linha {
    const li = elemento("li", "cr-linha");
    li.innerHTML = `<span class="rk" aria-hidden="true"></span><span class="cr-av"></span>
      <span class="nm"><b><i></i><span class="n"></span></b><small></small><span class="chip"></span></span>
      <span class="track" aria-hidden="true"><span class="fill"></span><span class="tick50"></span></span>
      <span class="vt"><span class="odo" aria-hidden="true"></span><span class="sr"></span></span>
      <span class="pc"><span class="pct"><span class="pt"></span></span><span class="dlt"></span></span>`;
    const g = <T extends HTMLElement>(s: string) => li.querySelector<T>(s)!;
    li.dataset.id = id;
    q<HTMLElement>(".cr-linhas").append(li);
    return { li, rk: g(".rk"), av: g(".cr-av"), nm: g(".n"), sg: g(".nm small"), chip: g(".chip"), fill: g(".fill"), odo: g(".odo"), vsr: g(".vt .sr"), pct: g(".pct"), pt: g(".pt"), dlt: g(".dlt"), avHtml: "", sit: "", selo: null };
  }

  function curva(id: string, cor: string): SVGGElement {
    let g = curvas.get(id);
    if (!g) {
      g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      pl.setAttribute("class", "l");
      g.append(pl);
      q<SVGElement>(".cr-curvas").append(g);
      curvas.set(id, g);
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("class", "fim"); c.setAttribute("r", "4");
      q<SVGElement>(".cr-pontas").append(c);
      pontas.set(id, c);
    }
    g.style.setProperty("--c", cor);
    pontas.get(id)!.style.setProperty("--c", cor);
    return g;
  }

  function atualizarGrafico(p: CorridaProps, ids: string[], max: number, cores: Map<string, string>) {
    const gx = (a: number) => PX + a * (GW - 2 * PX), gy = (v: number) => GH - PY - (v / max) * (GH - 2 * PY);
    const grade = q<SVGElement>(".cr-grade");
    const marcas = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].filter((v) => v <= max + 1e-9);
    grade.innerHTML = marcas.map((v) => `<line x1="${PX}" x2="${GW - PX}" y1="${gy(v).toFixed(1)}" y2="${gy(v).toFixed(1)}"/><text x="${GW - PX}" y="${(gy(v) - 3).toFixed(1)}" text-anchor="end">${Math.round(v * 100)}%</text>`).join("");
    const pts = p.hist.filter((x) => x.avanco > 0);
    const nota = q<HTMLElement>(".cr-grafico-nota");
    q<HTMLElement>(".cr-grafico").hidden = pts.length < 2; // an empty axis says nothing: until two files are read, only the note
    nota.textContent = pts.length >= 2 ? "Eixo horizontal: avanço da apuração. A linha só existe a partir do momento em que você abriu a aba." : "A linha aparece quando a aba tiver lido dois arquivos do TSE.";
    for (const id of ids) {
      const g = curva(id, cores.get(id)!);
      const serie = pts.filter((x) => x.pcts[id] !== undefined);
      g.firstElementChild!.setAttribute("points", serie.length >= 2 ? serie.map((x) => `${gx(x.avanco).toFixed(1)},${gy(x.pcts[id]!).toFixed(1)}`).join(" ") : "");
      const ult = serie[serie.length - 1];
      const c = pontas.get(id)!;
      c.style.opacity = ult && serie.length >= 2 ? "1" : "0";
      if (ult) c.style.translate = `${gx(ult.avanco).toFixed(1)}px ${gy(ult.pcts[id]!).toFixed(1)}px`;
    }
    for (const [id, g] of curvas) if (!ids.includes(id)) { g.remove(); curvas.delete(id); pontas.get(id)?.remove(); pontas.delete(id); }
    const ultimo = pts[pts.length - 1];
    q<HTMLElement>(".cr-curvas").style.setProperty("--t", String(((ultimo?.avanco ?? 0) * 100).toFixed(2)));
  }

  function fato(f: FatoCorrida, cores: Map<string, string>) {
    const lista = q<HTMLElement>(".cr-fatos");
    const li = elemento("li", `cr-fato ${f.tipo}`);
    const cor = f.id ? cores.get(f.id) : undefined;
    if (cor) li.style.setProperty("--c", cor);
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const t = elemento("time"); t.textContent = hora;
    const s = elemento("span"); s.textContent = f.texto;
    li.append(t, s);
    lista.prepend(li);
    while (lista.children.length > 30) lista.lastElementChild!.remove();
    q<HTMLElement>(".cr-fatos-vazio").hidden = lista.children.length > 0;
  }

  return {
    get raiz() { return raiz; },
    montar(alvo) {
      if (host === alvo && raiz && alvo.contains(raiz)) return;
      this.parar();
      host = alvo;
      raiz = elemento("div", "fx cr", ESQUELETO);
      alvo.replaceChildren(raiz);
      depoisDoPrimeiroQuadro(() => raiz?.classList.add("pronto")); // transitions only after the first paint: the view does not fly in from zero
    },
    atualizar(p) {
      if (!raiz) return;
      raiz.classList.toggle("sem-fx", !p.efeitos);
      raiz.classList.toggle("simulado", !!p.simulado);
      const d = p.dados;
      const quadro = q<HTMLElement>(".cr-quadro"), vazio = q<HTMLElement>(".cr-vazio");
      const contou = !!d && d.fase !== "aguardando" && (d.candidatos[0]?.votos ?? 0) > 0;
      if (!d || !contou) {
        quadro.hidden = true; vazio.hidden = false;
        vazio.textContent = p.status === "erro" ? "Não foi possível consultar o TSE agora. A página continua tentando." : p.status === "ausente" ? "O TSE ainda não publicou o arquivo de resultados desta disputa. A página continua consultando." : d ? "A apuração ainda não começou: assim que o TSE totalizar as primeiras seções, a corrida aparece aqui." : "Consultando o TSE…";
        prev = d;
        return;
      }
      quadro.hidden = false; vazio.hidden = true;
      const ls = linhasCorrida(d);
      const ids = ls.map((l) => l.id);
      const cores = new Map(ls.map((l) => [l.id, corDoPartido(p.cor, l.partido)]));
      const max = eixoMax(ls[0]!.pct);
      const lista = q<HTMLElement>(".cr-linhas");
      lista.style.setProperty("--n", String(ls.length));
      lista.style.setProperty("--eixo", String(max));
      if (max !== eixo) {
        eixo = max;
        const marcas = Array.from({ length: Math.round(max * 10) + 1 }, (_, i) => i * 10);
        q<HTMLElement>(".cr-escala").innerHTML = marcas.map((m) => `<span${m === 50 ? ' class="meio"' : ""}>${m}${m === 50 ? "%" : ""}</span>`).join("");
      }
      const antes = prev ? linhasCorrida(prev, 99) : [];
      const pctAntes = new Map(antes.map((l) => [l.id, l.pct]));
      ls.forEach((l, pos) => {
        let r = linhas.get(l.id);
        if (!r) { r = criarLinha(l.id); linhas.set(l.id, r); }
        r.li.style.setProperty("--c", cores.get(l.id)!);
        r.li.style.setProperty("--i", String(pos));
        r.li.dataset.pos = String(pos);
        r.li.classList.remove("some");
        r.li.style.setProperty("--w", Math.min(1.02, l.pct / max).toFixed(4));
        r.rk.textContent = `${pos + 1}º`;
        r.nm.textContent = titleName(l.nome);
        r.sg.textContent = `${l.partido} · ${l.num}`;
        const own = p.byId.get(l.id);
        const av = own ? p.avatar(own, "sm") : `<span class="av sm ini" aria-hidden="true">${h(iniciais(l.nome))}</span>`;
        if (av !== r.avHtml) { r.av.innerHTML = av; r.avHtml = av; }
        odometro(r.odo, l.votos);
        r.vsr.textContent = `${int(l.votos)} votos`;
        r.pct.style.setProperty("--v", decimos(l.pct));
        r.pt.textContent = pct1(l.pct);
        const dif = pctAntes.has(l.id) ? (l.pct - pctAntes.get(l.id)!) * 100 : 0;
        r.dlt.textContent = Math.abs(dif) < 0.005 ? "▬ 0,0 p.p." : `${dif > 0 ? "▲" : "▼"} ${Math.abs(dif).toFixed(1).replace(".", ",")} p.p.`;
        // The TSE's own text, always: a chip for as long as it stands, and a stamp the moment it appears
        r.chip.textContent = l.situacao;
        r.chip.className = `chip${l.situacao ? ` rot ${l.destaque ? "alta" : "baixa"}` : ""}`;
        if (l.situacao && l.situacao !== r.sit && !!prev && !p.salto) {
          r.selo?.remove();
          r.selo = elemento("span", "selo"); r.selo.textContent = l.situacao;
          r.li.append(r.selo);
          const s = r.selo;
          depois(() => { s.remove(); }, 6000);
        }
        r.sit = l.situacao;
        r.li.setAttribute("aria-label", `${pos + 1}º lugar: ${titleName(l.nome)}, ${pct1(l.pct)}, ${int(l.votos)} votos${l.situacao ? `, situação no TSE: ${l.situacao}` : ""}`);
      });
      for (const [id, r] of linhas) if (!ids.includes(id)) { linhas.delete(id); r.li.classList.add("some"); depois(() => r.li.remove(), 450); }
      q<HTMLElement>(".cr-resumo").textContent = ls.map((l, i) => `${i + 1}º ${titleName(l.nome)} ${pct1(l.pct)}`).join(". ");

      const av = avancoDe(d.secoes);
      q<HTMLElement>(".cr-anel").style.setProperty("--value", (av * 100).toFixed(2));
      q<HTMLElement>(".cr-anel").setAttribute("aria-label", `${pct1(av)} das seções totalizadas`);
      q<HTMLElement>(".cr-anel-n").textContent = pct1(av);
      q<HTMLElement>(".cr-sec").textContent = `${int(d.secoes.totalizadas)} de ${int(d.secoes.total)} seções`;
      q<HTMLElement>(".cr-arq-t").textContent = d.versao.data || d.versao.hora ? `Arquivo do TSE de ${d.versao.data} ${d.versao.hora}`.trim() : "Arquivo do TSE";
      atualizarGrafico(p, ids, max, cores);

      if (p.salto) {
        q<HTMLElement>(".cr-fatos").replaceChildren();
        q<HTMLElement>(".cr-fatos-vazio").hidden = false;
      } else {
        for (const f of fatosCorrida(prev, d)) {
          fato(f, cores);
          if (f.tipo === "passou" && f.id) {
            const par = ultrapassagens(antes.map((l) => l.id), ids).find((u) => u.sobe === f.id);
            const sobe = linhas.get(f.id)?.li, desce = par ? linhas.get(par.desce)?.li : undefined;
            if (sobe && p.efeitos) { reiniciaClasse(sobe, "up", 1400, depois); if (desce) reiniciaClasse(desce, "down", 900, depois); }
            p.som?.passou();
            p.anunciar?.(f.texto);
          } else if (f.tipo === "tse") p.anunciar?.(f.texto);
        }
      }
      prev = d;
    },
    parar() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      linhas.clear(); curvas.clear(); pontas.clear();
      raiz?.remove();
      raiz = null; host = null; prev = null; eixo = 0;
    },
  };
}
