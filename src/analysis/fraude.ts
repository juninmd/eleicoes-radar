// Forense da cota parlamentar (CEAP): heurísticas de anomalia, não prova de fraude.
// Cada sinal é um indício; o score é a soma normalizada dos indícios por deputado.
import { db } from "../db";

interface Despesa {
  deputadoId: number;
  fornecedor: string;
  cnpjCpf: string;
  dataEmissao: string;
  valorLiquido: number;
  numDocumento: string;
  urlDocumento: string;
}

export interface FraudeResultado {
  deputadoId: number;
  gastoTotal: number;
  concentracaoMaiorFornecedor: number; // 0-1, % do gasto no fornecedor mais usado
  maiorFornecedorNome: string;
  notasValorIdenticoRepetido: number; // possível fracionamento
  notasFimDeSemana: number;
  fornecedoresExclusivos: number; // fornecedores usados só por este deputado
  indicios: string[];
  fraudeScore: number; // 0-100, maior = mais indícios
}

export function analisarFraudeCeap(): FraudeResultado[] {
  const todas = db
    .query<Despesa, []>(
      `SELECT deputadoId, fornecedor, cnpjCpf, dataEmissao, valorLiquido, numDocumento, urlDocumento
       FROM despesas WHERE valorLiquido > 0`
    )
    .all();

  const porDeputado = new Map<number, Despesa[]>();
  for (const d of todas) {
    if (!porDeputado.has(d.deputadoId)) porDeputado.set(d.deputadoId, []);
    porDeputado.get(d.deputadoId)!.push(d);
  }

  // fornecedor -> conjunto de deputados que usaram (pra achar "fornecedor exclusivo")
  const fornecedorDeputados = new Map<string, Set<number>>();
  for (const d of todas) {
    if (!d.cnpjCpf) continue;
    if (!fornecedorDeputados.has(d.cnpjCpf)) fornecedorDeputados.set(d.cnpjCpf, new Set());
    fornecedorDeputados.get(d.cnpjCpf)!.add(d.deputadoId);
  }

  const resultados: FraudeResultado[] = [];

  for (const [deputadoId, notas] of porDeputado) {
    const gastoTotal = notas.reduce((s, n) => s + n.valorLiquido, 0);
    const indicios: string[] = [];

    // 1. concentração no maior fornecedor
    const porFornecedor = new Map<string, number>();
    for (const n of notas) {
      const key = n.cnpjCpf || n.fornecedor;
      porFornecedor.set(key, (porFornecedor.get(key) ?? 0) + n.valorLiquido);
    }
    let maiorFornecedorValor = 0;
    let maiorFornecedorKey = "";
    for (const [k, v] of porFornecedor) {
      if (v > maiorFornecedorValor) {
        maiorFornecedorValor = v;
        maiorFornecedorKey = k;
      }
    }
    const concentracao = gastoTotal > 0 ? maiorFornecedorValor / gastoTotal : 0;
    const maiorFornecedorNome =
      notas.find((n) => (n.cnpjCpf || n.fornecedor) === maiorFornecedorKey)?.fornecedor ?? "";
    if (concentracao > 0.4) {
      indicios.push(
        `${(concentracao * 100).toFixed(0)}% do gasto concentrado em 1 fornecedor (${maiorFornecedorNome})`
      );
    }

    // 2. valores idênticos repetidos com mesmo fornecedor (possível fracionamento/padrão artificial)
    const valorFornecedorCount = new Map<string, number>();
    for (const n of notas) {
      const key = `${n.cnpjCpf}|${n.valorLiquido.toFixed(2)}`;
      valorFornecedorCount.set(key, (valorFornecedorCount.get(key) ?? 0) + 1);
    }
    let notasValorIdenticoRepetido = 0;
    for (const [, count] of valorFornecedorCount) {
      if (count >= 4) notasValorIdenticoRepetido += count;
    }
    if (notasValorIdenticoRepetido > 0) {
      indicios.push(
        `${notasValorIdenticoRepetido} notas com valor idêntico repetido (mesmo fornecedor, ≥4x)`
      );
    }

    // 3. notas emitidas em fim de semana
    let notasFimDeSemana = 0;
    for (const n of notas) {
      const dt = new Date(n.dataEmissao);
      if (!isNaN(dt.getTime())) {
        const dia = dt.getDay();
        if (dia === 0 || dia === 6) notasFimDeSemana++;
      }
    }
    const pctFimDeSemana = notas.length > 0 ? notasFimDeSemana / notas.length : 0;
    if (pctFimDeSemana > 0.25 && notasFimDeSemana >= 5) {
      indicios.push(
        `${notasFimDeSemana} notas (${(pctFimDeSemana * 100).toFixed(0)}%) emitidas em fim de semana`
      );
    }

    // 4. fornecedores usados só por este deputado (dentro da base coletada)
    let fornecedoresExclusivos = 0;
    const jaContados = new Set<string>();
    for (const n of notas) {
      if (!n.cnpjCpf || jaContados.has(n.cnpjCpf)) continue;
      jaContados.add(n.cnpjCpf);
      const usuarios = fornecedorDeputados.get(n.cnpjCpf);
      if (usuarios && usuarios.size === 1) fornecedoresExclusivos++;
    }

    // score composto simples 0-100 (heurístico, não calibrado estatisticamente)
    const fraudeScore = Math.min(
      100,
      concentracao * 40 +
        Math.min(notasValorIdenticoRepetido, 20) * 1.5 +
        Math.min(pctFimDeSemana * 100, 30) * 0.5
    );

    resultados.push({
      deputadoId,
      gastoTotal,
      concentracaoMaiorFornecedor: concentracao,
      maiorFornecedorNome,
      notasValorIdenticoRepetido,
      notasFimDeSemana,
      fornecedoresExclusivos,
      indicios,
      fraudeScore: Math.round(fraudeScore * 10) / 10,
    });
  }

  return resultados.sort((a, b) => b.fraudeScore - a.fraudeScore);
}
