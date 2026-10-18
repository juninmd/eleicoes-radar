// Official channels each candidate declared to the TSE (rede_social_candidato). Links are
// rendered as-is in the page, so only https links of known social hosts survive; WhatsApp
// (phone numbers, group invites) and arbitrary sites are dropped on purpose.
import { existsSync } from "node:fs";
import { forEachZipRow } from "../zip-csv";

const ZIP = "data/tse/rede_social_candidato_2026.zip";
const MAX_POR_CANDIDATO = 10;

export type Rede = "instagram" | "facebook" | "x" | "tiktok" | "youtube" | "kwai" | "threads" | "linkedin" | "telegram" | "linktree";
export interface Canal {
  r: Rede;
  u: string;
  c?: 1; // listed only by the Câmara, not declared to the TSE
}

const HOSTS: Record<string, Rede> = {
  "instagram.com": "instagram", "instagr.am": "instagram",
  "facebook.com": "facebook", "fb.com": "facebook", "fb.me": "facebook", "fb.watch": "facebook",
  "x.com": "x", "twitter.com": "x",
  "tiktok.com": "tiktok",
  "youtube.com": "youtube", "youtu.be": "youtube",
  "kwai.com": "kwai", "k.kwai.com": "kwai",
  "threads.net": "threads", "threads.com": "threads",
  "linkedin.com": "linkedin",
  "t.me": "telegram", "telegram.me": "telegram",
  "linktr.ee": "linktree",
};

// Query strings are tracking noise except where they identify the page.
function keepQuery(rede: Rede, path: string, params: URLSearchParams): string {
  const key = rede === "facebook" && path === "/profile.php" ? "id" : rede === "youtube" && path === "/watch" ? "v" : null;
  const v = key && params.get(key);
  return v ? `?${key}=${encodeURIComponent(v)}` : "";
}

export function canalDe(raw: string): Canal | null {
  const t = raw.replace(/[​-‍﻿]/g, "").trim();
  if (!t || /\s/.test(t)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile|pt-br)\./, "");
  const rede = Object.hasOwn(HOSTS, host) ? HOSTS[host] : undefined; // a plain lookup would accept "constructor"
  if (!rede) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (!path) return null; // bare host says nothing about the candidate
  // A handle made only of 10-13 digits is a phone number (no platform issues such usernames).
  if (/^\/@?\d{10,13}(\/|$)/.test(path)) return null;
  // Group invites and phone-number links identify people the page must not expose.
  if (rede === "telegram" && /^\/(\+|joinchat)/i.test(path)) return null;
  return { r: rede, u: `https://${host === "twitter.com" ? "x.com" : host}${path}${keepQuery(rede, path, url.searchParams)}` };
}

// Handles are case-insensitive; YouTube ids and query values are not.
const keyOf = (c: Canal) => (c.r === "youtube" ? c.u : c.u.toLowerCase());
const sameChannel = (a: Canal, b: Canal) => a.r === b.r && keyOf(a) === keyOf(b);

// Merges lists in priority order, one entry per channel.
export function mergeCanais(...lists: (readonly Canal[] | undefined)[]): Canal[] {
  const out: Canal[] = [];
  for (const l of lists) for (const c of l ?? []) if (!out.some((o) => sameChannel(o, c))) out.push(c);
  return out.slice(0, MAX_POR_CANDIDATO);
}

export async function loadRedes(zip = ZIP): Promise<Map<string, Canal[]>> {
  const out = new Map<string, Canal[]>();
  if (!existsSync(zip)) return out;
  await forEachZipRow(zip, "rede_social_candidato_2026_BRASIL.csv", (r) => {
    const c = r.SQ_CANDIDATO && canalDe(r.DS_URL ?? "");
    if (c) out.set(r.SQ_CANDIDATO!, mergeCanais(out.get(r.SQ_CANDIDATO!), [c]));
  });
  return out;
}
