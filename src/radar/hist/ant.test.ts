import { describe, expect, test } from "bun:test";
import type { HistElection } from "./aggregate";
import { buildAnt } from "./ant";

const c = (sq: string, uf: string, cargo: string, pk: string, numero: string, votos: number, sit: string) =>
  ({ sq, uf, cargo, numero, partido: "X", lista: "1", ocupacao: "", nome: sq, pk, receita: 0, votos, votos2: 0, sit });

const prev: HistElection = {
  year: 2018, cutoff: "", vagas: {}, legenda: {},
  cands: [
    c("a", "SP", "DEPUTADO FEDERAL", "ANA|1970-01-01", "2201", 600, "ELEITO POR QP"),
    c("b", "SP", "DEPUTADO FEDERAL", "BIA|1980-02-02", "2202", 200, "NÃO ELEITO"),
    c("c", "SP", "DEPUTADO FEDERAL", "CID|1975-03-03", "1301", 200, "NÃO ELEITO"),
    c("d", "RJ", "DEPUTADO ESTADUAL", "DAN|1960-04-04", "2501", 50, "ELEITO POR MÉDIA"),
  ],
};

describe("what the previous election says about a candidacy", () => {
  const q = (sq: string, uf: string, cargo: string, pk: string, numero: string) => ({ sq, uf, cargo, pk, numero });
  const out = buildAnt(prev, [
    q("n1", "SP", "DEPUTADO FEDERAL", "ANA|1970-01-01", "2299"), // same person, same race
    q("n2", "SP", "DEPUTADO FEDERAL", "NOVA|1990-05-05", "2288"), // never ran, but the party is the same
    q("n3", "SP", "DEPUTADO FEDERAL", "DAN|1960-04-04", "1111"), // won a state seat last time, now runs federal
    q("n4", "SP", "DEPUTADO FEDERAL", "", "1377"), // no key: cannot be matched
  ]);

  test("a returning candidate carries the share of votes and the win", () => {
    expect(out.get("n1")).toMatchObject({ ran: true, elected: true });
    expect(out.get("n1")!.share).toBeCloseTo(0.6, 6);
  });

  test("party weight comes from the number's first two digits, whoever the candidate is", () => {
    expect(out.get("n1")!.partido).toBeCloseTo(0.8, 6);
    expect(out.get("n2")).toMatchObject({ ran: false, share: 0, elected: false });
    expect(out.get("n2")!.partido).toBeCloseTo(0.8, 6);
    expect(out.get("n4")!.partido).toBeCloseTo(0.2, 6);
  });

  test("a win in another cargo counts as having been elected, but not as having run in this race", () => {
    expect(out.get("n3")).toMatchObject({ ran: false, share: 0, elected: true });
  });

  test("no person key means no match, never a false one", () => {
    expect(out.get("n4")).toMatchObject({ ran: false, elected: false });
  });
});
