// Live results from the TSE results site (resultados.tse.jus.br). The browser reads the files
// directly: the TSE answers CORS for any origin, so there is no proxy and no server-side fetch.
export const TSE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";

const CARGOS = { Presidente: 1, Governador: 3, Senador: 5, "Deputado Federal": 6, "Deputado Estadual": 7, "Deputado Distrital": 8 } as const;
export type Cargo = keyof typeof CARGOS;
// Election codes (config/ele-c.json, pleito 3220): 1st round 6257 (president) and 6259; runoff 6258 and 6260.
export type Turno = 1 | 2;
const eleicao = (cargo: number, turno: Turno = 1) => (turno === 2 ? (cargo === 1 ? 6258 : 6260) : cargo === 1 ? 6257 : 6259);
// Only these offices go to a runoff; the Senate and the deputies are decided in the first round.
export const TEM_SEGUNDO_TURNO: ReadonlySet<string> = new Set(["Presidente", "Governador"]);
export const turnoDe = (cargo: string, turno: Turno): Turno => (TEM_SEGUNDO_TURNO.has(cargo) ? turno : 1);
const pad = (n: number, w: number) => String(n).padStart(w, "0");

// Both parts are validated: the URL is built only from a known office and a two-letter UF.
export function tseUrl(cargo: string, uf: string, base = TSE_BASE, turno: Turno = 1): string {
  const sigla = String(uf).toLowerCase();
  if (!Object.hasOwn(CARGOS, cargo)) throw new Error(`cargo desconhecido: ${cargo}`);
  const cd = CARGOS[cargo as Cargo];
  if (!/^[a-z]{2}$/.test(sigla)) throw new Error(`UF inválida: ${uf}`);
  return `${base}/${eleicao(cd, turno)}/dados/${sigla}/${sigla}-c${pad(cd, 4)}-e${pad(eleicao(cd, turno), 6)}-u.json`;
}

// The files carry every number as a string, with a decimal comma for percentages.
export function brNumber(v: unknown): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

// The raw TSE file, as far as the parser reads it: every field may be missing and every number is a string.
type Raw = string | number | null | undefined;
interface RawCand { sqcand?: Raw; n?: Raw; nmu?: string; nm?: string; vap?: Raw; pvap?: Raw; e?: Raw; st?: Raw; seq?: Raw }
interface RawAgr { com?: string; nm?: string; vag?: Raw; par?: { sg?: string; cand?: RawCand[] }[] }
interface RawFile {
  carg?: { cd?: Raw; nmn?: string; nv?: Raw; qe?: Raw; agr?: RawAgr[] }[];
  s?: { ts?: Raw; st?: Raw };
  e?: { te?: Raw; est?: Raw; c?: Raw; a?: Raw };
  v?: { tv?: Raw; vv?: Raw; vvc?: Raw; vb?: Raw; tvn?: Raw };
  dg?: Raw;
  hg?: Raw;
}

export interface Candidato {
  id: string; num: string; nome: string; partido: string; votos: number; pct: number;
  destaque: boolean; situacao: string; lista: string;
}
export type Fase = "aguardando" | "parcial" | "concluida";
export interface Apuracao {
  versao: { data: string; hora: string };
  cargo: { codigo: string; nome: string; vagas: number };
  fase: Fase;
  secoes: { total: number; totalizadas: number };
  eleitorado: { apto: number; apurado: number; comparecimento: number; abstencao: number };
  votos: { total: number; validos: number; brancos: number; nulos: number };
  quociente: number | null;
  candidatos: Candidato[];
  partidos: { nome: string; vagas: number }[];
}

// Share published by the TSE (two decimals) as a 0..1 fraction.
const share = (pvap: unknown) => Math.round(brNumber(pvap) * 100) / 1e4;

// Turns a TSE results file into what the view needs. Returns null when the file is not a
// results file, so a changed layout shows a message instead of a broken page.
export function parseApuracao(json: unknown): Apuracao | null {
  const file = json as RawFile | null | undefined;
  const c = file?.carg?.[0];
  if (!c || typeof c !== "object" || !Array.isArray(c.agr)) return null;
  const { s, e, v } = file!;

  const candidatos: Candidato[] = c.agr
    .flatMap((a) => list(a.par).flatMap((p) => list(p.cand).map((x) => ({
      id: str(x.sqcand), num: str(x.n), nome: str(x.nmu || x.nm), partido: str(p.sg),
      votos: brNumber(x.vap), pct: share(x.pvap),
      // "e" only highlights the row. What it means ("Eleito", "2º turno"...) is the TSE's own text in "st".
      destaque: str(x.e).toLowerCase() === "s", situacao: str(x.st), seq: brNumber(x.seq),
      // Same key as `partidos`: it ties a candidate to the list that holds the seats.
      lista: str(a.com || a.nm),
    }))))
    .sort((a, b) => b.votos - a.votos || a.seq - b.seq)
    .map(({ seq, ...rest }) => rest);

  const secoes = { total: brNumber(s?.ts), totalizadas: brNumber(s?.st) };
  const votos = {
    total: brNumber(v?.tv),
    validos: brNumber(v?.vv !== undefined && v.vv !== "" ? v.vv : v?.vvc),
    brancos: brNumber(v?.vb),
    nulos: brNumber(v?.tvn),
  };
  const fase = secoes.totalizadas === 0 && votos.total === 0 ? "aguardando" : secoes.total > 0 && secoes.totalizadas >= secoes.total ? "concluida" : "parcial";

  return {
    versao: { data: str(file!.dg), hora: str(file!.hg) },
    cargo: { codigo: str(c.cd), nome: str(c.nmn), vagas: brNumber(c.nv) },
    fase,
    secoes,
    // "apurado" is the electorate of the sections already totalized: the right base for turnout so far.
    eleitorado: { apto: brNumber(e?.te), apurado: brNumber(e?.est), comparecimento: brNumber(e?.c), abstencao: brNumber(e?.a) },
    votos,
    quociente: brNumber(c.qe) > 0 ? brNumber(c.qe) : null,
    candidatos,
    partidos: c.agr.map((a) => ({ nome: str(a.com || a.nm), vagas: brNumber(a.vag) })),
  };
}
