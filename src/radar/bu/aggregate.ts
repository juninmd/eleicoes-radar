// Boletim de Urna (BU) do TSE: agrega as linhas oficiais por município, cargo majoritário e turno.
// Uma linha do CSV é uma seção × cargo × votável (candidato, branco ou nulo). Aptos/comparecimento/abstenções
// se repetem em cada linha da seção, então entram uma vez por seção; os votos somam.
import { parseNumber, type Row } from "../csv";

export const CARGOS_BU = ["Presidente", "Governador", "Senador"] as const;
export type CargoBu = (typeof CARGOS_BU)[number];

export interface BuCandidato { nr: string; nome: string; partido: string; votos: number }
export interface BuMunicipio {
  cd: string;
  nome: string;
  secoes: number;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  brancos: number;
  nulos: number;
  candidatos: BuCandidato[];
}
export interface BuTotal {
  secoes: number;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  brancos: number;
  nulos: number;
  candidatos: BuCandidato[];
}
export interface BuArquivo {
  ano: number;
  turno: 1 | 2;
  uf: string;
  cargo: CargoBu;
  geradoEm: string;
  buGeradoEm: string | null; // DT_GERACAO/HH_GERACAO do arquivo do TSE
  recebidoAte: string | null; // maior DT_BU_RECEBIDO
  fonte: string;
  fonteUrl: string;
  municipios: BuMunicipio[];
  total: BuTotal;
}

interface MunAcc {
  cd: string;
  nome: string;
  secoes: Set<string>;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  brancos: number;
  nulos: number;
  candidatos: Map<string, BuCandidato>;
}

const limpo = (s: string) => s.trim().replace(/^"|"$/g, "");

export function novoAgregador() {
  const porCargo = new Map<CargoBu, Map<string, MunAcc>>();
  const meta = { geradoEm: "", recebidoAte: "" };
  const mun = (cargo: CargoBu, cd: string, nome: string): MunAcc => {
    let m = porCargo.get(cargo);
    if (!m) { m = new Map(); porCargo.set(cargo, m); }
    let x = m.get(cd);
    if (!x) { x = { cd, nome, secoes: new Set(), aptos: 0, comparecimento: 0, abstencoes: 0, brancos: 0, nulos: 0, candidatos: new Map() }; m.set(cd, x); }
    return x;
  };
  return {
    push(r: Row) {
      const cargo = limpo(r.DS_CARGO_PERGUNTA ?? "") as CargoBu;
      if (!CARGOS_BU.includes(cargo)) return;
      const cd = limpo(r.CD_MUNICIPIO ?? "");
      if (!cd) return;
      const x = mun(cargo, cd, limpo(r.NM_MUNICIPIO ?? ""));
      const data = limpo(r.DT_GERACAO ?? "");
      const hora = limpo(r.HH_GERACAO ?? "");
      if (data && `${data} ${hora}` > meta.geradoEm) meta.geradoEm = `${data} ${hora}`;
      const recebido = limpo(r.DT_BU_RECEBIDO ?? "");
      if (recebido > meta.recebidoAte) meta.recebidoAte = recebido;
      const secao = `${limpo(r.NR_ZONA ?? "")}-${limpo(r.NR_SECAO ?? "")}`;
      if (!x.secoes.has(secao)) {
        x.secoes.add(secao);
        x.aptos += parseNumber(r.QT_APTOS);
        x.comparecimento += parseNumber(r.QT_COMPARECIMENTO);
        x.abstencoes += parseNumber(r.QT_ABSTENCOES);
      }
      const votos = parseNumber(r.QT_VOTOS);
      const tipo = limpo(r.CD_TIPO_VOTAVEL ?? "");
      if (tipo === "1") {
        const nr = limpo(r.NR_VOTAVEL ?? "");
        if (!nr) return;
        const c = x.candidatos.get(nr) ?? { nr, nome: limpo(r.NM_VOTAVEL ?? ""), partido: limpo(r.SG_PARTIDO ?? ""), votos: 0 };
        c.votos += votos;
        x.candidatos.set(nr, c);
      } else if (tipo === "2") x.brancos += votos;
      else if (tipo === "3") x.nulos += votos;
    },
    resultado(ano: number, uf: string, turno: 1 | 2, fonteUrl: string): BuArquivo[] {
      const out: BuArquivo[] = [];
      const ordena = (a: BuCandidato, b: BuCandidato) => b.votos - a.votos || a.nome.localeCompare(b.nome, "pt-BR");
      for (const cargo of CARGOS_BU) {
        const mapa = porCargo.get(cargo);
        if (!mapa) continue;
        const municipios: BuMunicipio[] = [...mapa.values()]
          .map((x) => ({ cd: x.cd, nome: x.nome, secoes: x.secoes.size, aptos: x.aptos, comparecimento: x.comparecimento, abstencoes: x.abstencoes, brancos: x.brancos, nulos: x.nulos, candidatos: [...x.candidatos.values()].sort(ordena) }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        const total: BuTotal = { secoes: 0, aptos: 0, comparecimento: 0, abstencoes: 0, brancos: 0, nulos: 0, candidatos: [] };
        const cand = new Map<string, BuCandidato>();
        for (const m of municipios) {
          total.secoes += m.secoes;
          total.aptos += m.aptos;
          total.comparecimento += m.comparecimento;
          total.abstencoes += m.abstencoes;
          total.brancos += m.brancos;
          total.nulos += m.nulos;
          for (const c of m.candidatos) {
            const y = cand.get(c.nr) ?? { ...c, votos: 0 };
            y.votos += c.votos;
            cand.set(c.nr, y);
          }
        }
        total.candidatos = [...cand.values()].sort(ordena);
        out.push({
          ano, turno, uf, cargo,
          geradoEm: new Date().toISOString(),
          buGeradoEm: meta.geradoEm || null,
          recebidoAte: meta.recebidoAte || null,
          fonte: "TSE — Boletim de Urna (dados abertos)",
          fonteUrl,
          municipios,
          total,
        });
      }
      return out;
    },
  };
}
