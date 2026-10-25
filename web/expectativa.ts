// "Expectativa" view: who is likely to win. Majoritarian races use the poll average
// (Wikipedia compilation of registered polls); deputies use the 2022-calibrated model.
import { displayName, h, int, pct } from "./format.js";
import { chance, chip, fmtDate, frescor, leitura, rangeBar, tendCell } from "./prev.js";
import { seats } from "./expectativa-seats.js";
import type { Candidatura } from "./types.js";
import type { Lider } from "../src/radar/expectativa";
import type { Poll } from "../src/radar/polls/extract";
import type { Forecast, PARAMS } from "../src/radar/polls/forecast";
import type { Backtest } from "../src/radar/model/seats";

// The shape of web/data/expectativa.json (the writer, buildExpectativa, leaves these parts untyped).
// Fields an older export may lack are optional: the renderers already tolerate their absence.
export type PollRow = Pick<Poll, "instituto" | "fim" | "amostra" | "margem" | "votos" | "indecisos">;
export interface Corrida extends Pick<Forecast, "cargo" | "uf" | "vagas" | "pesquisas" | "institutos" | "desde" | "ultima" | "p1turno"> {
  refTendencia?: Forecast["refTendencia"];
  confrontos?: Forecast["confrontos"];
  candidatos: string[];
  lideres: Lider[];
  primeiroTurno: PollRow[];
  segundoTurno: PollRow[];
}
export interface Modelo { treino?: string; anterior?: number; corte: string; features: string[]; coef: number[]; backtest: Backtest }
export interface Expectativa {
  fontes: { uf: string; titulo: string; url: string; revid: number }[];
  vagas: Record<string, number>;
  metodo?: typeof PARAMS;
  modelo: Modelo | null;
  corridas: Corrida[];
}
export type Avatar = (c: Candidatura, size: "xs") => string;
interface Args { exp: Expectativa | null; cargo: string; uf: string; cands: Candidatura[]; avatar: Avatar; limit: number }

const MAJORITARIAN = new Set(["Presidente", "Governador", "Senador"]);

export function renderExpectativa({ exp, cargo, uf, cands, avatar, limit }: Args) {
  if (!exp) return `<p class="empty">Os dados de expectativa ainda não foram gerados (<code>bun run radar:polls</code> e <code>radar:model</code>).</p>`;
  const byId = new Map(cands.map((c) => [c.id, c]));
  return MAJORITARIAN.has(cargo) ? race(exp, cargo, uf, byId, avatar) : seats(exp, cargo, uf, cands, avatar, limit);
}

const legenda = (twoRounds: boolean) => `<ul class="legenda" aria-label="Como ler o quadro">
  <li><i class="k mean"></i><span><b>Marca escura:</b> média das pesquisas em votos válidos (sem indecisos, brancos e nulos).</span></li>
  <li><i class="k range"></i><span><b>Faixa clara:</b> onde o resultado caiu em 90% das eleições passadas com pesquisas desse tamanho. Faixa larga = mais incerteza.</span></li>
  <li><i class="k"></i><span><b>${twoRounds ? "Vence" : "Eleito"}:</b> % das simulações em que termina ${twoRounds ? "vencedor" : "entre os eleitos"}. Não é a % de votos.</span></li>
  <li><i class="k"></i><span><b>2 semanas:</b> mudança da média em relação às pesquisas de 14 dias antes.</span></li>
</ul>`;

