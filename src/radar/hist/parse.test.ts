import { describe, expect, test } from "bun:test";
import { cargoKey, isElected, isoDate, legendVotes, keyOf, listKey, nominalVotes, personKey } from "./parse";

describe("historical file layouts", () => {
  test("dates: plain and the 2014 accounts' glued date-time both read as ISO", () => {
    expect(isoDate("02/10/2018")).toBe("2018-10-02");
    expect(isoDate("02/10/201400:00:00")).toBe("2014-10-02");
    expect(isoDate("")).toBe("");
    expect(isoDate("#NULO#")).toBe("");
  });

  test("only the three 'ELEITO' outcomes are wins, not substitutes or runoffs", () => {
    for (const s of ["ELEITO", "ELEITO POR QP", "ELEITO POR MÉDIA"]) expect(isElected(s)).toBe(true);
    for (const s of ["SUPLENTE", "NÃO ELEITO", "2º TURNO", "#NULO#", "#NULO", ""]) expect(isElected(s)).toBe(false);
  });

  test("a list is its coalition id; a missing or masked id falls back to the party number", () => {
    expect(listKey({ SQ_COLIGACAO: "130000050539", NR_PARTIDO: "40" })).toBe("130000050539");
    expect(listKey({ SQ_COLIGACAO: "#NULO#", NR_PARTIDO: "40" })).toBe("P40");
    expect(listKey({ SQ_COLIGACAO: "-1", NR_PARTIDO: "13" })).toBe("P13");
    expect(listKey({})).toBe("P?");
  });

  test("valid votes win over the raw column when the layout has both", () => {
    expect(nominalVotes({ QT_VOTOS_NOMINAIS_VALIDOS: "90", QT_VOTOS_NOMINAIS: "100" })).toBe(90);
    expect(nominalVotes({ QT_VOTOS_NOMINAIS: "100" })).toBe(100);
    expect(nominalVotes({ QT_VOTOS_NOMINAIS: "x" })).toBe(0);
    expect(legendVotes({ QT_VOTOS_LEGENDA_VALIDOS: "7" })).toBe(7);
    expect(legendVotes({ QT_VOTOS_LEGENDA: "3" })).toBe(3);
    expect(legendVotes({})).toBe(0);
  });

  test("cargo names compare case-insensitively", () => {
    expect(cargoKey("Deputado Federal")).toBe("DEPUTADO FEDERAL");
    expect(cargoKey(undefined)).toBe("");
  });

  test("person key ignores accents, case and CPF, and needs both a name and a birth date", () => {
    const a = { NM_CANDIDATO: "José da Conceição", DT_NASCIMENTO: "03/04/1970", NR_CPF_CANDIDATO: "-4" };
    const b = { NM_CANDIDATO: "JOSE DA CONCEICAO", DT_NASCIMENTO: "03/04/1970", NR_CPF_CANDIDATO: "12345678901" };
    expect(personKey(a)).toBe(personKey(b));
    expect(personKey({ ...a, DT_NASCIMENTO: "04/04/1970" })).not.toBe(personKey(a));
    expect(personKey({ NM_CANDIDATO: "SEM DATA" })).toBe("");
    expect(personKey({ DT_NASCIMENTO: "03/04/1970" })).toBe("");
    expect(keyOf("JOSE DA CONCEICAO", "1970-04-03")).toBe(personKey(b)); // the 2026 cadastro hands over ISO dates
    expect(keyOf("Fulano", null)).toBe("");
  });
});
