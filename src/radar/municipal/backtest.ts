// How well does the first round predict the runoff, city by city? Leaves one election year out: fits the shape (kappa, eta) and the
// vote ratio on the other years' runoffs of the same office and scores the left-out year. Two readings per race:
//   "nível certo": alpha solved so the race total matches the real one (what a good poll would give) -> the error of the shape alone;
//   "sem âncora":  alpha = 0, no outside information -> what knowing nothing but the first round costs at the race level.
// Writes data/municipal-modelo.json (fit on every year, plus these errors) for the build and the page.
// Usage: bun run radar:mun-backtest   (needs data/hist/mun-<year>.json for 2002-2022)
import { writeFileSync } from "node:fs";
import { actualShare, fitShape, loadRunoffs, ratioOf, type Runoff } from "./fit";
import { cityShare, raceShare, solveAlpha, type Params } from "../../../web/municipio-modelo";
import type { Erros } from "../../../web/apuracao-municipios";
import type { Cargo } from "./sources";

export const SIZE_EDGES = [5_000, 20_000, 100_000]; // estimated valid votes of a city: the classes the error band is read by

export interface Pred { cod: string; votes: number; y: number; s: number; w: number; real: number } // one city: real share, estimate, runoff votes
export interface RacePred { race: Runoff; preds: Pred[]; nacional: number; real: number }

export function predictRace(r: Runoff, p: Params, nivel: "certo" | "zero"): RacePred {
  const cities = r.cities.map((c) => c.city);
  const alpha = nivel === "certo" ? solveAlpha(cities, actualShare(r), p).alpha : 0;
  const preds = r.cities.map((c): Pred => {
    const v = c.a2 + c.b2;
    return { cod: c.cod, votes: (c.city.a + c.city.b + c.city.o) * p.ratio, y: c.a2 / v, s: cityShare(c.city, alpha, p), w: v, real: v };
  });
  return { race: r, preds, nacional: raceShare(cities, alpha, p), real: actualShare(r) };
}

export interface Score { races: number; cities: number; rmse: number; mae: number; acertoVencedor: number; erroNacional: number; erroNacionalAbs: number; erroNacionalRmse: number; erroVotos: number }

// Each race counts once (a small state is not drowned by São Paulo); inside a race the cities are weighted by their real votes.
export function score(rps: readonly RacePred[]): Score {
  let se = 0, ae = 0, ok = 0, ev = 0, nat = 0, natAbs = 0, natSq = 0, n = 0;
  for (const rp of rps) {
    let w = 0, s2 = 0, a = 0, o = 0, e = 0, wv = 0;
    for (const q of rp.preds) {
      w += q.w; s2 += q.w * (q.s - q.y) ** 2; a += q.w * Math.abs(q.s - q.y);
      if ((q.s > 0.5) === (q.y > 0.5) || Math.abs(q.y - 0.5) < 1e-12) o += q.w;
      e += Math.abs(q.votes - q.real); wv += q.real;
    }
    se += s2 / w; ae += a / w; ok += o / w; ev += e / wv; n += rp.preds.length;
    const d = rp.nacional - rp.real;
    nat += d; natAbs += Math.abs(d); natSq += d * d;
  }
  const k = rps.length;
  return { races: k, cities: n, rmse: Math.sqrt(se / k) * 100, mae: (ae / k) * 100, acertoVencedor: (ok / k) * 100, erroNacional: (nat / k) * 100, erroNacionalAbs: (natAbs / k) * 100, erroNacionalRmse: Math.sqrt(natSq / k) * 100, erroVotos: (ev / k) * 100 };
}

// Error of a single city's share of A by the city's size class, over every left-out race: the band the page prints next to each city.
export function porTamanho(rps: readonly RacePred[]): { ate: number | null; rmse: number }[] {
  const edges = [...SIZE_EDGES, Infinity];
  const sq = edges.map(() => 0), n = edges.map(() => 0);
  for (const rp of rps) for (const q of rp.preds) {
    const k = edges.findIndex((e) => q.votes <= e);
    sq[k]! += (q.s - q.y) ** 2; n[k]!++;
  }
  return edges.map((e, k) => ({ ate: Number.isFinite(e) ? e : null, rmse: n[k]! > 0 ? Math.round(Math.sqrt(sq[k]! / n[k]!) * 1e3) / 10 : NaN }));
}

