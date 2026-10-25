// Loads each UF's supplier sidecar (<UF>-forn.json) once, off the critical path, and merges it into the candidates.
import type { Candidatura } from "./types.js";

export type Fornecedores = NonNullable<Candidatura["fornecedores"]>;
export type FornEstado = "carregando" | "erro" | "pronto";
type Mapa = Record<string, Fornecedores>;

export function createFornecedores(get: (url: string) => Promise<Response> = (url) => fetch(url)) {
  const prontos = new Map<string, Mapa>();
  const falhas = new Set<string>();
  const pendentes = new Map<string, Promise<Mapa>>();

  // A failure is not retried by itself: a dossier that asks again would loop. Only tentar() retries.
  function carregar(uf: string): Promise<Mapa> {
    const pronto = prontos.get(uf);
    if (pronto) return Promise.resolve(pronto);
    const pend = pendentes.get(uf);
    if (pend) return pend;
    if (falhas.has(uf)) return Promise.reject(new Error(`fornecedores de ${uf} indisponíveis`));
    const p = get(`data/uf/${uf}-forn.json`)
      .then(async (r) => {
        if (r.status === 404) return {}; // build antigo: a UF não tem sidecar, então nenhum fornecedor fora do JSON da UF
        if (!r.ok) throw new Error(`${r.status} fornecedores de ${uf}`);
        return (await r.json()) as Mapa;
      })
      .then((m) => { prontos.set(uf, m); return m; }, (e) => { falhas.add(uf); throw e; })
      .finally(() => pendentes.delete(uf));
    pendentes.set(uf, p);
    return p;
  }

  function tentar(uf: string): Promise<Mapa> {
    falhas.delete(uf);
    return carregar(uf);
  }

  function estado(uf: string): FornEstado {
    if (prontos.has(uf)) return "pronto";
    return falhas.has(uf) ? "erro" : "carregando";
  }

  // Fills only the candidates that still lack the field: data from before the split already has it and is used as is.
  function aplicar(cands: Candidatura[], uf: string): void {
    const mapa = prontos.get(uf);
    if (!mapa) return;
    for (const c of cands) if (c.uf === uf && c.fornecedores === undefined) c.fornecedores = Object.hasOwn(mapa, c.id) ? mapa[c.id]! : null;
  }

  return { carregar, tentar, estado, aplicar };
}

// Only UFs with a candidate still missing the field need the sidecar; old-format data never does.
export const ufsPendentes = (cands: Candidatura[], ufs: string[]) => ufs.filter((uf) => cands.some((c) => c.uf === uf && c.fornecedores === undefined));
