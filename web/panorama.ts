// Panorama tabs (Partidos, Dinheiro, Alianças, Perfil): picks the data for the race on the
// open ballot and hands it to one view per tab. Aggregates come from web/data/panorama.json.
import { h } from "./format.js";
import { aliancasView } from "./pan-aliancas.js";
import { dinheiroView } from "./pan-dinheiro.js";
import { agendaView, partidosView } from "./pan-partidos.js";
import { perfilView } from "./pan-perfil.js";
import { redesView } from "./pan-redes.js";
import { votoView } from "./pan-redes-voto.js";
import { loadResultado } from "./apuracao-feed.js";
import { tseUrl } from "./apuracao-tse.js";
import type { Apuracao } from "./apuracao-tse.js";
import type { RedesCand } from "./pan-redes.js";
import type { AlCand } from "./aliancas.js";
import type { build } from "../src/radar/panorama";

export type Panorama = ReturnType<typeof build>;
export interface PanCtx {
  modo: string; pan: Panorama | null; cargo: string; uf: string; escopo?: string; metrica?: string;
  cands?: (AlCand & RedesCand & { uf: string })[];
}

export const PAN_MODES: Record<string, string> = { partidos: "Partidos", dinheiro: "Dinheiro", aliancas: "Alianças", perfil: "Perfil", redes: "Redes" };

const seg = (attr: string, value: string, items: [string, string][]) => items.map(([k, nome]) => `<button type="button" data-${attr}="${k}" aria-pressed="${k === value}">${h(nome)}</button>`).join("");

function body({ modo, pan, cargo, uf, key, label, cands, metrica }: Required<Omit<PanCtx, "pan" | "escopo">> & { pan: Panorama; key: string; label: string }) {
  const escopo = pan.escopos[key];
  if (modo === "aliancas") {
    const all = cands.filter((c) => c.uf === uf);
    return aliancasView({ cands: all.filter((c) => c.cargo === cargo), all, cargo, label: uf === "BR" ? "Brasil" : uf });
  }
  const data = escopo?.[cargo];
  if (!data) return `<p class="empty">Sem candidaturas a ${h(cargo)} em ${h(label)} nos dados do panorama.</p>`;
  if (modo === "dinheiro") return dinheiroView({ data, cargo, label, escopo });
  if (modo === "redes") return redesView({ data, cargo, label, cands: key === uf ? cands.filter((c) => c.uf === uf) : [] }); // only the ballot on screen is loaded
  if (modo === "perfil") return perfilView({ data, cargo, label, br: key === "BR" });
  return partidosView({ data, cargo, label, metrica }) + agendaView(pan.agenda);
}

// uf is "BR" for the presidential race. Alliances are built per state, so that tab ignores `escopo`.
export function renderPanorama({ modo, pan, cargo, uf, escopo = "uf", metrica = "total", cands = [] }: PanCtx) {
  const titulo = `<h2 id="pan-t">${h(PAN_MODES[modo] ?? "")} <small>${h(cargo)}</small></h2>`;
  if (!pan) return `<section class="exp-card pan">${titulo}<p class="empty">Os dados do panorama ainda não foram gerados (<code>bun run radar:panorama</code> depois de <code>radar:build</code>).</p></section>`;
  const nacional = uf === "BR";
  const br = nacional || (escopo === "br" && modo !== "aliancas");
  const key = br ? "BR" : uf;
  const barra = nacional || modo === "aliancas" ? "" : `<div class="pan-seg" role="group" aria-label="Abrangência">${seg("pan-escopo", br ? "br" : "uf", [["uf", `Meu estado (${uf})`], ["br", "Brasil todo"]])}</div>`;
  return `<section class="exp-card pan" aria-labelledby="pan-t">${titulo}${barra}${body({ modo, pan, cargo, uf, key, label: key === "BR" ? "Brasil" : key, cands, metrica })}
    <p class="muted small">Totais por partido e por perfil, calculados na geração dos dados com as mesmas fontes do Radar. Não há nota nem recomendação aqui: é um retrato do conjunto de candidaturas.</p></section>`;
}

// Fills the "Redes e voto" slot of the Redes tab with the TSE result of the open race. Only a finished
// count is cached; a partial one is read again on the next draw.
export function vozDoVoto(root: HTMLElement, getCtx: () => PanCtx | null, getEscopo: () => string, load: (url: string) => Promise<Apuracao> = loadResultado) {
  const cache = new Map<string, Apuracao>();
  const inflight = new Map<string, Promise<Apuracao>>(); // two draws in a row share one download
  let token = 0;
  const say = (html: string) => {
    const slot = root.querySelector<HTMLElement>("#pan-voto");
    if (slot) slot.innerHTML = `${slot.querySelector("h3")?.outerHTML ?? ""}${html}`;
  };
  return async () => {
    const ctx = getCtx(), mine = ++token;
    if (!ctx || ctx.modo !== "redes" || !ctx.pan) return;
    if (ctx.uf !== "BR" && getEscopo() === "br") return say(`<p class="muted small">O cruzamento com o resultado é feito por estado: escolha "Meu estado".</p>`);
    let url: string;
    try { url = tseUrl(ctx.cargo, ctx.uf); } catch { return say(`<p class="empty">Este recorte não tem resultado do TSE para cruzar.</p>`); }
    const show = (ap: Apuracao) => say(votoView({ cands: (ctx.cands ?? []).filter((c) => c.uf === ctx.uf), ap, cargo: ctx.cargo }));
    const hit = cache.get(url);
    if (hit) return show(hit);
    try {
      const pending = inflight.get(url) ?? load(url).finally(() => inflight.delete(url));
      inflight.set(url, pending);
      const ap = await pending;
      if (mine !== token) return; // another draw or race took over while the file was loading
      // The TSE marks the outcome ("Eleito", "2º turno") after the count ends; a runoff race never gets "Eleito"
      if (ap.fase === "concluida" && ap.candidatos.some((c) => c.situacao.trim())) cache.set(url, ap);
      show(ap);
    } catch (e) {
      if (mine === token) say(`<p class="empty">Não deu para ler o resultado do TSE agora (${h((e as Error).message)}). O restante da aba não depende dele.</p>`);
    }
  };
}

export function mountPanorama(root: HTMLElement) {
  const st: { escopo: string; metrica: string; ctx: PanCtx | null } = { escopo: "uf", metrica: "total", ctx: null };
  const fillVoto = vozDoVoto(root, () => st.ctx, () => st.escopo);
  const draw = (focus?: string) => {
    root.innerHTML = renderPanorama({ ...st.ctx!, escopo: st.escopo, metrica: st.metrica });
    if (focus) root.querySelector<HTMLElement>(focus)?.focus(); // a redraw drops focus; keyboard users keep their place
    void fillVoto();
  };
  root.addEventListener("click", (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>("[data-pan-metrica]"), s = (e.target as HTMLElement).closest<HTMLElement>("[data-pan-escopo]");
    if (m) { st.metrica = m.dataset.panMetrica!; draw(`[data-pan-metrica="${CSS.escape(st.metrica)}"]`); }
    else if (s) { st.escopo = s.dataset.panEscopo!; draw(`[data-pan-escopo="${CSS.escape(st.escopo)}"]`); }
  });
  return { show(ctx: PanCtx) { st.ctx = ctx; draw(); } };
}
