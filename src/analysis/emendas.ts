// Rastro de emenda parlamentar: quanto o deputado destinou de verba pública
// e se ficou concentrado em poucos favorecidos (mesmo tipo de heurística de
// concentração usada na cota CEAP).
import { db } from "../db";

interface EmendaRow {
  deputadoId: number;
  valorEmpenhado: number;
  valorPago: number;
}
interface FavorecidoRow {
  deputadoId: number;
  favorecido: string;
  cnpjCpf: string;
  tipoFavorecido: string;
  municipio: string;
  valorRecebido: number;
}

export interface EmendaResultado {
  deputadoId: number;
  totalEmpenhado: number;
  totalPago: number;
  numFavorecidos: number;
  concentracaoMaiorFavorecido: number; // 0-1
  maiorFavorecido: string;
  top5Favorecidos: { nome: string; municipio: string; valor: number }[];
  indicios: string[];
}

export function analisarEmendas(): EmendaResultado[] {
  const emendas = db
    .query<EmendaRow, []>(`SELECT deputadoId, valorEmpenhado, valorPago FROM emendas`)
    .all();
  const favorecidos = db
    .query<FavorecidoRow, []>(
      `SELECT deputadoId, favorecido, cnpjCpf, tipoFavorecido, municipio, valorRecebido FROM emendas_favorecidos`
    )
    .all();

  const totaisPorDep = new Map<number, { empenhado: number; pago: number }>();
  for (const e of emendas) {
    const acc = totaisPorDep.get(e.deputadoId) ?? { empenhado: 0, pago: 0 };
    acc.empenhado += e.valorEmpenhado;
    acc.pago += e.valorPago;
    totaisPorDep.set(e.deputadoId, acc);
  }

  const favPorDep = new Map<number, FavorecidoRow[]>();
  for (const f of favorecidos) {
    if (!favPorDep.has(f.deputadoId)) favPorDep.set(f.deputadoId, []);
    favPorDep.get(f.deputadoId)!.push(f);
  }

  const resultados: EmendaResultado[] = [];
  for (const [deputadoId, totais] of totaisPorDep) {
    const favs = favPorDep.get(deputadoId) ?? [];
    const porFavorecido = new Map<string, { nome: string; municipio: string; valor: number }>();
    for (const f of favs) {
      const key = f.cnpjCpf || f.favorecido;
      const acc = porFavorecido.get(key) ?? { nome: f.favorecido, municipio: f.municipio, valor: 0 };
      acc.valor += f.valorRecebido;
      porFavorecido.set(key, acc);
    }
    const ordenados = [...porFavorecido.values()].sort((a, b) => b.valor - a.valor);
    const totalFav = ordenados.reduce((s, f) => s + f.valor, 0);
    const maior = ordenados[0];
    const concentracao = totalFav > 0 && maior ? maior.valor / totalFav : 0;

    const indicios: string[] = [];
    if (concentracao > 0.5 && ordenados.length > 1) {
      indicios.push(
        `${(concentracao * 100).toFixed(0)}% da verba de emenda concentrada em 1 favorecido (${maior.nome})`
      );
    }

    resultados.push({
      deputadoId,
      totalEmpenhado: totais.empenhado,
      totalPago: totais.pago,
      numFavorecidos: porFavorecido.size,
      concentracaoMaiorFavorecido: concentracao,
      maiorFavorecido: maior?.nome ?? "",
      top5Favorecidos: ordenados.slice(0, 5),
      indicios,
    });
  }
  return resultados;
}
