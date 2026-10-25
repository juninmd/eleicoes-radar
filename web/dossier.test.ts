import { describe, expect, test } from "bun:test";
import { renderDossier, propostaBlock } from "./dossier.js";
import type { Candidatura } from "./types.js";

const candidate: Candidatura = {
  id: "250001234567",
  nome: "MARIA CANDIDATA DA SILVA",
  urna: "MARIA DA SILVA",
  cargo: "Deputado Federal",
  uf: "SP",
  num: "1234",
  partido: "PARTIDO",
  genero: "FEMININO",
  corRaca: "BRANCA",
  temContas: true,
  fin: {
    total: 100000,
    publico: 80000,
    partido: 10000,
    proprio: 5000,
    pf: 5000,
    candidatos: 0,
    doadoresPF: 10,
    maiorDoador: 0.2,
    gastos: 90000,
    impuls: 5000,
    maiorFornecedor: 0.15,
  },
  ind: {
    presenca: 0.95,
    producao: 0.8,
    economia: 0.6,
    impostos: 0.6,
    liberdadeEconomica: 0.7,
    expressao: 0.8,
  },
  mandato: {
    id: 123456,
    nome: "MARIA DA SILVA",
    partido: "PARTIDO",
    uf: "SP",
    votos: { votou: 95, possiveis: 100, alinhadoPartido: 90, comparaveisPartido: 100, alinhadoGoverno: 70, comparaveisGoverno: 100 },
    projetos: { autorPrincipal: 10, aprovadasCamara: 2, leis: 1, destaques: [{ id: 987, sigla: "PL 987/2023", ementa: "Ementa do projeto", situacao: "Aprovado" }] },
    cota: { total: 120000, meses: 12, mediaMensal: 10000, maiorFornecedor: "FORNECEDOR X", maiorFornecedorShare: 0.2 },
    agenda: { temas: {}, votos: { "1": "Sim" } },
    emendas: { empenhado: 500000, pago: 400000, areas: [{ nome: "Saúde", valor: 300000 }] },
  },
  perfil: { status: "reeleicao", casa: "Câmara", desde: 2023 },
  ficha: { nascimento: "1980-05-15", ufNascimento: "SP", ocupacao: "DEPUTADA", instrucao: "SUPERIOR COMPLETO", federacao: "", estadoCivil: "CASADO(A)", coligacao: null },
  proposta: { kb: 2048 },
  canais: [{ r: "instagram", u: "https://instagram.com/mariadasilva" }],
  patrimonio: { total: 500000, total2022: 400000, n: 3, tipos: [{ tipo: "Imóvel", valor: 400000 }] },
  motivos: null,
  fornecedores: null,
  bio: {
    naturalidade: "São Paulo - SP",
    nascimento: "1980-05-15",
    trajetoria: [{ inicio: "2023", fim: null, cargo: "Deputada Federal", fonte: "Câmara" }],
    wikidata: "Q123456",
    escolaridade: null,
    redes: null,
    seguidores: null,
    site: null,
    atuacao: null,
    resumo: { url: "https://pt.wikipedia.org/wiki/Maria_da_Silva", texto: "Deputada federal por São Paulo." },
  },
  fotoCredito: "Câmara dos Deputados",
  prev: null,
};

const fakeScore = { nota: 82, cobertura: 1, s: 0.82 };

describe("dossier rendering", () => {
  test("includes copy candidate link button with data-copy-cand attribute", () => {
    const html = renderDossier(candidate, fakeScore, false, null, `<img src="x" alt="">`, null);
    expect(html).toContain('data-copy-cand="250001234567"');
    expect(html).toContain("Copiar link");
    expect(html).toContain("dossie-actions");
  });

  test("external links consistently carry rel='noopener noreferrer'", () => {
    const html = renderDossier(candidate, fakeScore, false, null, `<img src="x" alt="">`, null);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).not.toMatch(/target="_blank"\s+rel="noopener"/);
    expect(html).toContain('href="https://www.camara.leg.br/deputados/123456"');
    expect(html).toContain('href="https://www.wikidata.org/wiki/Q123456"');
  });

  test("propostaBlock formats sizes accurately and provides download link", () => {
    const html = propostaBlock(candidate.proposta, candidate.id);
    expect(html).toContain("2,0 MB");
    expect(html).toContain('download="proposta-250001234567.pdf"');
  });
});
