// "Expectativa" view data: poll-based forecasts for majoritarian races and the
// 2022-calibrated seat model for deputies. Both inputs are optional build artefacts
// (bun run radar:polls / radar:model); missing ones just leave the view empty.
import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { decodeLatin1, parseCsv } from "./csv";
import type { Candidate } from "./tse";
import type { Poll, Race } from "./polls/extract";
import { forecast, PARAMS, type CandidateForecast } from "./polls/forecast";
import { explain, predictGroups, type Knots, type SeatCand, type SeatWhy } from "./model/seats";

export interface Prev {
  p: number; // P(elected)
  fonte: "pesquisas" | "modelo";
  media?: number; // poll average, share of valid votes
  lo?: number;
  hi?: number;
  p2t?: number | null; // P(reaching the runoff)
  tend?: number | null; // poll-average change vs 14 days earlier (share of valid votes)
  ex?: SeatWhy; // deputies: what the model looked at (only where the chance is not negligible)
}

const VAGAS_ZIP = "data/tse/consulta_vagas_2026.zip";
const POLLS = "data/pesquisas.json";
const MODEL = "data/modelo-deputados.json";
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function loadVagas(zip = VAGAS_ZIP): Map<string, number> {
  const out = new Map<string, number>();
  if (!existsSync(zip)) return out;
  const files = unzipSync(readFileSync(zip), { filter: (f) => f.name === "consulta_vagas_2026_BRASIL.csv" });
  for (const data of Object.values(files)) {
    for (const r of parseCsv(decodeLatin1(data))) out.set(`${r.SG_UF}|${(r.DS_CARGO ?? "").toUpperCase()}`, Number(r.QT_VAGA) || 0);
  }
  return out;
}

const POLL_FIELDS = ({ instituto, fim, amostra, margem, votos, indecisos }: Poll) => ({ instituto, fim, amostra, margem, votos, indecisos });
export interface Lider { sq: string; nome: string; partido: string; media: number; lo: number; hi: number }

// The best-placed candidates of a race: enough for the Apuração map to say whom the polls favour in each
// state without loading every state file. A candidate with no poll mentions is not a leader.
export function lideres(f: CandidateForecast[], quem: Map<string, { nome: string; partido: string }>, n = 3): Lider[] {
  return f
    .filter((c) => c.media > 0 && quem.has(c.sq))
    .sort((a, b) => b.media - a.media || a.sq.localeCompare(b.sq))
    .slice(0, n)
    .map((c) => ({ sq: c.sq, ...quem.get(c.sq)!, media: r4(c.media), lo: r4(c.lo), hi: r4(c.hi) }));
}

const EX_MIN_P = 0.005; // chance() shows "<1%" below this, so no explanation is attached there

const RACES: Race[] = ["Presidente", "Governador", "Senador"];

export function buildExpectativa(cands: Candidate[]) {
  const porCandidato = new Map<string, Prev>();
  const vagas = loadVagas();
  const corridas: unknown[] = [];
  const quem = new Map(cands.map((c) => [c.sq, { nome: c.nomeUrna || c.nome, partido: c.partido }]));
  let pesquisas: { geradoEm: string; fontes: unknown[]; pesquisas: Poll[] } | null = null;

  if (existsSync(POLLS)) {
    pesquisas = JSON.parse(readFileSync(POLLS, "utf8"));
    const byRace = Map.groupBy(pesquisas!.pesquisas, (p) => `${p.cargo}|${p.uf}`);
    const races = new Set(cands.filter((c) => RACES.includes(c.cargo as Race)).map((c) => `${c.cargo}|${c.uf}`));
    for (const key of [...races].sort()) {
      const [cargo, uf] = key.split("|") as [Race, string];
      const polls = byRace.get(key) ?? [];
      const f = forecast(cargo, uf, polls, vagas.get(`${uf}|${cargo.toUpperCase()}`) ?? (cargo === "Senador" ? 2 : 1));
      if (!f) continue;
      for (const c of f.candidatos) {
        porCandidato.set(c.sq, { p: r4(c.pVitoria), fonte: "pesquisas", media: r4(c.media), lo: r4(c.lo), hi: r4(c.hi), p2t: c.p2turno === null ? null : r4(c.p2turno), tend: c.tendencia === null ? null : r4(c.tendencia) });
      }
      const recent = polls.filter((p) => p.fim >= (f.desde ?? ""));
      corridas.push({
        cargo, uf, vagas: f.vagas, pesquisas: f.pesquisas, institutos: f.institutos, desde: f.desde, ultima: f.ultima,
        p1turno: f.p1turno === null ? null : r4(f.p1turno), refTendencia: f.refTendencia,
        confrontos: f.confrontos.map((m) => ({ ...m, qa: r4(m.qa) })),
        candidatos: f.candidatos.map((c) => c.sq),
        lideres: lideres(f.candidatos, quem),
        primeiroTurno: recent.filter((p) => p.turno === 1).slice(0, 12).map(POLL_FIELDS),
        segundoTurno: recent.filter((p) => p.turno === 2).slice(0, 12).map(POLL_FIELDS),
      });
    }
  }

  let modelo: unknown = null;
  if (existsSync(MODEL)) {
    const m: { coef: number[]; knots: Knots; treino: string; corte: string; features: string[]; backtest: unknown } = JSON.parse(readFileSync(MODEL, "utf8"));
    const deps: SeatCand[] = cands
      .filter((c) => c.cargo.startsWith("Deputado"))
      .map((c) => ({ sq: c.sq, grupo: `${c.uf}|${c.cargo.toUpperCase()}`, lista: c.federacao || c.partido, receita: c.finance.total, ocupacao: c.ocupacao ?? "" }));
    const why = explain(deps, vagas);
    for (const [sq, raw] of predictGroups(deps, vagas, m.coef, m.knots)) {
      const p = r4(raw); // the stored (rounded) value is what the UI shows, so the threshold must use it
      porCandidato.set(sq, { p, fonte: "modelo", ...(p >= EX_MIN_P && { ex: why.get(sq) }) });
    }
    modelo = { treino: m.treino, corte: m.corte, features: m.features, coef: m.coef.map(r4), backtest: m.backtest };
  }

  const resumo = {
    pesquisasEm: pesquisas?.geradoEm ?? null,
    fontes: pesquisas?.fontes ?? [],
    vagas: Object.fromEntries(vagas),
    metodo: PARAMS,
    modelo,
    corridas,
  };
  return { porCandidato, resumo };
}
