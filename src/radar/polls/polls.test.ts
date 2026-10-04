import { describe, expect, test } from "bun:test";
import { parseTables } from "./html-table";
import { classifyTable, dedupe, extractPolls, matchCandidate, parseEndDate, parsePct, type Poll } from "./extract";
import { average, forecast, instituteKeys, PARAMS, selectPolls } from "./forecast";

const cands = [
  { sq: "1", nome: "TARCISIO GOMES DE FREITAS", nomeUrna: "TARCÍSIO", partido: "REPUBLICANOS" },
  { sq: "2", nome: "FERNANDO HADDAD", nomeUrna: "FERNANDO HADDAD", partido: "PT" },
  { sq: "3", nome: "VERA LUCIA SALGADO", nomeUrna: "VERA LÚCIA", partido: "PSTU" },
];

// Shape of a real pt.wikipedia poll table: 3 header rows with rowspans, an
// annotation row spanning every column, and a year given by a collapsible block.
const html = `
<div class="mw-heading mw-heading2"><h2 id="x">Primeiro Turno (Governador)</h2></div>
<table class="wikitable"><tbody>
<tr><th rowspan="3">Contratante/Pesquisa</th><th rowspan="3">Datas de Pesquisa</th><th rowspan="3">Amostragem</th><th rowspan="3">Margem de erro</th><th>img</th><th>img</th><th>img</th><th rowspan="3">Outros</th><th rowspan="3">Indecisos</th></tr>
<tr><th>Tarcísio<br>REPUBLICANOS</th><th>Haddad<br>PT</th><th>Serra<br>PSDB</th></tr>
<tr><th></th><th></th><th></th></tr>
<tr><td>Datafolha</td><td>22 – 23 Set</td><td>1&#160;610</td><td>2,0</td><td>50%</td><td>30%</td><td>—</td><td>2%</td><td>11%</td></tr>
<tr><td colspan="9">21 de setembro: Serra retira a candidatura</td></tr>
<tr><td>Vox</td><td>10 – 12 Set</td><td>1 480</td><td>2,55</td><td>45%</td><td>30%</td><td>8%</td><td>—</td><td>7%</td></tr>
</tbody></table>
<div class="hidden-title">2025</div>
<table class="wikitable"><tbody>
<tr><th>Contratante/Pesquisa</th><th>Datas de Pesquisa</th><th>Amostragem</th><th>Tarcísio REPUBLICANOS</th><th>Haddad PT</th></tr>
<tr><td>Quaest</td><td>29 Nov – 1 Dez</td><td>1 500</td><td>45%</td><td>30%</td></tr>
</tbody></table>`;

describe("poll tables", () => {
  const tables = parseTables(html);

  test("expands spans and carries the section and year", () => {
    expect(tables).toHaveLength(2);
    expect(tables[0]!.section).toEqual(["Primeiro Turno (Governador)"]);
    expect(tables[0]!.rows[1]![0]!.text).toBe("Contratante/Pesquisa"); // rowspan copied down
    expect(tables[0]!.rows[4]!.every((c) => c.text.startsWith("21 de setembro"))).toBe(true); // colspan
    expect(tables[1]!.year).toBe(2025);
  });

  test("keeps only real scenarios of registered candidates", () => {
    const race = classifyTable(tables[0]!, "estado")!;
    expect(race).toEqual({ cargo: "Governador", turno: 1 });
    const polls = extractPolls(tables[0]!, { ...race, uf: "SP", asOf: "2026-09-27" }, cands);
    // Vox lists Serra (not registered) with 8%: a hypothetical scenario, dropped.
    expect(polls.map((p) => p.instituto)).toEqual(["Datafolha"]);
    expect(polls[0]).toMatchObject({ fim: "2026-09-23", amostra: 1610, votos: { "1": 50, "2": 30 }, outros: 2, indecisos: 11 });
  });

  test("dates without a year take the table's year", () => {
    const polls = extractPolls(tables[1]!, { cargo: "Governador", turno: 1, uf: "SP", asOf: "2026-09-27" }, cands);
    expect(polls[0]!.fim).toBe("2025-12-01");
  });

  test("aggregator and rejection tables are ignored", () => {
    expect(classifyTable({ section: ["Primeiro turno", "Agregação de pesquisas"], year: null, rows: [] }, "presidente")).toBeNull();
    expect(classifyTable({ section: ["Rejeição"], year: null, rows: [] }, "estado")).toBeNull();
    expect(classifyTable({ section: ["Senador", "2026"], year: 2026, rows: [] }, "estado")).toEqual({ cargo: "Senador", turno: 1 });
  });
});

