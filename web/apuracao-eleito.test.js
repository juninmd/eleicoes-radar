import { describe, expect, test } from "bun:test";
import { decididos } from "./apuracao-eleito.js";

// Only the fields the proof reads. falta = apto - apurado: the electors of sections not yet totalized.
const arq = ({ votos, apto = 1000, apurado = 800, vagas = 1, fase = "parcial", validos, situacao = [] } = {}) => ({
  fase,
  cargo: { vagas },
  eleitorado: { apto, apurado },
  votos: { validos: validos ?? votos.reduce((a, v) => a + v, 0) },
  candidatos: votos.map((v, i) => ({ id: `c${i + 1}`, votos: v, situacao: situacao[i] ?? "" })),
});
const ids = (s) => [...s].sort();

describe("one seat: more than half of the valid votes that can still exist", () => {
  // 600 + 150 + 50 = 800 valid votes, 200 electors still to count: at most 1.000 valid votes, half is 500.
  test("a leader above half of the most valid votes there can still be is decided", () => {
    expect(ids(decididos(arq({ votos: [600, 150, 50] }), "Governador"))).toEqual(["c1"]);
  });

  test("exactly half is not a majority: the proof needs strictly more", () => {
    expect(decididos(arq({ votos: [500, 250, 50] }), "Governador").size).toBe(0); // 500 vs (800 + 200) / 2
    expect(decididos(arq({ votos: [501, 249, 50] }), "Governador").size).toBe(1);
  });

  test("the worst case is every elector still to count voting for someone else", () => {
    // Same votes, but 600 electors left: the ceiling is 800 + 600 = 1.400, half is 700 > 600.
    expect(decididos(arq({ votos: [600, 150, 50], apto: 1400 }), "Governador").size).toBe(0);
  });

  test("with every section counted the proof is the plain majority of the valid votes", () => {
    expect(ids(decididos(arq({ votos: [600, 150, 50], apurado: 1000, fase: "concluida" }), "Presidente", "BR"))).toEqual(["c1"]);
    expect(decididos(arq({ votos: [450, 400, 150], apurado: 1000, fase: "concluida" }), "Presidente", "BR").size).toBe(0); // runoff
  });

  test("when the candidates add up to more than the file's valid-vote total, the larger is the base", () => {
    // 520 + 280 = 800, but the file says 700 valid: 500 would be half of 700 + 300, 550 is half of 800 + 300.
    expect(decididos(arq({ votos: [520, 280], apurado: 700, validos: 700 }), "Governador").size).toBe(0);
    expect(decididos(arq({ votos: [600, 200], apurado: 700, validos: 700 }), "Governador").size).toBe(1); // 600 > 550
  });

  test("it does not depend on the order the candidates come in", () => {
    const d = arq({ votos: [150, 600, 50] });
    expect(ids(decididos(d, "Governador"))).toEqual(["c2"]);
  });
});

describe("Senate: the last elected must stay ahead of the first one left out", () => {
  // 2 seats. 300 / 280 / 100 / 20: the 2nd leads the 3rd by 180; 200 electors still to count could all go to the 3rd.
  test("decided when the margin at the last seat is bigger than the electors still to count", () => {
    expect(ids(decididos(arq({ votos: [300, 280, 100, 20], vagas: 2, apto: 1000, apurado: 850 }), "Senador"))).toEqual(["c1", "c2"]); // falta 150 < 180
  });

  test("not decided when the margin is not bigger than them, even by one", () => {
    expect(decididos(arq({ votos: [300, 280, 100, 20], vagas: 2, apto: 1000, apurado: 820 }), "Senador").size).toBe(0); // falta 180 = margin
    expect(decididos(arq({ votos: [300, 280, 100, 20], vagas: 2 }), "Senador").size).toBe(0); // falta 200
  });

  test("with fewer candidates than seats plus one there is nobody to compare against: no claim", () => {
    expect(decididos(arq({ votos: [300, 280], vagas: 2, apurado: 999 }), "Senador").size).toBe(0);
  });

  test("one seat works the same way", () => {
    expect(ids(decididos(arq({ votos: [400, 150, 100], vagas: 1, apurado: 900 }), "Senador"))).toEqual(["c1"]); // 250 > 100
  });
});

