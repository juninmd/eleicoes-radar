// "Eleitos": a timeline of who got elected while the tab is open. A line is added the first time the TSE marks someone "Eleito", or
// the first time the Radar's own proof ("Matematicamente eleito", apuracao-eleito.js) holds for them. In memory only, like the
// list of updates: the TSE keeps no history, so someone already elected when the tab opens is shown as such, with the hour of the
// first file seen (the Radar does not know when it happened).
import { h, int, pct, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { epochDe } from "./apuracao-ritmo.js";
import { decididos, eleitoTse } from "./apuracao-eleito.js";
import type { Apuracao, Cargo } from "./apuracao-tse.js";

const MOSTRAR = 40;

// `t` is the file's epoch: the hour alone ("23:58") cannot tell one night's order from the next day's.
export interface Eleito { id: string; nome: string; partido: string; hora: string; t: number; avanco: number; tipo: "tse" | "radar"; ja: boolean }
export interface EstadoEleitos { itens: Eleito[]; chave: string; vistos: Set<string>; vagas: number; primeira: boolean }

export const vazio = (): EstadoEleitos => ({ itens: [], chave: "", vistos: new Set(), vagas: 0, primeira: true });

// Called with each new TSE file of the open race. Same file twice, or a count not started: nothing.
export function atualizar(est: EstadoEleitos, d: Apuracao | null | undefined, { cargo, uf }: { cargo: Cargo; uf: string }): EstadoEleitos {
  if (!d || d.fase === "aguardando" || !(d.secoes?.totalizadas > 0)) return est;
  const chave = `${d.versao.data} ${d.versao.hora}`;
  if (chave.trim() && chave === est.chave) return est;
  const dec = decididos(d, cargo, uf);
  const hora = d.versao.hora.slice(0, 5);
  const t = epochDe(d);
  const avanco = avancoDe(d.secoes);
  const vistos = new Set(est.vistos);
  const novos: Eleito[] = [];
  for (const c of d.candidatos) {
    // The TSE's own mark wins; the proof only speaks for whoever the TSE has not marked yet (decididos already drops a contradicted proof).
    const tipo = eleitoTse(c) ? "tse" : dec.has(c.id) && !c.situacao ? "radar" : null;
    if (!tipo) continue;
    const k = `${tipo}:${c.id}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    novos.push({ id: c.id, nome: c.nome, partido: c.partido, hora, t, avanco, tipo, ja: est.primeira });
  }
  return { itens: [...novos, ...est.itens], chave, vistos, vagas: d.cargo?.vagas ?? est.vagas, primeira: false };
}

const lin = (e: Eleito) => `<li class="${e.tipo}">
  <time>${h(e.hora)}</time>
  <span><b>${h(titleName(e.nome))}</b> <small>${h(e.partido)}</small>
    <em>${e.tipo === "tse" ? 'O TSE marcou "Eleito"' : "Matematicamente eleito (conta do Radar, não é a marcação do TSE)"}${e.ja ? " · já constava quando você abriu a aba" : ""} · com ${pct(Math.floor(e.avanco * 1000) / 1000, 1)} das seções</em></span></li>`;

export function renderEleitos(est: EstadoEleitos, d: Apuracao | null | undefined, cargo: Cargo): string {
  if (!d || d.fase === "aguardando") return `<p class="empty">A linha do tempo aparece quando o TSE começar a totalizar seções.</p>`;
  const tse = est.itens.filter((e) => e.tipo === "tse").length;
  const vagas = d.cargo?.vagas || est.vagas;
  const resumo = vagas > 0 ? `<b>${int(tse)}</b> de ${int(vagas)} ${vagas === 1 ? "vaga" : "vagas"} com situação de eleito no TSE` : `<b>${int(tse)}</b> com situação de eleito no TSE`;
  const lista = est.itens.slice(0, MOSTRAR);
  return `<div class="apu-eleitos"><p class="exp-lead">${resumo}${est.itens.length > tse ? ` · ${int(est.itens.length - tse)} com a conta do Radar` : ""}.</p>
    ${lista.length ? `<ol class="apu-linha" aria-label="Quem foi eleito, do mais recente ao mais antigo">${lista.map(lin).join("")}</ol>
      ${est.itens.length > MOSTRAR ? `<p class="muted small">Mostrando os ${MOSTRAR} mais recentes de ${int(est.itens.length)}.</p>` : ""}`
      : `<p class="empty">Ninguém tem situação de eleito ainda${/^Deputado/.test(cargo) ? ": nos cargos proporcionais o TSE só marca depois de distribuir as vagas" : ""}. Esta linha preenche sozinha a cada arquivo novo do TSE.</p>`}
    <p class="muted small">Hora do arquivo do TSE, em Brasília. A linha só conhece o que chegou com esta aba aberta: quem já estava eleito ao abrir aparece com a hora do primeiro arquivo. Nada fica guardado ao fechar a aba.</p></div>`;
}
