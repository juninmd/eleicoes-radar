// "Para conferir" signals about a supplier. Each is a fact plus context, never a verdict:
// legitimate suppliers trip them too (new businesses, coworking addresses, small capital).
import { isValidCnpj } from "./cnpj";
import type { Empresa } from "./receita";

export interface FlagInput {
  cnpj: string;
  total: number; // everything politicians paid this supplier
  primeiroPagamento: string; // ISO
  empresa?: Empresa;
  mesmoEndereco: number; // other suppliers at the same address in this survey
}

const DAY = 86_400_000;
export const NEW_DAYS = 365;

// Days between the company's opening and the first payment a politician made to it.
export function ageAtFirstPayment(abertura: string | undefined, primeiroPagamento: string): number | null {
  if (!abertura || primeiroPagamento >= "9999") return null;
  return Math.round((Date.parse(primeiroPagamento) - Date.parse(abertura)) / DAY);
}
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const br = (iso: string) => iso.split("-").reverse().join("/");

export function supplierFlags({ cnpj, total, primeiroPagamento, empresa: e, mesmoEndereco }: FlagInput): string[] {
  const out: string[] = [];
  if (!isValidCnpj(cnpj)) out.push("CNPJ com dígito verificador inválido");
  if (!e) return out;
  if (!e.encontrada) return [...out, "CNPJ não localizado na base da Receita Federal"];
  if (e.situacao && e.situacao !== "ATIVA") out.push(`Situação cadastral ${e.situacao.toLowerCase()}${e.situacaoDesde ? ` desde ${br(e.situacaoDesde)}` : ""}`);
  if (e.abertura && primeiroPagamento < "9999") {
    const dias = Math.round((Date.parse(primeiroPagamento) - Date.parse(e.abertura)) / DAY);
    if (dias >= 0 && dias <= 180) out.push(`Aberta em ${br(e.abertura)}, ${dias} dias antes do primeiro pagamento registrado`);
    else if (dias < 0) out.push(`Data de abertura (${br(e.abertura)}) posterior ao primeiro pagamento registrado`);
  }
  if (e.capital !== undefined && total >= 100_000 && e.capital * 50 < total) out.push(`Capital social de ${brl(e.capital)} frente a ${brl(total)} recebidos de políticos`);
  if (mesmoEndereco >= 4) out.push(`Endereço compartilhado com outros ${mesmoEndereco} fornecedores deste levantamento`);
  return out;
}
