import { describe, expect, test } from "bun:test";
import { caminho, numeros, onda, ondeFalta, pesquisas2t } from "./apuracao-aovivo-2t.js";
import { mi, renderCaminho, renderNumeros, renderOnda, renderOndeFalta, renderPesquisas2t } from "./apuracao-aovivo-2t-view.js";
import { difPesquisa, renderAoVivo, BRASIL } from "./apuracao-aovivo.js";
import { atualizar, vazio } from "./apuracao-eleitos.js";
import { registrar } from "./apuracao-graficos.js";
import { createCores } from "./apuracao-nacional.js";
import { parseApuracao } from "./apuracao-tse.js";
import { cand, file } from "./apuracao-fixtures.js";
import type { PesquisaBruta } from "./apuracao-aovivo-2t.js";
import type { LadoPrev, Previsao } from "./apuracao-previsao.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";

// The panels never say who will win: "à frente", "precisa de" and "o que falta" are all the words they use for the count.
const VENCEDOR = /\b(vencer[áa]?|venceu|vai ganhar|ser[áa] eleit[oa]s?|vencedor[ae]?s?|eleit[oa]s?)\b/i;
const cor = createCores(["#111111", "#222222", "#333333"], "#999999");
const A = "280000000001", B = "280000000002";
const par = { a: { id: A, nome: "ANA <b>ALFA</b>", partido: "AAA" }, b: { id: B, nome: "BETO BETA", partido: "BBB" } };
const poll = (instituto: string, fim: string, a: number, b: number): PesquisaBruta => ({ instituto, fim, votos: { [A]: a, [B]: b }, amostra: 4050, margem: 2, indecisos: 5 });
const corrida = { confrontos: [{ a: A, b: B, qa: 0.5086, n: 22 }], segundoTurno: [poll("DataFolha", "2026-10-24", 47, 48), poll("Quaest <i>", "2026-10-24", 46, 45)] };

describe("mi", () => {
  test("millions with the precision a reader needs, thousands in full", () => {
    expect(mi(2_440_000)).toBe("2,44 mi");
    expect(mi(54_010_000)).toBe("54,0 mi");
    expect(mi(674_461)).toBe("674.461");
  });
});

describe("pesquisas do 2º turno (visão)", () => {
  const p = pesquisas2t(corrida, par, null)!;
  const html = renderPesquisas2t(p, par, cor);

  test("prints every value it draws: the average of the pair, each institute with its share and the raw numbers", () => {
    expect(html).toContain("50,9%"); // the average of A
    expect(html).toContain("49,1%"); // and of B
    expect(html).toContain("22</b> pesquisas");
    expect(html).toContain("DataFolha");
    expect(html).toContain(">47×48<"); // the poll as it was published, A first
    expect(html).toContain("4.050 entrevistas");
    expect(html).toContain('<small class="pq-det">4.050 entrev. · ±2 pp</small>'); // sample and margin beside the institute, not only in the tooltip
    expect(html.match(/class="pq-pt"/g)).toHaveLength(2 + 1); // two polls and the legend
  });

  test("names come out escaped, and the line of the count only exists when there is a count", () => {
    expect(html).not.toContain("<b>ALFA</b>");
    expect(html).not.toContain("Quaest <i>");
    expect(html).not.toContain("pq-ap"); // before the count
    const d = parseApuracao(file({ cands: [cand(A, "13", "ANA", "1", "600", "60,00"), cand(B, "22", "BETO", "2", "400", "40,00")] }))!;
    const comContagem = renderPesquisas2t(pesquisas2t(corrida, par, d)!, par, cor);
    expect(comContagem).toContain("pq-ap");
    expect(comContagem).toContain("Apuração agora");
    expect(comContagem).toMatch(/▲|▼/); // neutral arrow against the average
    expect(comContagem).not.toContain("aria-label=\"pontos percentuais"); // the text for a screen reader is real text, not an attribute on a bare span
    expect(comContagem).toMatch(/<span class="sr">[\d,]+ pontos percentuais (acima|abaixo) da média das pesquisas<\/span>/);
  });

  test("never names a winner", () => {
    expect(html).not.toMatch(VENCEDOR);
  });
});

