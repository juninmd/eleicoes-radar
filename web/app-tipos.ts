// Types of the page state, apart from app.ts to keep it short.
import type { AgendaConfig } from "../src/radar/camara/agenda";
import type { Rede } from "../src/radar/suppliers/graph";
import type { Cola } from "./cola.js";
import type { Expectativa } from "./expectativa.js";
import type { Panorama } from "./panorama.js";
import type { Weights } from "./score.js";
import type { Candidatura } from "./types.js";

// What avatar() reads: a candidacy, or a pick on the cola (which carries its own photo).
export interface AvatarSrc { id: string; nome: string; urna?: string | null; foto?: string | null }

export interface Meta { geradoEm: string; retratoTse: string; total: number; comMandato: number; ufs: { uf: string; n: number }[] }

export interface AppState {
  uf: string;
  ballot: number;
  weights: Required<Weights>;
  agenda: AgendaConfig | null;
  busca: string;
  ordem: string;
  situacao: string;
  fotos: Record<string, string>;
  mostrarFotos: boolean;
  limit: number;
  cands: Candidatura[];
  open: string | null;
  cola: Cola;
  modo: string;
  exp: Expectativa | null;
  pan: Panorama | null;
  rede: Rede | null;
  redeFoco: string | null; // candidate id, or null for the overview
  redeSel: string | null;
}
