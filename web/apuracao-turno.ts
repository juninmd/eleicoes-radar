// Which round the Apuração and Ao vivo tabs read. Only the President and the governors have a runoff; for every other office the round is
// always the first, whatever was chosen. The choice is kept in the browser (one key for both tabs) and read again each time a tab opens.
import { TEM_SEGUNDO_TURNO } from "./apuracao-tse.js";
import type { Turno } from "./apuracao-tse.js";

const CHAVE = "radar:turno";

// 25/10/2026 00:00 in Brasília (UTC-3, no DST since 2019). From then on the runoff is the round being counted, so it is the default.
const INICIO_2T = Date.UTC(2026, 9, 25, 3);

// No saved choice = nobody clicked yet: follow the calendar, otherwise the tab opens on a finished 1st round on the night of the runoff.
export function lerTurno(agora: Date = new Date()): Turno {
  const padrao: Turno = agora.getTime() >= INICIO_2T ? 2 : 1;
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "1" ? 1 : v === "2" ? 2 : padrao;
  } catch { return padrao; }
}

export function gravarTurno(t: Turno): void {
  try { localStorage.setItem(CHAVE, String(t)); } catch { /* private window: the choice lasts until the tab closes */ }
}

// The selector: two buttons, shown only for the offices that can have a runoff. `data-turno` is read by each tab's own click handler.
export function seletorTurno(cargo: string, turno: Turno): string {
  if (!TEM_SEGUNDO_TURNO.has(cargo)) return "";
  const b = (t: Turno, rot: string) => `<button type="button" data-turno="${t}" aria-pressed="${turno === t}">${rot}</button>`;
  return `<div class="apu-vistas apu-turnos" role="group" aria-label="Turno">${b(1, "1º turno")}${b(2, "2º turno")}</div>
    <span class="muted small apu-turno-datas">1º turno em 04/10 · 2º turno em 25/10</span>`;
}