describe("what it refuses to claim", () => {
  const ok = arq({ votos: [600, 150, 50] });

  test("proportional offices: seats go to lists first, there is no such proof here", () => {
    for (const cargo of ["Deputado Federal", "Deputado Estadual", "Deputado Distrital"]) expect(decididos(ok, cargo).size).toBe(0);
  });

  test("before the count starts, or with no file", () => {
    expect(decididos({ ...ok, fase: "aguardando" }, "Governador").size).toBe(0);
    expect(decididos(null, "Governador").size).toBe(0);
  });

  test("numbers that cannot be right: no electorate, counted electorate above the total, no valid votes, no seats", () => {
    expect(decididos(arq({ votos: [600, 150, 50], apto: 0, apurado: 0 }), "Governador").size).toBe(0);
    expect(decididos(arq({ votos: [600, 150, 50], apto: 700, apurado: 800 }), "Governador").size).toBe(0);
    expect(decididos(arq({ votos: [0, 0], validos: 0 }), "Governador").size).toBe(0);
    expect(decididos(arq({ votos: [600, 150, 50], vagas: 0 }), "Governador").size).toBe(0);
    expect(decididos({ ...ok, eleitorado: { apto: NaN, apurado: 800 } }, "Governador").size).toBe(0);
  });

  test("a file without the electorate or valid-vote fields is not trusted either", () => {
    const { eleitorado, ...semEleitorado } = ok;
    const { votos, ...semVotos } = ok;
    expect(decididos(semEleitorado, "Governador").size).toBe(0);
    expect(decididos(semVotos, "Governador").size).toBe(0);
  });

  test("the TSE disagreeing about a candidate the proof picked: claim nothing, not even about the others", () => {
    // 300 / 280 / 100 / 20 with 2 seats is decided; the TSE saying the 2nd is "Não eleito" means one of the two is wrong.
    const d = (situacao) => arq({ votos: [300, 280, 100, 20], vagas: 2, apurado: 850, situacao });
    expect(decididos(d(["Eleito", "Eleito"]), "Senador").size).toBe(2);
    expect(decididos(d(["Eleito", "Não eleito"]), "Senador").size).toBe(0);
    expect(decididos(d(["", "2º turno"]), "Senador").size).toBe(0);
    // "Eleito" on someone the proof did NOT pick: three elected for two seats is a contradiction too.
    expect(decididos(d(["", "", "Eleito", ""]), "Senador").size).toBe(0);
    expect(decididos(arq({ votos: [600, 150, 50], situacao: ["", "Eleito"] }), "Governador").size).toBe(0);
  });

  test("a state file of the presidential race is a slice, never a result, however lopsided", () => {
    expect(decididos(ok, "Presidente", "SP").size).toBe(0);
    expect(decididos(ok, "Presidente", "ZZ").size).toBe(0);
    expect(decididos(ok, "Presidente").size).toBe(0); // scope unknown: not claimed
    expect(decididos(ok, "Presidente", "BR").size).toBe(1);
    expect(decididos(ok, "Governador", "SP").size).toBe(1); // a governor's state file is the whole race
  });

  test("a file that reports no valid votes while candidates have votes is incoherent", () => {
    expect(decididos(arq({ votos: [600, 150, 50], validos: 0 }), "Governador").size).toBe(0);
  });

  test("candidates without an id, or sharing one, would all get the label: claim nothing", () => {
    const semId = arq({ votos: [600, 150, 50] });
    semId.candidatos.forEach((c) => { c.id = ""; });
    expect(decididos(semId, "Governador").size).toBe(0);
    const repetido = arq({ votos: [600, 150, 50] });
    repetido.candidatos[1].id = "c1";
    expect(decididos(repetido, "Governador").size).toBe(0);
  });

  test("a single-seat office that reports several seats is not trusted", () => {
    expect(decididos(arq({ votos: [600, 150, 50], vagas: 2 }), "Governador").size).toBe(0);
  });
});
