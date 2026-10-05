import { describe, expect, test } from "bun:test";
import { segundoTurno } from "./apuracao-eleito.js";

// Only the fields the proof reads. falta = apto - apurado: the electors of sections not yet totalized.
const arq = ({ votos, apto = 1000, apurado = 800, vagas = 1, fase = "parcial", validos, situacao = [] } = {}) => ({
  fase,
  cargo: { vagas },
  eleitorado: { apto, apurado },
  votos: { validos: validos ?? votos.reduce((a, v) => a + v, 0) },
  candidatos: votos.map((v, i) => ({ id: `c${i + 1}`, votos: v, situacao: situacao[i] ?? "" })),
});

describe("runoff guaranteed: the leader cannot pass half of the valid votes even with every elector left", () => {
  // 400 + 300 + 200 + 100 = 1.000 valid votes, 200 electors left: the leader tops out at 600 of 1.200, exactly half.
  test("exactly half is not a majority, so the runoff holds at the boundary", () => {
    expect(segundoTurno(arq({ votos: [400, 300, 200, 100], apto: 1200, apurado: 1000 }), "Presidente", "BR")).not.toBeNull();
  });

  test("one vote more and the leader could still pass half: no claim", () => {
    expect(segundoTurno(arq({ votos: [401, 300, 199, 100], apto: 1200, apurado: 1000 }), "Presidente", "BR")).toBeNull();
  });

  test("the electors still to count are the worst case: more of them and the same votes prove nothing", () => {
    const folga = arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950 }); // falta 50: 450 of 950
    expect(segundoTurno(folga, "Governador", "SP")).not.toBeNull();
    expect(segundoTurno({ ...folga, eleitorado: { apto: 1300, apurado: 950 } }, "Governador", "SP")).toBeNull(); // falta 350: 750 of 1.250
  });

  test("with every section counted it is the plain rule: nobody above half of the valid votes", () => {
    expect(segundoTurno(arq({ votos: [450, 400, 150], apurado: 1000, fase: "concluida" }), "Presidente", "BR")).not.toBeNull();
    expect(segundoTurno(arq({ votos: [501, 400, 99], apurado: 1000, fase: "concluida" }), "Presidente", "BR")).toBeNull();
  });

  test("when the candidates add up to more than the file's valid-vote total, the smaller is the base", () => {
    // 400 + 380 + 100 = 880, falta 50. Base 880: 450 of 930 holds. The file says 800 valid: 450 of 850 would be over half.
    expect(segundoTurno(arq({ votos: [400, 380, 100], apto: 1000, apurado: 950, validos: 880 }), "Governador", "SP")).not.toBeNull();
    expect(segundoTurno(arq({ votos: [400, 380, 100], apto: 1000, apurado: 950, validos: 800 }), "Governador", "SP")).toBeNull();
  });

  test("it does not depend on the order the candidates come in", () => {
    const d = arq({ votos: [20, 380, 100, 400], apto: 1000, apurado: 950 });
    expect(segundoTurno(d, "Governador", "SP").finalistas.sort()).toEqual(["c2", "c4"]);
  });
});

describe("who goes to the runoff: the third place cannot catch the second even with every vote left", () => {
  test("pair closed when the gap between second and third is bigger than the electors left", () => {
    const d = arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950 });
    expect(segundoTurno(d, "Presidente", "BR")).toEqual({ finalistas: ["c1", "c2"] });
  });

  test("a gap equal to the electors left is still open, one more closes it", () => {
    // falta 50. 301 - 250 = 51 closes; 300 - 250 = 50 does not (the third takes all 50 and ties).
    expect(segundoTurno(arq({ votos: [400, 301, 250, 49], apto: 1050, apurado: 1000 }), "Presidente", "BR")).toEqual({ finalistas: ["c1", "c2"] });
    expect(segundoTurno(arq({ votos: [400, 300, 250, 50], apto: 1050, apurado: 1000 }), "Presidente", "BR")).toEqual({ finalistas: null });
  });

  test("runoff certain, second place open: says so without naming a pair", () => {
    expect(segundoTurno(arq({ votos: [400, 300, 200, 100], apto: 1200, apurado: 1000 }), "Presidente", "BR")).toEqual({ finalistas: null });
  });

  test("a tie for second is open, never closed", () => {
    expect(segundoTurno(arq({ votos: [400, 250, 250, 100], apto: 1000, apurado: 1000, fase: "concluida" }), "Presidente", "BR")).toEqual({ finalistas: null });
  });
});