describe("contagem em números (visão)", () => {
  test("after the last section it says most voted, not ahead", () => {
    const d = parseApuracao(file({ s: { ts: "100", st: "100" }, cands: [cand(A, "13", "ANA", "1", "6000", "60,00"), cand(B, "22", "BETO", "2", "4000", "40,00")] }))!;
    expect(renderNumeros(numeros(d))).toContain("Ana mais votado");
    expect(renderPesquisas2t(pesquisas2t(corrida, par, d)!, par, cor)).toContain("Apuração concluída");
  });

  test("in a 1st round the valid votes are not 'of the two finalists'", () => {
    const d = parseApuracao(file({ cands: [cand(A, "13", "ANA", "1", "6000", "60,00"), cand(B, "22", "BETO", "2", "4000", "40,00")] }))!;
    const html = renderNumeros({ ...numeros(d)!, candidatos: 4 });
    expect(html).toContain("em todos os candidatos");
    expect(html).not.toContain("dos dois finalistas");
  });

  test("shows the margin in votes and who is ahead, or a tie", () => {
    const d = parseApuracao(file({ cands: [cand(A, "13", "ANA", "1", "6000", "60,00"), cand(B, "22", "BETO", "2", "4000", "40,00")] }))!;
    const html = renderNumeros(numeros(d));
    expect(html).toContain("Diferença");
    expect(html).toContain("2.000");
    expect(html).toContain("Ana à frente");
    expect(renderNumeros(null)).toBe("");
    expect(html).toContain("dos dois finalistas");
    expect(html).not.toMatch(VENCEDOR);
  });
});

const lado = (id: string, apuracao: number, mc: number): LadoPrev => ({ id, nome: id === A ? "ANA ALFA" : "BETO BETA", partido: id === A ? "AAA" : "BBB", chance: 0.5, pesquisa: null, apuracao, mc: [mc - 0.02, mc, mc + 0.02] });
const prev = (fav: LadoPrev, out: LadoPrev, o: Partial<Previsao> = {}): Previsao => ({ turno: 2, favorito: fav, outro: out, nivel: "aberta", n: 2000, contados: 0.5, apurados: 50_000_000, faltam: 50_000_000, decideNoPrimeiro: null, segundoTurno: null, defasadas: [], ...o });

describe("caminho para a frente (visão)", () => {
  test("says what is needed of the votes to come, and that it is an estimate, not a result", () => {
    const html = renderCaminho(caminho(prev(lado(B, 0.54, 0.51), lado(A, 0.46, 0.49))), cor);
    expect(html).toContain("Ana Alfa");
    expect(html).toContain("precisa de <b>54,0%</b>");
    expect(html).toContain("ganhar o que falta por <b>8,0 p.p.</b>");
    expect(html).toContain("Não é resultado");
    expect(html).toContain("cm-prec");
    expect(html).not.toMatch(VENCEDOR);
  });

  test("when it is out of reach it shows no percentage above 100 and no marker for it", () => {
    const html = renderCaminho(caminho(prev(lado(B, 0.8, 0.8), lado(A, 0.2, 0.2), { apurados: 90, faltam: 10 })), cor);
    expect(html).toContain("não chegaria");
    expect(html).not.toMatch(/1\d\d,\d%/);
    expect(html).not.toContain("cm-prec");
  });

  test("when the required margin is under 0.1 p.p. it says pouco mais da metade and menos de 0,1 p.p.", () => {
    const html = renderCaminho(caminho(prev(lado(B, 0.654, 0.5), lado(A, 0.346, 0.5), { apurados: 10_000, faltam: 119_400_000 })), cor);
    expect(html).toContain("precisa de <b>pouco mais da metade</b> dos <b>119,4 mi</b> que ainda faltam, isto é, ganhar o que falta por <b>menos de 0,1 p.p.</b>");
    expect(html).not.toContain("0,0 p.p.");
    expect(html).toContain("precisa de <b>>50%</b>");
    expect(html).toContain('aria-label="Parcela dos votos que faltam: Ana Alfa tem 34,6% do apurado, precisa de pouco mais de 50%');
  });

  test("nothing to say, nothing drawn", () => {
    expect(renderCaminho(null, cor)).toBe("");
  });
});

