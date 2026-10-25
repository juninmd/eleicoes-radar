import { describe, expect, test } from "bun:test";
import { cand, file } from "../../../web/apuracao-fixtures";
import { parseApuracao } from "../../../web/apuracao-tse";
import { AVANCO_MINIMO, detectar, INTERVALO_VIRADA_MS, type Disputa, type EstadoDisputa } from "./eventos";

const PRES: Disputa = { cargo: "Presidente", uf: "BR", rotulo: "Presidente", marcos: true };
const GOV: Disputa = { cargo: "Governador", uf: "AC", rotulo: "Governo AC", marcos: false };

// Two candidates; `a`/`b` are votes. apto 100 / apurado 90 leaves 10 electors to count, so 51+ votes of 90 valid is decided.
function arq(o: { a: number; b: number; st?: number; apurado?: number; sitA?: string }) {
  const pa = ((o.a / (o.a + o.b || 1)) * 100).toFixed(2).replace(".", ",");
  const pb = ((o.b / (o.a + o.b || 1)) * 100).toFixed(2).replace(".", ",");
  const f = file({ s: { ts: "100", st: String(o.st ?? 50) }, v: { tv: String(o.a + o.b), vv: String(o.a + o.b), vvc: String(o.a + o.b) },
    cands: [cand("a1", "13", "ANA SOUZA", "1", String(o.a), pa, "n", o.sitA ?? ""), cand("b2", "22", "BETO LIMA", "2", String(o.b), pb)] });
  return parseApuracao({ ...f, e: { te: "100", est: String(o.apurado ?? 90), c: "80", a: "20" } })!;
}
const seed = (d = arq({ a: 40, b: 35 }), disp = PRES) => detectar(null, d, disp, 0).estado;
const ids = (es: { id: string }[]) => es.map((e) => e.id.split(":").slice(1).join(":"));

describe("detectar", () => {
  test("first sight announces nothing, even a race the TSE already marked: a restart must not replay the night", () => {
    const r = detectar(null, arq({ a: 60, b: 30, sitA: "Eleito", st: 100 }), PRES, 0);
    expect(r.eventos).toEqual([]);
    expect(r.estado.emitidos.size).toBeGreaterThan(0);
    expect(detectar(r.estado, arq({ a: 60, b: 30, sitA: "Eleito", st: 100 }), PRES, 1).eventos).toEqual([]);
  });
  test("the count starting is an event once; milestones fire once as the sections pass them", () => {
    const vazio = parseApuracao(file({ s: { ts: "100", st: "0" }, v: { tv: "0", vv: "0", vvc: "0" }, cands: [cand("a1", "13", "ANA SOUZA", "1", "0", "0"), cand("b2", "22", "BETO LIMA", "2", "0", "0")] }))!;
    const s0 = detectar(null, vazio, PRES, 0).estado;
    const r1 = detectar(s0, arq({ a: 5, b: 4, st: 3 }), PRES, 1);
    expect(ids(r1.eventos)).toEqual(["inicio"]);
    const r2 = detectar(r1.estado, arq({ a: 50, b: 40, st: 55 }), PRES, 2);
    expect(ids(r2.eventos)).toEqual(["m50"]);
    expect(detectar(r2.estado, arq({ a: 50, b: 41, st: 56 }), PRES, 3).eventos).toEqual([]);
  });
  test("a state race has no percentage milestones, only the facts that matter", () => {
    const r = detectar(seed(arq({ a: 5, b: 4, st: 3 }), GOV), arq({ a: 50, b: 40, st: 95 }), GOV, 1);
    expect(r.eventos).toEqual([]);
  });
  test("the lead changing is news only after the first urns stop being noise, and not more than once per interval", () => {
    const base = seed(arq({ a: 40, b: 35, st: 50 }));
    const cedo = detectar(seed(arq({ a: 4, b: 3, st: 5 })), arq({ a: 4, b: 6, st: 6 }), PRES, 10);
    expect(AVANCO_MINIMO).toBeGreaterThan(0.05);
    expect(cedo.eventos).toEqual([]); // 5% of the sections: noise
    const r = detectar(base, arq({ a: 40, b: 45, st: 52 }), PRES, INTERVALO_VIRADA_MS + 1);
    expect(ids(r.eventos)).toEqual(["virada:1"]);
    expect(r.eventos[0].texto).toContain("Beto Lima passou à frente de Ana Souza");
    const volta = detectar(r.estado, arq({ a: 50, b: 45, st: 53 }), PRES, INTERVALO_VIRADA_MS + 60_000);
    expect(volta.eventos).toEqual([]); // flipped back a minute later: no second buzz
    const depois = detectar(volta.estado, arq({ a: 50, b: 60, st: 54 }), PRES, 2 * INTERVALO_VIRADA_MS + 5);
    expect(ids(depois.eventos)).toEqual(["virada:2"]);
  });
  test("the Radar's proof is labelled as a calculation, not as the TSE's mark", () => {
    const r = detectar(seed(), arq({ a: 60, b: 30, st: 90 }), PRES, 5);
    const prova = r.eventos.find((e) => e.tipo === "prova")!;
    expect(prova.id).toBe("Presidente-BR:prova:a1");
    expect(prova.texto).toContain("Ainda não é a marcação do TSE");
    expect(prova.titulo).not.toMatch(/eleit/i);
  });
  test("only the TSE's own text says Eleito, quoted from its file, once per candidate", () => {
    const r = detectar(seed(), arq({ a: 60, b: 30, st: 100, apurado: 100, sitA: "Eleito" }), PRES, 5);
    const tse = r.eventos.filter((e) => e.tipo === "tse");
    expect(tse.map((e) => e.titulo)).toEqual(['Presidente: o TSE marcou "Eleito"']);
    expect(ids(r.eventos)).toContain("fim");
  });
  test("no event ever promises a winner", () => {
    let s: EstadoDisputa = seed(arq({ a: 4, b: 3, st: 5 }));
    const todos = [arq({ a: 40, b: 45, st: 50 }), arq({ a: 60, b: 30, st: 90 }), arq({ a: 60, b: 30, st: 100, apurado: 100, sitA: "Eleito" })].flatMap((d, i) => {
      const r = detectar(s, d, PRES, (i + 1) * INTERVALO_VIRADA_MS);
      s = r.estado;
      return r.eventos;
    });
    expect(todos.length).toBeGreaterThanOrEqual(4);
    for (const e of todos) expect(`${e.titulo} ${e.texto}`).not.toMatch(/vencedor|venceu|vai ganhar|será eleit|vai vencer/i);
  });
});
