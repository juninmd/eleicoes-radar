import { expect, test } from "bun:test";
import { canon, grafoAliancas, parseColigacao } from "./aliancas.js";

// Shapes copied from the registry: coalition with nested federations, lone federation, nothing.
const GOV = "CORAGEM PARA SEGUIR AVANÇANDO: REPUBLICANOS / PL / MDB / FEDERAÇÃO RENOVAÇÃO SOLIDÁRIA (25-PRD / 77-SOLIDARIEDADE) / FEDERAÇÃO UNIÃO PROGRESSISTA (44-UNIÃO / 11-PP) / AVANTE";
const FED = "FEDERAÇÃO: FEDERAÇÃO PSDB CIDADANIA (45-PSDB / 23-CIDADANIA)";
const c = (id, cargo, partido, coligacao = "", federacao = "") => ({ id, cargo, partido, nome: `N ${id}`, ficha: { coligacao, federacao } });

test("a coalition is split on top-level slashes only, so federations keep their members", () => {
  const p = parseColigacao(GOV);
  expect(p.nome).toBe("CORAGEM PARA SEGUIR AVANÇANDO");
  expect(p.partidos).toEqual(["REPUBLICANOS", "PL", "MDB", "PRD", "SOLIDARIEDADE", "UNIÃO", "PP", "AVANTE"]);
  expect(p.federacoes.map((f) => f.partidos)).toEqual([["PRD", "SOLIDARIEDADE"], ["UNIÃO", "PP"]]);
});

test("registry party numbers are stripped and a lone federation has no coalition name", () => {
  const p = parseColigacao(FED);
  expect(p.partidos).toEqual(["PSDB", "CIDADANIA"]);
  expect(p.nome).toBeNull();
  expect(p.federacoes).toHaveLength(1);
});

test("a coalition name that itself contains a colon does not leak into the party list", () => {
  const p = parseColigacao("UNIDOS POR RONDÔNIA: RONDÔNIA FORTE DE VERDADE: PDT / PL / FEDERAÇÃO X (1-AAA / 2-BBB)");
  expect(p.nome).toBe("UNIDOS POR RONDÔNIA: RONDÔNIA FORTE DE VERDADE");
  expect(p.partidos).toEqual(["PDT", "PL", "AAA", "BBB"]);
});

test("no text means the party runs alone", () => {
  expect(parseColigacao("")).toBeNull();
  expect(parseColigacao(undefined)).toBeNull();
  expect(parseColigacao("   ")).toBeNull();
});

test("spelling variants of one party compare equal", () => {
  expect(canon("PC do B")).toBe(canon("PCdoB"));
  expect(canon("PCDOB")).toBe(canon("PC do B"));
});

test("two senators of one coalition make one list with two candidates", () => {
  const all = [c("1", "Senador", "PL", GOV), c("2", "Senador", "PP", GOV), c("3", "Senador", "PSTU")];
  const g = grafoAliancas(all.slice(0, 3), all);
  expect(g.listas).toHaveLength(1);
  expect(g.listas[0].candidatos.map((x) => x.id)).toEqual(["1", "2"]);
  expect(g.solos).toEqual([{ partido: "PSTU", n: 1 }]);
});

test("a coalition of k parties is a clique, and federation pairs are stronger than coalition pairs", () => {
  const all = [c("1", "Governador", "PL", GOV)];
  const g = grafoAliancas(all, all);
  expect(g.nodes).toHaveLength(8);
  expect(g.links).toHaveLength((8 * 7) / 2);
  const by = (a, b) => g.links.find((l) => [l.a, l.b].sort().join() === [canon(a), canon(b)].sort().join());
  expect(by("UNIÃO", "PP")).toMatchObject({ kind: "federacao", w: 2 });
  expect(by("PL", "MDB")).toMatchObject({ kind: "coligacao", w: 1 });
  expect(by("PRD", "UNIÃO")).toMatchObject({ kind: "coligacao", w: 1 }); // different federations of one coalition
});

test("federation names keep party acronyms instead of lower-casing them", () => {
  const all = [c("1", "Governador", "PL", GOV), c("2", "Governador", "PSDB", FED)];
  const names = grafoAliancas(all, all).listas.flatMap((l) => l.federacoes.map((f) => f.nome));
  expect(names).toContain("Federação União Progressista"); // a word, not an acronym
  expect(names).toContain("Federação PSDB Cidadania");
  expect(names.join()).not.toMatch(/Psdb/);
});

test("a federation acronym after the dash keeps its capitals", () => {
  const fed = "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL";
  const deps = [c("1", "Deputado Federal", "PT", "", fed), c("2", "Deputado Federal", "PCdoB", "", fed)];
  expect(grafoAliancas(deps, deps).listas[0].nome).toBe("Federação Brasil da Esperança - FE BRASIL");
});

test("a lone federation is a federation list, not a named coalition", () => {
  const all = [c("1", "Governador", "PSDB", FED)];
  const [l] = grafoAliancas(all, all).listas;
  expect(l.tipo).toBe("federacao");
  expect(l.nome).toBeNull();
  expect(l.partidos).toEqual(["PSDB", "CIDADANIA"]);
});

test("for deputies the only alliance is the federation, and parties without one stay out of the graph", () => {
  const deps = [c("1", "Deputado Federal", "PT", "", "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL"), c("2", "Deputado Federal", "PCdoB", "", "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL"), c("3", "Deputado Federal", "NOVO")];
  const g = grafoAliancas(deps, deps);
  expect(g.listas).toHaveLength(1);
  expect(g.listas[0].partidos).toEqual(["PT", "PCdoB"]);
  expect(g.links).toHaveLength(1);
  expect(g.solos).toEqual([{ partido: "NOVO", n: 1 }]);
});

test("a coalition text on a deputy is ignored: proportional coalitions do not exist", () => {
  const deps = [c("1", "Deputado Federal", "PL", GOV)];
  const g = grafoAliancas(deps, deps);
  expect(g.listas).toHaveLength(0);
  expect(g.solos).toEqual([{ partido: "PL", n: 1 }]);
});

test("party size counts candidacies in every cargo, and the display name follows the registry spelling", () => {
  const all = [c("1", "Senador", "PC do B", "X: PC do B / PT"), c("2", "Deputado Federal", "PCdoB"), c("3", "Deputado Federal", "PCdoB"), c("4", "Deputado Federal", "PT")];
  const g = grafoAliancas([all[0]], all);
  const pc = g.nodes.find((n) => n.id === "PCDOB");
  expect(pc.n).toBe(3);
  expect(pc.label).toMatch(/^PC/);
});
