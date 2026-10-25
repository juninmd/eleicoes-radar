// "Rodar disputas" in the fullscreen panel: the races of the reader's ballot that have one clear leader, one after the other, for a screen
// left on across the room. Only the president, the governor and the senators of the reader's state: the deputies' lists have no duel to show.
import type { Cargo } from "./apuracao-tse.js";

export interface Disputa { cargo: Cargo; uf: string }
export const GIRO_MS = 20_000;

export const disputasDoGiro = (ufEleitor: string): Disputa[] => [
  { cargo: "Presidente", uf: "BR" },
  { cargo: "Governador", uf: ufEleitor },
  { cargo: "Senador", uf: ufEleitor },
];

// The one after `atual`, wrapping around; the first when `atual` is not in the list.
export function proxima(lista: Disputa[], atual: Disputa): Disputa {
  const i = lista.findIndex((d) => d.cargo === atual.cargo && d.uf === atual.uf);
  return lista[(i + 1) % lista.length];
}
