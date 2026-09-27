// Weighted score where a missing indicator counts as the median (0.5): without it,
// someone judged on 2 of 6 indicators could outrank a full, verifiable record.
// "cobertura" reports how much of the chosen weight had evidence behind it.
export const INDICATORS = [
  { key: "impostos", grupo: "Agenda", nome: "Redução de impostos", fonte: "Votos", desc: "Parcela dos votos a favor de menos impostos nas votações escolhidas (ex.: offshores, IOF). Veja a lista no dossiê." },
  { key: "liberdadeEconomica", grupo: "Agenda", nome: "Liberdade econômica", fonte: "Votos", desc: "Parcela dos votos a favor de concorrência, contratação flexível e direito de propriedade nas votações escolhidas." },
  { key: "expressao", grupo: "Agenda", nome: "Liberdade de expressão", fonte: "Votos", desc: "Voto contra a regulação de conteúdo em plataformas (urgência do PL 2630). Uma votação só: evidência limitada." },
  { key: "economia", grupo: "Mandato", nome: "Economia na cota", fonte: "Câmara", desc: "Gasto médio mensal da cota parlamentar nos meses em exercício, comparado com deputados do mesmo estado." },
  { key: "presenca", grupo: "Mandato", nome: "Presença em votações", fonte: "Câmara", desc: "Votações nominais do plenário em que votou, contando só os períodos em exercício do mandato." },
  { key: "producao", grupo: "Mandato", nome: "Projetos aprovados", fonte: "Câmara", desc: "PL, PLP e PEC de autoria principal (2023–2026) aprovados na Câmara ou transformados em lei." },
  { key: "independencia", grupo: "Mandato", nome: "Voto independente", fonte: "Câmara", desc: "Quantas vezes votou diferente da orientação do próprio partido." },
  { key: "renovacao", grupo: "Perfil", nome: "Renovação", fonte: "Câmara/Senado", desc: "Estreante no cargo = 100; ex-suplente = 67; tem mandato e disputa outro cargo = 33; tenta reeleição = 0. Governador, presidente e deputado estadual sem mandato federal ficam sem dado (não verificável)." },
  { key: "experiencia", grupo: "Perfil", nome: "Experiência", fonte: "Câmara/Senado", desc: "O inverso de Renovação: tenta reeleição = 100; estreante = 0. Use um ou outro, conforme a sua preferência." },
  { key: "apoio", grupo: "Campanha", nome: "Base de doadores", fonte: "TSE", desc: "Quantas pessoas físicas doaram, comparado com os concorrentes da mesma disputa." },
  { key: "diversificacao", grupo: "Campanha", nome: "Dinheiro diversificado", fonte: "TSE", desc: "Quanto a campanha depende de uma única fonte. Menos dependência, nota maior." },
];

const zero = Object.fromEntries(INDICATORS.map((i) => [i.key, 0]));
export const PRESETS = {
  agenda: { nome: "Economia e liberdade", w: { ...zero, impostos: 3, liberdadeEconomica: 3, expressao: 2, economia: 2, presenca: 1 } },
  equilibrio: { nome: "Equilíbrio", w: { ...zero, presenca: 2, producao: 2, economia: 1, apoio: 1, diversificacao: 1 } },
  mandato: { nome: "Trabalho no mandato", w: { ...zero, presenca: 3, producao: 3, economia: 2 } },
  campanha: { nome: "Campanha", w: { ...zero, apoio: 3, diversificacao: 3 } },
};
export const DEFAULT_PRESET = "agenda";

export function score(ind, weights) {
  let total = 0, covered = 0, acc = 0;
  for (const { key } of INDICATORS) {
    const w = weights[key] ?? 0;
    const has = typeof ind[key] === "number";
    total += w;
    if (has) covered += w;
    acc += w * (has ? ind[key] : 0.5);
  }
  return { nota: total ? Math.round((acc / total) * 100) : null, cobertura: total ? covered / total : 0 };
}
