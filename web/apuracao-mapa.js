// Brazil map of the live count, one shape per state. Pure functions returning SVG/HTML strings.
// Every colour has a text twin (aria-label, tooltip, legend, the state table), and the map never
// paints "good" or "bad": a state that disagrees with the polls is hatched, not coloured differently.
import { h, int, pct, titleName } from "./format.js";
import { contraPesquisa, rotulosComp } from "./apuracao-nacional.js";

export const NOMES = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba",
  PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima",
  RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins", ZZ: "Exterior",
};

// Colour-blind-safe categorical palette (Okabe-Ito and a few darker companions). Colours are arbitrary:
// they are handed out in order, never tied to a party's identity.
export const PALETA = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#882255", "#44AA99", "#332288", "#AA4499", "#999933"];
// Parties past the palette share this grey, so no two of them look alike by accident.
export const RESTO = "#8a948b";
const NEUTRO = { fill: "#d5d9d3", css: "var(--sunk)", cls: "sd" };
const AZUL = "#0072B2";
export const MIN_ROTULO = 650; // projected square units; DF, SE and AL are smaller and get a chip instead

export const MODOS = [
  { id: "lider", rotulo: "Quem lidera" },
  { id: "margem", rotulo: "Margem" },
  { id: "avanco", rotulo: "Apuração" },
  { id: "pesquisa", rotulo: "Contra a pesquisa" },
];

// Polls are national for president, so the poll mode exists only for the offices with a poll leader per state.
export function modosDe(cargo, corridas) {
  const temPesquisa = cargo !== "Presidente" && (corridas ?? []).some((x) => x.cargo === cargo && x.lideres?.length);
  return MODOS.filter((m) => m.id !== "pesquisa" || temPesquisa);
}

const clamp = (x) => Math.max(0, Math.min(1, x));
const mix = (cor, p) => `color-mix(in srgb, ${cor} ${Math.round(p * 100)}%, var(--surface))`;
export const corridaDe = (corridas, cargo, uf) => (corridas ?? []).find((x) => x.cargo === cargo && x.uf === uf);

