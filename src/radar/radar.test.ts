import { describe, expect, test } from "bun:test";
import { parseCsv, parseNumber } from "./csv";
import { percentileRanks, topShare } from "./stats";
import { aggregate } from "./tse";
import { bancadaMatchesParty, computeVotes, exerciseIntervals } from "./camara/votes";
import { computeBills } from "./camara/bills";
import { monthsInExercise } from "./camara/ceap";
import { computeAgenda } from "./camara/agenda";
import { classify } from "./incumbency";
import { parseRegistry } from "./tse-cand";
import { namesAgree } from "./profiles/wikidata";
import { linkMandate, toPublic } from "./build";
import type { Mandate } from "./mandate";

describe("csv", () => {
  test("keeps delimiters, escaped quotes and newlines inside quoted fields", () => {
    const text = '﻿"a";"b"\r\n"x;1";"linha\nquebrada ""citada"""\r\n';
    expect([...parseCsv(text)]).toEqual([{ a: "x;1", b: 'linha\nquebrada "citada"' }]);
  });

  test("parses pt-BR and dot-decimal numbers, TSE null markers as zero", () => {
    expect(parseNumber("90000,00")).toBe(90000);
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("216.3")).toBe(216.3);
    expect(parseNumber("#NULO")).toBe(0);
  });
});

describe("stats", () => {
  test("missing data stays null instead of ranking last", () => {
    expect(percentileRanks([10, null, 30, 20])).toEqual([0, null, 1, 0.5]);
  });
  test("ties share the same rank", () => {
    expect(percentileRanks([5, 5, 10])).toEqual([0.25, 0.25, 1]);
  });
  test("topShare ignores non-positive entries", () => {
    expect(topShare([30, 10, -5, 0])).toBe(0.75);
    expect(topShare([])).toBe(0);
  });
});

const receita = (over: Record<string, string>) => ({
  SQ_CANDIDATO: "1", NM_CANDIDATO: "FULANA DE TAL", NR_CANDIDATO: "1234", DS_CARGO: "Deputado Federal",
  SG_UF: "SP", SG_PARTIDO: "XYZ", DT_GERACAO: "30/08/2026", NR_CPF_CANDIDATO: "-4",
  DS_FONTE_RECEITA: "OUTROS RECURSOS", DS_ORIGEM_RECEITA: "Recursos de pessoas físicas",
  NR_CPF_CNPJ_DOADOR: "111", VR_RECEITA: "100,00", ...over,
});

describe("tse finance", () => {
  const cands = aggregate(
    [
      receita({ DS_FONTE_RECEITA: "FUNDO ESPECIAL", DS_ORIGEM_RECEITA: "Recursos de partido político", NR_CPF_CNPJ_DOADOR: "999", VR_RECEITA: "600,00" }),
      receita({ NR_CPF_CNPJ_DOADOR: "111", VR_RECEITA: "100,00" }),
      receita({ NR_CPF_CNPJ_DOADOR: "111", VR_RECEITA: "100,00" }),
      receita({ NR_CPF_CNPJ_DOADOR: "222", DS_ORIGEM_RECEITA: "Recursos de Financiamento Coletivo", VR_RECEITA: "100,00" }),
      receita({ DS_ORIGEM_RECEITA: "Recursos próprios", NR_CPF_CNPJ_DOADOR: "333", VR_RECEITA: "100,00" }),
    ],
    [{ SQ_CANDIDATO: "1", NR_CPF_CNPJ_FORNECEDOR: "55", VR_DESPESA_CONTRATADA: "300,00" }, { SQ_CANDIDATO: "1", NR_CPF_CNPJ_FORNECEDOR: "66", VR_DESPESA_CONTRATADA: "100,00" }],
  );
  const f = cands.get("1")!.finance;

  test("splits public funds from private money", () => {
    expect(f.total).toBe(1000);
    expect(f.publico).toBe(600);
    expect(f.pessoasFisicas).toBe(300);
    expect(f.proprio).toBe(100);
  });
  test("counts distinct individual donors, crowdfunding included", () => {
    expect(f.doadoresPF).toBe(2);
  });
  test("concentration uses the largest single source", () => {
    expect(f.maiorDoadorShare).toBe(0.6);
    expect(f.maiorFornecedorShare).toBe(0.75);
  });
});

