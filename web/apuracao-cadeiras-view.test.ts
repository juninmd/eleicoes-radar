import { describe, expect, test } from "bun:test";
import { renderCadeiras } from "./apuracao-cadeiras-view.js";

const c = (id, lista, votos, extra = {}) => ({ id, nome: `${id.toUpperCase()} SILVA`, partido: "PXX", num: "1234", votos, pct: 0, destaque: false, situacao: "", lista, ...extra });
const dados = (over = {}) => ({
  secoes: { total: 100, totalizadas: 90 },
  partidos: [{ nome: "L1", vagas: 2 }, { nome: "L2", vagas: 1 }],
  candidatos: [c("a", "L1", 1000), c("b", "L1", 900), c("c", "L1", 850), c("d", "L1", 10), c("e", "L2", 500), c("f", "L2", 100)],
  ...over,
});
const byId = new Map([["a", { id: "a" }]]);

describe("renderCadeiras", () => {
  const html = renderCadeiras({ d: dados(), byId });

  test("it says up front that this reads today's count and is not a result", () => {
    expect(html).toMatch(/não é resultado/);
    expect(html).toMatch(/O TSE/);
  });

  test("each list shows its seats and the candidates holding them, with votes", () => {
    expect(html).toContain("L1");
    expect(html).toContain("A Silva");
    expect(html).toContain("B Silva");
    expect(html).toMatch(/1\.000/);
    expect(html).toMatch(/3 de 3|3 vagas|total/i);
  });

  test("the first ones left out of a list are shown with the votes they miss", () => {
    expect(html).toContain("C Silva");
    expect(html).toMatch(/fora por enquanto/i);
  });

  test("a tight list says so with the numbers behind it: the gap and what the last one in can still receive", () => {
    expect(html).toMatch(/apertada/i);
    expect(html).toMatch(/50 votos/); // 900 - 850
    expect(html).toMatch(/cerca de\s*(<b>)?100 votos/); // 900 x 10/90
  });

  test("tight lists open by default and a list that is not tight stays closed", () => {
    expect(html).toMatch(/<details[^>]*data-k="cad-L1"[^>]* open/);
    expect(html).not.toMatch(/<details[^>]*data-k="cad-L2"[^>]* open/);
  });

  test("the TSE's own status text is shown next to the candidate when the TSE has published one", () => {
    const out = renderCadeiras({ d: dados({ candidatos: [c("a", "L1", 1000, { situacao: "Eleito por QP", destaque: true }), ...dados().candidatos.slice(1)] }), byId });
    expect(out).toContain("Eleito por QP");
  });

  test("a candidate with a profile opens it; one without is plain text", () => {
    expect(html).toContain('data-open="a"');
    expect(html).not.toContain('data-open="b"');
  });

  test("names from the file are escaped", () => {
    const out = renderCadeiras({ d: dados({ candidatos: [c("a", "L1", 1000, { nome: "<img src=x> SILVA" }), ...dados().candidatos.slice(1)] }), byId });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  test("it never says who will take office", () => {
    expect(html).not.toMatch(/será eleit|vai se eleger|vai ganhar|vencerá/i);
  });

  test("with the count complete there is no 'tight' wording, and with nothing counted it waits", () => {
    const fechada = renderCadeiras({ d: dados({ secoes: { total: 100, totalizadas: 100 } }), byId });
    expect(fechada).toMatch(/Nenhuma lista tem a última vaga apertada/);
    expect(fechada).not.toMatch(/Vagas apertadas<\/h3>|última vaga apertada<\/span>|<details[^>]* open/); // no section, no badge, nothing opened
    const vazio = renderCadeiras({ d: dados({ secoes: { total: 100, totalizadas: 0 } }), byId });
    expect(vazio).toMatch(/Aguardando/);
    expect(vazio).not.toMatch(/A Silva/);
  });

  test("the rule is on the page: seats per list come from the TSE, inside a list they go to the most voted", () => {
    expect(html).toMatch(/<details[^>]*>[\s\S]*Como ler as cadeiras/);
    expect(html).toMatch(/mais votados/);
  });
});