const f = (x: number, d = 2) => x.toFixed(d).replace(".", ",");
const linha = (nome: string, s: Score) => `  ${nome.padEnd(36)} ${String(s.races).padStart(3)} disputas · cidade: RMSE ${f(s.rmse)} p.p., MAE ${f(s.mae)}, vencedor certo em ${f(s.acertoVencedor, 1)}% dos votos · votos ±${f(s.erroVotos, 1)}% · total da disputa: viés ${f(s.erroNacional)}, |erro| ${f(s.erroNacionalAbs)}, RMSE ${f(s.erroNacionalRmse)} p.p.`;

// Leave-one-year-out predictions for one office. `fit` decides which parameters each fold uses.
export function loyo(all: readonly Runoff[], years: readonly number[], pick: (r: Runoff) => boolean, mk: (train: Runoff[]) => Params, nivel: "certo" | "zero"): RacePred[] {
  return years.flatMap((y) => {
    const test = all.filter((r) => r.year === y && pick(r));
    if (!test.length) return [];
    const p = mk(all.filter((r) => r.year !== y && pick(r)));
    return test.map((r) => predictRace(r, p, nivel));
  });
}

if (import.meta.main) {
  const years = [2002, 2006, 2010, 2014, 2018, 2022];
  const all = loadRunoffs(years);
  const count = (c: Cargo) => all.filter((r) => r.cargo === c).length;
  console.log(`${all.length} segundos turnos (${count("Presidente")} de Presidente, ${count("Governador")} de Governador)\n`);
  const proporcional = (train: Runoff[]): Params => ({ kappa: 1, eta: 0, ratio: ratioOf(train) });
  const ajustado = (train: Runoff[]): Params => fitShape(train);
  const out: Record<string, { params: Params; erros: Erros }> = {};

  for (const cargo of ["Presidente", "Governador"] as const) {
    const pick = (r: Runoff) => r.cargo === cargo;
    console.log(`== ${cargo}`);
    const certoProp = score(loyo(all, years, pick, proporcional, "certo"));
    const certoAj = loyo(all, years, pick, ajustado, "certo");
    const zeroAj = loyo(all, years, pick, ajustado, "zero");
    console.log(linha("proporcional (κ=1, η=0), nível certo", certoProp));
    console.log(linha("ajustado, nível certo", score(certoAj)));
    console.log(linha("proporcional sem âncora (α=0)", score(loyo(all, years, pick, proporcional, "zero"))));
    console.log(linha("ajustado sem âncora (α=0)", score(zeroAj)));
    const tam = porTamanho(certoAj);
    console.log(`  erro da cidade por tamanho (votos válidos estimados): ${tam.map((t) => `${t.ate === null ? "acima" : "até " + t.ate}: ${f(t.rmse, 1)}`).join(" · ")}`);
    const p = fitShape(all.filter(pick));
    console.log(`  ajuste com todas as eleições: κ=${p.kappa} η=${p.eta} razão de votos ${p.ratio.toFixed(4)}\n`);
    const s = score(certoAj), z = score(zeroAj);
    out[cargo] = {
      params: p,
      erros: {
        cidade: Math.round(s.rmse * 10) / 10, porTamanho: tam.map((t) => ({ ate: t.ate, rmse: t.rmse })),
        nacionalSemAncora: Math.round(z.erroNacionalAbs * 10) / 10, nacionalSemAncoraRmse: Math.round(z.erroNacionalRmse * 10) / 10,
        acertoVencedor: Math.round(s.acertoVencedor * 10) / 10, erroVotos: Math.round(s.erroVotos * 10) / 10, disputas: s.races, anos: years.filter((y) => all.some((r) => r.year === y && pick(r))),
      },
    };
  }
  writeFileSync("data/municipal-modelo.json", JSON.stringify({ geradoEm: new Date().toISOString(), ...out }, null, 1));
  console.log("gravado data/municipal-modelo.json");
}
