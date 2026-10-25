// Who is watching and whom they cheer for, in memory only: an anonymous random id the browser makes up, the state the reader chose,
// no IP and nothing on disk. A restart forgets everything, which is the privacy promise as much as a limit.
export const UFS: ReadonlySet<string> = new Set("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" "));
export const ID_VALIDO = /^[A-Za-z0-9_-]{16,48}$/;

export interface Opcao { id: string; nome: string; partido: string }
export interface Torcida { corrida: string; total: number; opcoes: (Opcao & { votos: number })[] }
export interface Resumo { online: number; porUf: Record<string, number>; semUf: number; torcida: Torcida | null }
export type ResultadoVoto = "ok" | "invalida" | "lotada";

export interface PresencaOpts { ttlMs?: number; maxOnline?: number; maxVotos?: number; agora?: () => number }

export function criarPresenca({ ttlMs = 75_000, maxOnline = 50_000, maxVotos = 200_000, agora = Date.now }: PresencaOpts = {}) {
  const vistos = new Map<string, { uf: string; t: number }>();
  const votos = new Map<string, string>(); // visitor id -> option id; one cheer per browser, changeable
  const contagem = new Map<string, number>();
  let corrida = "";
  let opcoes: Opcao[] = [];
  let cache: { t: number; resumo: Resumo } | null = null;

  const mexe = (id: string, d: number) => contagem.set(id, Math.max(0, (contagem.get(id) ?? 0) + d));
  const podar = () => { const lim = agora() - ttlMs; for (const [id, v] of vistos) if (v.t < lim) vistos.delete(id); };

  return {
    // Registers a heartbeat. An unknown state counts as "not informed": the server never guesses a place.
    ping(id: string, uf: string): boolean {
      if (!ID_VALIDO.test(id)) return false;
      if (!vistos.has(id) && vistos.size >= maxOnline) return false;
      vistos.set(id, { uf: UFS.has(uf) ? uf : "", t: agora() });
      cache = null;
      return true;
    },
    // The race and its candidates come from the TSE file the monitor reads; the client can only pick among them.
    definirOpcoes(nova: string, lista: Opcao[]) {
      corrida = nova;
      opcoes = lista.slice(0, 15);
      cache = null;
    },
    votar(id: string, opcao: string): ResultadoVoto {
      if (!ID_VALIDO.test(id) || !opcoes.some((o) => o.id === opcao)) return "invalida";
      const antes = votos.get(id);
      if (antes === undefined && votos.size >= maxVotos) return "lotada";
      if (antes === opcao) return "ok";
      if (antes !== undefined) mexe(antes, -1);
      votos.set(id, opcao);
      mexe(opcao, 1);
      cache = null;
      return "ok";
    },
    meuVoto: (id: string): string | null => {
      const v = votos.get(id);
      return v !== undefined && opcoes.some((o) => o.id === v) ? v : null;
    },
    resumo(): Resumo {
      // Recomputed at most every 3 s: a thousand open tabs ask in the same minute and share one answer.
      if (cache && agora() - cache.t < 3000) return cache.resumo;
      podar();
      const porUf: Record<string, number> = {};
      let semUf = 0;
      for (const v of vistos.values()) { if (v.uf) porUf[v.uf] = (porUf[v.uf] ?? 0) + 1; else semUf++; }
      const lista = opcoes.map((o) => ({ ...o, votos: contagem.get(o.id) ?? 0 }));
      const torcida = opcoes.length ? { corrida, total: lista.reduce((s, o) => s + o.votos, 0), opcoes: lista } : null;
      const resumo = { online: vistos.size, porUf, semUf, torcida };
      cache = { t: agora(), resumo };
      return resumo;
    },
  };
}
export type Presenca = ReturnType<typeof criarPresenca>;
