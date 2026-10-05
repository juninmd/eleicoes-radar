import { describe, expect, test } from "bun:test";
import { contraPesquisa, createCores, linhasUf, rotulosComp, totalNacional } from "./apuracao-nacional.js";

// A parsed state file (the shape parseApuracao returns), reduced to what the aggregation reads.
const c = (id, nome, partido, votos, pct) => ({ id, nome, partido, num: id, votos, pct, destaque: false, situacao: "" });
const uf = ({ total = 100, feitas = 40, vagas = 1, cands = [] } = {}) => ({
  status: "ok", erro: null,
  dados: { fase: feitas === 0 ? "aguardando" : feitas >= total ? "concluida" : "parcial", secoes: { total, totalizadas: feitas }, cargo: { vagas }, candidatos: cands },
});
const snap = (o) => o;

describe("linhasUf", () => {
  const ufs = {
    SP: uf({ cands: [c("1", "ANA", "AAA", 600, 0.6), c("2", "BETO", "BBB", 300, 0.3), c("3", "CRIS", "CCC", 100, 0.1)] }),
    AC: uf({ feitas: 0, cands: [c("1", "ANA", "AAA", 0, 0), c("2", "BETO", "BBB", 0, 0)] }),
    AL: { status: "carregando", dados: null, erro: null },
    BA: { status: "erro", dados: null, erro: "sem conexão com o TSE" },
  };
  const rows = Object.fromEntries(linhasUf(snap(ufs), "Governador").map((r) => [r.uf, r]));

  test("who leads, the runner-up and the margin, from the votes the TSE counted", () => {
    expect(rows.SP.lider).toMatchObject({ id: "1", nome: "ANA", partido: "AAA", pct: 0.6 });
    expect(rows.SP.segundo).toMatchObject({ id: "2" });
    expect(rows.SP.margem).toBeCloseTo(0.3, 6);
  });

  test("how far the count is: sections done over sections total, rounded down while open", () => {
    expect(rows.SP.avanco).toBeCloseTo(0.4, 6);
    const quase = linhasUf({ SP: uf({ total: 10000, feitas: 9996, cands: [c("1", "A", "X", 1, 1)] }) }, "Governador")[0];
    expect(quase.avanco).toBe(0.999);
    expect(linhasUf({ SP: uf({ total: 10000, feitas: 10000, cands: [c("1", "A", "X", 1, 1)] }) }, "Governador")[0].avanco).toBe(1);
  });

  test("a state with no section counted has no leader, however the file lists the zeros", () => {
    expect(rows.AC.lider).toBeNull();
    expect(rows.AC.margem).toBeNull();
    expect(rows.AC.fase).toBe("aguardando");
  });

  test("a state that has not answered (or failed with nothing to show) keeps its status and no numbers", () => {
    expect(rows.AL).toMatchObject({ status: "carregando", lider: null, fase: null, avanco: null });
    expect(rows.BA).toMatchObject({ status: "erro", erro: "sem conexão com o TSE", lider: null });
  });

  test("two seats (Senate): the margin is measured at the last seat, between 2nd and 3rd", () => {
    const sen = linhasUf({ SP: uf({ vagas: 2, cands: [c("1", "A", "X", 50, 0.5), c("2", "B", "Y", 30, 0.3), c("3", "C", "Z", 20, 0.2)] }) }, "Senador")[0];
    expect(sen.margem).toBeCloseTo(0.1, 6);
    expect(sen.vagas).toBe(2);
  });

  test("a race with a single candidate has a leader and no margin", () => {
    const so = linhasUf({ SP: uf({ cands: [c("1", "A", "X", 5, 1)] }) }, "Governador")[0];
    expect(so.lider.id).toBe("1");
    expect(so.margem).toBeNull();
  });
});

