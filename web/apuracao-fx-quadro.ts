// The two animated views are not drawn from this string: the tab redraws strings, which would throw away what has to slide. This is only their
// frame (buttons, a place to put them, the explanation); apuracao-mount.js fills `data-fx-host` with a DOM that updates in place. Nothing in this
// frame changes with the count, so a new file from the TSE never redraws it. The state of the buttons is set by the mount, for the same reason.
const FX_TEXTO: Record<"corrida" | "noite", string> = {
  corrida: `<li><b>O que é.</b> Os mais votados como uma corrida: as linhas trocam de lugar com uma mola, os votos rolam, a parcela é contada na tela e uma ultrapassagem deixa um rastro. Só aparecem os 8 primeiros.</li>
    <li><b>O que mostra.</b> Os números do TSE, a cada arquivo novo. Quem o TSE marca com situação (por exemplo "Eleito" ou "2º turno") ganha o texto dele, nunca um rótulo do Radar.</li>
    <li><b>A linha de cada um</b> começa quando você abriu a aba: o Radar não guarda os arquivos do TSE, então não há história anterior.</li>`,
  noite: `<li><b>O que é.</b> O mapa da apuração ao vivo. Um estado acende quando chega o primeiro arquivo dele e muda de cor quando quem está à frente muda. "Cartograma" dá o mesmo tamanho a todos os estados.</li>
    <li><b>O que a cor diz.</b> O partido de quem está à frente no estado (a mesma cor das outras visões) e, quanto mais forte, maior a diferença para o segundo. Não é projeção nem resultado final.</li>
    <li><b>Presidente:</b> a faixa de cima soma os arquivos dos estados e mostra os dois mais votados. <b>Governador:</b> cada estado tem a sua disputa, então a faixa conta em quantos estados cada partido está à frente.</li>`,
};
// With the tab's own simulation on (the "Simulação" switch above the views) the local one of these two views has no place.
export function fxQuadro(vista: "corrida" | "noite", simulado: boolean): string {
  return `<div class="fx-barra">
      <button type="button" class="ghost" data-fx-pref="fx">Efeitos</button>
      <button type="button" class="ghost" data-fx-pref="som">Som</button>
      ${simulado ? "" : `<button type="button" class="ghost" data-demo-toggle>Ver simulação</button>`}
    </div>
    <div class="fx-deck" data-fx-deck hidden></div>
    <div class="fx-host" data-fx-host="${vista}"></div>
    <details class="how" data-k="fx-como"><summary>Como ler esta visão</summary><ol class="muted small">${FX_TEXTO[vista]}
      <li><b>Efeitos e som.</b> Os botões acima valem para as duas visões e para o Ao vivo. Com "reduzir movimento" ligado no sistema as animações ficam desligadas. Nada pisca mais de três vezes por segundo.</li>
      <li><b>Ver simulação.</b> Toca uma noite inventada (candidaturas, partidos e números fictícios) para você ver o movimento antes de haver apuração. Nada ali é dado real.</li></ol></details>`;
}