// Main parties get the first colours: handed out by number of states led, then by name.
function distribuir(linhas, cor) {
  const n = new Map();
  for (const l of linhas) if (l.lider) n.set(l.lider.partido, (n.get(l.lider.partido) ?? 0) + 1);
  for (const [p] of [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) cor(p);
}

export function pintar(l, modo, cor, comp) {
  if (modo === "lider") return l.lider ? { fill: cor(l.lider.partido), css: mix(cor(l.lider.partido), 0.35 + 0.65 * clamp((l.lider.pct - 0.25) / 0.5)) } : NEUTRO;
  if (modo === "margem") return l.margem === null ? NEUTRO : { fill: AZUL, css: mix(AZUL, 0.2 + 0.8 * clamp(l.margem / 0.3)) };
  if (modo === "avanco") return l.avanco === null ? NEUTRO : { fill: AZUL, css: mix(AZUL, 0.15 + 0.85 * l.avanco) };
  if (comp?.situacao === "diverge") return { fill: "url(#apu-hachura)", css: "url(#apu-hachura)" };
  return comp?.situacao === "igual" ? { fill: AZUL, css: mix(AZUL, 0.8) } : NEUTRO;
}

// What a state's colour says, in words. Used for aria-label and the hover tip.
export function descreve(l, comp) {
  const nome = NOMES[l.uf] ?? l.uf;
  if (l.status === "erro" && !l.dados) return `${nome}: não foi possível consultar o TSE agora`;
  if (!l.dados) return `${nome}: ${l.status === "ausente" ? "o TSE ainda não publicou o arquivo" : "consultando o TSE"}`;
  if (l.fase === "aguardando") return `${nome}: apuração ainda não começou`;
  const velha = l.defasada ? "; atenção: o TSE não respondeu na última consulta, estes são os números anteriores" : "";
  if (!l.lider) return `${nome}: sem votos válidos no arquivo do TSE por enquanto${velha}`;
  const base = `${nome}: ${titleName(l.lider.nome)} lidera com ${pct(l.lider.pct, 1)} dos votos válidos; ${pct(l.avanco, 1)} das seções totalizadas${velha}`;
  if (!comp?.pesquisa) return base;
  const r = rotulosComp(comp.n);
  const quem = (comp.lista ?? [comp.pesquisa]).map((p) => `${titleName(p.nome)} (${pct(p.media, 1)})`).join(", ");
  return `${base}; ${comp.situacao === "igual" ? `${r.igual} das pesquisas${r.onde}, ${quem}` : `${r.dif} das pesquisas${r.onde}; a pesquisa aponta ${quem}`}`;
}

export function mapaSvg({ mapa, linhas, modo, cor, sel, corridas, cargo }) {
  const porUf = new Map(linhas.map((l) => [l.uf, l]));
  distribuir(linhas, cor);
  const vazia = (uf) => ({ uf, status: "carregando", dados: null, lider: null, margem: null, avanco: null, fase: null });
  const formas = Object.keys(mapa.ufs).map((uf) => {
    const l = porUf.get(uf) ?? vazia(uf);
    const comp = modo === "pesquisa" ? contraPesquisa(l, corridaDe(corridas, cargo, uf)) : null;
    const { fill, css } = pintar(l, modo, cor, comp);
    const txt = h(descreve(l, comp));
    return `<path data-uf="${uf}" d="${mapa.ufs[uf].d}" fill="${fill}" style="fill:${css}" class="uf${uf === sel ? " sel" : ""}${l.fase === "concluida" ? " feito" : ""}" role="button" tabindex="0" aria-pressed="${uf === sel}" aria-label="${txt}"><title>${txt}</title></path>`;
  });
  // The outline of the selection is its own shape on top: moving the state itself would move it in the tab order.
  const anel = mapa.ufs[sel] ? `<path class="uf-anel" d="${mapa.ufs[sel].d}" fill="none" aria-hidden="true" pointer-events="none"/>` : "";
  const rotulos = Object.entries(mapa.ufs).filter(([, s]) => s.a >= MIN_ROTULO).map(([uf, s]) => `<text x="${s.c[0]}" y="${s.c[1]}" class="uf-rot" aria-hidden="true">${uf}</text>`);
  return `<svg class="apu-mapa" viewBox="${mapa.viewBox.join(" ")}" role="group" aria-label="Mapa do Brasil por estado">
    <defs><pattern id="apu-hachura" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--sunk)"/><rect width="3" height="7" fill="${AZUL}"/></pattern></defs>
    ${formas.join("")}${anel}${rotulos.join("")}</svg>`;
}

const chave = (cls, txt, extra = "") => `<li><i class="key ${cls}" ${extra}></i>${txt}</li>`;
const gradiente = (de, ate) => `<div class="apu-grad"><span>${h(de)}</span><i aria-hidden="true"></i><span>${h(ate)}</span></div>`;

export function legenda({ modo, linhas, cor, cargo }) {
  if (modo === "lider") {
    const n = new Map();
    for (const l of linhas) if (l.lider) n.set(l.lider.partido, (n.get(l.lider.partido) ?? 0) + 1);
    const itens = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p, k]) => chave("", `<span>${h(p)}</span> <b>${int(k)}</b>`, `style="background:${cor(p)}"`));
    const demais = cor.resto !== undefined && [...n.keys()].some((p) => cor(p) === cor.resto);
    return `<ul class="apu-legenda" aria-label="Legenda do mapa">${itens.join("")}${chave("sd", "Sem apuração")}</ul><p class="muted small">Cor: partido do líder em cada estado. Tom mais forte: maior parcela dos votos válidos para o líder.${demais ? " Cinza escuro: demais partidos, que passam das cores disponíveis." : ""}</p>`;
  }
  if (modo === "margem") {
    const ultima = linhas.some((l) => l.vagas > 1) || cargo === "Senador";
    return `${gradiente("0 p.p.", "30 p.p. ou mais")}<p class="muted small">${ultima ? "Margem na última vaga: diferença entre o último candidato que ocuparia uma vaga e o primeiro que ficaria de fora." : "Margem do líder: diferença para o segundo colocado, em pontos percentuais dos votos válidos."} Cinza: sem apuração.</p>`;
  }
  if (modo === "avanco") return `${gradiente("0%", "100%")}<p class="muted small">Parcela das seções do estado já totalizadas pelo TSE. Estados com contorno forte já terminaram. Cinza: sem apuração.</p>`;
  const varias = linhas.some((l) => l.vagas > 1);
  const [igual, dif] = varias ? ["Mesmos nomes das pesquisas nos primeiros lugares", "Nomes diferentes dos das pesquisas nos primeiros lugares"] : ["Mesmo líder das pesquisas", "Líder diferente do das pesquisas"];
  return `<ul class="apu-legenda" aria-label="Legenda do mapa">${chave("igual", igual)}${chave("dif", dif)}${chave("sd", "Sem pesquisa ou sem apuração")}</ul><p class="muted small">${varias ? "Com mais de uma vaga, compara-se quem ocupa as primeiras vagas, em qualquer ordem. " : ""}A diferença não significa erro de nenhum dos lados: com a apuração parcial, pode ser só quais urnas já chegaram.</p>`;
}
