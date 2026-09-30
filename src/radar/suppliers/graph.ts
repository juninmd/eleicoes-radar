// Party <-> supplier network for the "Rede" tab: valid-CNPJ suppliers that served the most
// politicians, and how much each party's candidates paid them. Individuals never appear.
import { supplierFlags } from "./flags";
import { formatCnpj, isValidCnpj } from "./cnpj";
import { addressKey } from "./view";
import type { Empresa } from "./receita";
import type { Directory, Suppliers } from "./collect";

export const TOP_NODES = 150;

export interface RedeFornecedor {
  id: string;
  nome: string;
  cnpj: string;
  total: number;
  politicos: number;
  situacao: string;
  endereco: string;
  flags: string[];
}
export interface Rede {
  partidos: { id: string; total: number }[];
  fornecedores: RedeFornecedor[];
  arestas: { p: string; f: string; valor: number; n: number }[];
}

const endereco = (e?: Empresa) => {
  const a = e?.endereco;
  return a ? [[a.logradouro, a.numero].filter(Boolean).join(", "), a.bairro, [a.municipio, a.uf].filter(Boolean).join("/"), a.cep && `CEP ${a.cep}`].filter(Boolean).join(" · ") : "";
};

export function buildRede(all: Suppliers, dir: Directory, empresas: Map<string, Empresa>, addrN: Map<string, number>): Rede {
  const top = [...all.values()].filter((s) => s.pagos.size >= 2 && isValidCnpj(s.cnpj)).sort((a, b) => b.pagos.size - a.pagos.size || b.total - a.total).slice(0, TOP_NODES);
  const edges = new Map<string, { p: string; f: string; valor: number; n: number }>();
  const party = new Map<string, number>();
  for (const s of top) {
    for (const [id, pay] of s.pagos) {
      const p = dir.get(id)?.partido;
      if (!p) continue;
      const k = `${p}|${s.cnpj}`;
      const e = edges.get(k) ?? { p, f: s.cnpj, valor: 0, n: 0 };
      e.valor += Math.round(pay.valor);
      e.n++;
      edges.set(k, e);
      party.set(p, (party.get(p) ?? 0) + pay.valor);
    }
  }
  return {
    partidos: [...party].map(([id, total]) => ({ id, total: Math.round(total) })).sort((a, b) => b.total - a.total),
    fornecedores: top.map((s) => {
      const e = empresas.get(s.cnpj);
      const k = addressKey(e);
      return {
        id: s.cnpj,
        nome: e?.razao || s.nome,
        cnpj: formatCnpj(s.cnpj),
        total: Math.round(s.total),
        politicos: s.pagos.size,
        situacao: e?.situacao ?? "",
        endereco: endereco(e),
        flags: supplierFlags({ cnpj: s.cnpj, total: s.total, primeiroPagamento: s.primeiroPagamento, empresa: e, mesmoEndereco: k ? (addrN.get(k) ?? 1) - 1 : 0 }),
      };
    }),
    arestas: [...edges.values()].filter((e) => e.valor > 0),
  };
}
