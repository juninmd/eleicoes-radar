// "Redes e voto": joins the channels and boosting spend of one race with the TSE result of the same race.
// An association table, never a ranking of people: it cannot say that a channel brought a single vote.
import { h, int, money, pct } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import type { Apuracao } from "./apuracao-tse.js";
import type { RedesCand } from "./pan-redes.js";

export const MIN_VOTO = 100; // proportional races only: fewer matched candidacies say nothing about a group
export const MIN_CELULA = 20; // a group smaller than this shows no median
const BANDAS = [{ nome: "Nenhuma plataforma", test: (n: number) => n === 0 }, { nome: "1 ou 2 plataformas", test: (n: number) => n === 1 || n === 2 }, { nome: "3 ou mais", test: (n: number) => n >= 3 }];

export interface Linha { id: string; nome: string; partido: string; plataformas: number; impuls: number; gastos: number; votos: number; pct: number; eleito: boolean }

const AVANCO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

// Only channels declared to the TSE count, as in the Redes tab: the Câmara's links favour incumbents.
const plataformas = (c: RedesCand) => new Set((c.canais ?? []).filter((k) => !k.c).map((k) => k.r)).size;

// Candidacies present in both the dossier file and the result; an id missing from either side is left out.
export function juntar(cands: RedesCand[], ap: Apuracao): Linha[] {
  const byId = new Map(cands.map((c) => [c.id, c] as const));
  return ap.candidatos.flatMap((r) => {
    const c = byId.get(r.id);
    if (!c) return [];
    return [{ id: c.id, nome: c.urna || c.nome, partido: c.partido, plataformas: plataformas(c), impuls: c.fin?.impuls ?? 0, gastos: c.fin?.gastos ?? 0, votos: r.votos, pct: r.pct, eleito: /^eleito/i.test(r.situacao) }];
  });
}

interface Grupo { n: number; mediana: number; eleitos: number }
const grupo = (l: Linha[]): Grupo => ({ n: l.length, mediana: l.length ? median(l.map((x) => x.votos)) : 0, eleitos: l.filter((x) => x.eleito).length });

// Spending tertiles among candidacies that spent anything: boosting is compared inside the same spending band,
// because whoever spends more overall boosts more and also gets more votes.
export function tercis(linhas: Linha[]) {
  const gastaram = linhas.filter((l) => l.gastos > 0).sort((a, b) => a.gastos - b.gastos);
  const k = Math.floor(gastaram.length / 3);
  return [gastaram.slice(0, k), gastaram.slice(k, gastaram.length - k), gastaram.slice(gastaram.length - k)];
}

const cel = (g: Grupo, concluida: boolean) => (g.n < MIN_CELULA ? `<td class="muted">n&lt;${MIN_CELULA}</td>` : `<td><b>${int(Math.round(g.mediana))}</b> votos${concluida ? ` <small class="muted">· ${pct(g.eleitos / g.n)} eleitos</small>` : ""}<small class="muted"> (${int(g.n)})</small></td>`);

function proporcional(linhas: Linha[], concluida: boolean) {
  const porBanda = BANDAS.map((b) => ({ nome: b.nome, g: grupo(linhas.filter((l) => b.test(l.plataformas))) }));
  const faixas = tercis(linhas).map((t, i) => ({
    nome: ["Gasto total menor", "Gasto total médio", "Gasto total maior"][i]!,
    faixa: t.length ? `${money(t[0]!.gastos)} a ${money(t.at(-1)!.gastos)}` : "",
    sem: grupo(t.filter((l) => l.impuls <= 0)), com: grupo(t.filter((l) => l.impuls > 0)),
  }));
  return `<h3>Canais declarados e votos <small>${int(linhas.length)} candidaturas</small></h3>
    <div class="scroll"><table class="agenda pan-table"><caption class="sr">Mediana de votos por número de plataformas declaradas</caption>
      <thead><tr><th scope="col">Plataformas declaradas ao TSE</th><th scope="col">Mediana de votos (candidaturas)</th></tr></thead>
      <tbody>${porBanda.map((b) => `<tr><th scope="row">${h(b.nome)}</th>${cel(b.g, concluida)}</tr>`).join("")}</tbody></table></div>
    <h3>Impulsionamento pago, no mesmo patamar de gasto <small>quem pagou × quem não pagou</small></h3>
    <div class="scroll"><table class="agenda pan-table"><caption class="sr">Mediana de votos de quem pagou e de quem não pagou impulsionamento, por faixa de gasto total</caption>
      <thead><tr><th scope="col">Faixa de gasto total</th><th scope="col">Não pagou</th><th scope="col">Pagou</th></tr></thead>
      <tbody>${faixas.map((f) => `<tr><th scope="row">${h(f.nome)}<br><small class="muted">${h(f.faixa)}</small></th>${cel(f.sem, concluida)}${cel(f.com, concluida)}</tr>`).join("")}</tbody></table></div>`;
}

function majoritario(linhas: Linha[]) {
  const rows = linhas.map((l) => `<tr><th scope="row">${h(l.nome)}</th><td>${h(l.partido)}</td><td>${int(l.plataformas)}</td><td>${l.impuls > 0 ? money(l.impuls) : "–"}</td><td>${pct(l.pct)}</td></tr>`).join("");
  return `<h3>Canais, impulsionamento e votos <small>${int(linhas.length)} candidaturas</small></h3>
    <div class="scroll"><table class="agenda pan-table"><thead><tr><th scope="col">Candidatura</th><th scope="col">Partido</th><th scope="col">Plataformas</th><th scope="col">Impulsionamento</th><th scope="col">Votos válidos</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">Disputa com poucos nomes: a lista segue a ordem do resultado e não permite estimar efeito de rede nenhuma.</p>`;
}

const LEITURA = `<details class="how"><summary>Como ler esta comparação</summary><p class="muted small">É uma associação, não uma causa. Quem já é conhecido (mandato, partido grande, mais dinheiro) tende a ter mais canais, a impulsionar mais e a ter mais votos, e nada aqui separa uma coisa da outra; o corte por faixa de gasto só reduz parte disso. Impulsionamento é a despesa que a candidatura declarou ao TSE com essa finalidade; o alcance real dos perfis e do conteúdo orgânico não está nos dados. Candidatura e resultado se unem pelo número de sequência do TSE.</p></details>`;

export function votoView({ cands, ap, cargo }: { cands: RedesCand[]; ap: Apuracao; cargo: string }) {
  const linhas = juntar(cands, ap);
  if (ap.fase === "aguardando" || !linhas.length) return `<p class="empty">O TSE ainda não publicou votos para ${h(cargo)} neste recorte.</p>`;
  // The TSE fills "Eleito" after the count ends: a finished count with no one marked would read as "0% eleitos".
  const concluida = ap.fase === "concluida" && linhas.some((l) => l.eleito);
  const aviso = ap.fase === "concluida" ? "" : `<p class="muted small">Apuração em andamento (${AVANCO.format(avancoDe(ap.secoes) * 100)}% das seções): os números ainda mudam.</p>`;
  // Deputies are decided by list, the other offices by a handful of names: each gets the table that fits.
  const corpo = !/^Deputado/.test(cargo) ? majoritario(linhas) : linhas.length >= MIN_VOTO ? proporcional(linhas, concluida) : `<p class="empty">Só ${int(linhas.length)} candidaturas casaram com o resultado: poucas para comparar grupos (mínimo ${MIN_VOTO}).</p>`;
  return `${aviso}${corpo}${LEITURA}`;
}
