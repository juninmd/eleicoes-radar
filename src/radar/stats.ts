export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const onlyDigits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

// Percentile rank in [0,1] within the group (ties share the mid rank).
// null values stay null so "no data" never looks like "worst".
export function percentileRanks(values: (number | null)[]): (number | null)[] {
  const present = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = present.length;
  if (n === 0) return values.map(() => null);
  if (n === 1) return values.map((v) => (v === null ? null : 0.5));
  return values.map((v) => {
    if (v === null) return null;
    const lo = bound(present, v, false);
    const hi = bound(present, v, true);
    return (lo + hi - 1) / 2 / (n - 1);
  });
}

// First index whose value is > v (upper) or >= v (lower) in a sorted array.
function bound(sorted: number[], v: number, upper: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (upper ? sorted[mid]! <= v : sorted[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Share of the largest entry in a positive distribution, 0 when empty.
export function topShare(values: Iterable<number>): number {
  let total = 0;
  let max = 0;
  for (const v of values) {
    if (v <= 0) continue;
    total += v;
    if (v > max) max = v;
  }
  return total > 0 ? max / total : 0;
}

export const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;