test("boosting counts only the TSE expense origin 20420000, and stays inside the contracted total", () => {
  const rows = [
    { SQ_CANDIDATO: "1", NR_CPF_CNPJ_FORNECEDOR: "55", VR_DESPESA_CONTRATADA: "300,00", CD_ORIGEM_DESPESA: "20420000" },
    { SQ_CANDIDATO: "1", NR_CPF_CNPJ_FORNECEDOR: "55", VR_DESPESA_CONTRATADA: "1.200,50", CD_ORIGEM_DESPESA: "20420000" },
    { SQ_CANDIDATO: "1", NR_CPF_CNPJ_FORNECEDOR: "66", VR_DESPESA_CONTRATADA: "100,00", CD_ORIGEM_DESPESA: "20140000" }, // printed material
    { SQ_CANDIDATO: "2", NR_CPF_CNPJ_FORNECEDOR: "66", VR_DESPESA_CONTRATADA: "50,00", CD_ORIGEM_DESPESA: "" },
  ];
  const got = aggregate([], rows);
  expect(got.get("1")!.finance.impulsionamento).toBe(1500.5);
  expect(got.get("1")!.finance.despesasContratadas).toBe(1600.5);
  expect(got.get("2")!.finance.impulsionamento).toBe(0);
});

describe("chamber votes", () => {
  test("party orientation matches truncated names and federations, never blocs", () => {
    expect(bancadaMatchesParty("Fdr PT-PCdoB-PV", "PT")).toBe(true);
    expect(bancadaMatchesParty("Solidaried", "SOLIDARIEDADE")).toBe(true);
    expect(bancadaMatchesParty("Podemos", "PODE")).toBe(true);
    expect(bancadaMatchesParty("Bl PlFdrPtUniPp...", "PL")).toBe(false);
    expect(bancadaMatchesParty("PSD", "PSDB")).toBe(false);
  });

  test("exercise intervals close on leave and reopen on return", () => {
    expect(exerciseIntervals([
      { dataHora: "2023-02-01T12:00", situacao: "Exercício" },
      { dataHora: "2023-04-12T19:00", situacao: "Licença" },
      { dataHora: "2024-12-03T11:00", situacao: "Exercício" },
    ], "Z")).toEqual([["2023-02-01T12:00", "2023-04-12T19:00"], ["2024-12-03T11:00", "Z"]]);
  });

  test("roll calls held while on leave are not counted as absences", () => {
    const votacoes = ["2023-03-01", "2023-06-01", "2023-09-01", "2024-01-10"].map((d, i) => ({
      id: `v${i}`, siglaOrgao: "PLEN", votosSim: "300", votosNao: "100", votosOutros: "0", data: d, dataHoraRegistro: `${d}T15:00:00`,
    }));
    const votos = [{ idVotacao: "v0", deputado_id: "7", voto: "Sim" }, { idVotacao: "v3", deputado_id: "7", voto: "Não" }];
    const history = new Map([[7, [
      { dataHora: "2023-02-01T12:00", situacao: "Exercício" },
      { dataHora: "2023-04-01T12:00", situacao: "Licença" },
      { dataHora: "2023-12-01T12:00", situacao: "Exercício" },
    ]]]);
    const s = computeVotes(votacoes, votos, [], history).get(7)!;
    expect(s).toMatchObject({ votou: 2, possiveis: 2 });
  });

  test("symbolic and committee votes are ignored", () => {
    const votacoes = [
      { id: "a", siglaOrgao: "PLEN", votosSim: "0", votosNao: "0", votosOutros: "0", data: "2023-03-01" },
      { id: "b", siglaOrgao: "CCJC", votosSim: "30", votosNao: "5", votosOutros: "0", data: "2023-03-01" },
    ];
    expect(computeVotes(votacoes, [{ idVotacao: "a", deputado_id: "1", voto: "Sim" }, { idVotacao: "b", deputado_id: "1", voto: "Sim" }], []).size).toBe(0);
  });
});

