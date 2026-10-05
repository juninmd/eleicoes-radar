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
