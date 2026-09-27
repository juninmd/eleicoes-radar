import { db } from "../db";
import { analisarFraudeCeap, type FraudeResultado } from "./fraude";
import { analisarFantasma, type FantasmaResultado } from "./fantasma";
import { analisarParentesco } from "./parentesco";
import { analisarEmendas, type EmendaResultado } from "./emendas";

interface Deputado {
  id: number;
  nome: string;
  partido: string;
  uf: string;
  urlFoto: string;
}

export interface RankingItem {
  id: number;
  nome: string;
  partido: string;
  urlFoto: string;
  gastoTotal: number;
  totalProposicoes: number;
  proposicoesAprovadas: number;
  totalDiscursos: number;
  fraudeScore: number;
  fraudeIndicios: string[];
  fantasmaIndex: number;
  totalEmpenhadoEmendas: number;
  top5FavorecidosEmendas: { nome: string; municipio: string; valor: number }[];
  emendaIndicios: string[];
  notaGeral: number; // 0-100, maior = melhor avaliado
}

function normalizar(valores: number[]): (v: number) => number {
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const range = max - min || 1;
  return (v: number) => (v - min) / range;
}

export function gerarRanking() {
  const deputados = db.query<Deputado, []>(`SELECT id, nome, partido, uf, urlFoto FROM deputados`).all();
  const fraudeMap = new Map<number, FraudeResultado>(
    analisarFraudeCeap().map((f) => [f.deputadoId, f])
  );
  const fantasmaMap = new Map<number, FantasmaResultado>(
    analisarFantasma().map((f) => [f.deputadoId, f])
  );
  const emendaMap = new Map<number, EmendaResultado>(
    analisarEmendas().map((e) => [e.deputadoId, e])
  );
  const discursosCount = new Map<number, number>(
    db
      .query<{ deputadoId: number; n: number }, []>(
        `SELECT deputadoId, COUNT(*) as n FROM discursos GROUP BY deputadoId`
      )
      .all()
      .map((r) => [r.deputadoId, r.n])
  );

  const atividades = deputados.map((d) => {
    const f = fantasmaMap.get(d.id);
    const disc = discursosCount.get(d.id) ?? 0;
    return (f?.totalProposicoes ?? 0) + disc;
  });
  const normAtividade = normalizar(atividades);
  const normFraude = normalizar(deputados.map((d) => fraudeMap.get(d.id)?.fraudeScore ?? 0));
  const normFantasma = normalizar(deputados.map((d) => fantasmaMap.get(d.id)?.fantasmaIndex ?? 0));

  const ranking: RankingItem[] = deputados.map((d) => {
    const fraude = fraudeMap.get(d.id);
    const fantasma = fantasmaMap.get(d.id);
    const emenda = emendaMap.get(d.id);
    const disc = discursosCount.get(d.id) ?? 0;
    const atividadeScore = normAtividade((fantasma?.totalProposicoes ?? 0) + disc);
    const fraudePenalty = normFraude(fraude?.fraudeScore ?? 0);
    const fantasmaPenalty = normFantasma(fantasma?.fantasmaIndex ?? 0);
    const emendaPenalty = emenda?.concentracaoMaiorFavorecido ?? 0; // já é 0-1

    // nota geral: 35% atividade real, -30% fraude na cota, -20% fantasma, -15% concentração de emenda
    const notaGeral = Math.round(
      (atividadeScore * 35 - fraudePenalty * 30 - fantasmaPenalty * 20 - emendaPenalty * 15 + 60) * 10
    ) / 10;

    return {
      id: d.id,
      nome: d.nome,
      partido: d.partido,
      urlFoto: d.urlFoto,
      gastoTotal: Math.round(fraude?.gastoTotal ?? 0),
      totalProposicoes: fantasma?.totalProposicoes ?? 0,
      proposicoesAprovadas: fantasma?.proposicoesAprovadas ?? 0,
      totalDiscursos: disc,
      fraudeScore: fraude?.fraudeScore ?? 0,
      fraudeIndicios: fraude?.indicios ?? [],
      fantasmaIndex: fantasma?.fantasmaIndex ?? 0,
      totalEmpenhadoEmendas: Math.round(emenda?.totalEmpenhado ?? 0),
      top5FavorecidosEmendas: emenda?.top5Favorecidos ?? [],
      emendaIndicios: emenda?.indicios ?? [],
      notaGeral: Math.max(0, Math.min(100, notaGeral)),
    };
  });

  ranking.sort((a, b) => b.notaGeral - a.notaGeral);
  const clas = analisarParentesco();

  return { ranking, clas, geradoEm: new Date().toISOString() };
}