describe("bills", () => {
  test("counts only first-signed PL/PLP/PEC and classifies passage", () => {
    const props = [
      { id: "1", siglaTipo: "PL", numero: "10", ano: "2023", ementa: "x", ultimoStatus_descricaoSituacao: "Transformado em Norma Jurídica" },
      { id: "2", siglaTipo: "PL", numero: "11", ano: "2023", ementa: "y", ultimoStatus_descricaoSituacao: "Aguardando Apreciação pelo Senado Federal" },
      { id: "3", siglaTipo: "REQ", numero: "12", ano: "2023", ementa: "z", ultimoStatus_descricaoSituacao: "Transformado em Norma Jurídica" },
      { id: "4", siglaTipo: "PEC", numero: "13", ano: "2023", ementa: "w", ultimoStatus_descricaoSituacao: "Aguardando Parecer" },
    ];
    const autores = [
      { idProposicao: "1", idDeputadoAutor: "9", ordemAssinatura: "1" },
      { idProposicao: "2", idDeputadoAutor: "9", ordemAssinatura: "1" },
      { idProposicao: "3", idDeputadoAutor: "9", ordemAssinatura: "1" },
      { idProposicao: "4", idDeputadoAutor: "9", ordemAssinatura: "2" },
    ];
    expect(computeBills(props, autores).get(9)).toMatchObject({ autorPrincipal: 2, aprovadasCamara: 2, leis: 1 });
  });
});

describe("linking and output", () => {
  const mandate = (id: number, uf: string): Mandate => ({ deputadoId: id, nome: "X", partido: "P", uf, votos: null, bills: null, ceap: null, emendas: null, agenda: null, atual: true, desde: 2023 });
  const cand = aggregate([receita({ NM_CANDIDATO: "JOSÉ DA SILVA", SG_UF: "BA" })], []).get("1")!;

  test("homonyms are disambiguated by UF and left unlinked when still ambiguous", () => {
    const idx = (list: Mandate[]) => ({ byName: new Map([["JOSE DA SILVA", list]]), byCpf: new Map<string, Mandate>() });
    expect(linkMandate(cand, idx([mandate(1, "SP"), mandate(2, "BA")]))?.deputadoId).toBe(2);
    expect(linkMandate(cand, idx([mandate(1, "BA"), mandate(2, "BA")]))).toBeNull();
  });

  test("CPF from the registry wins over any name match", () => {
    const withCpf = { ...cand, cpf: "12345678901" };
    const byName = new Map([["JOSE DA SILVA", [mandate(1, "BA")]]]);
    expect(linkMandate(withCpf, { byName, byCpf: new Map([["12345678901", mandate(9, "SP")]]) })?.deputadoId).toBe(9);
  });

  test("CPF never reaches the public JSON, even with a linked mandate", () => {
    const m = { ...mandate(9, "SP"), ceap: { total: 1, meses: 1, mediaMensal: 1, maiorFornecedorShare: 1, maiorFornecedor: "X", uf: "SP", ultimoMes: "2026-01", cpf: "12345678901" } };
    const json = JSON.stringify(toPublic({ c: { ...cand, cpf: "12345678901" }, m, ind: {} }));
    expect(json).not.toContain("12345678901");
  });

  test("public output never carries CPF or donor identities", () => {
    const json = JSON.stringify(toPublic({ c: cand, m: null, ind: {} }));
    expect(json).not.toMatch(/cpf/i);
    expect(json).not.toContain("111");
  });
});

describe("ceap tenure", () => {
  test("months without spending still count while in office, leave months do not", () => {
    const intervals: [string, string][] = [["2023-02-01T12:00", "2023-04-12T19:00"], ["2023-11-21T11:00", "9999"]];
    expect(monthsInExercise(intervals, "2024-02")).toBe(3 + 4);
  });
  test("year rollover and a single-month interval", () => {
    expect(monthsInExercise([["2023-12-20T00:00", "2024-01-05T00:00"]], "2026-09")).toBe(2);
  });
});

describe("agenda alignment", () => {
  const config = {
    descricao: "",
    temas: {
      impostos: { nome: "Impostos", votos: [
        { id: "v1", proposicao: "PL 1/2023", data: "", resumo: "", posicao: "Não" as const, porque: "" },
        { id: "v2", proposicao: "PDL 2/2025", data: "", resumo: "", posicao: "Sim" as const, porque: "" },
      ] },
    },
  };
  test("counts aligned votes against the configured position per theme", () => {
    const s = computeAgenda([
      { idVotacao: "v1", deputado_id: "5", voto: "Não" },
      { idVotacao: "v2", deputado_id: "5", voto: "Não" },
      { idVotacao: "v9", deputado_id: "5", voto: "Sim" },
    ], config).get(5)!;
    expect(s.temas.impostos).toEqual({ alinhado: 1, total: 2 });
  });
  test("obstruction and abstention are recorded but never scored as a position", () => {
    const s = computeAgenda([{ idVotacao: "v1", deputado_id: "6", voto: "Obstrução" }], config).get(6)!;
    expect(s.temas.impostos).toBeUndefined();
    expect(s.votos.v1).toBe("Obstrução");
  });
});

