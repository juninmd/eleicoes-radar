// Poll tables from pt.wikipedia: one presidential page plus one page per UF. Pages are
// cached per day (polls change daily) under data/polls/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { UA } from "../profiles/wikidata";

const API = "https://pt.wikipedia.org/w/api.php";
const CACHE = "data/polls";

export const PRESIDENTIAL = "Pesquisas de opinião para a eleição presidencial no Brasil em 2026";

const UF_PAGE: Record<string, string> = {
  AC: "no Acre", AL: "em Alagoas", AP: "no Amapá", AM: "no Amazonas", BA: "na Bahia", CE: "no Ceará",
  ES: "no Espírito Santo", GO: "em Goiás", MA: "no Maranhão", MT: "em Mato Grosso", MS: "em Mato Grosso do Sul",
  MG: "em Minas Gerais", PA: "no Pará", PB: "na Paraíba", PR: "no Paraná", PE: "em Pernambuco", PI: "no Piauí",
  RJ: "no Rio de Janeiro", RN: "no Rio Grande do Norte", RS: "no Rio Grande do Sul", RO: "em Rondônia",
  RR: "em Roraima", SC: "em Santa Catarina", SP: "em São Paulo", SE: "em Sergipe", TO: "no Tocantins",
};

export const statePage = (uf: string) =>
  uf === "DF"
    ? "Pesquisas eleitorais para a eleição distrital de 2026 no Distrito Federal"
    : `Pesquisas eleitorais para a eleição estadual de 2026 ${UF_PAGE[uf]}`;

export const pageUrl = (title: string) => `https://pt.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

export interface Page {
  title: string;
  revid: number;
  html: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchPage(title: string, day: string, force = false): Promise<Page | null> {
  const file = `${CACHE}/${day}-${title.replace(/[^\w-]/g, "_").slice(0, 120)}.json`;
  if (!force && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  const url = `${API}?${new URLSearchParams({ action: "parse", page: title, prop: "text|revid", format: "json", formatversion: "2", redirects: "1" })}`;
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    await sleep(1000);
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
    if ((res.status !== 429 && res.status !== 503) || attempt >= 5) break;
    await sleep(Number(res.headers.get("retry-after") ?? 10) * 1000);
  }
  if (!res.ok) throw new Error(`[pesquisas] ${res.status} ${title}`);
  const json: any = await res.json();
  if (json.error) {
    console.warn(`[pesquisas] ${title}: ${json.error.info}`);
    return null;
  }
  const page: Page = { title: json.parse.title, revid: json.parse.revid, html: json.parse.text };
  writeFileSync(file, JSON.stringify(page));
  return page;
}
