import { describe, expect, test } from "bun:test";
import { codificar, decodificar } from "./apuracao-link.js";

describe("link da apuração", () => {
  test("round trip", () => {
    const v = { cargo: "Governador", uf: "RJ", vista: "mapa", turno: 2 as const, passo: 40 };
    expect(decodificar(codificar(v), 72)).toEqual(v);
  });
  test("round 1 and real data leave no t or s", () => {
    expect(codificar({ cargo: "Presidente", uf: "BR", vista: "placar", turno: 1 })).toBe("#apuracao?c=Presidente&uf=BR&v=placar");
  });
  test("malformed or hand-edited links are dropped", () => {
    expect(decodificar("#sobre", 72)).toBeNull();
    expect(decodificar("#apuracao?c=Rei&uf=BR", 72)).toBeNull();
    expect(decodificar("#apuracao?c=Presidente&uf=../x", 72)).toBeNull();
    expect(decodificar("#apuracao?c=Presidente&uf=BR&v=<b>&s=99&t=7", 72)).toEqual({ cargo: "Presidente", uf: "BR" });
  });
});