const arq = (a: number, b: number, apto: number, apurado: number, fase: "parcial" | "aguardando" = "parcial") => parseApuracao(file({
  s: { ts: "100", st: fase === "aguardando" ? "0" : "50" }, v: { vv: String(a + b), vvc: String(a + b), tv: String(a + b) },
  cands: [cand(A, "13", "ANA", "1", String(a), a + b ? ((a / (a + b)) * 100).toFixed(2).replace(".", ",") : "0,00"), cand(B, "22", "BETO", "2", String(b), a + b ? ((b / (a + b)) * 100).toFixed(2).replace(".", ",") : "0,00")],
}))!;
const eleit = (d: ReturnType<typeof arq>, apto: number, apurado: number) => ({ ...d, eleitorado: { ...d.eleitorado, apto, apurado } });
const snap = (ufs: Record<string, ReturnType<typeof arq>>): BrasilSnapshot => ({ cargo: "Presidente", ciclo: 1, buscadoEm: null, ufs: Object.fromEntries(Object.entries(ufs).map(([k, d]) => [k, { status: "ok" as const, dados: d, erro: null, buscadoEm: null }])) });

describe("onde está o que falta (visão)", () => {
  const nac = snap({ SP: eleit(arq(60, 40, 0, 0), 1000, 500), MG: eleit(arq(15, 25, 0, 0), 600, 100), RR: eleit(arq(0, 0, 0, 0, "aguardando"), 300, 0) });

  test("lists the biggest blocks first with leader, margin and share of what is left, and a bar coloured by the leader", () => {
    const html = renderOndeFalta(ondeFalta(nac, { RR: 50 }), par, cor);
    expect(html.indexOf("Minas Gerais")).toBeLessThan(html.indexOf("São Paulo"));
    expect(html).toContain("fa-bar");
    expect(html).toContain("+20,0"); // SP: 60% to 40%
    expect(html).toContain("aguardando votos");
    expect(html).toContain("1 lugar sem votos nos arquivos até agora");
    expect(html).toContain("<b title=\"estimativa do modelo: o arquivo ainda não tem votos\">≈ 50</b>"); // RR has no votes: the model's number, marked as such
    expect(html).toContain("≈ marca o lugar que ainda não tem votos");
    expect(html).not.toContain("menores ficam");
    expect(html).not.toContain("estimativa do modelo</small>"); // two places have their own count: not all of it is the model's
    expect(html).not.toMatch(VENCEDOR);
  });

  test("with everything counted it says there is nothing left, not that it is waiting", () => {
    const feita = eleit(arq(60, 40, 0, 0), 1000, 1000);
    const html = renderOndeFalta(ondeFalta(snap({ SP: feita })), par, cor);
    expect(html).toContain("Não há mais votos a apurar");
    expect(html).not.toContain("Aparece quando");
  });

  test("before any vote it says when it will show, instead of a table of zeros", () => {
    const html = renderOndeFalta(ondeFalta(snap({ SP: eleit(arq(0, 0, 0, 0, "aguardando"), 1000, 0) })), par, cor);
    expect(html).toContain("Aparece quando");
    expect(html).not.toContain("fa-lista");
  });

  test("before the first cycle of files it says it is reading them, not that nothing is left", () => {
    expect(renderOndeFalta(null, par, cor)).toContain("Lendo os arquivos dos estados");
    const html = renderOndeFalta(ondeFalta({ ...nac, ciclo: 0 }), par, cor);
    expect(html).toContain("Lendo os arquivos dos estados");
    expect(html).not.toContain("fa-lista");
  });

  test("the count of smaller places in grey is only of those with votes to come, and agrees with the bar", () => {
    const sete = snap({ A1: eleit(arq(60, 40, 0, 0), 1000, 500), A2: eleit(arq(60, 40, 0, 0), 900, 500), A3: eleit(arq(60, 40, 0, 0), 800, 500), A4: eleit(arq(60, 40, 0, 0), 700, 500), A5: eleit(arq(60, 40, 0, 0), 1000, 1000) });
    expect(renderOndeFalta(ondeFalta(sete), par, cor, 2)).toContain("os 2 menores ficam em cinza"); // A5 has nothing left: it is neither shown nor counted
    expect(renderOndeFalta(ondeFalta(sete), par, cor, 3)).toContain("o menor fica em cinza");
    expect(renderOndeFalta(ondeFalta(sete), par, cor, 6)).not.toContain("em cinza");
  });

  test("a file kept after a failure is marked on its row and named under the list", () => {
    const velha = { ...nac, ufs: { ...nac.ufs, SP: { ...nac.ufs.SP!, status: "erro" as const } } };
    const html = renderOndeFalta(ondeFalta(velha), par, cor);
    expect(html).toContain('<li class="vel">');
    expect(html).toContain("1 arquivo está com números desatualizados:</b> São Paulo.");
    expect(renderOndeFalta(ondeFalta(nac), par, cor)).not.toContain("desatualizados");
  });

  test("a place with no file says so instead of looking like it is waiting for votes; the bars of progress are images with a text", () => {
    const sem = (status: "ausente" | "erro" | "carregando") => ({ status, dados: null, erro: null, buscadoEm: null });
    const html = renderOndeFalta(ondeFalta({ ...nac, ufs: { ...nac.ufs, AC: sem("ausente"), AL: sem("erro"), AM: sem("carregando") } }, { AC: 30, AL: 20, AM: 10 }), par, cor);
    expect(html).toContain("sem arquivo");
    expect(html).toContain("erro ao ler");
    expect(html).toContain(">carregando<");
    expect(html).toContain('class="fa-av" role="img" aria-label="sem arquivo"');
  });

  test("when every place is the model's number, the header says so", () => {
    const html = renderOndeFalta(ondeFalta(snap({ SP: eleit(arq(0, 0, 0, 0, "aguardando"), 1000, 0) }), { SP: 400 }), par, cor);
    expect(html).toContain("estimativa do modelo</small>");
    expect(html).toContain("≈ 400");
  });
});

