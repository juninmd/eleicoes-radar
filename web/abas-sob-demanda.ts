// Heavy tabs download their module on first use. The module is imported once; a failed import (or mount) is forgotten, so the next open retries.
export interface Aba<T> {
  get(): T | null; // the mounted value, or null while the module is still downloading or was never asked for
  carregar(): Promise<T>;
}

export function abaSobDemanda<M, T>(importar: () => Promise<M>, montar: (m: M) => T): Aba<T> {
  let pronta: T | null = null;
  let emCurso: Promise<T> | null = null;
  return {
    get: () => pronta,
    carregar: () => (emCurso ??= importar().then((m) => (pronta = montar(m))).catch((e) => { emCurso = null; throw e; })),
  };
}

// Runs `usar` once the tab is ready. A callback that arrives after the user left the tab does nothing; a failed download shows a retry in the tab's view.
export function quandoPronta<T>(a: Aba<T>, el: HTMLElement, visivel: () => boolean, usar: (x: T) => void, tentar: () => void): void {
  const pronta = a.get();
  if (pronta !== null) { usar(pronta); return; }
  a.carregar().then(
    (x) => { if (visivel()) usar(x); },
    () => {
      if (!visivel()) return;
      el.innerHTML = `<p class="empty">Não foi possível abrir esta aba. <button type="button">Tentar de novo</button></p>`;
      el.querySelector("button")!.addEventListener("click", tentar);
    },
  );
}
