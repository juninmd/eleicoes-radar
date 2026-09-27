// "Expectativa" view data: poll-based forecasts for majoritarian races and the
// 2022-calibrated seat model for deputies. Both inputs are optional build artefacts
// (bun run radar:polls / radar:model); missing ones just leave the view empty.
import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { decodeLatin1, parseCsv } from "./csv";
import type { Candidate } from "./tse";
import type { Poll, Race } from "./polls/extract";
import { forecast } from "./polls/forecast";
import { predictGroups, type Knots, type SeatCand } from "./model/seats";

export interface Prev {
  p: number; // P(elected)
  fonte: "pesquisas" | "modelo";
  media?: number; // poll average, share of valid votes
  lo?: number;
  hi?: number;
  p2t?: number | null; // P(reaching the runoff)
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

const RACES: Race[] = ["Presidente", "Governador", "Senador"];

export function buildExpectativa(cands: Candidate[]) {
  const porCandidato = new Map<string, Prev>();
  const vagas = loadVagas();
  const corridas: unknown[] = [];
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
        porCandidato.set(c.sq, { p: r4(c.pVitoria), fonte: "pesquisas", media: r4(c.media), lo: r4(c.lo), hi: r4(c.hi), p2t: c.p2turno === null ? null : r4(c.p2turno) });
      }
      const recent = polls.filter((p) => p.fim >= (f.desde ?? ""));
      corridas.push({
        cargo, uf, vagas: f.vagas, pesquisas: f.pesquisas, institutos: f.institutos, desde: f.desde, ultima: f.ultima,
        p1turno: f.p1turno === null ? null : r4(f.p1turno),
        candidatos: f.candidatos.map((c) => c.sq),
        primeiroTurno: recent.filter((p) => p.turno === 1).slice(0, 12).map(({ instituto, fim, amostra, votos }) => ({ instituto, fim, amostra, votos })),
        segundoTurno: recent.filter((p) => p.turno === 2).slice(0, 12).map(({ instituto, fim, amostra, votos }) => ({ instituto, fim, amostra, votos })),
      });
    }
  }

  let modelo: unknown = null;
  if (existsSync(MODEL)) {
    const m: { coef: number[]; knots: Knots; treino: string; corte: string; features: string[]; backtest: unknown } = JSON.parse(readFileSync(MODEL, "utf8"));
    const deps: SeatCand[] = cands
      .filter((c) => c.cargo.startsWith("Deputado"))
      .map((c) => ({ sq: c.sq, grupo: `${c.uf}|${c.cargo.toUpperCase()}`, lista: c.federacao || c.partido, receita: c.finance.total, ocupacao: c.ocupacao ?? "" }));
    for (const [sq, p] of predictGroups(deps, vagas, m.coef, m.knots)) porCandidato.set(sq, { p: r4(p), fonte: "modelo" });
    modelo = { treino: m.treino, corte: m.corte, features: m.features, coef: m.coef.map(r4), backtest: m.backtest };
  }

  const resumo = {
    pesquisasEm: pesquisas?.geradoEm ?? null,
    fontes: pesquisas?.fontes ?? [],
    vagas: Object.fromEntries(vagas),
    modelo,
    corridas,
  };
  return { porCandidato, resumo };
}
