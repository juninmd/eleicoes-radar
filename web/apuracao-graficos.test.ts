import { describe, expect, test } from "bun:test";
import { composicao, evolucao, faixaVsApuracao, registrar } from "./apuracao-graficos.js";
import { createCores } from "./apuracao-nacional.js";

const dados = (over = {}) => ({
  versao: { data: "04/10/2026", hora: "19:41:07" },
  secoes: { total: 100, totalizadas: 40 },
  eleitorado: { apto: 5000, apurado: 2000, comparecimento: 1600, abstencao: 400 },
  votos: { total: 1600, validos: 1400, brancos: 80, nulos: 120 },
  candidatos: [
    { id: "1", nome: "ANA SOUZA", partido: "AAA", votos: 700, pct: 0.5 },
    { id: "2", nome: "BETO LIMA", partido: "BBB", votos: 560, pct: 0.4 },
    { id: "3", nome: "CRIS", partido: "CCC", votos: 140, pct: 0.1 },
  ],
  ...over,
});

describe("composicao", () => {
  test("splits the electorate of the counted sections into valid, blank, null and abstention, as text and as bar", () => {
    const html = composicao(dados());
    for (const t of ["Votos válidos", "Brancos", "Nulos", "Abstenções"]) expect(html).toContain(t);
    expect(html).toContain("70,0%"); // 1.400 of 2.000
    expect(html).toContain("4,0%");
    expect(html).toContain("6,0%");
    expect(html).toContain("20,0%"); // 400 of 2.000
    expect(html.match(/class="seg c\d"/g)).toHaveLength(4);
  });

  test("segments are proportional to what they name", () => {
    const grow = [...composicao(dados()).matchAll(/flex-grow:(\d+)/g)].map((m) => Number(m[1]));
    expect(grow).toEqual([1400, 80, 120, 400]);
  });

  test("nothing counted yet draws nothing instead of a bar of zeros", () => {
    expect(composicao(dados({ eleitorado: { apto: 5000, apurado: 0, comparecimento: 0, abstencao: 0 }, votos: { total: 0, validos: 0, brancos: 0, nulos: 0 } }))).toBe("");
  });
});

