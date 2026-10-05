// "Últimas atualizações": what changed since the tab was opened, one line per milestone of the count (not one per poll) and one
// per change of status. Lines about the Radar's own arithmetic say so. Kept in memory only, like the evolution chart.
import { h, int, pct, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { decididos, eleitoTse, segundoTurno } from "./apuracao-eleito.js";
import type { Apuracao, Cargo } from "./apuracao-tse.js";

const MAX_ITENS = 30;
const MOSTRAR = 12;
const proporcional = (cargo: Cargo) => /^Deputado/.test(cargo);

export interface Novidade { tipo: "tse" | "radar" | "marco"; texto: string }
export interface Item extends Novidade { hora: string }
export interface EstadoNovidades { itens: Item[]; chave: string; marco: number; prev: Apuracao | null }

export const vazio = (): EstadoNovidades => ({ itens: [], chave: "", marco: 0, prev: null });

// Every 5 points of sections up to 90%, then every point: the end of the count is where the lines matter.
const marcoDe = (avanco: number): number => {
  const p = Math.floor(avanco * 100 + 1e-9);
  return p < 90 ? Math.floor(p / 5) * 5 : p;
};

const nome = (c: { nome: string }) => `<b>${h(titleName(c.nome))}</b>`;

function marcoTxt(d: Apuracao, cargo: Cargo, marco: number): string {
  const base = `Com ${marco}% das seções totalizadas`;
  if (proporcional(cargo)) {
    const n = d.candidatos.filter(eleitoTse).length;
    return `${base}, ${n === 0 ? "nenhum candidato tem" : n === 1 ? "1 candidato tem" : `${n} candidatos têm`} situação de eleito no TSE.`;
  }
  const [a, b] = [...d.candidatos].sort((x, y) => y.votos - x.votos);
  if (!a?.votos) return `${base}.`;
  return `${base}, ${nome(a)} tem ${pct(a.pct, 1)}${b ? ` e ${nome(b)}, ${pct(b.pct, 1)}` : ""}.`;
}

// One line per status text, not per candidate: a deputy race changes hundreds of them in one file and would bury every other line.
const PORNOME = 2;
function marcasDoTse(prev: Apuracao, d: Apuracao): Novidade[] {
  const antes = new Map<string, string>(prev.candidatos.map((c) => [c.id, c.situacao]));
  const grupos = new Map<string, Apuracao["candidatos"]>();
  for (const c of d.candidatos) if (c.situacao && c.situacao !== antes.get(c.id)) grupos.set(c.situacao, [...(grupos.get(c.situacao) ?? []), c]);
  return [...grupos].map(([sit, cs]) => ({
    tipo: "tse",
    texto: cs.length > PORNOME ? `O TSE marcou "${h(sit)}" em ${int(cs.length)} candidatos.` : `${cs.map(nome).join(" e ")}: o TSE marcou "${h(sit)}".`,
  }));
}

// Lines for what is new in `d` against the file before it. Only with a file before it: the first one seen says where the
// count stands (the milestone), not that something just happened.
function mudancas(prev: Apuracao, d: Apuracao, cargo: Cargo, uf: string): Novidade[] {
  const out = marcasDoTse(prev, d);
  const ja = decididos(prev, cargo, uf);
  const agora = decididos(d, cargo, uf);
  for (const c of d.candidatos) {
    if (agora.has(c.id) && !ja.has(c.id)) out.push({ tipo: "radar", texto: `${nome(c)}: matematicamente eleito(a) (conta do Radar, não é a marcação do TSE).` });
  }
  const t0 = segundoTurno(prev, cargo, uf);
  const t1 = segundoTurno(d, cargo, uf);
  if (t1 && !t0) out.push({ tipo: "radar", texto: "Segundo turno garantido (conta do Radar, não é a marcação do TSE)." });
  if (t1?.finalistas && !t0?.finalistas) {
    const par = d.candidatos.filter((c) => t1.finalistas!.includes(c.id)).sort((x, y) => y.votos - x.votos);
    out.push({ tipo: "radar", texto: `Disputam o 2º turno: ${par.map(nome).join(" e ")} (conta do Radar, não é a marcação do TSE).` });
  }
  return out;
}

// Called with each new TSE file of the open race. Same file twice, or a count not started: nothing.
export function atualizar(est: EstadoNovidades, d: Apuracao | null | undefined, { cargo, uf }: { cargo: Cargo; uf: string }): EstadoNovidades {
  if (!d || d.fase === "aguardando" || !(d.secoes?.totalizadas > 0)) return est;
  const chave = `${d.versao.data} ${d.versao.hora}`;
  if (chave.trim() && chave === est.chave) return est; // a file without a version is always taken (the feed already drops stale ones)
  const hora = d.versao.hora.slice(0, 5);
  const novos = est.prev ? mudancas(est.prev, d, cargo, uf) : [];
  const marco = marcoDe(avancoDe(d.secoes));
  if (marco > est.marco) novos.push({ tipo: "marco", texto: marcoTxt(d, cargo, marco) }); // after the changes: they are the news
  return {
    itens: [...novos.map((n) => ({ ...n, hora })), ...est.itens].slice(0, MAX_ITENS), // newest on top; within one file the changes sit above the milestone
    chave,
    marco: Math.max(marco, est.marco),
    prev: d,
  };
}

export function renderNovidades(itens: Item[]): string {
  if (!itens.length) return "";
  return `<details class="apu-novidades" data-k="novidades" open><summary>Últimas atualizações <small>desde que você abriu a aba</small></summary>
    <ol>${itens.slice(0, MOSTRAR).map((i) => `<li class="${i.tipo}"><time>${h(i.hora)}</time><span>${i.texto}</span></li>`).join("")}</ol>
    <p class="muted small">Uma linha por marco da apuração (a cada 5 pontos de seções, depois a cada ponto a partir de 90%) e por mudança de situação. Hora do arquivo do TSE, em Brasília. Nada fica guardado: ao fechar a aba, o registro some.</p></details>`;
}
