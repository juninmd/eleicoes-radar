// Aggregates who paid whom: campaign expenses (TSE) and parliamentary quota (CEAP) per
// supplier CNPJ, so each supplier knows every politician it served.
import { parseNumber, type Row } from "../csv";
import { digits } from "./cnpj";

export interface Politico {
  id: string; // candidate sq when known, else "d<deputyId>"
  nome: string;
  cargo: string;
  uf: string;
  partido: string;
}
export interface Payment {
  valor: number;
  via: Set<"campanha" | "cota">;
}
export interface Supplier {
  cnpj: string;
  nome: string;
  cnae: string;
  municipio: string;
  uf: string;
  primeiroPagamento: string; // ISO date
  total: number;
  pagos: Map<string, Payment>; // politician id -> payments
}
export type Suppliers = Map<string, Supplier>;
export type Directory = Map<string, Politico>;

const NULLS = new Set(["#NULO", "#NULO#", "#NE", "-1", ""]);
const clean = (s: string | undefined) => (s && !NULLS.has(s.trim()) ? s.trim() : "");
const isoBr = (s: string) => (/^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : s.slice(0, 10));
const BANK_FEES = /encargos financeiros/i;

function slot(all: Suppliers, cnpj: string, nome: string): Supplier {
  let s = all.get(cnpj);
  if (!s) {
    s = { cnpj, nome, cnae: "", municipio: "", uf: "", primeiroPagamento: "9999-12-31", total: 0, pagos: new Map() };
    all.set(cnpj, s);
  }
  return s;
}

function pay(s: Supplier, who: string, valor: number, date: string, via: "campanha" | "cota") {
  s.total += valor;
  if (date && date < s.primeiroPagamento) s.primeiroPagamento = date;
  const p = s.pagos.get(who) ?? { valor: 0, via: new Set() };
  p.valor += valor;
  p.via.add(via);
  s.pagos.set(who, p);
}

// Campaign expenses of legal entities. Bank/card fees are skipped: every campaign pays a bank.
export function addCampaign(all: Suppliers, r: Row) {
  const cnpj = digits(r.NR_CPF_CNPJ_FORNECEDOR);
  if (cnpj.length !== 14 || !r.SQ_CANDIDATO || BANK_FEES.test(r.DS_ORIGEM_DESPESA ?? "")) return;
  if (clean(r.SQ_CANDIDATO_FORNECEDOR)) return; // transfer between campaigns, not a vendor
  const s = slot(all, cnpj, clean(r.NM_FORNECEDOR_RFB) || clean(r.NM_FORNECEDOR));
  s.cnae ||= clean(r.DS_CNAE_FORNECEDOR);
  s.municipio ||= clean(r.NM_MUNICIPIO_FORNECEDOR);
  s.uf ||= clean(r.SG_UF_FORNECEDOR);
  pay(s, r.SQ_CANDIDATO, parseNumber(r.VR_DESPESA_CONTRATADA), isoBr(r.DT_DESPESA ?? ""), "campanha");
}

// CEAP line. deputyToSq folds a deputy who is also a 2026 candidate into one identity.
export function addCeap(all: Suppliers, dir: Directory, deputyToSq: Map<number, string>, r: Row) {
  if (r.codLegislatura !== "57" || !r.ideCadastro) return;
  const cnpj = digits(r.txtCNPJCPF);
  if (cnpj.length !== 14) return;
  const dep = Number(r.ideCadastro);
  const who = deputyToSq.get(dep) ?? `d${dep}`;
  if (!dir.has(who)) dir.set(who, { id: who, nome: r.txNomeParlamentar ?? "", cargo: "Deputado Federal", uf: r.sgUF ?? "", partido: r.sgPartido ?? "" });
  const s = slot(all, cnpj, clean(r.txtFornecedor));
  pay(s, who, parseNumber(r.vlrLiquido), (r.datEmissao ?? "").slice(0, 10), "cota");
}
