// Shared fixtures for the Apuração tests: a results file with the fields the parser reads.
import type { Candidatura } from "./types.js";

// The files carry every number as a string; tests also null or drop a field to check the parser.
type Campos = Record<string, string | null | undefined>;
export interface FixCand { n: string; sqcand: string; nm: string; nmu: string; seq: string; e: string; st: string; vap: string; pvap: string }
export interface FixAgr { n: string; nm: string; com: string; vag?: string; par: { n: string; sg: string; cand: FixCand[] }[] }
export interface FileOver { cargo?: Record<string, unknown>; s?: Campos; v?: Campos; cands?: FixCand[]; agr?: FixAgr[] }

export const cand = (sqcand: string, n: string, nmu: string, seq: string, vap: string, pvap: string, e = "n", st = ""): FixCand => ({ n, sqcand, nm: nmu, nmu, seq, e, st, vap, pvap });
export const file = ({ cargo = {}, s = {}, v = {}, cands = [], agr }: FileOver = {}) => ({
  dg: "04/10/2026", hg: "19:41:07",
  s: { ts: "1000", st: "400", ...s },
  e: { te: "500000", est: "200000", c: "160000", a: "40000" },
  v: { tv: "160000", vvc: "140000", vv: "140000", vb: "8000", tvn: "12000", ...v },
  carg: [{ cd: "3", nmn: "Governador", nv: "1", agr: agr ?? [{ n: "1", nm: "A", com: "AAA", par: [{ n: "10", sg: "AAA", cand: cands }] }], ...cargo }],
});
export const dois = [cand("a1", "10", "ANA SOUZA", "1", "6000", "60,00", "s", "Eleito"), cand("b2", "20", "BETO LIMA", "2", "4000", "40,00", "n", "Não eleito")];
export const avatar = (c: { id: string }) => `<i class="av">${c.id}</i>`;
export const byId = new Map<string, Candidatura>([["a1", { id: "a1" } as Candidatura]]);
