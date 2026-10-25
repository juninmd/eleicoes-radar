// The candidate deep link, #cand=<SQ>&uf=<UF>. Pure: a hash typed by hand must never throw.
export interface CandLink { id: string; uf?: string }

const LINK = /^#cand=(\d{1,20})(?:&uf=([A-Za-z]{2}))?$/;

export function parseCandLink(hash: string): CandLink | null {
  const m = LINK.exec(hash);
  if (!m) return null;
  // BR is the national list, always loaded with every UF: as a state it would load twice.
  const uf = m[2]?.toUpperCase();
  return uf && uf !== "BR" ? { id: m[1], uf } : { id: m[1] };
}

export const candHash = (id: string, uf: string) => `#cand=${encodeURIComponent(id)}&uf=${uf}`;

export const isCandHash = (hash: string) => hash.startsWith("#cand=");