describe("totalNacional", () => {
  const ufs = {
    SP: uf({ total: 100, feitas: 100, cands: [c("1", "ANA", "AAA", 600, 0.6), c("2", "BETO", "BBB", 400, 0.4)] }),
    RJ: uf({ total: 50, feitas: 25, cands: [c("1", "ANA", "AAA", 100, 0.25), c("2", "BETO", "BBB", 300, 0.75)] }),
    ZZ: uf({ total: 5, feitas: 5, cands: [c("1", "ANA", "AAA", 50, 0.5), c("2", "BETO", "BBB", 50, 0.5)] }),
    AC: { status: "carregando", dados: null, erro: null },
  };
  const t = totalNacional(linhasUf(ufs, "Presidente"));

  test("sums each candidate over every state with numbers, exterior included, as a share of the votes counted", () => {
    expect(t.candidatos.map((x) => [x.id, x.votos])).toEqual([["1", 750], ["2", 750]]);
    expect(t.candidatos[0].pct).toBeCloseTo(0.5, 6);
  });

  test("keeps the tie order stable: equal votes keep the first state's order", () => {
    expect(t.candidatos.map((x) => x.id)).toEqual(["1", "2"]);
  });

  test("sections add up, and the national phase stays partial while a state is missing", () => {
    expect(t.secoes).toEqual({ total: 155, totalizadas: 130 });
    expect(t.cobertura).toEqual({ com: 3, de: 4 });
    expect(t.fase).toBe("parcial");
  });

  test("it is complete only when every state answered and every section is in", () => {
    const todos = { SP: ufs.SP, ZZ: ufs.ZZ };
    expect(totalNacional(linhasUf(todos, "Presidente")).fase).toBe("concluida");
  });

  test("nothing counted anywhere is waiting, and there are no candidates to rank", () => {
    const vazio = totalNacional(linhasUf({ SP: uf({ feitas: 0, cands: [c("1", "A", "X", 0, 0)] }) }, "Presidente"));
    expect(vazio.fase).toBe("aguardando");
    expect(vazio.candidatos).toEqual([]);
  });
});

describe("createCores", () => {
  test("a party keeps its colour for the whole session, and a new party never takes a colour in use", () => {
    const cor = createCores(["#a", "#b", "#c"]);
    const a = cor("AAA");
    const b = cor("BBB");
    expect(a).not.toBe(b);
    expect(cor("AAA")).toBe(a);
    expect(cor("CCC")).toBe("#c");
  });
  test("past the palette it reuses colours instead of failing", () => {
    const cor = createCores(["#a", "#b"]);
    cor("X"); cor("Y");
    expect(["#a", "#b"]).toContain(cor("Z"));
  });
  test("with a rest colour, keys past the palette share it: no two keys look alike by accident", () => {
    const cor = createCores(["#a", "#b"], "#z");
    expect([cor("X"), cor("Y"), cor("Z"), cor("W")]).toEqual(["#a", "#b", "#z", "#z"]);
    expect(cor("X")).toBe("#a");
    expect(cor.resto).toBe("#z");
  });
});

describe("contraPesquisa", () => {
  const corrida = (ids, vagas = 1) => ({ vagas, lideres: ids.map((sq, i) => ({ sq, nome: `N${sq}`, partido: `P${sq}`, media: 0.5 - i * 0.1, lo: 0.4 - i * 0.1, hi: 0.6 - i * 0.1 })) });
  const linha = (ids, vagas = 1, fase = "parcial") => ({ fase, vagas, lider: ids[0] ? { id: ids[0] } : null, top: ids.map((id) => ({ id })) });

  test("same leader in the count and in the polls", () => {
    expect(contraPesquisa(linha(["1", "2"]), corrida(["1", "2"]))).toMatchObject({ situacao: "igual", pesquisa: { sq: "1" } });
  });

  test("a different leader is reported as a difference, never as an error of either side", () => {
    expect(contraPesquisa(linha(["2", "1"]), corrida(["1", "2"]))).toMatchObject({ situacao: "diverge" });
  });

  test("two seats compare the set of the two best, in any order", () => {
    expect(contraPesquisa(linha(["2", "1", "3"], 2), corrida(["1", "2", "3"], 2)).situacao).toBe("igual");
    expect(contraPesquisa(linha(["3", "1", "2"], 2), corrida(["1", "2", "3"], 2)).situacao).toBe("diverge");
  });

  test("no poll data or no count yet is its own state", () => {
    expect(contraPesquisa(linha(["1"]), undefined).situacao).toBe("sem-pesquisa");
    expect(contraPesquisa(linha(["1"]), { vagas: 1 }).situacao).toBe("sem-pesquisa"); // build older than the lideres field
    expect(contraPesquisa(linha([]), corrida(["1"])).situacao).toBe("sem-apuracao");
  });

  test("with fewer poll names than seats it compares what the polls have: one name is compared as a leader", () => {
    expect(contraPesquisa(linha(["1", "2"], 2), corrida(["1"], 2))).toMatchObject({ situacao: "igual", n: 1 });
    expect(contraPesquisa(linha(["2", "1"], 2), corrida(["1"], 2))).toMatchObject({ situacao: "diverge", n: 1 });
  });

  test("it says how many places it compared, so the words can match: the leader for one seat, names for several", () => {
    expect(contraPesquisa(linha(["1"]), corrida(["1"])).n).toBe(1);
    expect(contraPesquisa(linha(["2", "1", "3"], 2), corrida(["1", "2", "3"], 2)).n).toBe(2);
  });
});

