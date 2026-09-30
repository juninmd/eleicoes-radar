// Keyless enrichment: Câmara deputy detail (committees, fronts, speeches, public contacts),
// Senate committees and the pt.wikipedia lead paragraph. All responses cached on disk.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { UA } from "./wikidata";

const CACHE = "data/extra";
const CAMARA = "https://dadosabertos.camara.leg.br/api/v2";
const SENADO = "https://legis.senado.leg.br/dadosabertos/senador";

export interface Atuacao {
  comissoes: { sigla: string; nome: string; titulo: string }[];
  frentes: number;
  frentesDestaque: string[];
  discursos: number | null;
}
export interface Extra {
  escolaridade: string | null;
  redes: string[];
  site: string | null;
  atuacao: Atuacao | null;
  resumo: { texto: string; url: string } | null;
}

async function getJson(key: string, url: string, headers: Record<string, string> = {}): Promise<{ json: any; total: number | null }> {
  const file = `${CACHE}/${key}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  let res: Response;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(60_000) });
    if (res.status !== 429 || attempt === 4) break;
    await Bun.sleep(Number(res.headers.get("retry-after") || 0) * 1000 || 2000 * attempt); // polite backoff on rate limit
  }
  if (!res.ok) throw new Error(`[extra] ${res.status} ${url}`);
  const total = Number(res.headers.get("x-total-count")) || null;
  const out = { json: await res.json(), total };
  writeFileSync(file, JSON.stringify(out));
  return out;
}

// Only well-known social hosts over https: the links are rendered as-is in the page.
const SOCIAL = /^https:\/\/(www\.)?(twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|kwai\.com|threads\.net)\//i;
export const safeLinks = (urls: unknown): string[] =>
  (Array.isArray(urls) ? urls : []).map((u) => String(u).trim().replace(/^http:/i, "https:")).filter((u) => SOCIAL.test(u)).slice(0, 6);
const safeSite = (u: unknown) => (typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u.trim()) ? u.trim().replace(/^http:/i, "https:") : null);

const LEGISLATURE_START = "2023-02-01";
const asList = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export async function camaraExtra(id: number): Promise<Partial<Extra>> {
  const det = (await getJson(`camara-${id}`, `${CAMARA}/deputados/${id}`)).json.dados ?? {};
  const orgaos: any[] = (await getJson(`camara-${id}-orgaos`, `${CAMARA}/deputados/${id}/orgaos?itens=100&dataInicio=${LEGISLATURE_START}`)).json.dados ?? [];
  const frentes: any[] = (await getJson(`camara-${id}-frentes`, `${CAMARA}/deputados/${id}/frentes`)).json.dados ?? [];
  const disc = await getJson(`camara-${id}-discursos`, `${CAMARA}/deputados/${id}/discursos?itens=1&dataInicio=${LEGISLATURE_START}`);
  const seen = new Map<string, { sigla: string; nome: string; titulo: string }>();
  for (const o of orgaos) {
    if (o.dataFim && o.dataFim.slice(0, 10) < LEGISLATURE_START) continue;
    if (!/^(Comiss|CPI|CPMI)/i.test(o.nomeOrgao ?? "")) continue;
    const k = o.siglaOrgao;
    const prev = seen.get(k);
    // Keep the most senior title held (Presidente > Vice > Titular > Suplente).
    if (!prev || rank(o.titulo) < rank(prev.titulo)) seen.set(k, { sigla: k, nome: o.nomeOrgao, titulo: o.titulo });
  }
  return {
    escolaridade: det.escolaridade ?? null,
    redes: safeLinks(det.redeSocial),
    site: safeSite(det.urlWebsite),
    atuacao: {
      comissoes: [...seen.values()].sort((a, b) => rank(a.titulo) - rank(b.titulo)).slice(0, 12),
      frentes: frentes.length,
      frentesDestaque: frentes.slice(0, 5).map((f) => String(f.titulo).replace(/\s+/g, " ").trim()),
      discursos: disc.total,
    },
  };
}

const ORDER = ["presidente", "primeiro", "segundo", "terceiro", "vice", "titular", "suplente"];
const rank = (t: string) => {
  const i = ORDER.findIndex((x) => (t ?? "").toLowerCase().startsWith(x));
  return i < 0 ? ORDER.length : i;
};

export async function senadoExtra(codigo: string): Promise<Partial<Extra>> {
  const com = asList((await getJson(`senado-${codigo}-comissoes`, `${SENADO}/${codigo}/comissoes`)).json.MembroComissaoParlamentar?.Parlamentar?.MembroComissoes?.Comissao);
  const seen = new Map<string, { sigla: string; nome: string; titulo: string }>();
  for (const c of com) {
    if (c.DataFim && c.DataFim < LEGISLATURE_START) continue;
    const id = c.IdentificacaoComissao;
    if (!seen.has(id.SiglaComissao)) seen.set(id.SiglaComissao, { sigla: id.SiglaComissao, nome: id.NomeComissao, titulo: c.DescricaoParticipacao });
  }
  return { atuacao: { comissoes: [...seen.values()].slice(0, 12), frentes: 0, frentesDestaque: [], discursos: null } };
}

// Lead paragraph of the person's pt.wikipedia article, found through the Wikidata sitelink
// (already name-validated), so a namesake page can never be attached.
export async function wikipediaResumo(qid: string): Promise<Extra["resumo"]> {
  const ent = (await getJson(`wiki-${qid}`, `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=ptwiki&format=json`)).json.entities?.[qid];
  const title = ent?.sitelinks?.ptwiki?.title;
  if (!title) return null;
  const s = (await getJson(`wikisum-${qid}`, `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`)).json;
  if (s.type !== "standard" || !s.extract || s.wikibase_item !== qid) return null;
  return { texto: String(s.extract).slice(0, 900), url: s.content_urls?.desktop?.page ?? `https://pt.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}
