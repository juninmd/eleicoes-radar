// Career history, birthplace and a Commons photo from Wikidata for national/state-level
// candidates. Matching is strict: a hit is used only when it is a Brazilian human whose
// name agrees with the TSE civil name and no other hit also agrees.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeName } from "../stats";
import type { Rede } from "../enrich/redes";

const API = "https://www.wikidata.org/w/api.php";
const CACHE = "data/wikidata";
// Wikimedia asks for a descriptive UA; no personal contact data is sent.
export const UA = "eleicoes-radar/0.1 (open-data research tool)";
const SUFFIX = new Set(["NETO", "FILHO", "JUNIOR", "SOBRINHO", "SEGUNDO"]);

export interface Position {
  cargo: string;
  inicio: string | null;
  fim: string | null;
}
export interface Seguidores {
  rede: Rede;
  n: number;
  em: string; // date the count was recorded (YYYY-MM-DD): counts go stale, the page shows it
}
export interface WikiProfile {
  qid: string;
  nascimento: string | null;
  naturalidade: string | null;
  cargos: Position[];
  imagem: string | null; // Commons file name
  seguidores: Seguidores[];
}

type Entity = { id: string; labels?: Record<string, { value: string }>; aliases?: Record<string, { value: string }[]>; claims?: Record<string, any[]> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cached<T>(key: string, url: string): Promise<T> {
  const file = `${CACHE}/${key.replace(/[^\w-]/g, "_")}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  let res: Response;
  // Honour the API's rate limit (429/503 + Retry-After) instead of hammering it.
  for (let attempt = 0; ; attempt++) {
    await sleep(1000);
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
    if ((res.status !== 429 && res.status !== 503) || attempt >= 5) break;
    await sleep(Number(res.headers.get("retry-after") ?? 10) * 1000);
  }
  if (!res.ok) throw new Error(`[wikidata] ${res.status} ${url}`);
  const json = await res.json();
  writeFileSync(file, JSON.stringify(json));
  return json as T;
}

const core = (tokens: string[]) => tokens.filter((t, i) => !(i > 0 && SUFFIX.has(t)));

// Exact match on any name field, or same first and last name (ignoring Neto/Filho…),
// which covers "RONALDO RAMOS CAIADO" vs "Ronaldo Caiado".
export function namesAgree(civil: string, names: string[]): "exact" | "loose" | null {
  const c = core(normalizeName(civil).split(" "));
  let loose = false;
  for (const n of names) {
    const t = core(normalizeName(n).split(" "));
    if (t.join(" ") === c.join(" ")) return "exact";
    if (t.length >= 2 && t[0] === c[0] && t.at(-1) === c.at(-1)) loose = true;
  }
  return loose ? "loose" : null;
}

// A loose name match is only trusted for someone Wikidata records as a politician.
const isPolitician = (e: Entity) => claimIds(e, "P106").includes("Q82955") || (e.claims?.P39?.length ?? 0) > 0;

const claimIds = (e: Entity, p: string): string[] => (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const claimTime = (c: any, p: string): string | null => c?.qualifiers?.[p]?.[0]?.datavalue?.value?.time?.slice(1, 11) ?? null;

function names(e: Entity): string[] {
  const out = Object.values(e.labels ?? {}).map((l) => l.value);
  for (const list of Object.values(e.aliases ?? {})) for (const a of list) out.push(a.value);
  for (const c of e.claims?.P1477 ?? []) if (c.mainsnak?.datavalue?.value?.text) out.push(c.mainsnak.datavalue.value.text);
  return out;
}

const isBrazilianHuman = (e: Entity) => claimIds(e, "P31").includes("Q5") && claimIds(e, "P27").includes("Q155");

async function entities(ids: string[], props: string): Promise<Record<string, Entity>> {
  const out: Record<string, Entity> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = `${API}?action=wbgetentities&ids=${batch.join("|")}&props=${props}&languages=pt|pt-br|en&format=json`;
    const json = await cached<{ entities: Record<string, Entity> }>(`ent-${props}-${batch.join("-").slice(0, 120)}-${batch.length}`, url);
    Object.assign(out, json.entities);
  }
  return out;
}

export async function findPerson(civilName: string): Promise<Entity | null> {
  const url = `${API}?action=wbsearchentities&search=${encodeURIComponent(civilName)}&language=pt&uselang=pt&type=item&limit=7&format=json`;
  let hits = (await cached<{ search: { id: string }[] }>(`search-${normalizeName(civilName)}`, url)).search ?? [];
  if (hits.length === 0) {
    // Civil names often miss the item; retry with first + last name.
    const t = core(normalizeName(civilName).split(" "));
    if (t.length > 2) {
      const short = `${t[0]} ${t.at(-1)}`;
      hits = (await cached<{ search: { id: string }[] }>(`search-${short}`, `${API}?action=wbsearchentities&search=${encodeURIComponent(short)}&language=pt&uselang=pt&type=item&limit=7&format=json`)).search ?? [];
    }
  }
  if (hits.length === 0) return null;
  const ents = await entities(hits.map((h) => h.id), "labels|aliases|claims");
  const ok = Object.values(ents).filter((e) => {
    const m = isBrazilianHuman(e) ? namesAgree(civilName, names(e)) : null;
    return m === "exact" || (m === "loose" && isPolitician(e));
  });
  return ok.length === 1 ? ok[0]! : null;
}

// P8687 (social media followers) names the platform only through a qualifier holding the
// account id: YouTube channel, X user, Instagram and Facebook numeric ids.
const FOLLOWER_QUALIFIER: Record<string, Rede> = { P2397: "youtube", P6552: "x", P12546: "instagram", P11705: "facebook" };

// Latest recorded count per platform; undated or non-positive counts are ignored.
export function seguidoresDe(e: Entity): Seguidores[] {
  const best = new Map<Rede, Seguidores>();
  for (const c of e.claims?.P8687 ?? []) {
    const rede = Object.entries(FOLLOWER_QUALIFIER).find(([q]) => c.qualifiers?.[q])?.[1];
    const em = claimTime(c, "P585");
    const n = Number(c.mainsnak?.datavalue?.value?.amount);
    if (!rede || !em || !(n > 0) || c.rank === "deprecated") continue;
    if (!best.has(rede) || em > best.get(rede)!.em) best.set(rede, { rede, n, em });
  }
  return [...best.values()];
}

export async function toProfile(e: Entity): Promise<WikiProfile> {
  const positions = e.claims?.P39 ?? [];
  const birthplace = claimIds(e, "P19");
  const labelIds = [...new Set([...positions.map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean), ...birthplace])];
  const labels = labelIds.length ? await entities(labelIds, "labels") : {};
  const label = (id: string) => labels[id]?.labels?.pt?.value ?? labels[id]?.labels?.["pt-br"]?.value ?? labels[id]?.labels?.en?.value ?? null;

  const cargos = positions
    .map((c) => ({ id: c.mainsnak?.datavalue?.value?.id, c }))
    .filter((x) => x.id && label(x.id))
    .map(({ id, c }) => ({ cargo: label(id)!, inicio: claimTime(c, "P580"), fim: claimTime(c, "P582") }))
    .sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""));
  const born = e.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time?.slice(1, 11) ?? null;
  return {
    qid: e.id,
    nascimento: born,
    naturalidade: birthplace[0] ? label(birthplace[0]) : null,
    cargos,
    imagem: e.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null,
    seguidores: seguidoresDe(e),
  };
}
