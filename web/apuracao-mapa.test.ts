import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createCores, linhasUf } from "./apuracao-nacional.js";
import { descreve, legenda, mapaSvg, modosDe, NOMES, PALETA, RESTO } from "./apuracao-mapa.js";
import type { MapaArgs } from "./apuracao-mapa.js";
import type { Comparacao, Corrida } from "./apuracao-nacional.js";
import type { Candidato } from "./apuracao-tse.js";
import type { UfEstado } from "./apuracao-uf.js";
import type { UfMap } from "../src/radar/geo/uf-map";

const mapa: UfMap = JSON.parse(readFileSync("web/mapa-uf.json", "utf8"));
const c = (id: string, nome: string, partido: string, votos: number, pct: number) => ({ id, nome, partido, num: id, votos, pct, destaque: false, situacao: "" }) as Candidato;
const uf = ({ total = 100, feitas = 40, vagas = 1, cands = [] }: { total?: number; feitas?: number; vagas?: number; cands?: Candidato[] } = {}) => ({
  status: "ok", erro: null,
  dados: { fase: feitas === 0 ? "aguardando" : feitas >= total ? "concluida" : "parcial", secoes: { total, totalizadas: feitas }, cargo: { vagas }, candidatos: cands },
}) as UfEstado;
const ufs = {
  SP: uf({ cands: [c("1", "ANA SOUZA", "AAA", 600, 0.6), c("2", "BETO LIMA", "BBB", 400, 0.4)] }),
  RJ: uf({ feitas: 100, cands: [c("2", "BETO LIMA", "BBB", 600, 0.6), c("1", "ANA SOUZA", "AAA", 400, 0.4)] }),
  AC: uf({ feitas: 0, cands: [c("1", "ANA SOUZA", "AAA", 0, 0)] }),
  AL: { status: "carregando", dados: null, erro: null } as UfEstado,
};
const linhas = linhasUf(ufs, "Governador");
const base: MapaArgs = { mapa, linhas, modo: "lider", cor: createCores(PALETA), sel: null, corridas: [], cargo: "Governador" };
const paths = (svg: string) => [...svg.matchAll(/<path[^>]*data-uf="([A-Z]{2})"[^>]*>/g)].map((m) => ({ uf: m[1], tag: m[0] }));

