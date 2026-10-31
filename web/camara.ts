// "Câmara" tab: how the benches voted in the latest nominal roll calls of the Plenário, the agenda of the next days, the history of the bills
// voted and the affinity between parties. The data comes from web/data/camara/ (bun run radar:camara); this module loads and draws it.
// painel.json (all sections) and partidos.json (logos) load with the tab; fotos.json only when photos are on ("Mostrar fotos").
// The hemicycle is one persistent <svg>: the tab repaints through innerHTML, and a repaint would throw away the circles that animate.
import { keepFocus } from "./focus.js";
import { afinidade, assentos, lugares, norm, porUf, preparar } from "./camara-dados.js";
import type { Afinidade, Assento, Linha, Preparada } from "./camara-dados.js";
import { afinidadeView, aguardando, barrasOrientacao, barrasPartido, casaEvento, centroHemi, corVoto, deputadoView, dicaDeputado, divergentes, estadoInicial, legendaHemi, listaEventos, mapaBlocos, moldura, pautaView, registroProp, coresOrgao, resultadosBusca, buscarDeputados, SEG_COR, semDados, tramitacaoView, votacaoView } from "./camara-view.js";
import type { Ctx, Estado, Ficha, Sec } from "./camara-view.js";
import type { FotosCamara, PainelCamara, PartidosCamara } from "../src/radar/camara/painel-tipos.js";

export const DADOS = "data/camara";
type Ler = <T>(caminho: string) => Promise<T>;
const lerJson: Ler = async <T>(caminho: string) => {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`${r.status} ${caminho}`);
  return (await r.json()) as T;
};
const SECOES = new Set<string>(["votacao", "deputado", "pauta", "tramitacao", "afinidade"]);
const SELETOR = "[data-cm-sec],[data-cm-vi],[data-cm-agrupar],[data-cm-cor],[data-cm-foco],[data-cm-escala],[data-cm-dep],[data-cm-tipo],[data-cm-pauta],[data-cm-urg],[data-cm-evento],[data-cm-ti],[data-cm-ord],[data-cm-par]";

export interface Opcoes { mostrarFotos?: () => boolean }

