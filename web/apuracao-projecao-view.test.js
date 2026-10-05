import { describe, expect, test } from "bun:test";
import { pct } from "./format.js";
import { analise, medir } from "./apuracao-projecao.js";
import { renderProjecao } from "./apuracao-projecao-view.js";

const X = { id: "SP", versao: 1, apto: 10000, apurado: 9000, validos: 7200, secoes: { total: 100, totalizadas: 90 }, votos: { A: 3600, B: 2900, C: 300 } };
const Y = { id: "BA", versao: 1, apto: 8000, apurado: 4000, validos: 3200, secoes: { total: 100, totalizadas: 50 }, votos: { A: 1000, B: 2000, C: 100 } };
const nomes = { A: { nome: "ALFA SILVA", partido: "PAA" }, B: { nome: "BETA <b>X</b>", partido: "PBB" }, C: { nome: "GAMA", partido: "PCC" } };
// Keyed by party like every other view of the tab (map, charts, panel), so a party keeps its colour from one view to the next.
const cor = (partido) => ({ PAA: "#111111", PBB: "#222222", PCC: "#333333" })[partido];
const tela = (partes, mem = null, extra = {}) => renderProjecao({ analise: analise(partes, mem), nomes, cor, partes, cargo: "Presidente", ...extra });

describe("renderProjecao", () => {
  const partes = [X, Y];
  const r = analise(partes, null);
  const html = tela(partes);

  test("it says up front that this is the Radar's estimate and not a result", () => {
    expect(html).toMatch(/Estimativa do Radar/);
    expect(html).toMatch(/não é resultado/);
  });

  test("it shows, for each leading candidate, what the count is today and where the projection ends", () => {
    expect(html).toContain("Alfa Silva");
    expect(html).toContain(pct(r.sim.faixa[r.a][1], 1)); // the point is the median of the draws, inside its own band
    expect(html).toContain(pct(r.sim.faixa[r.a][0], 1));
    expect(html).toContain(pct(r.sim.faixa[r.a][2], 1));
  });

  test("it says what each of the two leaders would need of the votes still to come to pass 50%", () => {
    expect(html).toMatch(/precisaria de/);
    expect(html).toContain(pct(r.precisa[r.a], 1));
  });

  test("when 50% is out of reach it says so instead of printing a share above 100%", () => {
    const fechada = [{ ...X, apurado: 9900, votos: { A: 2000, B: 1900, C: 100 } }]; // little left, nobody close to 50%
    const out = tela(fechada);
    expect(out).toMatch(/não chegaria a 50%/);
    expect(out).not.toMatch(/precisaria de \d{3}/);
  });

  test("the chance of settling it in the 1st round reads 'menos de 1%' or 'mais de 99%' at the edges, never a false 0 or 100", () => {
    const quase = [{ ...X, apurado: 9000, votos: { A: 6500, B: 600, C: 100 } }]; // A far above 50% of what is counted
    const longe = [{ ...X, apurado: 9900, votos: { A: 2000, B: 1900, C: 100 } }]; // nobody near 50%, almost nothing left
    expect(tela(quase)).toMatch(/Chance de decidir no 1º turno<\/dt><\/div>|Chance de decidir no 1º turno/);
    expect(tela(quase).replace(/\s+/g, " ")).toMatch(/<dd>mais de 99%<\/dd><\/div><div><dt>Vai a 2º turno/);
    expect(tela(longe).replace(/\s+/g, " ")).toMatch(/<dd>menos de 1%<\/dd><\/div><div><dt>Vai a 2º turno/);
    expect(tela(partes)).toMatch(/<dd>\d+%<\/dd><\/div><div><dt>Vai a 2º turno/); // in between: a plain percentage
  });

  test("it paints each candidate with the colour of its party, the key the other views use", () => {
    const chaves = [];
    renderProjecao({ analise: analise(partes, null), nomes, cor: (k) => { chaves.push(k); return cor(k); }, partes, cargo: "Presidente" });
    expect(chaves.length).toBeGreaterThan(0);
    expect(chaves.every((k) => ["PAA", "PBB", "PCC"].includes(k))).toBe(true); // never a candidate id like "A"
    expect(html).toContain("background:#111111"); // Alfa's party colour
  });

  test("the exterior has a readable label in the per-state chart", () => {
    const ext = { ...X, id: "ZZ" };
    expect(tela([X, ext, Y])).toMatch(/<abbr title="Exterior">Ext\.<\/abbr>/);
    expect(html).toMatch(/<abbr title="Bahia">BA<\/abbr>/);
  });

  test("files whose numbers are old (the TSE failed or the file went missing) are named, never passed off as current", () => {
    const velho = renderProjecao({ analise: analise(partes, null), nomes, cor, partes, cargo: "Presidente", defasadas: ["SP", "BA"] });
    expect(velho).toMatch(/desatualizados/);
    expect(velho).toMatch(/SP, BA/);
    expect(html).not.toMatch(/desatualizados/); // nothing old: no warning
  });

  test("before the drift is measured it says the spread is wide, and after it says what was measured", () => {
    expect(html).toMatch(/ainda não mediu o deslocamento/i);
    const v2 = { ...Y, versao: 2, apurado: 5000, validos: 4000, votos: { A: 1150, B: 2500, C: 120 } };
    const mem = medir(medir(null, partes), [X, v2]);
    expect(tela([X, v2], mem)).toMatch(/Deslocamento medido/);
    expect(tela([X, v2], mem)).not.toMatch(/ainda não mediu/i);
  });

  test("the drift is described in terms of the unit that was measured: states for the country, the count itself for a one-file race", () => {
    expect(tela(partes)).toMatch(/que cada estado já mostrou/);
    expect(tela([X], null, { cargo: "Governador" })).toMatch(/que a apuração já mostrou/);
    expect(tela([X], null, { cargo: "Governador" })).not.toMatch(/cada estado/);
  });

  test("once the drift is measured it also says what the plain base scenario would give without it", () => {
    const v2 = { ...Y, versao: 2, apurado: 5000, validos: 4000, votos: { A: 1150, B: 2500, C: 120 } };
    const mem = medir(medir(null, partes), [X, v2]);
    const a = analise([X, v2], mem);
    expect(tela([X, v2], mem)).toContain(`sem ele, a conta daria ${pct(a.base.final[a.a], 1)}`);
  });

  test("the chart of what is left to count lists the parts by how many votes are left, with the share of sections counted", () => {
    expect(html).toMatch(/O que falta apurar/);
    expect(html.indexOf(">BA<")).toBeLessThan(html.indexOf(">SP<")); // BA has 3.200 left, SP 800
    expect(html).toMatch(/50% das seções/); // BA: 50 of 100 sections
    expect(html).toMatch(/90% das seções/); // SP: 90 of 100
  });

  test("a race with a single file has no per-state chart", () => {
    expect(tela([X], null, { cargo: "Governador" })).not.toMatch(/O que falta apurar/);
  });

  test("the 2nd round is arithmetic with a range, not a forecast", () => {
    expect(html).toMatch(/2º turno/);
    expect(html).toMatch(/Não é previsão/);
    expect(html).toMatch(/não bastaria/); // here the runner-up is too far behind: no share of the others' votes would do
    // with a big pack of other candidates the range is printed, and it is the one the arithmetic gives
    const perto = [{ ...X, apurado: 5000, validos: 4000, votos: { A: 1700, B: 1500, C: 800 } }];
    const [lo, hi] = analise(perto, null).segundo;
    expect(lo).toBeLessThan(1);
    expect(tela(perto)).toContain(`${pct(lo, 0)} a ${pct(hi, 0)}`);
    expect(tela(perto)).not.toMatch(/não bastaria/);
  });

  test("the formulas are on the page, in words and symbols", () => {
    expect(html).toMatch(/<details[^>]*>[\s\S]*Como calculamos/);
    expect(html).toContain("0,5 ×");
    expect(html).toMatch(/eleitorado das seções ainda não apuradas/);
  });

  test("names from the files are escaped", () => {
    expect(html).not.toMatch(/<b>x<\/b>/i);
    expect(html).toContain("&lt;b&gt;");
  });

  test("when the race has more files than have numbers yet, it says how many it is using and that the rest is left out", () => {
    const parcial = tela(partes, null, { esperadas: 28 });
    expect(parcial).toMatch(/2 de 28 arquivos/);
    expect(parcial).toMatch(/fica de fora/);
    expect(tela(partes, null, { esperadas: 2 })).not.toMatch(/de 2 arquivos/); // all there: no warning
    expect(html).not.toMatch(/arquivos do TSE com números/); // not told how many to expect: no warning
  });

  test("it never calls a winner", () => {
    expect(html).not.toMatch(/será eleit|vai vencer|vai ganhar|vencerá/i);
  });

  test("with no data yet it says it is waiting, and nothing else", () => {
    const vazio = renderProjecao({ analise: null, nomes, cor, partes: [], cargo: "Presidente" });
    expect(vazio).toMatch(/Aguardando/);
    expect(vazio).not.toMatch(/precisaria de/);
  });
});
