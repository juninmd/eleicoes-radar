// Plenary roll-call presence and alignment (own party / government leader).
import type { Row } from "../csv";
import { normalizeName } from "../stats";

export interface VoteStats {
  votou: number;
  possiveis: number;
  alinhadoPartido: number;
  comparaveisPartido: number;
  alinhadoGoverno: number;
  comparaveisGoverno: number;
}

const PARTY_ALIASES: Record<string, string> = { PODEMOS: "PODE" };
const key = (s: string) => {
  const k = normalizeName(s).replace(/ /g, "");
  return PARTY_ALIASES[k] ?? k;
};

// Orientation labels are truncated ("Solidaried", "Fdr PSDB-CIDADAN"); blocs ("Bl ...") are skipped
// because a bloc orientation is not the deputy's own party line.
export function bancadaMatchesParty(bancada: string, party: string): boolean {
  const p = key(party);
  const raw = bancada.trim();
  if (!p || /^bl\b/i.test(raw)) return false;
  const matches = (b: string) => b === p || (b.length >= 4 && p.startsWith(b));
  if (/^fdr\b/i.test(raw)) return raw.slice(3).split("-").some((t) => matches(key(t)));
  return matches(key(raw));
}

export type HistoryEvent = { dataHora: string; situacao: string | null };

// [start, end) ISO intervals in which the deputy was in office ("Exercício").
export function exerciseIntervals(events: HistoryEvent[], until = "9999"): [string, string][] {
  const sorted = [...events].filter((e) => e.situacao).sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const out: [string, string][] = [];
  let start: string | null = null;
  for (const e of sorted) {
    if (e.situacao === "Exercício") start ??= e.dataHora;
    else if (start) {
      out.push([start, e.dataHora]);
      start = null;
    }
  }
  if (start) out.push([start, until]);
  return out;
}

export function computeVotes(
  votacoes: Iterable<Row>,
  votos: Iterable<Row>,
  orientacoes: Iterable<Row>,
  history: Map<number, HistoryEvent[]> = new Map(),
): Map<number, VoteStats> {
  // Nominal plenary votes only: symbolic votes have no individual record.
  const plenDate = new Map<string, string>();
  for (const v of votacoes) {
    const nominal = Number(v.votosSim) + Number(v.votosNao) + Number(v.votosOutros) > 0;
    if (v.siglaOrgao === "PLEN" && nominal) plenDate.set(v.id!, v.dataHoraRegistro || v.data!);
  }
  const orient = new Map<string, { bancada: string; o: string }[]>();
  for (const o of orientacoes) {
    if (!plenDate.has(o.idVotacao!)) continue;
    const list = orient.get(o.idVotacao!) ?? [];
    list.push({ bancada: o.siglaBancada ?? "", o: o.orientacao ?? "" });
    orient.set(o.idVotacao!, list);
  }

  const stats = new Map<number, VoteStats & { first: string; last: string }>();
  for (const v of votos) {
    const date = plenDate.get(v.idVotacao!);
    if (!date) continue;
    const id = Number(v.deputado_id);
    let s = stats.get(id);
    if (!s) {
      s = { votou: 0, possiveis: 0, alinhadoPartido: 0, comparaveisPartido: 0, alinhadoGoverno: 0, comparaveisGoverno: 0, first: date, last: date };
      stats.set(id, s);
    }
    s.votou++;
    if (date < s.first) s.first = date;
    if (date > s.last) s.last = date;

    const voto = v.voto ?? "";
    if (voto !== "Sim" && voto !== "Não") continue;
    for (const { bancada, o } of orient.get(v.idVotacao!) ?? []) {
      if (o !== "Sim" && o !== "Não") continue;
      if (key(bancada) === "GOVERNO") {
        s.comparaveisGoverno++;
        if (o === voto) s.alinhadoGoverno++;
      } else if (bancadaMatchesParty(bancada, v.deputado_siglaPartido ?? "")) {
        s.comparaveisPartido++;
        if (o === voto) s.alinhadoPartido++;
      }
    }
  }

  // Denominator = roll calls held while in office; without history, approximate
  // the tenure by the first..last recorded vote.
  const dates = [...plenDate.values()].sort();
  const out = new Map<number, VoteStats>();
  for (const [id, { first, last, ...s }] of stats) {
    const intervals = exerciseIntervals(history.get(id) ?? []);
    // "~" sorts after every ISO timestamp char, making the fallback end inclusive.
    const windows = intervals.length ? intervals : [[first, `${last}~`] as [string, string]];
    const possiveis = windows.reduce((n, [a, b]) => n + lower(dates, b) - lower(dates, a), 0);
    out.set(id, { ...s, possiveis: Math.max(possiveis, s.votou) });
  }
  return out;
}

function lower(a: string[], v: string) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m]! < v) lo = m + 1; else hi = m; }
  return lo;
}
