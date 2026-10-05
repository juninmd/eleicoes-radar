import { describe, expect, test } from "bun:test";
import { createCores, linhasUf } from "./apuracao-nacional.js";
import { PALETA, RESTO } from "./apuracao-mapa.js";
import { hemiciclo, renderCamara, vagasNacionais } from "./apuracao-camara.js";
import type { BrasilSnapshot, UfEstado } from "./apuracao-uf.js";

const uf = ({ vagas, listas, feitas = 50, total = 100 }: { vagas: number; listas: [string, number][]; feitas?: number; total?: number }) => ({
  status: "ok", erro: null,
  dados: { fase: feitas === 0 ? "aguardando" : feitas >= total ? "concluida" : "parcial", secoes: { total, totalizadas: feitas }, cargo: { vagas }, candidatos: [], partidos: listas.map(([nome, v]) => ({ nome, vagas: v })), quociente: 1000 },
}) as unknown as UfEstado;
const ufs = {
  SP: uf({ vagas: 70, listas: [["PT/PC do B/PV", 20], ["PL", 18], ["UNIÃO", 0]] }),
  RJ: uf({ vagas: 46, listas: [["PL", 14], ["PT/PC do B/PV", 6]], feitas: 100 }),
  AC: uf({ vagas: 8, listas: [["PL", 2]], feitas: 0 }),
};
const linhas = linhasUf(ufs, "Deputado Federal");

describe("vagasNacionais", () => {
  const v = vagasNacionais(linhas);

  test("adds the seats of every list over the states, biggest first, dropping lists with none", () => {
    expect(v.listas).toEqual([{ nome: "PL", vagas: 34 }, { nome: "PT/PC do B/PV", vagas: 26 }]);
  });

  test("counts the seats the TSE has assigned against the seats in dispute in the states that answered", () => {
    expect(v.definidas).toBe(60);
    expect(v.emDisputa).toBe(124); // 70 + 46 + 8
    expect(v.cobertura).toEqual({ com: 3, de: 3 });
  });

  test("a state that has not answered adds nothing, and the coverage says so", () => {
    const parcial = vagasNacionais(linhasUf({ ...ufs, MG: { status: "carregando", dados: null, erro: null } as UfEstado }, "Deputado Federal"));
    expect(parcial.emDisputa).toBe(124);
    expect(parcial.cobertura).toEqual({ com: 3, de: 4 });
  });

  test("a list name that differs only by case or spacing is the same list", () => {
    const dois = vagasNacionais(linhasUf({ SP: uf({ vagas: 10, listas: [["PL", 3]] }), RJ: uf({ vagas: 10, listas: [[" PL ", 2]] }) }, "Deputado Federal"));
    expect(dois.listas).toEqual([{ nome: "PL", vagas: 5 }]);
  });
});