describe("what it refuses to claim", () => {
  const ok = arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950 });

  test("only offices with one seat and one round of votes: Senate and deputies have no such proof", () => {
    for (const cargo of ["Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital"]) expect(segundoTurno(ok, cargo, "SP")).toBeNull();
  });

  test("a state file of the presidential race is a slice, never a result", () => {
    expect(segundoTurno(ok, "Presidente", "SP")).toBeNull();
    expect(segundoTurno(ok, "Presidente", "ZZ")).toBeNull();
    expect(segundoTurno(ok, "Presidente")).toBeNull();
    expect(segundoTurno(ok, "Presidente", "BR")).not.toBeNull();
    expect(segundoTurno(ok, "Governador", "SP")).not.toBeNull(); // a governor's state file is the whole race
  });

  test("with two candidates one of them ends above half: there is no runoff to guarantee", () => {
    expect(segundoTurno(arq({ votos: [400, 380], apto: 1000, apurado: 950 }), "Governador", "SP")).toBeNull();
  });

  test("an exact tie between two candidates passes the half test but has no third place to compare: no claim, no crash", () => {
    expect(segundoTurno(arq({ votos: [400, 400], apto: 1000, apurado: 1000, fase: "concluida" }), "Governador", "SP")).toBeNull();
  });

  test("before the count starts, with no file, or with a seat count that is not one", () => {
    expect(segundoTurno({ ...ok, fase: "aguardando" }, "Presidente", "BR")).toBeNull();
    expect(segundoTurno(null, "Presidente", "BR")).toBeNull();
    expect(segundoTurno(arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, vagas: 2 }), "Governador", "SP")).toBeNull();
  });

  test("numbers that cannot be right: no electorate, counted above the total, no valid votes", () => {
    expect(segundoTurno(arq({ votos: [400, 380, 100], apto: 0, apurado: 0 }), "Governador", "SP")).toBeNull();
    expect(segundoTurno(arq({ votos: [400, 380, 100], apto: 700, apurado: 800 }), "Governador", "SP")).toBeNull();
    expect(segundoTurno(arq({ votos: [0, 0, 0], validos: 0 }), "Governador", "SP")).toBeNull();
    expect(segundoTurno({ ...ok, eleitorado: { apto: NaN, apurado: 950 } }, "Governador", "SP")).toBeNull();
  });

  test("candidates without an id, or sharing one, would all get the label: claim nothing", () => {
    const semId = arq({ votos: [400, 380, 100] });
    semId.candidatos.forEach((c) => { c.id = ""; });
    expect(segundoTurno(semId, "Governador", "SP")).toBeNull();
    const repetido = arq({ votos: [400, 380, 100] });
    repetido.candidatos[1].id = "c1";
    expect(segundoTurno(repetido, "Governador", "SP")).toBeNull();
  });

  test("the TSE disagreeing: someone already 'Eleito', or the runoff mark outside the pair, claims nothing", () => {
    const d = (situacao) => arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, situacao });
    expect(segundoTurno(d(["Eleito"]), "Presidente", "BR")).toBeNull();
    expect(segundoTurno(d(["", "", "Eleito"]), "Presidente", "BR")).toBeNull();
    expect(segundoTurno(d(["2º turno", "", "2º turno"]), "Presidente", "BR")).toBeNull();
    expect(segundoTurno(d(["", "", "2º turno"]), "Presidente", "BR")).toBeNull();
  });

  test("runoff marks while the Radar cannot name the pair: the TSE already knows more, so the Radar stays out", () => {
    // 300 vs 200 for second and third, 200 electors left: the pair is open (gap 100 < 200).
    const d = (situacao) => arq({ votos: [400, 300, 200, 100], apto: 1200, apurado: 1000, situacao });
    expect(segundoTurno(d([]), "Presidente", "BR")).toEqual({ finalistas: null }); // control: no marks, the claim stands
    expect(segundoTurno(d(["2º turno", "2º turno"]), "Presidente", "BR")).toBeNull(); // marks on the leading two
    expect(segundoTurno(d(["2º turno", "", "2º turno"]), "Presidente", "BR")).toBeNull(); // marks on one and the third
    expect(segundoTurno(d(["", "", "2º turno"]), "Presidente", "BR")).toBeNull();
  });

  test("the TSE agreeing, however it writes the mark, changes nothing", () => {
    const d = (situacao) => arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, situacao });
    for (const txt of ["2º turno", "2° turno", "2o turno", "2 turno"]) expect(segundoTurno(d([txt, txt]), "Presidente", "BR")).toEqual({ finalistas: ["c1", "c2"] });
    expect(segundoTurno(d(["2º turno"]), "Presidente", "BR")).toEqual({ finalistas: ["c1", "c2"] }); // only one of the two marked yet
    expect(segundoTurno(d(["", "Não eleito"]), "Presidente", "BR")).toEqual({ finalistas: ["c1", "c2"] }); // not "Eleito": no conflict
  });
});
