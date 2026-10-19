import { describe, expect, test } from "bun:test";
import { tseUrl, turnoDe } from "./apuracao-tse.js";
import { seletorTurno } from "./apuracao-turno.js";
import { vistasDe } from "./apuracao.js";

describe("turno", () => {
  test("2º turno usa os códigos 6258/6260 só em Presidente e Governador", () => {
    expect(tseUrl("Presidente", "BR", undefined, 2)).toContain("e006258");
    expect(tseUrl("Governador", "SP", undefined, 2)).toContain("e006260");
    expect(turnoDe("Senador", 2)).toBe(1);
    expect(turnoDe("Presidente", 2)).toBe(2);
  });
  test("seletor só existe onde há 2º turno", () => {
    expect(seletorTurno("Deputado Federal", 1)).toBe("");
    expect(seletorTurno("Presidente", 2)).toContain('data-turno="2"');
  });
  test("sem Projeção no 2º turno", () => {
    expect(vistasDe("Presidente", 2).includes("projecao")).toBe(false);
    expect(vistasDe("Presidente", 2).includes("municipios")).toBe(true); // the runoff estimate per municipality
    expect(vistasDe("Presidente", 1).includes("municipios")).toBe(false);
    expect(vistasDe("Senador", 2).includes("municipios")).toBe(false);
  });
});
