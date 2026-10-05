import { describe, expect, test } from "bun:test";
import { extenso, renderDuelo } from "./apuracao-duelo.js";
import { PALETA } from "./apuracao-mapa.js";
import type { Apuracao, Cargo, Fase } from "./apuracao-tse.js";

const cor = (partido: string) => (partido === "AAA" ? "#111111" : partido === "BBB" ? "#222222" : "#333333");
// votos sum to the valid votes; pct is the fraction of them, like the parser hands over.
interface ArqOpts { votos: number[]; apto?: number; apurado?: number; fase?: Fase; vagas?: number; situacao?: string[]; nomes?: string[] }
const arq = ({ votos, apto = 1000, apurado = 800, fase = "parcial", vagas = 1, situacao = [], nomes = [] }: ArqOpts = {} as ArqOpts): Apuracao => {
  const total = votos.reduce((a, v) => a + v, 0);
  return {
    fase,
    cargo: { vagas },
    eleitorado: { apto, apurado },
    votos: { validos: total },
    candidatos: votos.map((v, i) => ({ id: `c${i + 1}`, nome: nomes[i] ?? `CAND ${i + 1}`, partido: ["AAA", "BBB", "CCC", "DDD"][i] ?? "EEE", votos: v, pct: v / total, situacao: situacao[i] ?? "" })),
  } as unknown as Apuracao;
};
const html = (d: Apuracao | null, cargo = "Presidente", uf = "BR") => renderDuelo({ d, cargo: cargo as Cargo, uf, cor });

describe("votes in a sentence", () => {
  test("millions, with the singular below two, thousands, and small numbers as they are", () => {
    expect(extenso(2_900_000)).toBe("2,9 milhões");
    expect(extenso(1_200_000)).toBe("1,2 milhão");
    expect(extenso(1_999_999)).toBe("2,0 milhões");
    expect(extenso(999_499)).toBe("999 mil");
    expect(extenso(999_500)).toBe("1,0 milhão");
    expect(extenso(233_400)).toBe("233 mil");
    expect(extenso(850)).toBe("850");
    expect(extenso(0)).toBe("0");
  });
});

