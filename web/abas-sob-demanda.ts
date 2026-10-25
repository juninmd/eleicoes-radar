// Heavy tabs download their module on first use. The module is imported once; a failed import (or mount) is forgotten, so the next open retries.
export interface Aba<T> {
  get(): T | null; // the mounted value, or null while the module is still downloading or was never asked for
  carregar(): Promise<T>;
  baixar(): void; // prefetch on hover or focus: download only, the mount waits for the first open
}

export function abaSobDemanda<M, T>(importar: () => Promise<M>, montar: (m: M) => T): Aba<T> {
  let pronta: T | null = null;
  let emCurso: Promise<T> | null = null;
  return {
    get: () => pronta,
    carregar: () => (emCurso ??= importar().then((m) => (pronta = montar(m))).catch((e) => { emCurso = null; throw e; })),
    baixar: () => { importar().catch(() => {}); }, // a failed prefetch is not shown; the open that needs it reports the error
  };
}

// Runs `usar` once the tab is ready. A hidden tab does nothing at all, so it neither downloads nor repaints. A failed download shows a reload: the browser caches the failed import, so an in-page retry cannot succeed.
export function quandoPronta<T>(a: Aba<T>, el: HTMLElement, visivel: () => boolean, usar: (x: T) => void): void {
  const pronta = a.get();
  if (pronta !== null) { usar(pronta); return; }
  a.carregar().then(
    (x) => { if (visivel()) usar(x); },
    () => {
      if (!visivel()) return;
      el.innerHTML = `<p class="empty" role="status">Não foi possível abrir esta aba. <button type="button">Recarregar a página</button></p>`;
      const botao = el.querySelector<HTMLButtonElement>("button");
      botao?.addEventListener("click", () => location.reload());
      botao?.focus(); // the reader lands on the only control, not on BODY
    },
  );
}