export function mountCamara(root: HTMLElement, ler: Ler = lerJson, opcoes: Opcoes = {}) {
  const st: Estado = estadoInicial();
  let dados: PainelCamara | null = null, preps: Preparada[] = [], fichas: Ficha[] = [], falhou = false, aberto = false;
  let fotos: FotosCamara = {}, partidos: PartidosCamara = {};
  let afin: Afinidade | null = null;
  const pedidos = new Map<string, Promise<void>>(); // one request per file; a failure is forgotten, so the next open asks again
  const fotosLigadas = () => opcoes.mostrarFotos?.() ?? true;
  const ctx = (): Ctx => ({ fotos, partidos, mostrarFotos: fotosLigadas() });

  const pedir = (chave: string, quando: () => Promise<void>) => {
    if (pedidos.has(chave)) return;
    pedidos.set(chave, quando().then(() => { if (aberto) desenhar(); }).catch(() => { pedidos.delete(chave); }));
  };
  const garantir = () => {
    pedir("partidos", async () => { partidos = await ler<PartidosCamara>(`${DADOS}/partidos.json`); });
    if (fotosLigadas()) pedir("fotos", async () => { fotos = await ler<FotosCamara>(`${DADOS}/fotos.json`); });
  };

  function aposCarregar(d: PainelCamara) {
    dados = d; falhou = false;
    preps = d.votacoes.map((v) => preparar(d, v));
    const vistos = new Map<number, Ficha>(); // the party of the most recent roll call each deputy appears in
    for (const p of preps) for (const l of p.linhas) if (!vistos.has(l.dep)) vistos.set(l.dep, { dep: l.dep, id: l.id, nome: l.nome, uf: l.uf, partido: l.partido });
    fichas = [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    afin = null;
  }
  const prepAtual = () => preps[Math.min(st.vi, preps.length - 1)]!;

  const corpo = (): string => {
    if (!dados) return falhou ? semDados() : aguardando();
    if (!preps.length && st.sec !== "pauta") return `<p class="empty" role="status">Nenhuma votação nominal coletada.</p>`;
    const c = ctx();
    switch (st.sec) {
      case "deputado": return deputadoView(buscarDeputados(fichas, st.dq), st, fichas, preps, c);
      case "pauta": return pautaView(dados.pauta, st, c);
      case "tramitacao": return tramitacaoView(dados.proposicoes, st, dados.geradoEm);
      case "afinidade": return afinidadeView((afin ??= afinidade(preps)), st, c);
      default: return votacaoView(prepAtual(), preps, st, c, porUf(prepAtual().linhas, st.foco));
    }
  };

  function desenhar() {
    keepFocus(root, () => { root.innerHTML = moldura(st.sec, corpo(), dados); });
    colocarHemi();
  }

  // ---- hemicycle: one <svg> kept across repaints ----
  const NS = "http://www.w3.org/2000/svg";
  let svg: SVGSVGElement | null = null, svgVi = -1, svgLinhas: Linha[] = [], svgAssentos: Assento[] = [], svgPos: Assento[] = [];
  function colocarHemi() {
    const alvo = st.sec === "votacao" && dados && preps.length ? root.querySelector<HTMLElement>("[data-cm-hemi]") : null;
    if (!alvo) return;
    const pr = prepAtual();
    if (!svg) {
      svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 1000 520"); svg.setAttribute("role", "img"); svg.classList.add("cm-hemi");
      svg.addEventListener("click", (e) => { const c = (e.target as Element).closest<SVGElement>("circle.d"); if (c) mudarFoco(svgLinhas[Number(c.dataset.k)]!.partido); });
      svg.addEventListener("pointermove", (e) => { const c = (e.target as Element).closest<SVGElement>("circle.d"); if (!c) { anel(null); dica.esconder(); return; } const i = Number(c.dataset.k); anel(i); dica.mostrar(e, dicaDeputado(svgLinhas[i]!, ctx())); });
      svg.addEventListener("pointerleave", () => { anel(null); dica.esconder(); });
    }
    alvo.replaceWith(svg);
    if (svgVi !== st.vi) { // another roll call: new circles, which sweep in
      svgVi = st.vi; svgLinhas = pr.linhas;
      const a = assentos(pr.linhas.length); svgAssentos = a.pts;
      svg.innerHTML = pr.linhas.map((_, i) => `<circle class="d" data-k="${i}" r="${a.raio.toFixed(1)}" style="--dl:${((i / pr.linhas.length) * 0.7).toFixed(2)}s"></circle>`).join("") + `<circle class="anel" r="${(a.raio + 4).toFixed(1)}"></circle>`;
      svgPos = [];
    } else void svg.getBoundingClientRect(); // re-attached: settle the old style first, so the move below animates
    svgPos = lugares(pr.linhas, st.agrupar, svgAssentos);
    const cs = svg.querySelectorAll<SVGElement>("circle.d");
    cs.forEach((c, i) => {
      const l = pr.linhas[i]!, p = svgPos[i]!;
      c.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
      c.style.fill = st.cor === "voto" ? corVoto(l.voto) : SEG_COR[l.seg];
      c.classList.toggle("on", !!st.foco && l.partido === st.foco);
    });
    svg.classList.toggle("foco", !!st.foco);
    svg.setAttribute("aria-label", `Hemiciclo com ${pr.linhas.length} votos: ${pr.contagem.sim} Sim, ${pr.contagem.nao} Não, ${pr.contagem.abs + pr.contagem.outros} abstenção ou outros`);
  }
  function anel(i: number | null) {
    const r = svg?.querySelector<SVGElement>("circle.anel"); if (!r) return;
    if (i === null) { r.style.opacity = "0"; return; }
    const p = svgPos[i]!; r.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`; r.style.opacity = "1";
  }

  // ---- tooltip: one element on <body>, so a repaint of the tab never removes it ----
  const dica = (() => {
    let el: HTMLElement | null = null;
    return {
      mostrar(e: PointerEvent, html: string, texto = false) {
        el ??= Object.assign(document.createElement("div"), { className: "cm-tip", role: "tooltip" });
        if (!el.isConnected) document.body.append(el);
        if (texto) el.textContent = html; else el.innerHTML = html;
        el.classList.add("on");
        const w = el.offsetWidth, hh = el.offsetHeight;
        let x = e.clientX + 14, y = e.clientY + 16;
        if (x + w > innerWidth - 8) x = e.clientX - w - 14;
        if (y + hh > innerHeight - 8) y = e.clientY - hh - 14;
        el.style.transform = `translate(${Math.max(8, x)}px,${Math.max(8, y)}px)`;
      },
      esconder() { el?.classList.remove("on"); },
    };
  })();
  root.addEventListener("pointermove", (e) => {
    const t = (e.target as Element | null)?.closest?.<HTMLElement>("[data-tt]");
    if (t && root.contains(t)) dica.mostrar(e as PointerEvent, t.dataset.tt ?? "", true); else if (!(e.target as Element | null)?.closest?.("svg.cm-hemi")) dica.esconder();
  });
  root.addEventListener("pointerleave", () => dica.esconder());

  // ---- actions ----
  function mudarFoco(p: string) {
    st.foco = st.foco === p ? null : p;
    if (!root.querySelector("[data-cm-hemi],.cm-hemi")) { desenhar(); return; }
    desenhar();
  }
  const secao = (s: string) => { if (SECOES.has(s)) { st.sec = s as Sec; desenhar(); } };

  root.addEventListener("click", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>(SELETOR);
    if (!alvo) return;
    const d = alvo.dataset;
    if (d.cmSec) return secao(d.cmSec);
    if (d.cmVi) { st.vi = Number(d.cmVi); st.foco = null; return desenhar(); }
    if (d.cmAgrupar) { st.agrupar = d.cmAgrupar as Estado["agrupar"]; return desenhar(); }
    if (d.cmCor) { st.cor = d.cmCor as Estado["cor"]; return desenhar(); }
    if (d.cmEscala) { st.escala = d.cmEscala as Estado["escala"]; return desenhar(); }
    if (d.cmFoco) return mudarFoco(d.cmFoco);
    if (d.cmDep) { st.dep = Number(d.cmDep); st.sec = "deputado"; st.dq = fichas.find((f) => f.dep === st.dep)?.nome ?? st.dq; return desenhar(); }
    if (d.cmTipo) { st.tipos = st.tipos.includes(d.cmTipo) ? st.tipos.filter((t) => t !== d.cmTipo) : [...st.tipos, d.cmTipo]; return desenhar(); }
    if (d.cmPauta) { st.soPauta = !st.soPauta; return desenhar(); }
    if (d.cmUrg) { st.soUrg = !st.soUrg; return desenhar(); }
    if (d.cmEvento) {
      const id = Number(d.cmEvento); st.busca = ""; st.soPauta = false; st.soUrg = false; st.tipos = []; desenhar();
      const det = root.querySelector<HTMLDetailsElement>(`#cm-ev-${id}`);
      if (det) { det.open = true; det.scrollIntoView({ block: "center" }); }
      return;
    }
    if (d.cmTi) { st.ti = Number(d.cmTi); st.tt = ""; st.to = ""; return desenhar(); }
    if (d.cmOrd) { st.ord = d.cmOrd as Estado["ord"]; return desenhar(); }
    if (d.cmPar && afin) { st.sel = afin.ps[Number(d.cmPar)] ?? null; return desenhar(); }
  });

  // Text and select changes update only the part they affect: a full repaint under the cursor would drop the field's focus.
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "cm-dq") { st.dq = t.value; const r = root.querySelector("#cm-dres"); if (r && dados) r.innerHTML = resultadosBusca(buscarDeputados(fichas, st.dq), st.dq, ctx()); }
    else if (t.id === "cm-pq" && dados) { st.busca = t.value; const r = root.querySelector("#cm-evs"); if (r) r.innerHTML = listaEventos(dados.pauta.filter((x) => casaEvento(x, st)), ctx(), null); }
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement;
    if ((t.id !== "cm-tt" && t.id !== "cm-to") || !dados) return;
    if (t.id === "cm-tt") st.tt = t.value; else st.to = t.value;
    const p = dados.proposicoes[Math.min(st.ti, dados.proposicoes.length - 1)];
    const lista = root.querySelector("#cm-tl"), cont = root.querySelector("#cm-cnt");
    if (!p || !lista || !cont) return;
    const r = registroProp(p, dados.geradoEm, coresOrgao(dados.proposicoes, dados.geradoEm), st.tt, st.to);
    lista.innerHTML = r.html; cont.textContent = `${r.n} de ${r.total}`;
  });
  // A click on a deputy in the "voted differently" list opens his card; the roll-call pickers and chips keep focus through keepFocus.

  const carregar = () => {
    if (dados || pedidos.has("main")) return;
    pedidos.set("main", ler<PainelCamara>(`${DADOS}/painel.json`).then((d) => { aposCarregar(d); }).catch(() => { falhou = true; pedidos.delete("main"); }).then(() => { if (aberto) desenhar(); }));
  };

  return {
    show() { aberto = true; carregar(); garantir(); desenhar(); },
    hide() { aberto = false; dica.esconder(); },
    /** For tests. */
    get secao() { return st.sec; },
    get estado() { return st; },
  };
}
// Re-exports the view helpers the tests reach for through this module.
export { barrasOrientacao, barrasPartido, centroHemi, divergentes, legendaHemi, mapaBlocos, norm };