describe("incumbency", () => {
  const sen = new Map([["MARIA SOUZA", [{ nome: "MARIA SOUZA", uf: "RJ", fimMandato: "2027-01-31", desde: 2019 }]]]);
  const none = new Map();
  test("deputy holding the seat and running for it again is re-election", () => {
    expect(classify({ nome: "JOAO", cargo: "Deputado Federal", uf: "SP" }, { atual: true, desde: 2015 }, none)).toEqual({ status: "reeleicao", casa: "Câmara", desde: 2015 });
  });
  test("deputy running for governor is changing office, not new", () => {
    expect(classify({ nome: "JOAO", cargo: "Governador", uf: "SP" }, { atual: true, desde: 2023 }, none).status).toBe("outro-cargo");
  });
  test("former substitute is flagged as having served", () => {
    expect(classify({ nome: "JOAO", cargo: "Deputado Federal", uf: "SP" }, { atual: false, desde: 2023 }, none).status).toBe("ja-exerceu");
  });
  test("senator found by full name, even when running nationally", () => {
    expect(classify({ nome: "MARIA SOUZA", cargo: "Senador", uf: "RJ" }, null, sen).status).toBe("reeleicao");
    expect(classify({ nome: "Maria Souza", cargo: "Presidente", uf: "BR" }, null, sen).status).toBe("outro-cargo");
  });
  test("no federal mandate is 'novo' only in federal races; otherwise unverified", () => {
    expect(classify({ nome: "ANA", cargo: "Senador", uf: "SP" }, null, none).status).toBe("novo");
    expect(classify({ nome: "ANA", cargo: "Governador", uf: "SP" }, null, none).status).toBe("nao-verificado");
    expect(classify({ nome: "ANA", cargo: "Deputado Estadual", uf: "SP" }, null, none).status).toBe("nao-verificado");
  });
});

describe("wikidata name matching", () => {
  test("exact civil name, accents and case ignored", () => {
    expect(namesAgree("LUIZ INACIO LULA DA SILVA", ["Luiz Inácio Lula da Silva"])).toBe("exact");
  });
  test("first + last name agreement is only 'loose' (needs politician evidence)", () => {
    expect(namesAgree("RONALDO RAMOS CAIADO", ["Ronaldo Caiado"])).toBe("loose");
    expect(namesAgree("ROMEU ZEMA NETO", ["Romeu Zema"])).toBe("exact");
  });
  test("different surname never matches", () => {
    expect(namesAgree("JOSE CARLOS SILVA", ["José Carlos Souza", "Carlos Silva"])).toBeNull();
  });
});

describe("tse registry", () => {
  const row = {
    SQ_CANDIDATO: "250001", NM_CANDIDATO: "MARIA DA SILVA", NM_URNA_CANDIDATO: "MARIA DO POVO", NR_CANDIDATO: "4444",
    DS_CARGO: "DEPUTADO FEDERAL", SG_UF: "SP", SG_PARTIDO: "XYZ", NM_FEDERACAO: "#NULO", DS_GENERO: "FEMININO", DS_COR_RACA: "PARDA",
    DT_NASCIMENTO: "05/08/1975", SG_UF_NASCIMENTO: "PE", DS_OCUPACAO: "ADVOGADO", DS_GRAU_INSTRUCAO: "SUPERIOR COMPLETO",
    NR_CPF_CANDIDATO: "12345678901", NR_TITULO_ELEITORAL_CANDIDATO: "047714630884",
  };
  test("maps ballot name, ISO birth date and title-case office; TSE nulls become empty", () => {
    const r = parseRegistry([row]).get("250001")!;
    expect(r).toMatchObject({ nomeUrna: "MARIA DO POVO", cargo: "Deputado Federal", nascimento: "1975-08-05", federacao: "" });
  });
  test("drops vice and substitute slots and never keeps the voter ID", () => {
    const m = parseRegistry([row, { ...row, SQ_CANDIDATO: "2", DS_CARGO: "VICE-GOVERNADOR" }, { ...row, SQ_CANDIDATO: "3", DS_CARGO: "1º SUPLENTE" }]);
    expect([...m.keys()]).toEqual(["250001"]);
    expect(JSON.stringify([...m.values()])).not.toContain("047714630884");
  });
});
