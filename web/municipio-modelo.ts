// Runoff estimate per municipality, from the first round of the same election. Pure arithmetic, no files: the browser imports
// this same file (web/apuracao-municipios.ts), the backtest and the build import it from here too, so the page and the numbers
// quoted about its accuracy come from one formula. (It lives under web/ because only web/ goes into the image.)
//
// A and B are the two finalists. In a city the first round gave them a and b valid votes and everyone else o. With
//   lean  = logit of A's share of the votes of A and B (a / (a + b)),
//   so    = the share of the city's valid votes that went to other candidates (o / (a + b + o)),
// the share of A among the valid votes of the runoff is
//   logistic(alpha + (kappa + eta * so) * lean).
// kappa < 1 and eta < 0 say what the 2002-2022 runoffs show: a city keeps most of its first-round lean between the two finalists, and
// less of it the more voters had chosen someone else. `alpha` is the one number that belongs to this election (which way the
// eliminated voters leaned as a whole). It is never guessed here: the caller gives the share of A it wants for the race (a poll, or
// the reader's own scenario) and `solveAlpha` finds the alpha that produces it. With alpha = 0 the model has no outside
// information. No party is classified left or right: nothing of the past is carried besides kappa, eta and the vote ratio.

export interface City { a: number; b: number; o: number }
export interface Params { kappa: number; eta: number; ratio: number } // ratio: valid votes of the runoff / valid votes of the first round

const EPS = 0.5; // half a vote: keeps the logit finite for a city where one finalist had none
export const logit = (p: number) => Math.log(p / (1 - p));
export const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const firstRoundVotes = (c: City) => c.a + c.b + c.o;
export const leanOf = (c: City) => logit((c.a + EPS) / (c.a + c.b + 2 * EPS));
export const othersShare = (c: City) => { const t = firstRoundVotes(c); return t > 0 ? c.o / t : 0; };

// Share of A among the valid votes of the runoff in one city.
export function cityShare(c: City, alpha: number, { kappa, eta }: Params): number {
  return logistic(alpha + (kappa + eta * othersShare(c)) * leanOf(c));
}

// Vote-weighted share of A over a set of cities (weights = their runoff valid votes, all proportional to first-round votes).
export function raceShare(cities: readonly City[], alpha: number, p: Params): number {
  let num = 0, den = 0;
  for (const c of cities) {
    const w = firstRoundVotes(c);
    num += w * cityShare(c, alpha, p);
    den += w;
  }
  return den > 0 ? num / den : 0.5;
}

export const ALPHA_MAX = 6;

// The alpha whose race-wide share of A equals `target`. raceShare grows with alpha, so bisection is enough. A target the model
// cannot reach (outside what alpha = ±ALPHA_MAX allows) is pinned to the nearest reachable one; `limitado` says so.
export function solveAlpha(cities: readonly City[], target: number, p: Params): { alpha: number; limitado: boolean } {
  const lo0 = raceShare(cities, -ALPHA_MAX, p), hi0 = raceShare(cities, ALPHA_MAX, p);
  if (target <= lo0) return { alpha: -ALPHA_MAX, limitado: target < lo0 - 1e-9 };
  if (target >= hi0) return { alpha: ALPHA_MAX, limitado: target > hi0 + 1e-9 };
  let lo = -ALPHA_MAX, hi = ALPHA_MAX;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (raceShare(cities, mid, p) < target) lo = mid; else hi = mid;
  }
  return { alpha: (lo + hi) / 2, limitado: false };
}

export interface CityEstimate { shareA: number; votesA: number; votesB: number; votes: number }

export function estimate(cities: readonly City[], alpha: number, p: Params): CityEstimate[] {
  return cities.map((c) => {
    const votes = firstRoundVotes(c) * p.ratio;
    const shareA = cityShare(c, alpha, p);
    return { shareA, votesA: votes * shareA, votesB: votes * (1 - shareA), votes };
  });
}

// A runoff is never decided by more than 95% of the valid votes: the range the scenario accepts.
export const alvoValido = (x: number) => clamp(x, 0.05, 0.95);