describe("what the head-to-head shows", () => {
  const d = arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, nomes: ["ANA", "BRUNO", "CARLA", "DANI"] });

  test("the two with the most votes, in the order of the count, on a bar with the 50% line", () => {
    const out = html(d);
    expect(out).toContain('class="apu-duelo-tick"');
    expect(out).toContain("width:44.44%;background:#111111"); // 400 of 900 valid votes
    expect(out).toContain("width:42.22%;background:#222222");
    expect(out.indexOf("Ana")).toBeLessThan(out.indexOf("Bruno"));
  });

  test("the bar has a text equivalent and the same numbers are printed beside it", () => {
    const out = html(d);
    expect(out).toContain('aria-label="Votos válidos até agora: Ana 44,4%, Bruno 42,2%, demais 13,3%. A linha do meio marca 50%."');
    expect(out).toContain("44,44%");
    expect(out).toContain("42,22%");
    expect(out).toContain("Demais 2 candidaturas <b>13,3%</b>");
  });

  test("how far each is from 50%, the gap in points and in votes, and the electors still to count", () => {
    const out = html(d);
    expect(out).toContain("faltam 5,6 p.p. para 50%"); // 50 - 44,44
    expect(out).toContain("faltam 7,8 p.p. para 50%");
    expect(out).toContain("Diferença entre os dois: <b>2,2 p.p.</b> (20 de votos)");
    expect(out).toContain("<b>50</b>, contando quem não comparece");
  });

  test("when the session's colour memory has run out the two leaders still tell apart", () => {
    const d = arq({ votos: [400, 380, 100], apto: 1000, apurado: 950 });
    const cheia = () => "#8a948b"; // the shared grey every party past the palette gets
    cheia.resto = "#8a948b";
    const out = renderDuelo({ d, cargo: "Presidente", uf: "BR", cor: cheia });
    expect(out).toContain(`width:45.45%;background:${PALETA[0]}`); // 400 of 880 valid votes
    expect(out).toContain(`width:43.18%;background:${PALETA[1]}`);
    expect((out.match(/background:#8a948b/g) ?? []).length).toBe(0);
    // the same colour for both, even if it is not the grey: also falls back
    const igual = () => "#123456";
    expect(renderDuelo({ d, cargo: "Presidente", uf: "BR", cor: igual })).toContain(`background:${PALETA[1]}`);
  });

  test("each legend line keeps the name and the distance to 50% apart, so a phone can stack them", () => {
    const out = html(d);
    expect(out).toContain('<span class="lg-nm"><b>Ana</b> <small>AAA</small> <b>44,44%</b></span> <span class="lg-fl">faltam 5,6 p.p. para 50%</span>');
    expect(out).toContain('<span class="lg-nm">Demais 2 candidaturas <b>13,3%</b></span>');
  });

  test("above half it says so in words, never a negative distance", () => {
    const out = html(arq({ votos: [600, 150, 50], apurado: 900 }), "Governador", "SP");
    expect(out).toContain("acima de 50% dos votos válidos até agora");
    expect(out).not.toContain("faltam -");
  });

  test("candidate names are escaped", () => {
    const out = html(arq({ votos: [400, 380, 100], nomes: ["<IMG SRC=X>", "B", "C"], apto: 1000, apurado: 950 }));
    expect(out).not.toContain("<IMG");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img Src=x&gt;"); // titleName capitalizes the word after the space
  });

  test("the rest of the field reads right with one other candidate and with none", () => {
    expect(html(arq({ votos: [400, 380, 100], apto: 1000, apurado: 950 }))).toContain("1 outra candidatura <b>");
    expect(html(arq({ votos: [400, 380], apto: 1000, apurado: 950 }))).not.toContain("candidatura");
  });
});

describe("the runoff banner is the proof, nothing more", () => {
  test("shown, with the pair, when the proof holds", () => {
    const out = html(arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, nomes: ["ANA", "BRUNO", "CARLA", "DANI"] }));
    expect(out).toContain("Segundo turno garantido.");
    expect(out).toContain("Disputam: <b>Ana</b>");
    expect(out).toContain("não é a marcação do TSE");
  });

  test("claim, pair and label stay in view; the rule folds away behind a summary", () => {
    const out = html(arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, nomes: ["ANA", "BRUNO", "CARLA", "DANI"] }));
    const [aberto, dobrado] = out.split("<details");
    expect(aberto).toContain("Segundo turno garantido.");
    expect(aberto).toContain("Disputam: <b>Ana</b>");
    expect(aberto).toContain("não é a marcação do TSE"); // the label is never hidden behind a tap
    expect(aberto).not.toContain("continuaria em 50% ou menos");
    expect(dobrado).toContain('data-k="regra-2t"'); // dom.js restores the fold by this key after a redraw
    expect(dobrado).toContain("continuaria em 50% ou menos");
    expect(dobrado).toContain("O terceiro colocado não alcançaria o segundo");
  });

  test("with second place still open, that is said in view and the reason is folded", () => {
    const out = html(arq({ votos: [400, 300, 200, 100], apto: 1200, apurado: 1000 }));
    const [aberto, dobrado] = out.split("<details");
    expect(aberto).toContain("Quem fica em segundo ainda não está fechado.");
    expect(dobrado).toContain("A diferença entre o 2º e o 3º é menor do que o número de eleitores que faltam.");
  });

  test("the wording holds whoever the leader is: no pronoun", () => {
    const out = html(arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, nomes: ["ANA", "BRUNO", "CARLA", "DANI"] }));
    expect(out).toContain("a parcela de <b>Ana</b> <small>AAA</small> nos votos válidos continuaria em 50% ou menos");
    expect(out).not.toMatch(/\b(ele|ela) não passaria/);
  });

  test("runoff certain but second place open: says that, names no pair", () => {
    const out = html(arq({ votos: [400, 300, 200, 100], apto: 1200, apurado: 1000 }));
    expect(out).toContain("Segundo turno garantido.");
    expect(out).toContain("ainda não está fechado");
    expect(out).not.toContain("Disputam:");
  });

  test("absent while the leader could still pass half, and never claims a winner", () => {
    const out = html(arq({ votos: [600, 150, 50], apurado: 900 }));
    expect(out).not.toContain("Segundo turno");
    expect(out).not.toMatch(/vai vencer|será eleito|vencedor/i);
  });

  test("absent when the TSE already says 'Eleito'", () => {
    expect(html(arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, situacao: ["Eleito"] }))).not.toContain("Segundo turno");
  });

  test("a governor's state file gets it; the presidential one only at the national scope", () => {
    const d = arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950 });
    expect(html(d, "Governador", "SP")).toContain("Segundo turno garantido.");
    expect(html(d, "Presidente", "SP")).not.toContain("Segundo turno");
  });
});

describe("where it shows nothing", () => {
  const d = arq({ votos: [400, 380, 100] });
  test("offices that are not a one-seat race", () => {
    for (const cargo of ["Senador", "Deputado Federal", "Deputado Estadual"]) expect(html(d, cargo, "SP")).toBe("");
  });
  test("no file, before the count, one candidate, or no votes yet", () => {
    expect(html(null)).toBe("");
    expect(html({ ...d, fase: "aguardando" as const })).toBe("");
    expect(html(arq({ votos: [400] }))).toBe("");
    expect(html(arq({ votos: [0, 0, 0], apurado: 0 }))).toBe("");
  });
});
