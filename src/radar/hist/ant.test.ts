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

describe("the same person twice in one race", () => {
  const election = (rows: ReturnType<typeof c>[]): HistElection => ({ year: 2022, cutoff: "", vagas: {}, legenda: {}, cands: rows });
  const withVotes = c("v", "SP", "DEPUTADO FEDERAL", "ANA|1970-01-01", "2201", 500, "ELEITO POR QP");
  const refiled = c("z", "SP", "DEPUTADO FEDERAL", "ANA|1970-01-01", "2201", 0, "NÃO ELEITO");
  const other = c("o", "SP", "DEPUTADO FEDERAL", "BIA|1980-02-02", "1301", 500, "NÃO ELEITO");
  const ask = [{ sq: "n", uf: "SP", cargo: "DEPUTADO FEDERAL", pk: "ANA|1970-01-01", numero: "2299" }];

  test("the row with votes counts, whichever comes last", () => {
    for (const rows of [[withVotes, refiled, other], [refiled, withVotes, other]]) {
      const a = buildAnt(election(rows), ask).get("n")!;
      expect(a.share).toBeCloseTo(0.5, 6);
      expect(a.elected).toBe(true);
    }
  });
});

describe("a party's weight follows its successor, not just its number", () => {
  const row = (numero: string, votos: number) => c(`s${numero}`, "SP", "DEPUTADO FEDERAL", "", numero, votos, "NÃO ELEITO");
  const weight = (year: number, rows: ReturnType<typeof c>[], numero: string) =>
    buildAnt({ year, cutoff: "", vagas: {}, legenda: {}, cands: rows }, [{ sq: "q", uf: "SP", cargo: "DEPUTADO FEDERAL", pk: "", numero }]).get("q")!.partido;

  test("2018 -> 2022: União gets PSL + DEM and not the PRP that held 44 before", () => {
    const rows = [row("1701", 600), row("2501", 200), row("4401", 100), row("5101", 100)];
    expect(weight(2018, rows, "4499")).toBeCloseTo(0.8, 6);
    expect(weight(2018, rows, "5199")).toBeCloseTo(0.2, 6); // Patriota = its own 51 + the PRP
  });

  test("2022 -> 2026: mergers add up, a reused number inherits nothing, a rename keeps its votes", () => {
    const rows = [row("1401", 100), row("5101", 100), row("2001", 100), row("1901", 200), row("7701", 400), row("9001", 100), row("3301", 100)];
    expect(weight(2022, rows, "2599")).toBeCloseTo(200 / 1100, 6); // PRD = PTB + Patriota
    expect(weight(2022, rows, "2099")).toBeCloseTo(300 / 1100, 6); // Podemos = PODE (19) + PSC (20)
    expect(weight(2022, rows, "7799")).toBeCloseTo(500 / 1100, 6); // Solidariedade + PROS
    expect(weight(2022, rows, "1499")).toBe(0); // Missão took the PTB's number but not its votes
    expect(weight(2022, rows, "3399")).toBeCloseTo(100 / 1100, 6); // PMN -> Mobiliza kept 33
  });

  test("no successor listed for the year: the number's own votes, as before", () => {
    expect(weight(2014, [row("4401", 100), row("1301", 100)], "4499")).toBeCloseTo(0.5, 6);
  });
});