describe("cell parsing", () => {
  test("percentages", () => {
    expect(parsePct("40,1%")).toBe(40.1);
    expect(parsePct("<1%")).toBe(0.5);
    expect(parsePct("—")).toBeNull();
    expect(parsePct("‐")).toBeNull();
    expect(parsePct("±2,0")).toBe(2);
  });

  test("end dates in the formats the pages use", () => {
    expect(parseEndDate("22 e 24 de setembro", 2026)).toBe("2026-09-24");
    expect(parseEndDate("20 Set – 23 Set", 2026)).toBe("2026-09-23");
    expect(parseEndDate("25 Set 2026", null)).toBe("2026-09-25");
    expect(parseEndDate("sem data", 2026)).toBeNull();
  });

  test("candidate labels match by name, party breaks ties, same person twice is not ambiguous", () => {
    expect(matchCandidate("Tarcísio REPUBLICANOS", cands)?.sq).toBe("1");
    expect(matchCandidate("Marçal (PRTB)", cands)).toBeNull();
    const twice = [...cands, { sq: "9", nome: "FERNANDO HADDAD", nomeUrna: "FERNANDO HADDAD", partido: "PT" }];
    expect(matchCandidate("Haddad PT", twice)?.sq).toBe("9");
    const homonyms = [{ sq: "5", nome: "ANA SILVA", nomeUrna: "ANA", partido: "PT" }, { sq: "6", nome: "ANA SOUZA", nomeUrna: "ANA", partido: "PL" }];
    expect(matchCandidate("Ana", homonyms)).toBeNull();
    expect(matchCandidate("Ana PL", homonyms)?.sq).toBe("6");
  });
});

const poll = (instituto: string, fim: string, votos: Record<string, number>, turno: 1 | 2 = 1, amostra = 2000): Poll =>
  ({ cargo: "Governador", uf: "SP", turno, instituto, fim, amostra, margem: 2, votos, outros: 0, indecisos: 10 });

