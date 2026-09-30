// Public per-candidate supplier list: top payees, what the registry says about them,
// and which other politicians they served. Individuals (CPF) are never listed.
import { supplierFlags } from "./flags";
import { formatCnpj } from "./cnpj";
import type { Empresa } from "./receita";
import type { Directory, Suppliers, Supplier } from "./collect";

export const TOP_SUPPLIERS = 5;
const OTHERS = 3;

export interface FornecedorView {
  nome: string;
  cnpj: string;
  valor: number;
  via: string[];
  cnae: string;
  empresa: { situacao: string; abertura: string; capital: number | null; porte: string; endereco: string } | null;
  outros: number;
  outrosTop: { id: string; nome: string; cargo: string; uf: string; partido: string; valor: number }[];
  flags: string[];
}

export const addressKey = (e?: Empresa) => (e?.endereco?.cep && e.endereco.numero ? `${e.endereco.cep}|${e.endereco.numero}|${e.endereco.logradouro}` : "");

export function addressCounts(all: Suppliers, empresas: Map<string, Empresa>): Map<string, number> {
  const n = new Map<string, number>();
  for (const s of all.values()) {
    const k = addressKey(empresas.get(s.cnpj));
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return n;
}

export function byPolitician(all: Suppliers): Map<string, Supplier[]> {
  const out = new Map<string, Supplier[]>();
  for (const s of all.values()) for (const id of s.pagos.keys()) (out.get(id) ?? out.set(id, []).get(id)!).push(s);
  for (const [id, list] of out) list.sort((a, b) => b.pagos.get(id)!.valor - a.pagos.get(id)!.valor);
  return out;
}

const addr = (e: Empresa) => {
  const a = e.endereco;
  if (!a) return "";
  return [[a.logradouro, a.numero].filter(Boolean).join(", "), a.complemento, a.bairro, [a.municipio, a.uf].filter(Boolean).join("/"), a.cep && `CEP ${a.cep}`].filter(Boolean).join(" · ");
};

export function supplierView(id: string, list: Supplier[], dir: Directory, empresas: Map<string, Empresa>, addrN: Map<string, number>): FornecedorView[] {
  return list.slice(0, TOP_SUPPLIERS).map((s) => {
    const e = empresas.get(s.cnpj);
    const k = addressKey(e);
    const others = [...s.pagos].filter(([pid]) => pid !== id).sort((a, b) => b[1].valor - a[1].valor);
    return {
      nome: e?.razao || s.nome,
      cnpj: formatCnpj(s.cnpj),
      valor: Math.round(s.pagos.get(id)!.valor),
      via: [...s.pagos.get(id)!.via],
      cnae: e?.cnae || s.cnae,
      empresa: e?.encontrada ? { situacao: e.situacao ?? "", abertura: e.abertura ?? "", capital: e.capital ?? null, porte: e.porte ?? "", endereco: addr(e) } : null,
      outros: others.length,
      outrosTop: others.slice(0, OTHERS).flatMap(([pid, p]) => {
        const d = dir.get(pid);
        return d ? [{ id: pid, nome: d.nome, cargo: d.cargo, uf: d.uf, partido: d.partido, valor: Math.round(p.valor) }] : [];
      }),
      flags: supplierFlags({ cnpj: s.cnpj, total: s.total, primeiroPagamento: s.primeiroPagamento, empresa: e, mesmoEndereco: k ? (addrN.get(k) ?? 1) - 1 : 0 }),
    };
  });
}
