// "Redes" tab: which channels the candidacies of one cargo declared to the TSE, by platform and
// by party, plus the dated follower counts Wikidata holds. Presence, not reach or quality.
import { h, int, money, moneyShort, pct } from "./format.js";
import { hbars, heat } from "./charts.js";
import { MIN_N } from "./pan-partidos.js";
import { REDE_NOME } from "./dossier-canais.js";
import type { CargoAgg } from "../src/radar/panorama";
import type { Candidatura } from "./types.js";

export type RedesCand = { id: string; cargo: string; partido: string; nome: string; urna?: string | null } & Partial<Pick<Candidatura, "canais" | "bio" | "fin">>;

const COLUNAS = ["instagram", "facebook", "tiktok", "youtube", "x"];
const TOP_PARTIDOS = 15;
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const mesAno = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;

function audiencia(cands: RedesCand[], cargo: string) {
  const rows = cands
    .filter((c) => c.cargo === cargo && c.bio?.seguidores?.length)
    .sort((a, b) => a.partido.localeCompare(b.partido, "pt-BR") || (a.urna || a.nome).localeCompare(b.urna || b.nome, "pt-BR"));
  if (!rows.length) return "";
  const lines = rows.map((c) => `<tr><th scope="row">${h(c.urna || c.nome)}</th><td>${h(c.partido)}</td><td>${c.bio!.seguidores!.map((s) => `${h(REDE_NOME[s.rede] ?? s.rede)} <b>${compact.format(s.n)}</b> <small class="muted">${mesAno(s.em)}</small>`).join(" · ")}</td></tr>`).join("");
  return `<h3>Audiência registrada no Wikidata <small>${int(rows.length)} candidaturas</small></h3>
    <p class="muted small">Só quem tem contagem pública datada no Wikidata aparece; falta de linha não quer dizer falta de seguidores. A contagem é editada por voluntários e pode estar defasada: confira a data. Ordem alfabética por partido, sem ranking.</p>
    <div class="scroll"><table class="agenda pan-table"><thead><tr><th scope="col">Candidatura</th><th scope="col">Partido</th><th scope="col">Seguidores (data da contagem)</th></tr></thead><tbody>${lines}</tbody></table></div>`;
}

// Paid boosting of online content, as the campaigns declared it to the TSE: a spending figure, not reach.
function impulsionamento(data: CargoAgg, cargo: string) {
  const i = data.impuls;
  if (!i || i.total <= 0) return "";
  const parts = Object.entries(data.partidos).filter(([, p]) => p.n >= MIN_N && (p.impuls ?? 0) > 0).sort((a, b) => b[1].impuls! - a[1].impuls!).slice(0, TOP_PARTIDOS);
  const bars = parts.length ? hbars(parts.map(([sigla, p]) => ({ label: sigla, sub: `${int(p.comImpuls ?? 0)} de ${int(p.n)} pagaram`, value: p.impuls! / parts[0]![1].impuls!, text: moneyShort(p.impuls!) })), { max: 1 }) : "";
  return `<h3>Dinheiro em redes: impulsionamento <small>${h(cargo)}</small></h3>
    <p class="exp-lead"><b>${money(i.total)}</b> em impulsionamento de conteúdo${i.gastos > 0 ? `, <b>${pct(i.total / i.gastos)}</b> das despesas contratadas` : ""}; <b>${int(i.comGasto)}</b> de ${int(data.n)} candidaturas pagaram por isso.</p>
    ${bars}
    <p class="muted small">Despesa contratada declarada ao TSE com a origem "Impulsionamento de conteúdos" (anúncios pagos em redes e buscadores). Partidos com ${MIN_N} candidaturas ou mais; é gasto, não alcance nem voto.</p>`;
}

export function redesView({ data, cargo, label, cands }: { data: CargoAgg; cargo: string; label: string; cands: RedesCand[] }) {
  const parts = Object.entries(data.partidos);
  const comCanal = parts.reduce((a, [, p]) => a + (p.comCanal ?? 0), 0);
  if (!data.n || !parts.some(([, p]) => p.comCanal !== undefined)) return `<p class="empty">Os canais ainda não entraram nos dados desta disputa (rode <code>radar:build</code> e <code>radar:panorama</code>).</p>`;
  const total = (k: string) => parts.reduce((a, [, p]) => a + (p.redes?.[k] ?? 0), 0);
  const plataformas = Object.keys(REDE_NOME).map((k) => ({ k, n: total(k) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const bars = hbars(plataformas.map((x) => ({ label: REDE_NOME[x.k]!, sub: `${int(x.n)} ${x.n === 1 ? "candidatura" : "candidaturas"}`, value: x.n / data.n, text: pct(x.n / data.n) })), { max: 1 });
  const elegiveis = parts.filter(([, p]) => p.n >= MIN_N).sort((a, b) => b[1].n - a[1].n).slice(0, TOP_PARTIDOS);
  const tabela = elegiveis.length
    ? heat({
        caption: "Parcela das candidaturas de cada partido que declarou canal em cada plataforma",
        rows: elegiveis.map(([sigla, p]) => ({ key: sigla, label: sigla, sub: `${int(p.n)} candidaturas` })),
        cols: COLUNAS.map((k) => ({ key: k, label: REDE_NOME[k]! })),
        cell: (sigla, k) => {
          const p = data.partidos[sigla]!;
          const v = (p.redes?.[k] ?? 0) / p.n;
          return { text: pct(v), v, title: `${sigla}: ${int(p.redes?.[k] ?? 0)} de ${int(p.n)} candidaturas com ${REDE_NOME[k]}` };
        },
      })
    : "";
  return `
    <p class="exp-lead"><b>${int(comCanal)}</b> de ${int(data.n)} candidaturas a ${h(cargo)} ${label === "Brasil" ? "no Brasil" : `em ${h(label)}`} declararam ao menos um canal ao TSE (<b>${pct(comCanal / data.n)}</b>).</p>
    <h3>Onde estão os canais <small>${h(cargo)} · ${h(label)}</small></h3>
    ${bars}
    <p class="muted small">Cada candidatura conta uma vez por plataforma, mesmo com mais de um perfil. Canais abertos no dossiê de cada pessoa.</p>
    ${tabela ? `<h3>Por partido <small>parcela das candidaturas com canal</small></h3>${tabela}<p class="muted small">Mostra os ${TOP_PARTIDOS} maiores partidos com ${MIN_N} candidaturas ou mais. Ter perfil declarado não mede alcance, engajamento nem qualidade: é só presença.</p>` : ""}
    ${impulsionamento(data, cargo)}
    <section id="pan-voto" aria-live="polite"><h3>Redes e voto <small>${h(cargo)} · ${h(label)}</small></h3><p class="muted small" id="pan-voto-msg">Lendo o resultado do TSE…</p></section>
    ${audiencia(cands, cargo)}
    <details class="how"><summary>De onde vêm os canais</summary><p class="muted small">Links que as próprias candidaturas informaram ao TSE no registro, mais os que a Câmara lista para seus deputados. Só entram perfis de redes conhecidas; WhatsApp e sites avulsos ficam de fora. Seguidores não entram na nota.</p></details>`;
}
