// What the Projeção view keeps between redraws: the drift measured so far and the last analysis. The simulation is not
// cheap enough to run on every paint (the national feed paints once per state), so it runs only when a file changed.
import { analise, medir, parteDe } from "./apuracao-projecao.js";
import type { Analise, Memoria, Parte } from "./apuracao-projecao.js";
import type { Apuracao } from "./apuracao-tse.js";

export type Fonte = [id: string, dados: Apuracao | null, defasada?: boolean];
export type Nomes = Record<string, { nome: string; partido: string }>;
export interface Leitura { analise: Analise | null; partes: Parte[]; nomes: Nomes; defasadas: string[] }

const comNumeros = (d: Apuracao | null) => d && d.fase !== "aguardando" && d.eleitorado?.apurado > 0 && d.votos?.validos > 0;

export function createProjecao(): { reiniciar(): void; ler(fontes: Fonte[]): Leitura } {
  let mem: Memoria | null = null;
  let assinatura: string | null = null;
  let ultimo: Leitura | null = null;

  return {
    reiniciar() { mem = null; assinatura = null; ultimo = null; },
    // fontes: [[id, dados|null, defasada?]], one per file of the race (a state file for the president, the single file of a
    // governor). defasada: the feed kept these numbers after the TSE failed to answer; they are used, and named on the screen.
    ler(fontes) {
      const ativas = fontes.filter(([, d]) => comNumeros(d));
      const partes = ativas.map(([id, d]) => parteDe(id, d!));
      const defasadas = ativas.filter(([, , velha]) => velha).map(([id]) => id);
      const chave = `${partes.map((p) => `${p.id}:${p.versao}:${p.validos}`).join("|")}#${defasadas.join(",")}`;
      if (ultimo && chave === assinatura) return ultimo;
      mem = medir(mem, partes);
      // A file older than the one held (the TSE sometimes answers with one) never goes into the numbers.
      const atuais = partes.map((p) => mem?.ultimo?.[p.id] ?? p);
      const nomes: Nomes = {};
      for (const [, d] of ativas) for (const c of d!.candidatos) nomes[c.id] ??= { nome: c.nome, partido: c.partido };
      assinatura = chave;
      ultimo = { analise: analise(atuais, mem), partes: atuais, nomes, defasadas };
      return ultimo;
    },
  };
}
