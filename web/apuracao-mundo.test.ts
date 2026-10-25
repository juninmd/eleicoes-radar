import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { bolhasMundo, pontoNoMundo } from "./apuracao-noite.js";
import { pontosMundo } from "./apuracao-exterior.js";
import { posicaoCidade } from "./exterior-cidades.js";
import type { MunArquivo } from "./apuracao-municipios.js";

const mundo = JSON.parse(readFileSync("web/mapa-mundo.json", "utf8")) as { viewBox: [number, number, number, number]; d: string };
const fin = { n: "13", nome: "A", partido: "PT", sq: "1" };
const arq = { cargo: "Presidente", uf: "BR", ano: 2026, a: fin, b: { ...fin, n: "22", partido: "PL" }, cidades: [
  ["1", "LISBOA", "ZZ", 90, 10, 0], ["2", "Tóquio", "ZZ", 20, 90, 10], ["3", "ATLANTIDA", "ZZ", 5, 5, 0], ["4", "SÃO PAULO", "SP", 500, 400, 0],
] } as MunArquivo;

describe("mapa-múndi do exterior", () => {
  test("the world file has land and the 3:1 degrees-to-units view box", () => {
    expect(mundo.d.length).toBeGreaterThan(10_000);
    expect(mundo.viewBox).toEqual([0, 0, 1080, 426]);
  });
  test("projects lat/lon equirectangularly: Greenwich on the middle, the top edge at 84°N", () => {
    expect(pontoNoMundo(84, 0, mundo.viewBox)).toEqual([540, 0]);
    expect(pontoNoMundo(0, -180, mundo.viewBox)).toEqual([0, 252]);
  });
  test("only cities abroad with a known position become points; the rest are counted", () => {
    const { pontos, semPosicao } = pontosMundo(arq);
    expect(pontos.map((p) => p.nome)).toEqual(["Tóquio", "LISBOA"]);
    expect(pontos).toHaveLength(2);
    expect(semPosicao).toBe(1);
    expect(pontosMundo(null)).toEqual({ pontos: [], semPosicao: 0 });
  });
  test("names match without accents or case", () => {
    expect(posicaoCidade("Tóquio")).toEqual(posicaoCidade("TOQUIO"));
    expect(posicaoCidade("Lugar nenhum")).toBeNull();
  });
  test("bubbles are coloured by the finalist ahead, the bigger city first", () => {
    const svg = bolhasMundo(pontosMundo(arq).pontos, mundo.viewBox, "#a", "#b");
    expect(svg.indexOf('fill="#b"')).toBeLessThan(svg.indexOf('fill="#a"')); // Tóquio (B ahead, 120 votes) is drawn before Lisboa (A ahead, 100)
    expect(svg).toContain("votos válidos");
  });
  test("each city is painted on its own: the colour of the one ahead, as strong as its margin, and the title says both shares", () => {
    const pontos = [
      { nome: "EMPATE", lat: 0, lon: 0, votos: 100, a: 40, b: 40, o: 20 },
      { nome: "APERTADA", lat: 10, lon: 10, votos: 100, a: 50, b: 40, o: 10 },
      { nome: "LARGA", lat: 20, lon: 20, votos: 100, a: 10, b: 80, o: 10 },
    ];
    const svg = bolhasMundo(pontos, mundo.viewBox, "#a", "#b", 16, ["Ana", "Beto"]);
    const por = (nome: string) => svg.split("<circle").find((c) => c.includes(`<title>${nome[0]}${nome.slice(1).toLowerCase()}:`))!;
    expect(por("EMPATE")).toContain('fill="var(--vazio)"'); // a dead heat has no colour to give
    expect(por("APERTADA")).toContain('fill="#a"');
    expect(por("LARGA")).toContain('fill="#b"');
    const opac = (c: string) => Number(/fill-opacity:([\d.]+)/.exec(c)![1]);
    expect(opac(por("APERTADA"))).toBeLessThan(opac(por("LARGA"))); // 10 p.p. against 70 p.p.
    expect(opac(por("LARGA"))).toBe(1);
    expect(por("APERTADA")).toContain("Ana 50,0% · Beto 40,0% · outros 10,0%");
    expect(svg).not.toMatch(/vencedor|vencer|eleit/i);
  });
});
