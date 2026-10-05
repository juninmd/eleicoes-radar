// Alliances from the registry text. The TSE writes a coalition as
//   "NAME: PARTY / PARTY / FEDERAÇÃO X (44-A / 11-B) / PARTY"
// and a lone federation as "FEDERAÇÃO: FEDERAÇÃO X (45-A / 23-B)". A party running alone has no text.
import { displayName } from "./format.js";

// The few fields of a candidacy this module reads; a full Candidatura fits.
export interface AlCand {
  id: string; cargo: string; partido: string; nome: string; urna?: string | null;
  ficha?: { coligacao?: string | null; federacao?: string | null } | null;
}
interface Federacao { nome: string; partidos: string[] }
export interface Coligacao { nome: string | null; partidos: string[]; federacoes: Federacao[] }
interface Alianca { key: string; nome: string | null; tipo: "coligacao" | "federacao"; partidos: string[]; federacoes: Federacao[] }
export interface Lista extends Alianca { candidatos: { id: string; nome: string; partido: string }[] }
export interface Aresta { a: string; b: string; w: number; kind: "coligacao" | "federacao" }
export interface Grafo {
  nodes: { id: string; label: string; n: number }[];
  links: Aresta[];
  listas: Lista[];
  solos: { partido: string; n: number }[];
}

export const MAJORITARIAN = new Set(["Presidente", "Governador", "Senador"]);
const code = (s: string) => s.replace(/^\d+\s*-\s*/, "").trim();
// "PC do B", "PCdoB" and "PCDOB" are one party.
export const canon = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const noFed = (s: unknown) => String(s).replace(/^FEDERA[ÇC][ÃA]O\s+/i, "");
const PARTICLES = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "PARA", "POR", "COM"]);
// Title case that keeps party acronyms ("PSDB CIDADANIA" -> "PSDB Cidadania", "UNIÃO" -> "União").
const nice = (s: unknown, known: Set<string>) => String(s).split(/\s+/).map((w, i) => (known.has(canon(w)) && /^[A-Z]{2,5}$/.test(w) ? w : i && PARTICLES.has(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");

// A federation is registered as "NAME - ACRONYM": the acronym keeps its capitals ("FE BRASIL", not "Fe Brasil").
const niceFed = (s: unknown, known: Set<string>) => { const [nome, ...sigla] = String(s).split(" - "); return `Federação ${[nice(nome, known), ...sigla].join(" - ")}`; };

// Split on "/" outside parentheses, so a federation keeps its members together.
function splitTop(body: string) {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "/" && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseColigacao(raw: unknown): Coligacao | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const i = text.lastIndexOf(": "); // a coalition name may itself contain ": "; no party token does
  const nome = i > 0 ? text.slice(0, i).trim() : null;
  const partidos: string[] = [], federacoes: Federacao[] = [];
  for (const tok of splitTop(i > 0 ? text.slice(i + 2) : text)) {
    const m = tok.match(/^FEDERA[ÇC][ÃA]O\s+(.+?)\s*\((.+)\)$/i);
    if (m) {
      const membros = splitTop(m[2]).map(code);
      federacoes.push({ nome: m[1], partidos: membros });
      partidos.push(...membros);
    } else partidos.push(code(tok));
  }
  return { nome: nome && canon(nome) !== "FEDERACAO" ? nome : null, partidos: [...new Set(partidos)], federacoes };
}

// What alliance a candidacy belongs to, if any: coalitions for majoritarian races, the
// federation for deputies (proportional coalitions no longer exist).
function aliancaDe(c: AlCand): Alianca | null {
  if (MAJORITARIAN.has(c.cargo)) {
    const col = parseColigacao(c.ficha?.coligacao);
    if (!col) return null;
    return { key: [...col.partidos].map(canon).sort().join("|"), nome: col.nome, tipo: col.nome || !col.federacoes.length ? "coligacao" : "federacao", partidos: col.partidos, federacoes: col.federacoes };
  }
  const fed = c.ficha?.federacao;
  return fed ? { key: `fed:${fed}`, nome: noFed(fed), tipo: "federacao", partidos: [c.partido], federacoes: [] } : null;
}

const pairs = <T>(xs: T[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b]));

// cands: candidacies of ONE cargo. all: every candidacy loaded (sizes the parties).
export function grafoAliancas(cands: AlCand[], all: AlCand[]): Grafo {
  const sigla = new Map<string, string>(all.map((c) => [canon(c.partido), c.partido]));
  const nome = (p: string) => sigla.get(canon(p)) ?? p;
  const known = new Set(sigla.keys());
  const listas = new Map<string, Lista>(), solos = new Map<string, number>();
  for (const c of cands) {
    const a = aliancaDe(c);
    if (!a) { solos.set(c.partido, (solos.get(c.partido) ?? 0) + 1); continue; }
    const l = listas.get(a.key) ?? listas.set(a.key, { ...a, partidos: [], candidatos: [] }).get(a.key)!;
    for (const p of a.partidos.map(nome)) if (!l.partidos.some((x) => canon(x) === canon(p))) l.partidos.push(p);
    l.candidatos.push({ id: c.id, nome: displayName(c), partido: c.partido });
  }
  const lists = [...listas.values()].map((l) => ({
    ...l,
    nome: l.nome && (l.tipo === "federacao" ? niceFed(l.nome, known) : nice(l.nome, known)),
    federacoes: (l.tipo === "federacao" && !l.federacoes.length ? [{ nome: l.nome, partidos: l.partidos }] : l.federacoes).map((f) => ({ nome: niceFed(f.nome, known), partidos: f.partidos.map(nome) })),
  }));
  const edges = new Map<string, Aresta>();
  const link = (a: string, b: string, w: number, kind: Aresta["kind"]) => {
    const key = [canon(a), canon(b)].sort().join("|");
    if (!edges.has(key) || w > edges.get(key)!.w) edges.set(key, { a: canon(a), b: canon(b), w, kind });
  };
  for (const l of lists) {
    for (const [a, b] of pairs(l.partidos)) link(a, b, 1, "coligacao");
    for (const f of l.federacoes) for (const [a, b] of pairs(f.partidos)) link(a, b, 2, "federacao");
  }
  const size = new Map<string, number>();
  for (const c of all) size.set(canon(c.partido), (size.get(canon(c.partido)) ?? 0) + 1);
  const inList = new Map<string, string>(lists.flatMap((l) => l.partidos).map((p) => [canon(p), nome(p)]));
  return {
    nodes: [...inList].map(([id, label]) => ({ id, label, n: size.get(id) ?? 0 })),
    links: [...edges.values()],
    listas: lists,
    solos: [...solos].filter(([p]) => !inList.has(canon(p))).map(([p, n]) => ({ partido: nome(p), n })).sort((a, b) => b.n - a.n),
  };
}