describe("Ao vivo: os painéis entram na tela do 2º turno", () => {
  const d = parseApuracao(file({ cands: [cand(A, "13", "ANA", "1", "6000", "60,00"), cand(B, "22", "BETO", "2", "4000", "40,00")] }))!;
  const hero = { uf: BRASIL, snap: { url: "x", status: "ok" as const, dados: d, buscadoEm: new Date("2026-10-25T21:00:00Z"), erro: null }, hist: registrar([], d), eleitos: atualizar(vazio(), d, { cargo: "Presidente", uf: BRASIL }) };
  const base = { hero, linhas: [], escopo: BRASIL, ufCartoes: "SP", nac: null, cargoTodos: "Presidente" as const, agora: new Date("2026-10-25T21:00:00Z"), avatar: (c: { id: string }, s: string) => `<i class="av ${s}"></i>`, cor, turno: 2 as const };
  const dois = { numeros: numeros(d), par, pesquisas: pesquisas2t(corrida, par, d), caminho: caminho(prev(lado(B, 0.54, 0.51), lado(A, 0.46, 0.49))), falta: ondeFalta(snap({ SP: eleit(arq(60, 40, 0, 0), 1000, 500) })) };

  test("each panel is in its column, and the TSE's own marks and the timeline moved to the footer", () => {
    const html = renderAoVivo({ ...base, dois });
    const col = (nome: string) => html.slice(html.indexOf(`live-col live-col-${nome}`));
    expect(col("hero").indexOf("live-kpis")).toBeGreaterThan(-1);
    expect(col("hero").indexOf("live-cm")).toBeGreaterThan(-1);
    expect(html.indexOf("live-fa")).toBeGreaterThan(html.indexOf("live-col-mapa"));
    expect(html.indexOf("live-fa")).toBeLessThan(html.indexOf("live-col-prev"));
    expect(html.indexOf("live-pq")).toBeGreaterThan(html.indexOf("live-col-prev"));
    expect(html.indexOf("live-pq")).toBeLessThan(html.indexOf("live-rodape"));
    expect(html.indexOf("Resultado do TSE")).toBeGreaterThan(html.indexOf("live-rodape"));
    expect(html.indexOf("Quem foi eleito")).toBeGreaterThan(html.indexOf("live-rodape"));
  });

  test("before the first vote the two finalists take the duel's column and the polls stay collapsed in the side column", () => {
    const antes = parseApuracao(file({ s: { ts: "100", st: "0" }, v: { tv: "0", vv: "0", vvc: "0" }, cands: [cand(A, "13", "ANA", "1", "0", "0,00"), cand(B, "22", "BETO", "2", "0", "0,00")] }))!;
    const zerado = { ...base, hero: { ...hero, snap: { ...hero.snap, dados: antes } } };
    const html = renderAoVivo({ ...zerado, dois: { numeros: numeros(antes), par, pesquisas: pesquisas2t(corrida, par, antes) } });
    expect(html.indexOf("live-fin")).toBeGreaterThan(html.indexOf("live-col-hero"));
    expect(html.indexOf("live-fin")).toBeLessThan(html.indexOf("live-col-mapa"));
    expect(html.indexOf("live-pq")).toBeGreaterThan(html.indexOf("live-col-prev"));
    expect(html).toContain("pq-det-lista");
    expect(html).not.toContain("live-kpis");
  });

  test("the duel and the figures take the full width on top; the path to the lead opens the second column, above the Previsão and the polls", () => {
    const prevProps = { avatar: base.avatar, cor, estado: "carregando" as const, arquivos: { chegaram: 1, esperados: 28 } };
    const html = renderAoVivo({ ...base, dois, prev: prevProps });
    const na = (nome: string) => html.indexOf(`live-col live-col-${nome}`);
    expect(na("hero")).toBeLessThan(na("mapa"));
    expect(html.indexOf("live-kpis")).toBeLessThan(na("mapa")); // the figures stay with the duel
    expect(html.indexOf("live-cm")).toBeGreaterThan(na("prev"));
    expect(html.indexOf("live-cm")).toBeLessThan(html.indexOf("prev-compacto"));
    expect(html).not.toContain("dupla");
  });

  test("without the runoff data only the count in figures shows: no empty panels", () => {
    const html = renderAoVivo({ ...base, dois: { numeros: numeros(d) } });
    expect(html).toContain("live-kpis");
    for (const classe of ["live-cm", "live-fa", "live-pq"]) expect(html).not.toContain(`class="${classe}`);
    expect(renderAoVivo({ ...base, turno: 1, dois: null })).not.toContain("live-kpis");
  });
});

