import { describe, expect, test } from "bun:test";
import { tseUrl, turnoDe } from "./apuracao-tse.js";
import { lerTurno, seletorTurno } from "./apuracao-turno.js";
import { vistasDe } from "./apuracao.js";

describe("turno padrão", () => {
  const sem = (chave: string | null) => ({ getItem: () => chave });
  const g = globalThis as { localStorage?: unknown };
  const guardado = g.localStorage;
  const com = (chave: string | null, f: () => void) => { g.localStorage = sem(chave); try { f(); } finally { g.localStorage = guardado; } };

  test("sem escolha gravada, abre no 2º turno a partir do dia dele (Brasília)", () => {
    com(null, () => {
      expect(lerTurno(new Date("2026-10-25T02:59:00Z"))).toBe(1); // 24/10 23:59 em Brasília
      expect(lerTurno(new Date("2026-10-25T03:00:00Z"))).toBe(2); // 25/10 00:00 em Brasília
      expect(lerTurno(new Date("2026-11-02T12:00:00Z"))).toBe(2);
    });
  });
  test("a escolha gravada vence a data", () => {
    com("1", () => expect(lerTurno(new Date("2026-10-25T20:00:00Z"))).toBe(1));
    com("2", () => expect(lerTurno(new Date("2026-10-01T12:00:00Z"))).toBe(2));
  });
  test("armazenamento bloqueado cai no padrão da data", () => {
    g.localStorage = { getItem: () => { throw new Error("blocked"); } };
    try { expect(lerTurno(new Date("2026-10-25T20:00:00Z"))).toBe(2); } finally { g.localStorage = guardado; }
  });
});

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
