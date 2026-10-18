// Candidates and campaign finance from the TSE "prestação de contas 2026" bulk zip.
// Only candidates with at least one declared receipt appear here: the TSE
// registry (consulta_cand) is blocked by WAF for automated clients, see README.
import { unzipSync } from "fflate";
import { decodeLatin1, parseCsv, parseNumber, type Row } from "./csv";
import { onlyDigits, topShare } from "./stats";

export interface Candidate {
  sq: string;
  nome: string;
  numero: string;
  cargo: string;
  uf: string;
  partido: string;
  genero: string;
  corRaca: string;
  finance: Finance; // dataRetrato === "" means no accounts filed yet
  // From the candidate registry (consulta_cand), when available.
  nomeUrna?: string;
  federacao?: string;
  nascimento?: string | null;
  ufNascimento?: string;
  ocupacao?: string;
  instrucao?: string;
  estadoCivil?: string;
  coligacao?: string;
  cpf?: string; // join key only — never serialised
}

export interface Finance {
  total: number;
  publico: number; // FEFC + Fundo Partidário
  proprio: number;
  pessoasFisicas: number; // individuals, crowdfunding, internet
  partidoPrivado: number; // party transfers of non-public money
  outrosCandidatos: number;
  doadoresPF: number;
  maiorDoadorShare: number; // 0-1, any single source key
  despesasContratadas: number;
  impulsionamento: number; // paid boosting of online content, the TSE's own expense origin
  maiorFornecedorShare: number; // 0-1
  dataRetrato: string;
}

const IMPULSIONAMENTO = "20420000"; // CD_ORIGEM_DESPESA "Despesa com Impulsionamento de Conteúdos"
const PUBLIC_SOURCES =new Set(["FUNDO ESPECIAL", "FUNDO PARTIDARIO"]);

function originKind(origem: string): "proprio" | "pf" | "partido" | "candidato" | "outro" {
  const o = origem.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (o.includes("proprios")) return "proprio";
  if (o.includes("pessoas fisicas") || o.includes("financiamento coletivo") || o.includes("internet")) return "pf";
  if (o.includes("partido")) return "partido";
  if (o.includes("outros candidatos")) return "candidato";
  return "outro";
}

export const emptyFinance = (): Finance => ({
  total: 0, publico: 0, proprio: 0, pessoasFisicas: 0, partidoPrivado: 0, outrosCandidatos: 0,
  doadoresPF: 0, maiorDoadorShare: 0, despesasContratadas: 0, impulsionamento: 0, maiorFornecedorShare: 0, dataRetrato: "",
});

// Pure aggregation over parsed rows so it can be tested without the zip.
export function aggregate(receitas: Iterable<Row>, despesas: Iterable<Row>): Map<string, Candidate> {
  const cands = new Map<string, Candidate>();
  const donors = new Map<string, Map<string, number>>();
  const pfDonors = new Map<string, Set<string>>();
  const suppliers = new Map<string, Map<string, number>>();

  const ensure = (r: Row): Candidate => {
    let c = cands.get(r.SQ_CANDIDATO!);
    if (!c) {
      c = {
        sq: r.SQ_CANDIDATO!, nome: r.NM_CANDIDATO ?? "", numero: r.NR_CANDIDATO ?? "",
        cargo: r.DS_CARGO ?? "", uf: r.SG_UF ?? "", partido: r.SG_PARTIDO ?? "",
        genero: r.DS_GENERO ?? "", corRaca: r.DS_COR_RACA ?? "",
        finance: emptyFinance(),
      };
      cands.set(c.sq, c);
    }
    if (!c.genero && r.DS_GENERO) c.genero = r.DS_GENERO;
    if (!c.corRaca && r.DS_COR_RACA) c.corRaca = r.DS_COR_RACA;
    if (r.DT_GERACAO && r.DT_GERACAO > c.finance.dataRetrato) c.finance.dataRetrato = r.DT_GERACAO;
    return c;
  };

  for (const r of receitas) {
    if (!r.SQ_CANDIDATO) continue;
    const c = ensure(r);
    const v = parseNumber(r.VR_RECEITA);
    const f = c.finance;
    f.total += v;
    const kind = originKind(r.DS_ORIGEM_RECEITA ?? "");
    if (PUBLIC_SOURCES.has(r.DS_FONTE_RECEITA ?? "")) f.publico += v;
    else if (kind === "partido") f.partidoPrivado += v;
    if (kind === "proprio") f.proprio += v;
    if (kind === "pf") f.pessoasFisicas += v;
    if (kind === "candidato") f.outrosCandidatos += v;

    const donorKey = onlyDigits(r.NR_CPF_CNPJ_DOADOR) || r.NM_DOADOR || "?";
    const m = donors.get(c.sq) ?? new Map<string, number>();
    m.set(donorKey, (m.get(donorKey) ?? 0) + v);
    donors.set(c.sq, m);
    if (kind === "pf") {
      const s = pfDonors.get(c.sq) ?? new Set<string>();
      s.add(donorKey);
      pfDonors.set(c.sq, s);
    }
  }

  for (const r of despesas) {
    if (!r.SQ_CANDIDATO) continue;
    const c = ensure(r);
    const v = parseNumber(r.VR_DESPESA_CONTRATADA);
    c.finance.despesasContratadas += v;
    if (r.CD_ORIGEM_DESPESA === IMPULSIONAMENTO) c.finance.impulsionamento += v;
    const key = onlyDigits(r.NR_CPF_CNPJ_FORNECEDOR) || r.NM_FORNECEDOR || "?";
    const m = suppliers.get(c.sq) ?? new Map<string, number>();
    m.set(key, (m.get(key) ?? 0) + v);
    suppliers.set(c.sq, m);
  }

  for (const c of cands.values()) {
    c.finance.doadoresPF = pfDonors.get(c.sq)?.size ?? 0;
    c.finance.maiorDoadorShare = topShare(donors.get(c.sq)?.values() ?? []);
    c.finance.maiorFornecedorShare = topShare(suppliers.get(c.sq)?.values() ?? []);
  }
  return cands;
}

export async function loadTse(zipPath: string): Promise<Map<string, Candidate>> {
  const buf = new Uint8Array(await Bun.file(zipPath).arrayBuffer());
  // The BRASIL file is the union of every UF file plus national races; reading
  // the UF files too would double-count every real.
  const files = unzipSync(buf, {
    filter: (f) => /^(receitas_candidatos|despesas_contratadas_candidatos)_2026_BRASIL\.csv$/.test(f.name),
  });
  const rows = (prefix: string) =>
    (function* () {
      for (const [name, data] of Object.entries(files)) {
        if (name.startsWith(prefix)) yield* parseCsv(decodeLatin1(data));
      }
    })();
  return aggregate(rows("receitas_candidatos_2026_"), rows("despesas_contratadas_candidatos_2026_"));
}