describe("forecast", () => {
  test("sponsor/pollster labels in any order are one institute", () => {
    const k = instituteKeys(["Apex/Futura", "Futura/Apex", "Futura", "Nexus/BTG", "Nexus/BTG Pactual", "Quaest"]);
    expect(new Set([k.get("Apex/Futura"), k.get("Futura/Apex"), k.get("Futura")]).size).toBe(1);
    expect(k.get("Nexus/BTG")).toBe(k.get("Nexus/BTG Pactual"));
    expect(k.get("Quaest")).not.toBe(k.get("Futura"));
  });

  test("window keeps the latest poll per institute", () => {
    const sel = selectPolls([poll("A", "2026-09-20", { "1": 50, "2": 30 }), poll("A", "2026-09-10", { "1": 40, "2": 40 }), poll("B", "2026-08-01", { "1": 10, "2": 80 })]);
    expect(sel.map((p) => p.fim)).toEqual(["2026-09-20"]); // B is outside the 21-day window
  });

  test("average is in valid votes (undecided removed)", () => {
    const { mean } = average([poll("A", "2026-09-20", { "1": 45, "2": 45 })]);
    expect(mean.get("1")).toBeCloseTo(0.5, 5);
  });

  test("a 70-20 race is decided in the first round; a tie is a coin flip", () => {
    const clear = forecast("Governador", "SP", [poll("A", "2026-09-20", { "1": 70, "2": 20, "3": 10 })], 1)!;
    expect(clear.candidatos[0]!.sq).toBe("1");
    expect(clear.candidatos[0]!.pVitoria).toBeGreaterThan(0.95);
    expect(clear.p1turno).toBeGreaterThan(0.9);
    const tie = forecast("Governador", "SP", [poll("A", "2026-09-20", { "1": 40, "2": 40, "3": 20 }), poll("B", "2026-09-21", { "1": 40, "2": 40, "3": 20 })], 1)!;
    expect(tie.candidatos[0]!.pVitoria).toBeGreaterThan(0.35);
    expect(tie.candidatos[0]!.pVitoria).toBeLessThan(0.65);
  });

  // Backtest on 126 races (2014-2022): with a 3.5 p.p. systematic error the 90-100% band won only 78% of the time,
  // and the gap between the two poll leaders missed by 12.6 p.p. (sd). A 10-point lead in one poll is not a lock.
  test("a 10-point lead in a single poll is not near-certain (plurality race, so no runoff softens it)", () => {
    const f = forecast("Senador", "SP", [poll("A", "2026-09-20", { "1": 45, "2": 35, "3": 20 })], 1)!;
    expect(f.candidatos[0]!.sq).toBe("1");
    expect(f.candidatos[0]!.pVitoria).toBeGreaterThan(0.6);
    expect(f.candidatos[0]!.pVitoria).toBeLessThan(0.9);
  });

  test("the share band is the fitted 90% band around the average, inside 0-100%, wider for bigger shares", () => {
    const f = forecast("Governador", "SP", [poll("A", "2026-09-20", { "1": 50, "2": 49, "3": 1 })], 1)!;
    const [a, c] = [f.candidatos.find((x) => x.sq === "1")!, f.candidatos.find((x) => x.sq === "3")!];
    expect(a.hi - a.media).toBeCloseTo(a.media - a.lo, 9);
    expect(a.hi - a.lo).toBeGreaterThan(0.2); // about ±14 p.p. at 50%: polls this size are not that precise
    expect(a.hi - a.lo).toBeGreaterThan(c.hi - c.lo);
    expect(c.lo).toBeGreaterThanOrEqual(0);
    expect(a.hi).toBeLessThanOrEqual(1);
  });

  test("a larger systematic error makes a clear leader less certain", () => {
    const polls = [poll("A", "2026-09-20", { "1": 45, "2": 35, "3": 20 })];
    const tight = forecast("Senador", "SP", polls, 1, 0.035)!.candidatos[0]!.pVitoria;
    const wide = forecast("Senador", "SP", polls, 1)!.candidatos[0]!.pVitoria;
    expect(tight).toBeGreaterThan(wide);
  });

  test("the 40% example the method text quotes is the band the forecast really draws", () => {
    const f = forecast("Governador", "SP", [poll("A", "2026-09-20", { "1": 40, "2": 40, "3": 20 }, 1, 1e9)], 1)!;
    const c = f.candidatos.find((x) => x.sq === "1")!;
    expect(c.media).toBeCloseTo(0.4, 6);
    expect((c.hi - c.lo) / 2).toBeCloseTo(PARAMS.faixaEm40, 3); // sampling error vanishes at n = 1e9
    expect(PARAMS.faixaEm40).toBeGreaterThan(0.1); // about ±12 p.p.: polls in Brazil have missed by that much
  });

  test("runoff uses head-to-head polls when they exist", () => {
    const first = [poll("A", "2026-09-20", { "1": 42, "2": 38, "3": 20 })];
    const h2h = [poll("A", "2026-09-20", { "1": 40, "2": 55 }, 2)];
    const f = forecast("Governador", "SP", [...first, ...h2h], 1)!;
    expect(f.candidatos[0]!.sq).toBe("2"); // behind in round one, ahead head-to-head
  });

  test("the head-to-head average behind the runoff is reported per pair with its poll count", () => {
    const first = [poll("A", "2026-09-20", { "1": 35, "2": 33, "3": 20 })];
    const h2h = [poll("A", "2026-09-20", { "1": 40, "2": 55 }, 2), poll("B", "2026-09-21", { "1": 42, "2": 50 }, 2)];
    const f = forecast("Governador", "SP", [...first, ...h2h], 1)!;
    expect(f.confrontos).toHaveLength(1); // runoff polls exist for one pair only
    const [pair] = f.confrontos;
    expect(f.candidatos[0]!.sq).toBe("2");
    expect([pair!.a, pair!.b]).toEqual(["2", "1"]); // the likelier winner comes first, whatever the SQ order
    expect(pair!.n).toBe(2);
    expect(pair!.qa).toBeCloseTo((55 / 95 + 50 / 92) / 2, 1); // share of "2" among decided voters, two institutes
  });

  test("a runoff poll with a candidate who rarely gets there does not make a pair", () => {
    const polls = [poll("A", "2026-09-20", { "1": 42, "2": 38, "3": 2 }), poll("A", "2026-09-20", { "1": 40, "2": 55 }, 2), poll("A", "2026-09-20", { "1": 50, "3": 40 }, 2)];
    const f = forecast("Governador", "SP", polls, 1)!;
    expect(f.candidatos.find((c) => c.sq === "3")!.p2turno).toBeLessThan(0.05);
    expect(f.confrontos.map((m) => [m.a, m.b].sort().join("|"))).toEqual(["1|2"]);
  });

  test("senate elects the top k and is deterministic", () => {
    const polls = [poll("A", "2026-09-20", { "1": 30, "2": 28, "3": 5 })].map((p) => ({ ...p, cargo: "Senador" as const }));
    const a = forecast("Senador", "SP", polls, 2)!;
    const b = forecast("Senador", "SP", polls, 2)!;
    expect(a).toEqual(b);
    expect(a.p1turno).toBeNull();
    expect(a.candidatos.reduce((s, c) => s + c.pVitoria, 0)).toBeCloseTo(2, 5);
  });

  test("trend compares the average now with the one TREND_DAYS earlier, from the same rules", () => {
    const polls = [
      poll("A", "2026-09-30", { "1": 50, "2": 30 }), poll("A", "2026-09-10", { "1": 40, "2": 40 }),
      poll("B", "2026-09-29", { "1": 50, "2": 30 }), poll("B", "2026-09-12", { "1": 40, "2": 40 }),
    ];
    const f = forecast("Governador", "SP", polls, 1)!;
    const [lead, other] = [f.candidatos.find((c) => c.sq === "1")!, f.candidatos.find((c) => c.sq === "2")!];
    expect(lead.tendencia).toBeCloseTo(0.625 - 0.5, 2); // 50/80 now vs 40/80 before
    expect(other.tendencia).toBeCloseTo(-(lead.tendencia ?? 0), 5);
    expect(f.refTendencia).toBe("2026-09-12");
  });

  test("the earlier snapshot starts exactly TREND_DAYS back and must not be older than a week beyond that", () => {
    const now = poll("A", "2026-09-30", { "1": 50, "2": 30 });
    const withPrior = (fim: string) => forecast("Governador", "SP", [now, poll("A", fim, { "1": 40, "2": 40 })], 1)!;
    expect(withPrior("2026-09-16").refTendencia).toBe("2026-09-16"); // exactly 14 days: counts
    expect(withPrior("2026-09-17").refTendencia).toBeNull(); // 13 days: still the same fortnight
    expect(withPrior("2026-09-09").refTendencia).toBe("2026-09-09"); // 21 days: oldest reference allowed
    const stale = withPrior("2026-09-08"); // 22 days: "two weeks ago" would be a lie
    expect(stale.refTendencia).toBeNull();
    expect(stale.candidatos.every((c) => c.tendencia === null)).toBe(true);
  });

  test("no trend without an earlier snapshot, or for a candidate that was not in it", () => {
    const fresh = forecast("Governador", "SP", [poll("A", "2026-09-30", { "1": 50, "2": 30 })], 1)!;
    expect(fresh.refTendencia).toBeNull();
    expect(fresh.candidatos.every((c) => c.tendencia === null)).toBe(true);
    const entrant = forecast("Governador", "SP", [poll("A", "2026-09-30", { "1": 50, "2": 30, "3": 10 }), poll("A", "2026-09-10", { "1": 40, "2": 40 })], 1)!;
    expect(entrant.candidatos.find((c) => c.sq === "3")!.tendencia).toBeNull();
    expect(entrant.candidatos.find((c) => c.sq === "1")!.tendencia).not.toBeNull();
  });

  test("dedupe keeps the richest scenario per institute and date", () => {
    const d = dedupe([poll("A", "2026-09-20", { "1": 50, "2": 30 }), poll("A", "2026-09-20", { "1": 48, "2": 29, "3": 4 })]);
    expect(d).toHaveLength(1);
    expect(Object.keys(d[0]!.votos)).toHaveLength(3);
  });
});
