// Small, pure helpers shared by the historical loaders (2014, 2018 and 2022 ship the same facts under different layouts).
import type { Row } from "../csv";
import { normalizeName } from "../stats";

// "02/10/2018" and the 2014 accounts' "02/10/201400:00:00" (date and time glued together) both become "2018-10-02".
export function isoDate(s: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// The TSE writes "ELEITO", "ELEITO POR QP" and "ELEITO POR MÉDIA"; "SUPLENTE", "NÃO ELEITO" and "2º TURNO" are not wins.
export const isElected = (sit: string): boolean => /^ELEITO/i.test(sit.trim());

// Seats belong to the list: the coalition (2014, 2018), the federation or the isolated party (2022). SQ_COLIGACAO is
// unique per list and state in all three files, so it is the key; the party number is the fallback when it is missing.
export function listKey(r: Row): string {
  const sq = r.SQ_COLIGACAO ?? "";
  return /^\d+$/.test(sq) ? sq : `P${r.NR_PARTIDO ?? "?"}`;
}

export const cargoKey = (s: string | undefined): string => (s ?? "").toUpperCase().trim();

export const DEPUTIES = new Set(["DEPUTADO FEDERAL", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL"]);
export const MAJORITARIAN = new Set(["PRESIDENTE", "GOVERNADOR", "SENADOR"]);

// A candidate's votes in one file: the 2018/2022 layouts split valid from annulled, 2014 has a single column.
export function nominalVotes(r: Row): number {
  const raw = r.QT_VOTOS_NOMINAIS_VALIDOS ?? r.QT_VOTOS_NOMINAIS ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function legendVotes(r: Row): number {
  const n = Number(r.QT_VOTOS_LEGENDA_VALIDOS ?? r.QT_VOTOS_LEGENDA ?? "0");
  return Number.isFinite(n) ? n : 0;
}

// Same person across elections: civil name + birth date. Never the CPF: it is masked in most older files, and a key
// that switches form between years would silently drop the match.
export function keyOf(nome: string, iso: string | null | undefined): string {
  const n = normalizeName(nome);
  return n && iso ? `${n}|${iso}` : "";
}

export const personKey = (r: Row): string => keyOf(r.NM_CANDIDATO ?? "", isoDate(r.DT_NASCIMENTO ?? ""));