function metodo(r: Corrida, m: Expectativa["metodo"]) {
  if (!m) return "";
  const pp = (x: number) => (x * 100).toFixed(1).replace(".", ",");
  return `<details class="how"><summary>Como esta média é calculada</summary><ol class="muted small">
    <li>Entram ${int(r.pesquisas)} pesquisas: a mais recente de cada instituto (${h(r.institutos.join(", "))}), dentro de ${m.janelaDias} dias da mais nova.</li>
    <li>Cada uma pesa menos conforme envelhece (cai pela metade a cada ${m.meiaVidaDias} dias) e pesa mais com amostra maior.</li>
    <li>${int(m.simulacoes)} simulações somam o erro de amostra a um erro sistemático medido nas eleições de 2014, 2018 e 2022. A faixa clara é onde o resultado caiu em 90% dessas vezes${m.faixaEm40 != null ? `: para quem aparece com 40%, cerca de ±${pp(m.faixaEm40)} p.p. só pelo erro sistemático` : ""}. A chance de vitória usa um erro maior, calibrado para a diferença entre os dois primeiros, que errou mais do que o resultado de cada um.</li>
    <li>A coluna "2 semanas" compara com a média feita só com pesquisas de ${m.tendenciaDias} dias ou mais antes${r.refTendencia ? ` (a mais nova delas é de ${fmtDate(r.refTendencia)})` : ""}.</li></ol></details>`;
}

