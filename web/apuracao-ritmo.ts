// How fresh the TSE's files are. The count does not arrive at a steady pace: on count night the TSE went 18, 30 and 50
// minutes without publishing some files while others kept moving. Saying so beats a screen that looks frozen for no reason.
import type { Versionado } from "./apuracao-feed.js";

// The date and time inside a file are Brasília time (UTC-3; no daylight saving since 2019), not the browser's zone.
export function epochDe(d: Versionado): number {
  const dia = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d?.versao?.data ?? "");
  const hora = /^(\d{2}):(\d{2}):(\d{2})$/.exec(d?.versao?.hora ?? "");
  return dia && hora ? Date.UTC(Number(dia[3]), Number(dia[2]) - 1, Number(dia[1]), Number(hora[1]) + 3, Number(hora[2]), Number(hora[3])) : NaN;
}

export function idadeTxt(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "há segundos";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

// The newest file among the ones given. "parado": nothing newer than the limit (default 10 min, longer than the usual gap).
export function pausaDoTse(arquivos: Versionado[], agora: Date, limiteMs = 10 * 60_000) {
  const epochs = arquivos.map(epochDe).filter(Number.isFinite);
  if (!epochs.length) return null;
  const ultima = new Date(Math.max(...epochs));
  const idadeMs = agora.getTime() - ultima.getTime();
  return { ultima, idadeMs, parado: idadeMs > limiteMs };
}

export const POLL_RAPIDO_MS = 30_000;
export const POLL_LENTO_MS = 120_000;

// How long to wait before asking the TSE again. The count has a rhythm: the last stretch (90% of the sections or more) is where leads
// settle, so it is asked twice as often (the TSE's own cache is 20 to 45 s, so faster would only repeat answers); a finished count, or a
// file that has not moved for 10 minutes, changes rarely, so it is asked half as often. Anything unknown keeps the base.
export function intervaloDe(d: { fase?: string; secoes?: { totalizadas: number; total: number } } & Versionado | null | undefined, agora: Date, base: number): number {
  if (!d) return base;
  if (d.fase === "concluida") return POLL_LENTO_MS;
  if (d.fase !== "parcial") return base;
  const idade = agora.getTime() - epochDe(d);
  if (idade > 10 * 60_000) return POLL_LENTO_MS;
  const s = d.secoes;
  return s && s.total > 0 && s.totalizadas / s.total >= 0.9 ? POLL_RAPIDO_MS : base;
}