describe("onda de votos (visão)", () => {
  const nac = snap({ SP: eleit(arq(60, 40, 0, 0), 1000, 500), BA: eleit(arq(30, 70, 0, 0), 1000, 500) });

  test("one row per region with what is left, what it already showed and the pull on the first name; no word of who wins", () => {
    const html = renderOnda(onda(nac, par), par, cor);
    expect(html).toContain("Onda de votos");
    expect(html.indexOf("Nordeste")).toBeGreaterThan(-1);
    expect(html.indexOf("Sudeste")).toBeGreaterThan(-1);
    expect(html).toContain("já mostrou");
    expect(html).toContain("não um resultado");
    expect(html).not.toMatch(VENCEDOR);
  });

  test("with nothing to price it says when it will appear, and escapes names", () => {
    expect(renderOnda(null, par, cor)).toContain("Aparece quando");
    expect(renderOnda(onda(nac, { a: { ...par.a, nome: "<b>X</b>" }, b: par.b }), { a: { ...par.a, nome: "<b>X</b>" }, b: par.b }, cor)).not.toContain("<b>X</b>");
  });

  test("the hero's poll gap is written in words as well as in sign", () => {
    expect(difPesquisa(0.524, 0.51)).toContain("+1,4 p.p.");
    expect(difPesquisa(0.524, 0.51)).toContain("acima da pesquisa");
    expect(difPesquisa(0.476, 0.49)).toContain("−1,4 p.p.");
    expect(difPesquisa(0.476, 0.49)).toContain("abaixo da pesquisa");
    expect(difPesquisa(0.5, 0.5)).toContain("igual à pesquisa");
  });
});

describe("pontuação do caminho para a frente", () => {
  test("a frase termina em um ponto só: o 'p.p.' do rótulo já fecha a abreviação", () => {
    const normal = renderCaminho(caminho(prev(lado(B, 0.54, 0.51), lado(A, 0.46, 0.49))), cor);
    const quase = renderCaminho(caminho(prev(lado(B, 0.654, 0.5), lado(A, 0.346, 0.5), { apurados: 10_000, faltam: 119_400_000 })), cor);
    for (const html of [normal, quase]) expect(html).not.toMatch(/p\.p\.<\/b>\./);
    expect(normal).toContain("por <b>8,0 p.p.</b>");
  });
});

describe("onda de votos: efeito que arredonda para zero", () => {
  const linha = (efeito: number) => ({ regiao: "Exterior", faltam: 155_529, avanco: 0.6, qa: 0.597, efeito, ufs: 1 });
  const html = (efeito: number) => renderOnda({ linhas: [linha(efeito)], agora: 0.445, final: 0.445, faltam: 155_529, semVotos: 0 }, par, cor);

  test("um efeito de −0,00004 não vira '−0,0' nem '+0,0': sem sinal quando o número impresso é zero", () => {
    for (const e of [-0.00004, 0.00004, 0, -0]) {
      const h = html(e);
      expect(h).not.toMatch(/[−+]0,0/);
      expect(h).toContain(">0,0<");
    }
  });
  test("efeitos que aparecem no número mantêm o sinal", () => {
    expect(html(-0.0072)).toContain("−0,7");
    expect(html(0.012)).toContain("+1,2");
  });
});
