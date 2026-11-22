// One request and one JSON.parse of mapa-uf.json per page: the live map and the social panel both ask for it on the same screen.
let uma: Promise<unknown> | null = null;

export function carregarMapaUf<T>(buscar: typeof fetch = fetch): Promise<T> {
  uma ??= buscar("mapa-uf.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch((e) => { uma = null; throw e; }); // a failure is not kept: the next visit tries again
  return uma as Promise<T>;
}
