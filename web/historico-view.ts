// "Histórico" tab, pure rendering: presidential results 1989-2022, by round and by state. No DOM access, so the tests run on strings.
import { h, int, titleName } from "./format.js";
import { NOMES } from "./apuracao-mapa.js";
import type { HAno, HCand, HTurno } from "../src/radar/hist/presidencial.js";

export interface Estado { ano: number; turno: 1 | 2 }

// Party colours, same family as the live view; anything else is neutral grey.
const COR: Record<string, string> = { PT: "#c0392b", PSDB: "#1f6fb2", PMDB: "#2e8b57", MDB: "#2e8b57", PDT: "#d4742c", PSL: "#2c4a8a", PRN: "#7a5c2e", PPS: "#8e5ba0", PSB: "#e0a100", PV: "#3a9d3a", PPR: "#5b6770", PFL: "#00a0a0", PTB: "#444", PL: "#2c4a8a", PRONA: "#6b4e9b" };
export const corDe = (partido: string): string => COR[partido] ?? "#7b8794";

const pc = (v: number, total: number): string => (total ? `${((v / total) * 100).toFixed(2).replace(".", ",")}%` : "–");
export const turnoDe = (a: HAno, t: number): HTurno => a.turnos.find((x) => x.t === t) ?? a.turnos[a.turnos.length - 1];
export const anoDe = (anos: HAno[], ano: number): HAno => anos.find((a) => a.ano === ano) ?? anos[anos.length - 1];

export function linhaDoTempo(anos: HAno[], sel: number): string {
  const itens = anos.map((a) => {
    const t = a.turnos[a.turnos.length - 1];
    const e = t.cands.find((c) => c.n === a.eleito) ?? t.cands[0];
    return `<li><button type="button" data-his-ano="${a.ano}" aria-pressed="${a.ano === sel}" aria-label="${a.ano}: ${h(titleName(e.nome))} (${h(e.partido)}), ${pc(e.v, t.total)}"><b>${a.ano}</b><span class="his-dot" style="background:${corDe(e.partido)}"></span><span>${h(titleName(e.nome))}</span><small>${h(e.partido)} · ${pc(e.v, t.total)}</small></button></li>`;
  });
  return `<ol class="his-tempo" aria-label="Quem venceu em cada eleição">${itens.join("")}</ol>`;
}

const barra = (c: HCand, t: HTurno, eleito: boolean): string => {
  const w = t.total ? (c.v / t.total) * 100 : 0;
  return `<tr${eleito ? ' class="eleito"' : ""}><th scope="row"><span class="his-dot" style="background:${corDe(c.partido)}"></span>${h(titleName(c.nome))} <small class="muted">${h(c.partido)}</small>${eleito ? ' <span class="his-sel">eleito</span>' : ""}</th>
    <td class="num">${int(c.v)}</td>
    <td><div class="his-bar" role="img" aria-label="${h(titleName(c.nome))}: ${pc(c.v, t.total)}"><i style="width:${w.toFixed(2)}%;background:${corDe(c.partido)}"></i></div></td>
    <td class="num"><b>${pc(c.v, t.total)}</b></td></tr>`;
};

export function turnoView(a: HAno, t: HTurno): string {
  const ultimo = a.turnos[a.turnos.length - 1].t === t.t;
  return `<div class="scroll"><table class="exp-bars his-tab"><caption class="sr">Votos nominais por candidato, ${t.t}º turno de ${a.ano}</caption>
    <thead><tr><th scope="col">Candidato</th><th scope="col" class="num">Votos</th><th scope="col"><span class="sr">Proporção</span></th><th scope="col" class="num">%</th></tr></thead>
    <tbody>${t.cands.map((c) => barra(c, t, ultimo && c.n === a.eleito)).join("")}</tbody></table></div>
    <p class="muted small">${int(t.total)} votos nominais (porcentagem sobre eles; brancos e nulos ficam de fora).</p>`;
}

// One row per state: who led and by how much over the runner-up, in the round on screen.
export function estadosView(t: HTurno): string {
  const ufs = new Set<string>();
  for (const c of t.cands) for (const u of Object.keys(c.uf)) ufs.add(u);
  const linhas = [...ufs].sort((x, y) => (NOMES[x] ?? x).localeCompare(NOMES[y] ?? y, "pt-BR")).map((u) => {
    const r = t.cands.map((c) => ({ c, v: c.uf[u] ?? 0 })).filter((x) => x.v > 0).sort((p, q) => q.v - p.v);
    const tot = r.reduce((s, x) => s + x.v, 0);
    const [p, s] = r;
    if (!p) return "";
    return `<tr><th scope="row">${h(NOMES[u] ?? u)}</th><td><span class="his-dot" style="background:${corDe(p.c.partido)}"></span>${h(titleName(p.c.nome))} <small class="muted">${h(p.c.partido)}</small></td><td class="num"><b>${pc(p.v, tot)}</b></td><td class="num muted">${s ? `+${(((p.v - s.v) / tot) * 100).toFixed(1).replace(".", ",")} pp` : "–"}</td></tr>`;
  });
  return `<details class="how" data-k="his-ufs"><summary>Quem liderou em cada estado</summary><div class="scroll"><table class="exp-bars his-ufs"><caption class="sr">Líder por estado, ${t.t}º turno</caption>
    <thead><tr><th scope="col">Estado</th><th scope="col">Líder</th><th scope="col" class="num">%</th><th scope="col" class="num">Vantagem</th></tr></thead><tbody>${linhas.join("")}</tbody></table></div></details>`;
}

export function historicoView(anos: HAno[], e: Estado): string {
  const a = anoDe(anos, e.ano);
  const t = turnoDe(a, e.turno);
  const turnoBtns = a.turnos.length > 1 ? `<div class="pan-seg" role="group" aria-label="Turno">${a.turnos.map((x) => `<button type="button" data-his-turno="${x.t}" aria-pressed="${x.t === t.t}">${x.t}º turno</button>`).join("")}</div>` : `<p class="muted small">Eleição decidida em turno único.</p>`;
  return `<section class="exp-card pan his-root" aria-labelledby="his-t">
    <h2 id="his-t">Histórico <small>eleições presidenciais, 1989 a 2022</small></h2>
    <p class="muted small">Resultado oficial do TSE (dados abertos). Escolha a eleição; o vencedor é quem liderou o último turno.</p>
    ${linhaDoTempo(anos, a.ano)}
    <h3 class="his-h">${a.ano} <small>${turnoBtns}</small></h3>
    ${turnoView(a, t)}
    ${estadosView(t)}</section>`;
}

export const semDados = (): string => `<section class="exp-card pan his-root"><h2>Histórico</h2><p class="empty" role="status">Os dados do histórico ainda não foram gerados (<code>bun run radar:presidencial</code>).</p></section>`;