describe("faixaVsApuracao", () => {
  const rows = [
    { c: { nome: "ANA SOUZA", partido: "AAA", pct: 0.5 }, cmp: { media: 0.45, lo: 0.4, hi: 0.5, dentro: true, diff: 0.05 } },
    { c: { nome: "BETO LIMA", partido: "BBB", pct: 0.4 }, cmp: { media: 0.3, lo: 0.25, hi: 0.35, dentro: false, diff: 0.1 } },
    { c: { nome: "CRIS", partido: "CCC", pct: 0.1 }, cmp: null },
  ];

  test("one row per candidate with a poll: the 90% band, the poll mean and the count, all on one scale", () => {
    const html = faixaVsApuracao(rows, "parcial");
    expect(html.match(/<li class="apu-dumb-row">/g)).toHaveLength(2);
    expect(html).toContain("Ana Souza");
    expect(html).toContain("apuração <b>50,0%</b>");
    expect(html).toContain("pesquisa 45,0%");
    expect(html).toContain("faixa 40%–50%");
    const left = [...html.matchAll(/class="band" style="left:([\d.]+)%;width:([\d.]+)%"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(left).toHaveLength(2);
    expect(left[0][1]).toBeCloseTo(left[1][1], 6); // same band width (10 p.p.) draws the same width
    expect(left[1][0]).toBeLessThan(left[0][0]); // Beto's band is further left
  });

  test("says in words whether the count sits inside the band, with 'por enquanto' while partial", () => {
    expect(faixaVsApuracao(rows, "parcial")).toContain("dentro da faixa por enquanto");
    expect(faixaVsApuracao(rows, "parcial")).toContain("fora da faixa por enquanto");
    expect(faixaVsApuracao(rows, "concluida")).not.toContain("por enquanto");
  });

  test("without any poll there is no chart", () => {
    expect(faixaVsApuracao([{ c: rows[2].c, cmp: null }], "parcial")).toBe("");
  });

  test("the scale grows to fit the biggest value, so a leader above the band is not cut off", () => {
    const html = faixaVsApuracao([{ c: { nome: "A", partido: "X", pct: 0.8 }, cmp: { media: 0.3, lo: 0.2, hi: 0.4, dentro: false, diff: 0.5 } }], "parcial");
    const dot = Number(html.match(/class="dot" style="left:([\d.]+)%/)[1]);
    expect(dot).toBeLessThanOrEqual(100);
    expect(dot).toBeGreaterThan(50);
  });
});

describe("registrar", () => {
  test("keeps one point per TSE file version, in order, with the share of each candidate", () => {
    let h = registrar([], dados());
    h = registrar(h, dados()); // same file again: nothing new
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ rotulo: "19:41:07", avanco: 0.4, pcts: { 1: 0.5, 2: 0.4, 3: 0.1 } });
    h = registrar(h, dados({ versao: { data: "04/10/2026", hora: "19:42:09" }, secoes: { total: 100, totalizadas: 55 } }));
    expect(h.map((p) => p.avanco)).toEqual([0.4, 0.55]);
  });

  test("progress is rounded down while the count is open, like everywhere else: 99,96% is 99,9%", () => {
    expect(registrar([], dados({ secoes: { total: 10000, totalizadas: 9996 } }))[0].avanco).toBe(0.999);
    expect(registrar([], dados({ secoes: { total: 10000, totalizadas: 10000 } }))[0].avanco).toBe(1);
  });

  test("a file with no section counted yet is not a point", () => {
    expect(registrar([], dados({ secoes: { total: 100, totalizadas: 0 } }))).toEqual([]);
  });

  test("it never grows without bound", () => {
    let h = [];
    for (let i = 0; i < 300; i++) h = registrar(h, dados({ versao: { data: "04/10/2026", hora: `20:${String(i).padStart(4, "0")}` } }));
    expect(h.length).toBeLessThanOrEqual(120);
    expect(h.at(-1).rotulo).toBe("20:0299");
  });
});

describe("evolucao", () => {
  const cor = createCores(["#a", "#b", "#c"]);
  const pts = (n) => Array.from({ length: n }, (_, i) => ({ rotulo: `19:${40 + i}`, avanco: 0.2 * (i + 1), pcts: { 1: 0.5 - 0.02 * i, 2: 0.4 + 0.02 * i, 3: 0.1 } }));
  const quem = { 1: { nome: "ANA SOUZA", partido: "AAA" }, 2: { nome: "BETO LIMA", partido: "BBB" }, 3: { nome: "CRIS", partido: "CCC" } };

  test("the axis and the description never say 100% while the count is still open", () => {
    const arquivo = (hora, feitas) => dados({ versao: { data: "04/10/2026", hora }, secoes: { total: 10000, totalizadas: feitas } });
    const hist = registrar(registrar([], arquivo("20:00:00", 9990)), arquivo("20:01:00", 9996));
    const html = evolucao(hist, quem, cor);
    expect(html).not.toContain("100%");
    expect(html).toContain("99,9%");
  });

  test("needs at least two points: before that it explains when the chart will appear", () => {
    const html = evolucao(pts(1), quem, cor);
    expect(html).not.toContain("<svg");
    expect(html).toContain("novos arquivos do TSE");
  });

  test("draws one line per leading candidate, coloured by party, with the numbers as text", () => {
    const html = evolucao(pts(4), quem, cor);
    expect(html.match(/<polyline/g)).toHaveLength(3);
    expect(html).toContain('stroke="#a"');
    expect(html).toContain("Ana Souza");
    expect(html).toContain("50,0%"); // first value
    expect(html).toContain("44,0%"); // last value
    expect(html).toContain("▼"); // a fall is shown with a neutral arrow
    expect(html).toContain("caiu 6,0 p.p. desde o primeiro arquivo visto"); // about the count over time, not about the polls
    expect(html).not.toMatch(/média das pesquisas/);
  });

  test("files that report the same section count still spread along the axis, so a line never collapses", () => {
    const iguais = pts(4).map((p) => ({ ...p, avanco: 0.9 }));
    const xs = [...evolucao(iguais, quem, cor).matchAll(/<polyline points="([^"]+)"/g)][0][1].split(" ").map((q) => Number(q.split(",")[0]));
    expect(new Set(xs).size).toBe(4);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  test("the axis names the first and last file by time and by share of sections counted", () => {
    const html = evolucao(pts(3), quem, cor);
    expect(html).toContain("19:40 · 20,0% das seções");
    expect(html).toContain("19:42 · 60,0%");
  });

  test("limits the lines to the four leaders of the last point", () => {
    const muitos = pts(3).map((p) => ({ ...p, pcts: { ...p.pcts, 4: 0.05, 5: 0.04, 6: 0.03 } }));
    const q = { ...quem, 4: { nome: "D", partido: "D" }, 5: { nome: "E", partido: "E" }, 6: { nome: "F", partido: "F" } };
    expect(evolucao(muitos, q, cor).match(/<polyline/g)).toHaveLength(4);
  });

  test("names from the source are escaped", () => {
    const html = evolucao(pts(3), { ...quem, 1: { nome: "<img src=x>", partido: "A&B" } }, cor);
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });
});