describe("mapaSvg", () => {
  test("draws one focusable shape per state of the map file, even before any data arrives", () => {
    const svg = mapaSvg({ ...base, linhas: [] });
    expect(paths(svg)).toHaveLength(27);
    expect(svg).toContain(`viewBox="${mapa.viewBox.join(" ")}"`);
    expect(svg.match(/tabindex="0"/g)).toHaveLength(27);
  });

  test("each state says in words what its colour means, for screen readers and for the hover tip", () => {
    const svg = mapaSvg(base);
    expect(svg).toContain('aria-label="São Paulo: Ana Souza lidera com 60,0% dos votos válidos; 40,0% das seções totalizadas"');
    expect(svg).toContain("<title>São Paulo: Ana Souza lidera");
    expect(svg).toContain('aria-label="Acre: apuração ainda não começou"');
    expect(svg).toContain('aria-label="Alagoas: consultando o TSE"');
    const falha = mapaSvg({ ...base, linhas: linhasUf({ BA: { status: "erro", dados: null, erro: "sem conexão com o TSE" } as UfEstado }, "Governador") });
    expect(falha).toContain('aria-label="Bahia: não foi possível consultar o TSE agora"');
  });

  test("colours by the leader's party: same party same colour, other party another, no data neutral", () => {
    const svg = mapaSvg(base);
    const fill = (u: string) => paths(svg).find((p) => p.uf === u)!.tag.match(/ fill="([^"]+)"/)![1];
    expect(fill("SP")).not.toBe(fill("RJ"));
    expect(fill("AC")).toBe(fill("AL")); // neither has a leader
    expect(fill("SP")).toBe(PALETA[0]);
  });

  test("a stronger leader gets a stronger tone of the same colour", () => {
    const fortes = linhasUf({ SP: uf({ cands: [c("1", "A", "AAA", 80, 0.8), c("2", "B", "BBB", 20, 0.2)] }), RJ: uf({ cands: [c("1", "A", "AAA", 30, 0.3), c("2", "B", "BBB", 70, 0.7)].reverse() }) }, "Governador");
    const svg = mapaSvg({ ...base, linhas: fortes });
    const tom = (u: string) => Number(paths(svg).find((p) => p.uf === u)!.tag.match(/color-mix\(in srgb, [^ ]+ (\d+)%/)![1]);
    expect(tom("SP")).toBeGreaterThan(tom("RJ"));
  });

  test("the selected state is marked, and selecting it does not move it in the tab order", () => {
    const svg = mapaSvg({ ...base, sel: "SP" });
    const ps = paths(svg);
    expect(ps.map((p) => p.uf)).toEqual(paths(mapaSvg(base)).map((p) => p.uf));
    expect(ps.find((p) => p.uf === "SP")!.tag).toContain('aria-pressed="true"');
    expect(ps.filter((p) => p.tag.includes('aria-pressed="true"'))).toHaveLength(1);
  });

  test("the outline of the selection is a separate shape on top: not focusable, not read, not clickable", () => {
    const anel = mapaSvg({ ...base, sel: "SP" }).match(/<path[^>]*class="uf-anel"[^>]*>/)?.[0];
    expect(anel).toContain(`d="${mapa.ufs.SP.d}"`);
    expect(anel).toContain('fill="none"');
    expect(anel).toContain('aria-hidden="true"');
    expect(anel).toContain('pointer-events="none"');
    expect(anel).not.toContain("tabindex");
    expect(mapaSvg(base)).not.toContain("uf-anel");
  });

  test("labels are drawn only where the state is big enough to hold one", () => {
    const svg = mapaSvg(base);
    expect(svg).toMatch(/<text[^>]*>SP<\/text>/);
    expect(svg).not.toMatch(/<text[^>]*>DF<\/text>/); // 93 square units: it gets a chip instead
  });

  test("in the poll mode a state that disagrees with the polls is hatched, never painted a 'bad' colour", () => {
    const corridas = [
      { cargo: "Governador", uf: "SP", vagas: 1, lideres: [{ sq: "1", nome: "Ana", partido: "AAA", media: 0.5, lo: 0.4, hi: 0.6 }] },
      { cargo: "Governador", uf: "RJ", vagas: 1, lideres: [{ sq: "1", nome: "Ana", partido: "AAA", media: 0.5, lo: 0.4, hi: 0.6 }] },
    ];
    const svg = mapaSvg({ ...base, modo: "pesquisa", corridas });
    const sp = paths(svg).find((p) => p.uf === "SP")!.tag; // count leader = poll leader
    const rj = paths(svg).find((p) => p.uf === "RJ")!.tag; // count leader differs
    expect(rj).toContain("url(#apu-hachura)");
    expect(sp).not.toContain("url(#apu-hachura)");
    expect(svg).toContain('<pattern id="apu-hachura"');
    expect(rj).toContain("lidera"); // still readable as text
    expect(svg).toContain("a pesquisa aponta Ana");
  });

  test("margin and progress modes shade by the number they name", () => {
    const larga = linhasUf({ SP: uf({ cands: [c("1", "A", "AAA", 90, 0.9), c("2", "B", "BBB", 10, 0.1)] }), RJ: uf({ feitas: 100, cands: [c("1", "A", "AAA", 55, 0.55), c("2", "B", "BBB", 45, 0.45)] }) }, "Governador");
    const tom = (svg: string, u: string) => Number(paths(svg).find((p) => p.uf === u)!.tag.match(/color-mix\(in srgb, [^ ]+ (\d+)%/)![1]);
    const m = mapaSvg({ ...base, linhas: larga, modo: "margem" });
    const a = mapaSvg({ ...base, linhas: larga, modo: "avanco" });
    expect(tom(m, "SP")).toBeGreaterThan(tom(m, "RJ")); // 80 p.p. against 10 p.p.
    expect(tom(a, "RJ")).toBeGreaterThan(tom(a, "SP")); // 100% of the sections against 40%
  });

  test("names from the source never reach the page as markup", () => {
    const sujo = linhasUf({ SP: uf({ cands: [c("1", "<img src=x onerror=alert(1)>", "A&B", 6, 1)] }) }, "Governador");
    const svg = mapaSvg({ ...base, linhas: sujo });
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img src=x");
  });
});

describe("modosDe", () => {
  const com = [{ cargo: "Governador", uf: "SP", lideres: [{ sq: "1" }] }] as Corrida[];
  test("the poll mode exists only for state races whose polls carry a leader", () => {
    expect(modosDe("Governador", com).map((m) => m.id)).toEqual(["lider", "margem", "avanco", "pesquisa"]);
    expect(modosDe("Senador", com).map((m) => m.id)).not.toContain("pesquisa"); // these polls are for another office
    expect(modosDe("Senador", [{ cargo: "Senador", uf: "SP", lideres: [{ sq: "1" }] }] as Corrida[]).map((m) => m.id)).toContain("pesquisa");
    expect(modosDe("Governador", [{ cargo: "Governador", uf: "SP" }]).map((m) => m.id)).not.toContain("pesquisa"); // older build
    expect(modosDe("Presidente", [{ cargo: "Presidente", uf: "BR", lideres: [{ sq: "1" }] }] as Corrida[]).map((m) => m.id)).not.toContain("pesquisa"); // polls are national only
  });
});

describe("legenda", () => {
  test("lists the parties that lead somewhere with how many states, most first, and the neutral key", () => {
    const tres = linhasUf({
      SP: uf({ cands: [c("1", "A", "AAA", 6, 0.6), c("2", "B", "BBB", 4, 0.4)] }),
      MG: uf({ cands: [c("1", "A", "AAA", 6, 0.6), c("2", "B", "BBB", 4, 0.4)] }),
      RJ: uf({ cands: [c("2", "B", "BBB", 6, 0.6), c("1", "A", "AAA", 4, 0.4)] }),
      AC: uf({ feitas: 0, cands: [c("1", "A", "AAA", 0, 0)] }),
    }, "Governador");
    const html = legenda({ modo: "lider", linhas: tres, cor: createCores(PALETA), cargo: "Governador" });
    expect(html).toMatch(/AAA<\/span> <b>2<\/b>[^]*BBB<\/span> <b>1<\/b>/);
    expect(html).toContain("Sem apuração");
    expect(html).toMatch(/tom mais forte/i);
  });

  test("says which margin it measures: the leader's, or the last seat's when there are two", () => {
    expect(legenda({ modo: "margem", linhas, cor: createCores(PALETA), cargo: "Governador" })).toContain("Margem do líder");
    expect(legenda({ modo: "margem", linhas, cor: createCores(PALETA), cargo: "Senador" })).toContain("Margem na última vaga");
  });

  test("the poll legend explains hatching in words", () => {
    expect(legenda({ modo: "pesquisa", linhas, cor: createCores(PALETA), cargo: "Governador" })).toMatch(/líder diferente do das pesquisas/i);
  });
});

describe("descreve", () => {
  const vazio = linhasUf({ SP: uf({ cands: [c("1", "ANA", "AAA", 0, 0)] }) }, "Governador")[0];
  const comp = (situacao: Comparacao["situacao"], n: number) => ({ situacao, n, pesquisa: { nome: "ANA SOUZA", media: 0.5 } }) as unknown as Comparacao;

  test("a count that is open but has no valid vote in the file says so, and does not break the map", () => {
    expect(vazio).toMatchObject({ fase: "parcial", lider: null });
    expect(descreve(vazio, null)).toContain("sem votos válidos");
    expect(() => mapaSvg({ ...base, linhas: [vazio] })).not.toThrow();
  });

  test("one seat compares leaders; several seats compare the names in the first places, never 'the leader'", () => {
    const um = descreve(linhas[0], comp("diverge", 1));
    expect(um).toContain("líder diferente");
    const dois = descreve(linhas[0], comp("igual", 2));
    expect(dois).toContain("2 primeiros lugares");
    expect(dois).not.toMatch(/líder das pesquisas/);
    expect(descreve(linhas[0], comp("diverge", 2))).not.toMatch(/líder diferente/);
  });

  test("a state whose last query failed says the numbers are the previous reading", () => {
    const velha = linhasUf({ SP: { ...ufs.SP, status: "erro", erro: "sem conexão com o TSE" } }, "Governador")[0];
    expect(descreve(velha, null)).toContain("o TSE não respondeu na última consulta");
    expect(descreve(velha, null)).toContain("Ana Souza lidera");
  });
});

describe("legend, several seats and many parties", () => {
  test("for several seats the poll legend talks about names in the first places", () => {
    const dois = linhasUf({ SP: uf({ vagas: 2, cands: [c("1", "A", "AAA", 6, 0.6), c("2", "B", "BBB", 4, 0.4)] }) }, "Senador");
    const html = legenda({ modo: "pesquisa", linhas: dois, cor: createCores(PALETA), cargo: "Senador" });
    expect(html).toMatch(/mesmos nomes das pesquisas/i);
    expect(html).not.toMatch(/mesmo líder das pesquisas/i);
  });

  test("with more leading parties than colours, the rest share one grey and the legend says so", () => {
    const cor = createCores(PALETA, RESTO);
    const muitos = linhasUf(Object.fromEntries(Object.keys(mapa.ufs).slice(0, PALETA.length + 1).map((u, i) => [u, uf({ cands: [c("1", `A${i}`, `P${String(i).padStart(2, "0")}`, 60, 0.6)] })])), "Governador");
    const html = legenda({ modo: "lider", linhas: muitos, cor, cargo: "Governador" });
    expect(html).toContain(`background:${RESTO}`);
    expect(html).toMatch(/demais partidos/i);
    expect(legenda({ modo: "lider", linhas, cor: createCores(PALETA, RESTO), cargo: "Governador" })).not.toMatch(/demais partidos/i);
  });
});

test("NOMES covers every UF of the map plus the exterior", () => {
  for (const u of Object.keys(mapa.ufs)) expect(NOMES[u]).toBeTruthy();
  expect(NOMES.ZZ).toBe("Exterior");
});
