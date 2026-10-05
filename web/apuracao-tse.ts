// Live results from the TSE results site (resultados.tse.jus.br). The browser reads the files
// directly: the TSE answers CORS for any origin, so there is no proxy and no server-side fetch.
export const TSE_BASE = "https://resultados.tse.jus.br/oficial/ele2026";

const CARGOS = { Presidente: 1, Governador: 3, Senador: 5, "Deputado Federal": 6, "Deputado Estadual": 7, "Deputado Distrital": 8 };
// 1st-round election codes (config/ele-c.json, pleito 3220). The runoff uses 6258 (president) and 6260.
const eleicao = (cargo) => (cargo === 1 ? 6257 : 6259);
const pad = (n, w) => String(n).padStart(w, "0");

// Both parts are validated: the URL is built only from a known office and a two-letter UF.
export function tseUrl(cargo, uf, base = TSE_BASE) {
  const sigla = String(uf).toLowerCase();
  if (!Object.hasOwn(CARGOS, cargo)) throw new Error(`cargo desconhecido: ${cargo}`);
  const cd = CARGOS[cargo];
  if (!/^[a-z]{2}$/.test(sigla)) throw new Error(`UF inválida: ${uf}`);
  return `${base}/${eleicao(cd)}/dados/${sigla}/${sigla}-c${pad(cd, 4)}-e${pad(eleicao(cd), 6)}-u.json`;
}

// The files carry every number as a string, with a decimal comma for percentages.
export function brNumber(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const str = (v) => (v === null || v === undefined ? "" : String(v));
const list = (v) => (Array.isArray(v) ? v : []);

// Share published by the TSE (two decimals) as a 0..1 fraction.
const share = (pvap) => Math.round(brNumber(pvap) * 100) / 1e4;

// Turns a TSE results file into what the view needs. Returns null when the file is not a
// results file, so a changed layout shows a message instead of a broken page.
export function parseApuracao(json) {
  const c = json?.carg?.[0];
  if (!c || typeof c !== "object" || !Array.isArray(c.agr)) return null;
  const { s, e, v } = json;

  const candidatos = c.agr
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
    versao: { data: str(json.dg), hora: str(json.hg) },
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