describe("hemiciclo", () => {
  const cor = createCores(PALETA);
  const svg = hemiciclo([{ nome: "PL", vagas: 34 }, { nome: "PT/PC do B/PV", vagas: 26 }], 100, cor);
  const seats = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="([^"]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), fill: m[4] }));

  test("draws exactly one dot per seat in dispute, none piled on another", () => {
    expect(seats).toHaveLength(100);
    expect(new Set(seats.map((s) => `${s.x},${s.y}`)).size).toBe(100);
  });

  test("each list gets as many dots as seats, and the seats not yet assigned stay neutral", () => {
    const n = (fill: string) => seats.filter((s) => s.fill === fill).length;
    expect(n(cor("PL"))).toBe(34);
    expect(n(cor("PT/PC do B/PV"))).toBe(26);
    expect(seats.filter((s) => s.fill === "#d5d9d3")).toHaveLength(40);
  });

  test("seats are filled from the left edge, so a list is a wedge and the empty seats sit on the right", () => {
    const esquerda = seats.reduce((m, x) => (x.x < m.x ? x : m));
    const direita = seats.reduce((m, x) => (x.x > m.x ? x : m));
    expect(esquerda.fill).toBe(cor("PL"));
    expect(direita.fill).toBe("#d5d9d3");
  });

  test("more assigned seats than seats in dispute never draws more dots than the hemicycle holds", () => {
    expect(([...hemiciclo([{ nome: "X", vagas: 150 }], 100, cor).matchAll(/<circle/g)]).length).toBe(100);
  });

  test("it is described in words for screen readers", () => {
    expect(svg).toContain('role="img"');
    expect(svg).toContain("PL 34");
  });

  test("with no seats in dispute there is nothing to draw", () => {
    expect(hemiciclo([], 0, cor)).toBe("");
  });

  // While the 27 files arrive the total grows from a handful of seats to 513: every size must stay inside the drawing.
  test("every dot stays inside the drawing and none overlaps another, from a handful of seats to 700", () => {
    const tamanhos = [...Array.from({ length: 80 }, (_, i) => i + 1), 120, 200, 300, 513, 700];
    for (const n of tamanhos) {
      const s = hemiciclo([], n, cor);
      const [, , W, H] = s.match(/viewBox="([\d. ]+)"/)![1].split(" ").map(Number);
      const d = [...s.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
      expect(d).toHaveLength(n);
      const fora = d.filter((p) => p.x - p.r < 0 || p.x + p.r > W || p.y - p.r < 0 || p.y + p.r > H);
      expect({ n, fora: fora.length }).toEqual({ n, fora: 0 });
      let encostados = 0;
      for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) if (Math.hypot(d[i].x - d[j].x, d[i].y - d[j].y) < d[i].r + d[j].r - 0.5) encostados++;
      expect({ n, encostados }).toEqual({ n, encostados: 0 });
    }
  });
});

describe("renderCamara", () => {
  const cor = createCores(PALETA);
  const nac: BrasilSnapshot = { cargo: "Deputado Federal", ciclo: 1, buscadoEm: new Date("2026-10-04T20:00:00Z"), ufs };

  test("says how many seats are assigned, what that is based on, and that it still changes while the count is open", () => {
    const html = renderCamara({ nac, cor });
    expect(html).toContain("60 de 124 vagas");
    expect(html).toContain("3 de 3 estados");
    expect(html).toMatch(/podem mudar/i);
    expect(html).toContain("PT/PC do B/PV");
  });

  test("it says the distribution is provisional and how little of the count it rests on", () => {
    const html = renderCamara({ nac, cor });
    expect(html).toContain("distribuídas por enquanto");
    expect(html).toContain("com 50,0% das seções totalizadas"); // SP 50/100, RJ 100/100, AC 0/100
    expect(html).not.toMatch(/já atribuídas/);
  });

  test("the list table repeats the dots as text", () => {
    const html = renderCamara({ nac, cor });
    expect(html).toMatch(/<td class="num">34<\/td>/);
    expect(html).toContain("<caption");
  });

  test("before any answer it says it is loading; with no seats published it says that instead of an empty chart", () => {
    expect(renderCamara({ nac: null, cor })).toContain("Consultando os 27 estados");
    const vazio = { ...nac, ufs: { SP: uf({ vagas: 70, listas: [["PL", 0]] }) } };
    expect(renderCamara({ nac: vazio, cor })).toContain("ainda não publicou vagas");
  });

  test("lists past the palette share the rest colour, and the page says so instead of repeating a colour", () => {
    const corRest = createCores(PALETA, RESTO);
    const muitas = { ...nac, ufs: { SP: uf({ vagas: 70, listas: Array.from({ length: PALETA.length + 3 }, (_, i) => [`L${String(i).padStart(2, "0")}`, 4]) }) } };
    const html = renderCamara({ nac: muitas, cor: corRest });
    expect(html).toContain(`background:${RESTO}`);
    expect(html).toMatch(/3 listas menores dividem a cor cinza escuro/);
    expect(renderCamara({ nac, cor: createCores(PALETA, RESTO) })).not.toContain("dividem a cor");
  });

  test("list names from the source are escaped", () => {
    const sujo = { ...nac, ufs: { SP: uf({ vagas: 5, listas: [["<img src=x onerror=1>", 5]] }) } };
    const html = renderCamara({ nac: sujo, cor });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
