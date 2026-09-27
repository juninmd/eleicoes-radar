// Índice de "parlamentar fantasma": mede se a produção legislativa é
// substância (proposições que viram norma) ou placar de currículo (autoria
// em massa sem nada aprovado).
import { db } from "../db";

interface Row {
  deputadoId: number;
  total: number;
  aprovadas: number;
}

export interface FantasmaResultado {
  deputadoId: number;
  totalProposicoes: number;
  proposicoesAprovadas: number;
  taxaAprovacao: number; // 0-1
  fantasmaIndex: number; // 0-100, maior = mais "fantasma" (muita autoria, pouca aprovação)
}

export function analisarFantasma(): FantasmaResultado[] {
  const rows = db
    .query<Row, []>(
      `SELECT deputadoId, COUNT(*) as total, SUM(aprovada) as aprovadas
       FROM proposicoes GROUP BY deputadoId`
    )
    .all();

  return rows.map((r) => {
    const taxaAprovacao = r.total > 0 ? r.aprovadas / r.total : 0;
    // fantasmaIndex sobe com volume de autoria e desce com taxa de aprovação.
    // volume normalizado em log pra não deixar 1 deputado hiperativo dominar a escala.
    const volumeNormalizado = Math.min(Math.log10(r.total + 1) / Math.log10(200), 1);
    const fantasmaIndex = Math.round(volumeNormalizado * (1 - taxaAprovacao) * 100 * 10) / 10;
    return {
      deputadoId: r.deputadoId,
      totalProposicoes: r.total,
      proposicoesAprovadas: r.aprovadas,
      taxaAprovacao: Math.round(taxaAprovacao * 1000) / 1000,
      fantasmaIndex,
    };
  }).sort((a, b) => b.fantasmaIndex - a.fantasmaIndex);
}
