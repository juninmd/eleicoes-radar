// Count vs poll average. Both are a share of valid votes (the poll average is normalized to the
// candidates' total, like the TSE percentage), so the difference is a fair subtraction.
import { pp } from "./prev.js";

const MIN_MEDIA = 0.03; // below this the 90% band is so narrow that noise alone puts the count outside it

export function comparar(c, prev) {
  if (!prev || prev.fonte !== "pesquisas" || typeof prev.media !== "number") return null;
  const band = Number.isFinite(prev.lo) && Number.isFinite(prev.hi);
  return { media: prev.media, lo: prev.lo, hi: prev.hi, diff: c.pct - prev.media, dentro: band ? c.pct >= prev.lo && c.pct <= prev.hi : null };
}

// Neutral on purpose: being above or below the polls is not good or bad, so no green or red.
export function delta(diff) {
  if (Math.abs(diff) < 0.0005) return { seta: "▬", txt: "0,0 p.p.", sr: "igual à média das pesquisas" };
  const up = diff > 0;
  return { seta: up ? "▲" : "▼", txt: `${pp(diff)} p.p.`, sr: `${pp(diff)} pontos percentuais ${up ? "acima" : "abaixo"} da média das pesquisas` };
}

export function resumoFaixa(cmps) {
  const rel = cmps.filter((x) => x.media >= MIN_MEDIA && x.dentro !== null);
  return rel.length ? { dentro: rel.filter((x) => x.dentro).length, total: rel.length } : null;
}
