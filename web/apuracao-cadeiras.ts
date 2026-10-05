// Who holds a seat today in a proportional race, list by list. The TSE decides how many seats each list has (the
// quotient rules are its job); inside a list the seats go to the most voted. That is a reading of the count, not a result:
// until the TSE marks "Eleito" it only says where the numbers stand, and how close the last seat of each list is.
import type { Apuracao, Candidato } from "./apuracao-tse.js";

const FORA = 2; // first candidates left out that the view shows per list

export type DadosCadeiras = Pick<Apuracao, "secoes" | "partidos" | "candidatos">;
export interface Lista { nome: string; vagas: number; dentro: Candidato[]; fora: Candidato[]; margem: number | null; aindaPode: number; apertada: boolean }
export interface Cadeiras { listas: Lista[]; apertadas: Lista[]; total: number }

const porVotos = (a: Candidato, b: Candidato) => b.votos - a.votos;

export function cadeiras(d: DadosCadeiras | null | undefined): Cadeiras {
  const vazio: Cadeiras = { listas: [], apertadas: [], total: 0 };
  if (!d || !(d.secoes?.totalizadas > 0) || !(d.secoes.total > 0)) return vazio;
  const avanco = Math.min(1, d.secoes.totalizadas / d.secoes.total);
  const porLista = new Map<string, Candidato[]>();
  for (const x of d.candidatos) if (x.lista) (porLista.get(x.lista) ?? porLista.set(x.lista, []).get(x.lista)!).push(x);

  const listas = d.partidos
    .filter((p) => p.vagas > 0 && porLista.has(p.nome))
    .map((p): Lista => {
      const ordem = [...porLista.get(p.nome)!].sort(porVotos);
      const dentro = ordem.slice(0, p.vagas);
      const fora = ordem.slice(p.vagas, p.vagas + FORA);
      const ultimo = dentro.at(-1)!;
      const margem = dentro.length === p.vagas && fora[0] ? ultimo.votos - fora[0].votos : null;
      // What the last one in can still receive if the sections to come look like the ones already in.
      const aindaPode = avanco > 0 && avanco < 1 ? (ultimo.votos * (1 - avanco)) / avanco : 0;
      return { nome: p.nome, vagas: p.vagas, dentro, fora, margem, aindaPode, apertada: margem !== null && margem < aindaPode };
    })
    .sort((a, b) => b.vagas - a.vagas || a.nome.localeCompare(b.nome, "pt-BR"));

  return { listas, apertadas: listas.filter((l) => l.apertada), total: listas.reduce((s, l) => s + l.dentro.length, 0) };
}
