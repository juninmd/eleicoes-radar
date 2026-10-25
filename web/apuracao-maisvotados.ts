// "Mais votados" for Deputado Federal: the candidates with the most votes in the country, summed over
// the state files the Câmara view already reads. Only what the TSE publishes; nothing is projected.
import type { LinhaUf } from "./apuracao-nacional.js";
import { UFS } from "./apuracao-uf.js";

export const LIMITE_INICIAL = 10;
export const LIMITE_MAXIMO = 30;

export interface Votado { id: string; nome: string; partido: string; uf: string; votos: number; pct: number; situacao: string; destaque: boolean }

// Every candidate with votes so far, most votes first. Ties go to the name (Portuguese order), then to the id,
// so two reads of the same files always give the same order.
export function maisVotados(linhas: LinhaUf[], limite: number): Votado[] {
  const todos: Votado[] = [];
  for (const l of linhas) {
    if (!l.dados) continue;
    for (const c of l.dados.candidatos) {
      if (c.votos > 0) todos.push({ id: c.id, nome: c.nome, partido: c.partido, uf: l.uf, votos: c.votos, pct: c.pct, situacao: c.situacao, destaque: c.destaque });
    }
  }
  todos.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
  return todos.slice(0, Math.max(0, limite));
}

export interface Resumo { lidos: number; desatualizados: number; de: number; definitivo: boolean }

// How many state files answered, and whether the ranking can be called final: every state of the country answered,
// none is showing an earlier read, and every count is closed. Until then the view says the ranking is partial.
export function resumoArquivos(linhas: LinhaUf[], de: number = UFS.length): Resumo {
  const lidos = linhas.filter((l) => l.dados).length;
  const desatualizados = linhas.filter((l) => l.dados && l.defasada).length;
  const concluidos = linhas.filter((l) => l.dados?.fase === "concluida").length;
  return { lidos, desatualizados, de, definitivo: lidos === de && desatualizados === 0 && concluidos === de };
}
