// Incumbency status from federal mandates only (Chamber history + current Senate).
// State and executive offices are not in any source reachable here, so absence of a
// federal mandate is "nao-verificado" for those races, never "novo".
import { normalizeName } from "./stats";

export type Status = "reeleicao" | "outro-cargo" | "ja-exerceu" | "novo" | "nao-verificado";

export interface Senator {
  nome: string; // normalised full name
  uf: string;
  fimMandato: string; // YYYY-MM-DD
  desde: number;
}

export interface FederalMandate {
  atual: boolean; // holds the seat now (in office or on leave), not a former substitute
  desde: number | null; // first legislature year in the Chamber
}

export interface Incumbency {
  status: Status;
  casa: "Câmara" | "Senado" | null;
  desde: number | null;
}

// Races where "no federal mandate" really means first time in that office.
const FEDERAL_RACES = new Set(["Deputado Federal", "Senador"]);

export function classify(
  cand: { nome: string; cargo: string; uf: string },
  deputy: FederalMandate | null,
  senators: Map<string, Senator[]>,
): Incumbency {
  const found = senators.get(normalizeName(cand.nome)) ?? [];
  const sen = found.length === 1 ? found[0]! : found.find((s) => s.uf === cand.uf) ?? null;

  if (sen) {
    const status = cand.cargo === "Senador" ? "reeleicao" : "outro-cargo";
    return { status, casa: "Senado", desde: sen.desde };
  }
  if (deputy?.atual) {
    return { status: cand.cargo === "Deputado Federal" ? "reeleicao" : "outro-cargo", casa: "Câmara", desde: deputy.desde };
  }
  if (deputy) return { status: "ja-exerceu", casa: "Câmara", desde: deputy.desde };
  return { status: FEDERAL_RACES.has(cand.cargo) ? "novo" : "nao-verificado", casa: null, desde: null };
}

// 1 = renewal (first time), 0 = seeking the same seat again; null when unknown.
export const RENOVACAO: Record<Status, number | null> = {
  novo: 1,
  "ja-exerceu": 0.67,
  "outro-cargo": 0.33,
  reeleicao: 0,
  "nao-verificado": null,
};

export const legislatureStartYear = (n: number) => 2023 - (57 - n) * 4;
