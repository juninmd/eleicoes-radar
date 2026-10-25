// Who is watching and whom they cheer for, in memory only: an anonymous random id the browser makes up, the state the reader chose,
// no IP. Presence lives in memory only; the cheering poll is kept by the armazem as a salted hash of the code, never the code itself.
import { armazemMemoria, type Armazem } from "./armazem.js";
export const UFS: ReadonlySet<string> = new Set("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" "));
export const ID_VALIDO = /^[A-Za-z0-9_-]{16,48}$/;

export interface Opcao { id: string; nome: string; partido: string }
export interface Torcida { corrida: string; total: number; opcoes: (Opcao & { votos: number })[] }
export interface Resumo { online: number; porUf: Record<string, number>; semUf: number; torcida: Torcida | null }
export type ResultadoVoto = "ok" | "invalida" | "lotada" | "sem-presenca";

export interface PresencaOpts { ttlMs?: number; maxOnline?: number; maxVotos?: number; agora?: () => number; armazem?: Armazem }

export function criarPresenca({ ttlMs = 75_000, maxOnline = 50_000, maxVotos = 200_000, agora = Date.now, armazem = armazemMemoria() }: PresencaOpts = {}) {
  const vistos = new Map<string, { uf: string; t: number }>();
  const votos = new Map<string, string>(); // hash of the visitor code -> option id; one cheer per browser, changeable
  const contagem = new Map<string, number>();
  let corrida = "";
  let opcoes: Opcao[] = [];
  let cache: { t: number; online: number; porUf: Record<string, number>; semUf: number } | null = null;

  const mexe = (id: string, d: number) => contagem.set(id, Math.max(0, (contagem.get(id) ?? 0) + d));
  const presente = (id: string) => { const v = vistos.get(id); return !!v && agora() - v.t < ttlMs; };

  return {
    // Registers a heartbeat. An unknown state counts as "not informed": the server never guesses a place.
    ping(id: string, uf: string): boolean {
      if (!ID_VALIDO.test(id)) return false;
      if (!vistos.has(id) && vistos.size >= maxOnline) return false;
      vistos.set(id, { uf: UFS.has(uf) ? uf : "", t: agora() });
      return true; // the shared summary below is at most a few seconds old on purpose: a ping must not make it walk every visitor again
    },
    // The race and its candidates come from the TSE file the monitor reads; the client can only pick among them.
    definirOpcoes(nova: string, lista: Opcao[]) {
      if (nova !== corrida) {
        // A new race (or the first read after a restart): the poll is whatever the store holds for it.
        corrida = nova;
        votos.clear();
        contagem.clear();
        for (const [h, o] of armazem.votosDe(nova)) { votos.set(h, o); mexe(o, 1); }
      }
      opcoes = lista.slice(0, 15);
    },
    // Only someone who is online right now can cheer: a script that invents ids has to ping first and pays the same limits.
    votar(id: string, opcao: string): ResultadoVoto {
      if (!ID_VALIDO.test(id) || !opcoes.some((o) => o.id === opcao)) return "invalida";
      if (!presente(id)) return "sem-presenca";
      const h = armazem.hash(id);
      const antes = votos.get(h);
      if (antes === undefined && votos.size >= maxVotos) return "lotada";
      if (antes === opcao) return "ok";
      if (antes !== undefined) mexe(antes, -1);
      votos.set(h, opcao);
      mexe(opcao, 1);
      armazem.gravarVoto(corrida, h, opcao);
      return "ok";
    },
    meuVoto: (id: string): string | null => {
      const v = votos.get(armazem.hash(id));
      return v !== undefined && opcoes.some((o) => o.id === v) ? v : null;
    },
    resumo(): Resumo {
      // The walk over every visitor runs at most every 3 s; the cheering poll (at most 15 options) is always read fresh.
      if (!cache || agora() - cache.t >= 3000) {
        const lim = agora() - ttlMs;
        const porUf: Record<string, number> = {};
        let semUf = 0;
        for (const [id, v] of vistos) {
          if (v.t < lim) { vistos.delete(id); continue; }
          if (v.uf) porUf[v.uf] = (porUf[v.uf] ?? 0) + 1; else semUf++;
        }
        cache = { t: agora(), online: vistos.size, porUf, semUf };
      }
      const lista = opcoes.map((o) => ({ ...o, votos: contagem.get(o.id) ?? 0 }));
      const torcida = opcoes.length ? { corrida, total: lista.reduce((s, o) => s + o.votos, 0), opcoes: lista } : null;
      return { online: cache.online, porUf: cache.porUf, semUf: cache.semUf, torcida };
    },
  };
}
export type Presenca = ReturnType<typeof criarPresenca>;