describe("rotulosComp", () => {
  test("one place is a leader; several places are names in the first places, and never a leader", () => {
    expect(rotulosComp(1)).toEqual({ igual: "mesmo líder", dif: "líder diferente", onde: "" });
    const dois = rotulosComp(2);
    expect(`${dois.igual} ${dois.dif}`).not.toMatch(/líder/);
    expect(dois.onde).toContain("2 primeiros lugares");
  });
});

describe("linhasUf, stale numbers", () => {
  const cands = [c("1", "A", "X", 1, 1)];
  const rows = Object.fromEntries(linhasUf({
    SP: { ...uf({ cands }), status: "erro", erro: "sem conexão com o TSE" },
    RJ: { ...uf({ cands }), status: "ausente" },
    MG: uf({ cands }),
    BA: { status: "erro", dados: null, erro: "x" },
  }, "Governador").map((r) => [r.uf, r]));

  test("a state that failed or went missing after answering keeps its numbers but is flagged as not current", () => {
    expect(rows.SP).toMatchObject({ defasada: true, lider: { id: "1" } });
    expect(rows.RJ.defasada).toBe(true);
  });

  test("a current state, or one with nothing to show, is not 'stale'", () => {
    expect(rows.MG.defasada).toBe(false);
    expect(rows.BA.defasada).toBe(false);
  });
});

describe("linhasUf, races no split of the remaining votes can change", () => {
  // 900 of 1.000 electors counted and 800 valid votes: at most 100 votes can still arrive.
  const quase = (cands, vagas = 1) => {
    const u = uf({ vagas, cands });
    u.dados.eleitorado = { apto: 1000, apurado: 900 };
    u.dados.votos = { validos: 800 };
    return u;
  };
  const dois = [c("1", "ANA", "AAA", 600, 0.75), c("2", "BETO", "BBB", 200, 0.25)];

  test("a governor's row carries the ids already decided", () => {
    expect([...linhasUf({ SP: quase(dois) }, "Governador")[0].dec]).toEqual(["1"]);
  });

  test("a state's slice of the presidential race decides nothing, however lopsided", () => {
    expect(linhasUf({ SP: quase(dois) }, "Presidente")[0].dec.size).toBe(0);
  });

  test("Senate: every seat holder once the last one is out of reach", () => {
    const tres = [c("1", "ANA", "AAA", 300, 0.43), c("2", "BETO", "BBB", 280, 0.4), c("3", "CRIS", "CCC", 100, 0.14), c("4", "DUDU", "DDD", 20, 0.03)];
    expect([...linhasUf({ SP: quase(tres, 2) }, "Senador")[0].dec].sort()).toEqual(["1", "2"]);
  });

  test("no numbers, a count far from done, and proportional offices: nobody", () => {
    const longe = quase(dois);
    longe.dados.eleitorado = { apto: 5000, apurado: 900 };
    expect(linhasUf({ AL: { status: "carregando", dados: null, erro: null }, SP: longe }, "Governador").map((r) => r.dec.size)).toEqual([0, 0]);
    expect(linhasUf({ SP: quase(dois) }, "Deputado Federal")[0].dec.size).toBe(0);
  });

  test("state fixtures that carry no electorate fields are simply not claimed", () => {
    expect(linhasUf({ SP: uf({ cands: dois }) }, "Governador")[0].dec.size).toBe(0);
  });
});