function race(exp: Expectativa, cargo: string, uf: string, byId: Map<string, Candidatura>, avatar: Avatar) {
  const r = exp.corridas.find((x) => x.cargo === cargo && x.uf === uf);
  const fonte = exp.fontes.find((f) => f.uf === uf);
  if (!r) return `<p class="empty">Nenhuma pesquisa com os candidatos registrados foi encontrada para ${h(cargo)} ${h(uf === "BR" ? "" : uf)}.</p>`;
  const rows = r.candidatos.map((id) => byId.get(id)).filter(Boolean) as Candidatura[];
  const lead = rows[0];
  const shown = rows.filter((c, i) => i < 4 || (c.prev?.media ?? 0) >= 0.01);
  const twoRounds = cargo !== "Senador";
  const max = Math.max(...shown.map((c) => c.prev?.hi ?? 0), 0.5);
  const headline = twoRounds
    ? `<b>${h(displayName(lead))}</b> tem <b>${chance(lead.prev!.p)}</b> de chance de vencer ${chip(lead.prev!.p)}. Chance de a disputa acabar no 1º turno (mais de 50% dos votos válidos): <b>${chance(r.p1turno!)}</b>.`
    : `${r.vagas} ${r.vagas > 1 ? "vagas" : "vaga"} em disputa. Mais prováveis: ${rows.slice(0, r.vagas).map((c) => `<b>${h(displayName(c))}</b> (${chance(c.prev!.p)})`).join(" e ")}.`;
  const read = twoRounds ? leitura(rows[0], rows[1]) : leitura(rows[r.vagas - 1], rows[r.vagas], "corte");
  return `
    <section class="exp-card" aria-labelledby="exp-t">
      <h2 id="exp-t">${h(cargo)}${uf === "BR" ? "" : ` · ${h(uf)}`}</h2>
      <p class="exp-lead">${headline}</p>
      ${read ? `<p class="exp-read">${read}</p>` : ""}
      <p class="muted exp-meta">Média de ${int(r.pesquisas)} pesquisas (a mais recente de cada instituto) de ${fmtDate(r.desde)} a ${fmtDate(r.ultima)}${r.ultima ? ` (a última, ${frescor(r.ultima)})` : ""}: ${h(r.institutos.join(", "))}.</p>
      <div class="scroll"><table class="exp-bars">
        <caption class="sr">Média das pesquisas em votos válidos, intervalo de 90%, variação em duas semanas e chance de ${twoRounds ? "vitória" : "eleição"}</caption>
        <thead><tr><th scope="col">Candidato</th><th scope="col" class="num">${twoRounds ? "Vence" : "Eleito"}</th>${twoRounds ? `<th scope="col" class="num">2º turno</th>` : ""}<th scope="col">Votos válidos (média e faixa de 90%)</th><th scope="col" class="num">2 semanas</th></tr></thead>
        <tbody>${shown.map((c) => {
          const p = c.prev!;
          return `<tr>
            <th scope="row"><button type="button" class="linkish" data-open="${h(c.id)}">${avatar(c, "xs")}<span>${h(displayName(c))} <small>${h(c.partido)} · ${h(c.num)}</small></span></button></th>
            <td class="num"><b>${chance(p.p)}</b>${chip(p.p)}</td>
            ${twoRounds ? `<td class="num">${chance(p.p2t ?? 0)}</td>` : ""}
            <td class="bar">${rangeBar(p, max, displayName(c))}</td>
            <td class="num">${tendCell(p.tend)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
      ${legenda(twoRounds)}
      ${twoRounds && r.p1turno! < 1 ? runoffs(r, byId) : ""}
      ${pollTable("Pesquisas recentes (1º turno)", r.primeiroTurno, shown.slice(0, 5))}
      ${metodo(r, exp.metodo)}
      <p class="muted small">Fonte: pesquisas registradas no TSE pelos institutos, compiladas na <a href="${h(fonte?.url ?? "https://pt.wikipedia.org")}" rel="noopener noreferrer" target="_blank">Wikipédia</a> (CC BY-SA). Isto é uma média de pesquisas com simulação de erro, <b>não é uma pesquisa eleitoral</b>.</p>
    </section>`;
}

function runoffs(r: Corrida, byId: Map<string, Candidatura>) {
  const pairs = new Map<string, PollRow>();
  for (const p of r.segundoTurno) {
    const key = Object.keys(p.votos).sort().join("|");
    if (!pairs.has(key)) pairs.set(key, p);
  }
  const rows = [...pairs.values()].slice(0, 6).map((p) => {
    const [[a, va], [b, vb]] = Object.entries(p.votos).sort((x, y) => y[1] - x[1]);
    const ca = byId.get(a);
    const cb = byId.get(b);
    return ca && cb ? `<tr><td>${h(displayName(ca))} <b>${pct(va / 100)}</b> × ${h(displayName(cb))} ${pct(vb / 100)}</td><td class="num">${(va - vb).toFixed(1).replace(".", ",")} p.p.</td><td>${h(p.instituto)}</td><td class="num">${fmtDate(p.fim)}</td></tr>` : "";
  });
  const avg = (r.confrontos ?? []).flatMap((m) => {
    const [a, b] = [byId.get(m.a), byId.get(m.b)];
    return a && b ? [`<b>${h(displayName(a))}</b> ${pct(m.qa, 1)} × ${pct(1 - m.qa, 1)} <b>${h(displayName(b))}</b> <span class="muted">(${int(m.n)} ${m.n > 1 ? "pesquisas" : "pesquisa"})</span>`] : [];
  });
  return rows.length ? `<h3>Cenários de 2º turno <small>pesquisa mais recente por par</small></h3>
    <p class="muted small">Pesquisas só com os dois nomes. Não entram na média do 1º turno: servem para decidir quem vence o 2º turno dentro das simulações.</p>
    ${avg.length ? `<p class="exp-read">Média usada nas simulações, entre quem escolheu um dos dois: ${avg.join(" · ")}.</p>` : ""}
    <div class="scroll"><table class="agenda"><thead><tr><th>Cenário</th><th class="num">Diferença</th><th>Instituto</th><th class="num">Data</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : "";
}

function pollTable(title: string, polls: PollRow[], cols: Candidatura[]) {
  if (!polls.length) return "";
  const cell = (v: number | null | undefined) => (v === undefined || v === null ? "–" : pct(v / 100, v % 1 ? 1 : 0));
  return `<h3>${h(title)} <small>% de todos os entrevistados</small></h3>
    <p class="muted small">Aqui o indeciso conta no total; por isso os números são menores que os votos válidos das barras.</p>
    <div class="scroll"><table class="agenda exp-polls">
    <thead><tr><th>Instituto</th><th class="num">Data</th><th class="num">Amostra</th>${cols.map((c) => `<th class="num">${h(displayName(c))}</th>`).join("")}<th class="num">Indecisos</th></tr></thead>
    <tbody>${polls.map((p) => `<tr><td>${h(p.instituto)}</td><td class="num">${fmtDate(p.fim)}</td><td class="num">${p.amostra ? int(p.amostra) : "–"}</td>${cols.map((c) => `<td class="num">${cell(p.votos[c.id])}</td>`).join("")}<td class="num">${cell(p.indecisos)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}
