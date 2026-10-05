// "Perfil" tab: who the candidates are (self-declared to the TSE) and, for deputies, how that
// compares with the seats the model expects. Shown only for races big enough, and a category with
// only a handful of people is folded away, so no row points at one or two of them.
import { h, int, pct } from "./format.js";
import { hbars } from "./charts.js";
import type { CargoAgg, Perfil } from "../src/radar/panorama";

type Counts = Record<string, number>;
interface Facet { key: Exclude<keyof Perfil, "esperado">; titulo: string; ordem: string[] }

// Same values as src/radar/panorama.ts; a test keeps them in step. The aggregator already folds small
// categories into OUTRAS; hiding them here too keeps an older export from showing them.
export const MIN_PERFIL = 30;
export const MIN_CELL = 5;
export const OUTRAS = "Outras categorias";

// Same labels the aggregator writes (src/radar/panorama.ts); a test keeps them in step.
export const FACETS: Facet[] = [
  { key: "genero", titulo: "Gênero", ordem: ["Feminino", "Masculino", "Não informado"] },
  { key: "cor", titulo: "Cor ou raça", ordem: ["Branca", "Parda", "Preta", "Amarela", "Indígena", "Não informado"] },
  { key: "instrucao", titulo: "Escolaridade", ordem: ["Fundamental ou menos", "Ensino médio", "Superior incompleto", "Superior completo", "Não informado"] },
  { key: "idade", titulo: "Idade no dia da eleição", ordem: ["18–24", "25–34", "35–44", "45–54", "55–64", "65 ou mais", "Não informado"] },
];

const total = (o: Counts) => Object.values(o).reduce((a, b) => a + b, 0);

function facet(f: Facet, perfil: Perfil) {
  const cont = perfil[f.key];
  const exp = perfil.esperado?.[f.key];
  const n = total(cont), ne = exp ? total(exp) : 0;
  const present = [...f.ordem, ...Object.keys(cont).filter((k) => !f.ordem.includes(k))].filter((k) => (cont[k] ?? 0) > 0);
  const keys = present.filter((k) => cont[k] >= MIN_CELL);
  const folded = cont[OUTRAS]
    ? `<p class="muted small">Categorias com menos de ${MIN_CELL} candidaturas foram reunidas em “${OUTRAS}”, que sempre soma ${MIN_CELL} ou mais.</p>`
    : keys.length < present.length ? `<p class="muted small">Categorias com menos de ${MIN_CELL} candidaturas não aparecem separadas.</p>` : "";
  return `<h3>${h(f.titulo)}</h3>${folded}${hbars(keys.map((k) => {
    const s = cont[k] / n;
    const e = ne > 0 ? (exp![k] ?? 0) / ne : null;
    return { label: k, sub: `${int(cont[k])} ${cont[k] === 1 ? "candidatura" : "candidaturas"}`, value: s, marker: e ?? undefined, text: e === null ? pct(s) : `${pct(s)} · ${pct(e)}` };
  }), { max: 1 })}`;
}

export function perfilView({ data, cargo, label, br }: { data: CargoAgg; cargo: string; label: string; br: boolean }) {
  if (!data.perfil) {
    return `<p class="empty">São só ${int(data.n)} candidaturas a ${h(cargo)} em ${h(label)}: pouco para agrupar por perfil: com tão poucas pessoas, cada uma muda sozinha as proporções. ${br ? "" : "Veja o escopo Brasil."}</p>`;
  }
  const exp = !!data.perfil.esperado;
  return `
    <p class="exp-lead">Perfil das <b>${int(data.n)}</b> candidaturas a ${h(cargo)} em ${h(label)}, como cada pessoa declarou ao TSE.</p>
    <ul class="legenda" aria-label="Como ler">
      <li><i class="k"></i><span><b>Barra e primeiro número:</b> parcela das candidaturas em cada grupo.</span></li>
      ${exp ? `<li><i class="k mean"></i><span><b>Traço e segundo número:</b> parcela das vagas esperadas pelo modelo, somando a chance de cada candidatura.</span></li>` : ""}
    </ul>
    ${FACETS.map((f) => facet(f, data.perfil!)).join("")}
    ${exp ? `<p class="exp-read">O traço é o perfil esperado dos eleitos segundo o modelo (soma das chances de cada candidatura do grupo): uma estimativa, não um resultado. O modelo olha arrecadação, força da lista, ocupação declarada, o número da urna e o resultado da eleição anterior (da pessoa e dos partidos da lista): ele não usa gênero, cor ou raça, idade nem escolaridade. Quando barra e traço diferem, é porque esses grupos se distribuem de forma diferente em arrecadação e listas.</p>` : ""}
    <p class="muted small">Autodeclaração ao TSE. O perfil só aparece para disputas com ${int(MIN_PERFIL)} candidaturas ou mais, e categorias com menos de ${MIN_CELL} candidaturas são reunidas em “${OUTRAS}”.</p>`;
}
