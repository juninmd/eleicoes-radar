// A link to what is on screen in the Apuração tab: race, view, round and, in the simulation, the moment of the night. Lives in the
// hash (`#apuracao?c=Presidente&uf=BR&v=mapa&t=2&s=40`), so nothing goes to a server. Real data opens live: the link never freezes numbers.
import type { Turno } from "./apuracao-tse.js";

export interface Visao { cargo: string; uf: string; vista?: string; turno?: Turno; passo?: number }

const CARGOS = new Set(["Presidente", "Governador", "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital"]);

export function codificar(v: Visao): string {
  const q = new URLSearchParams({ c: v.cargo, uf: v.uf });
  if (v.vista) q.set("v", v.vista);
  if (v.turno === 2) q.set("t", "2");
  if (v.passo !== undefined) q.set("s", String(v.passo));
  return `#apuracao?${q}`;
}

// Anything unknown or malformed is dropped (a hand-edited link must not reach the TSE URL builder or the player). `passos`: length of the simulated night.
export function decodificar(hash: string, passos: number): Visao | null {
  const m = /^#apuracao\?(.*)$/.exec(hash);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const cargo = q.get("c") ?? "";
  const uf = q.get("uf") ?? "";
  if (!CARGOS.has(cargo) || !/^[A-Z]{2}$/.test(uf)) return null;
  const v: Visao = { cargo, uf };
  const vista = q.get("v");
  if (vista && /^[a-z]{3,12}$/.test(vista)) v.vista = vista;
  if (q.get("t") === "2") v.turno = 2;
  const s = q.get("s");
  if (s !== null && /^\d{1,3}$/.test(s) && Number(s) < passos) v.passo = Number(s);
  return v;
}
