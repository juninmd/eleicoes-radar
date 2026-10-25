// Fullscreen panel of the Apuração tab ("Tela cheia"): the open race to follow from across the room. Built from the same pieces as the
// views (duel bar, live chance or projection, map, exterior, list of updates), bigger and on one screen. Every estimate keeps its label.
import { h, int, pct, titleName } from "./format.js";
import { renderDuelo } from "./apuracao-duelo.js";
import { renderNovidades } from "./apuracao-novidades.js";
import { renderChance, ROTULO, chanceTxt } from "./apuracao-chance-view.js";
import { renderExterior } from "./apuracao-exterior.js";
import { linhasUf } from "./apuracao-nacional.js";
import { legenda, mapaSvg } from "./apuracao-mapa.js";
import { pctSecoes, status } from "./apuracao.js";
import { turnoDe } from "./apuracao-tse.js";
import type { SnapView } from "./apuracao.js";
import type { ChanceProps } from "./apuracao-chance-view.js";
import type { ExteriorProps } from "./apuracao-exterior.js";
import type { Analise } from "./apuracao-projecao.js";
import type { Nomes } from "./apuracao-projecao-estado.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Cores } from "./apuracao-nacional.js";
import type { Item } from "./apuracao-novidades.js";
import type { Cargo, Turno } from "./apuracao-tse.js";
import type { UfMap } from "../src/radar/geo/uf-map";

export interface PainelProps {
  cargo: Cargo; uf: string; turno: Turno; snap: SnapView | null; nac: BrasilSnapshot | null; mapa: UfMap | null | undefined;
  cor: Cores; novidades: Item[]; simulado: boolean;
  chance: ChanceProps | null; proj: { analise: Analise | null; nomes: Nomes } | null; exterior: ExteriorProps | null;
}

const UMA_VAGA = new Set(["Presidente", "Governador"]);
const TOP = 8;
const FASES: Record<string, [string, string]> = { aguardando: ["Aguardando início", "baixa"], parcial: ["Apuração em andamento", "aberta"], concluida: ["Apuração concluída", "alta"] };
const bloco = (titulo: string, corpo: string, cls = "") => (corpo ? `<section class="painel-bloco ${cls}"><h3>${titulo}</h3>${corpo}</section>` : "");

// Races with more than one seat or many candidates: the first ones, with the TSE's own status text.
function lista(d: NonNullable<SnapView["dados"]>, cor: Cores) {
  return `<ul class="bancadas apu-votos">${d.candidatos.slice(0, TOP).map((c) => `<li><span class="nome"><i class="key" style="background:${h(cor(c.partido))}"></i>${h(titleName(c.nome))} <small>${h(c.partido)}</small></span>
    <span class="bar"><span class="fill" style="width:${(c.pct * 100).toFixed(1)}%;background:${h(cor(c.partido))}"></span></span><b>${pct(c.pct, 2)}</b><small>${int(c.votos)} votos${c.situacao ? ` · ${h(c.situacao)} (TSE)` : ""}</small></li>`).join("")}</ul>`;
}

function projecaoCurta(p: PainelProps["proj"]) {
  const a = p?.analise;
  if (!a || !p) return `${ROTULO}<p class="muted">Aguardando votos suficientes do TSE para projetar.</p>`;
  const nome = (id: string) => h(titleName(p.nomes[id]?.nome ?? id));
  const linha = (id: string) => { const f = a.sim.faixa[id]; return f ? `<li><b>${nome(id)}</b> ${pct(f[1], 1)} <small>(de ${pct(f[0], 1)} a ${pct(f[2], 1)})</small></li>` : ""; };
  const p1 = (a.sim.p1turno[a.a] ?? 0) + (a.sim.p1turno[a.b2] ?? 0);
  return `${ROTULO}
    <ul class="painel-proj">${linha(a.a)}${linha(a.b2)}</ul>
    <p class="exp-read">Chance de a disputa se decidir no 1º turno: <b>${chanceTxt(p1)}</b>. Mediana das simulações e faixa de 90%, em votos válidos; o método está na visão Projeção.</p>`;
}

function mapaCurto(p: PainelProps) {
  if (p.cargo !== "Presidente") return "";
  if (p.mapa === undefined) return `<p class="muted">Carregando o mapa…</p>`;
  if (!p.mapa) return `<p class="empty">O mapa não carregou.</p>`;
  const linhas = linhasUf(p.nac?.ufs ?? {}, p.cargo);
  return `${mapaSvg({ mapa: p.mapa, linhas, modo: "lider", cor: p.cor, sel: null, corridas: undefined, cargo: p.cargo })}${legenda({ modo: "lider", linhas, cor: p.cor, cargo: p.cargo })}`;
}

export function renderPainel(p: PainelProps): string {
  const d = p.snap?.dados;
  const t = turnoDe(p.cargo, p.turno);
  const [fase, cls] = FASES[d?.fase ?? ""] ?? ["Consultando", "baixa"];
  const titulo = `${h(p.cargo)}${p.uf === "BR" ? "" : ` · ${h(p.uf)}`}${t === 2 ? " · 2º turno" : ""}`;
  const quando = (p.cargo === "Presidente" ? p.nac?.buscadoEm : null) ?? p.snap?.buscadoEm;
  const topo = `<header class="painel-topo">
      <h2 id="apu-painel-t">${titulo} <span class="rot ${cls}">${h(fase)}</span>${p.simulado ? ` <span class="rot baixa">Simulação</span>` : ""}</h2>
      ${d ? `<p class="painel-secoes"><b>${pctSecoes(d.secoes)}</b> <span>das seções totalizadas</span></p>` : ""}
      ${quando ? `<p class="muted exp-meta">Consultado às <span id="apu-quando">${h(quando.toLocaleTimeString("pt-BR"))}</span></p>` : ""}
    </header>`;
  if (!d) {
    const msg = p.snap?.status === "ausente" ? "O TSE ainda não publicou o arquivo de resultados desta disputa." : p.snap?.status === "erro" ? `Não foi possível consultar o TSE agora${p.snap.erro ? `: ${h(p.snap.erro)}` : ""}.` : "Consultando o TSE…";
    return `<section class="exp-card apu apu-painel" aria-labelledby="apu-painel-t">${topo}<p class="empty">${msg}</p></section>`;
  }
  const umaVaga = UMA_VAGA.has(p.cargo);
  const placar = umaVaga ? renderDuelo({ d, cargo: p.cargo, uf: p.uf, cor: p.cor }) || lista(d, p.cor) : lista(d, p.cor);
  const estimativa = !umaVaga ? "" : t === 2 ? (p.chance ? renderChance({ ...p.chance, compacto: true }) : "") : projecaoCurta(p.proj);
  return `<section class="exp-card apu apu-painel" aria-labelledby="apu-painel-t">${topo}
    <div class="painel-grade">
      ${bloco(umaVaga ? "Placar" : "Mais votados", placar, "painel-placar")}
      ${bloco(t === 2 ? "Chance de terminar à frente" : "Projeção do Radar", estimativa)}
      ${bloco("Mapa", mapaCurto(p), "painel-mapa")}
      ${p.exterior ? bloco("Exterior", renderExterior({ ...p.exterior, compacto: true })) : ""}
      ${bloco("Seções e votos", status(d, p.snap, p.simulado))}
      ${bloco("Últimas atualizações", renderNovidades(p.novidades) || `<p class="muted small">As atualizações aparecem a cada marco da apuração.</p>`)}
    </div>
  </section>`;
}
