// Barra lateral do "Ao vivo": acontecimentos de todas as disputas que a tela acompanha (viradas, eleitos marcados pelo TSE e marcos de
// % apurado). Uma linha por mudança entre dois arquivos do mesmo arquivo-fonte; o primeiro arquivo visto só fixa a referência (exceto
// quem o TSE já marcou eleito). Só em memória. Nada aqui é conta do Radar: tudo vem do texto e da contagem publicados pelo TSE.
import { h, pct, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { eleitoTse } from "./apuracao-eleito.js";
import { EXTERIOR } from "./apuracao-uf.js";
import type { Apuracao, Cargo } from "./apuracao-tse.js";

export type TipoNoticia = "virada" | "eleito" | "marco";
export interface Noticia { tipo: TipoNoticia; hora: string; cargo: Cargo; uf: string; texto: string }
export interface Fonte { cargo: Cargo; uf: string; dados: Apuracao | null | undefined }
interface Visto { versao: string; lider: string; eleitos: Set<string>; marco: number }
export interface EstadoNoticias { itens: Noticia[]; vistos: Map<string, Visto> }

const MAX = 60;
const proporcional = (c: Cargo) => /^Deputado/.test(c);
export const vazio = (): EstadoNoticias => ({ itens: [], vistos: new Map() });

// A cada 10 pontos até 90%, depois a cada ponto: o fim da contagem é onde as linhas importam.
const marcoDe = (avanco: number): number => {
  const p = Math.floor(avanco * 100 + 1e-9);
  return p < 90 ? Math.floor(p / 10) * 10 : p;
};
export const ondeTxt = (cargo: Cargo, uf: string): string => `${cargo} ${uf === "BR" ? "Brasil" : uf === EXTERIOR ? "Exterior" : uf}`;
const nome = (c: { nome: string }) => `<b>${h(titleName(c.nome))}</b>`;

export function observar(est: EstadoNoticias, fontes: Fonte[]): EstadoNoticias {
  let itens = est.itens;
  const vistos = new Map(est.vistos);
  let processou = false;
  for (const { cargo, uf, dados: d } of fontes) {
    if (!d || d.fase === "aguardando" || !(d.secoes?.totalizadas > 0)) continue;
    const chave = `${cargo}|${uf}`;
    const versao = `${d.versao.data} ${d.versao.hora}`;
    const antes = vistos.get(chave);
    if (antes && versao.trim() && antes.versao === versao) continue;
    processou = true;
    const hora = d.versao.hora.slice(0, 5);
    const onde = h(ondeTxt(cargo, uf));
    const ordem = [...d.candidatos].sort((a, b) => b.votos - a.votos);
    const lider = ordem[0]?.votos > 0 ? ordem[0] : null;
    const eleitos = new Set(d.candidatos.filter(eleitoTse).map((c) => c.id));
    const marco = marcoDe(avancoDe(d.secoes));
    const novos: Noticia[] = [];
    for (const c of d.candidatos) if (eleitos.has(c.id) && !antes?.eleitos.has(c.id)) novos.push({ tipo: "eleito", hora, cargo, uf, texto: `${onde}: o TSE marcou ${nome(c)} (${h(c.partido)}) como "${h(c.situacao)}".` });
    if (antes) {
      if (!proporcional(cargo) && lider && antes.lider && lider.id !== antes.lider) {
        const velho = d.candidatos.find((c) => c.id === antes.lider);
        novos.push({ tipo: "virada", hora, cargo, uf, texto: `${onde}: ${nome(lider)} passa à frente${velho ? ` de ${nome(velho)}` : ""} com ${pct(lider.pct, 1)} (${pct(avancoDe(d.secoes), 1)} apurado).` });
      }
      if (marco > antes.marco) novos.push({ tipo: "marco", hora, cargo, uf, texto: `${onde}: ${marco}% das seções totalizadas${lider && !proporcional(cargo) ? `, ${nome(lider)} lidera com ${pct(lider.pct, 1)}` : ""}.` });
    }
    if (novos.length) itens = [...novos, ...itens];
    vistos.set(chave, { versao, lider: lider?.id ?? antes?.lider ?? "", eleitos: new Set([...(antes?.eleitos ?? []), ...eleitos]), marco: Math.max(marco, antes?.marco ?? 0) });
  }
  if (!processou) return est;
  return { itens: itens.slice(0, MAX), vistos };
}

const ROTULO: Record<TipoNoticia, string> = { virada: "Virada", eleito: "Eleito", marco: "Apuração" };

// Telefone: o painel começa recolhido (o leitor abre quando quer); a escolha dele sobrevive aos redesenhos (data-k).
const celular = () => typeof matchMedia === "function" && matchMedia("(max-width: 980px)").matches;

export function renderNoticias(itens: Noticia[]): string {
  const lista = itens.length
    ? `<ol>${itens.map((i) => `<li class="${i.tipo}"><time>${h(i.hora)}</time><span><em>${ROTULO[i.tipo]}</em> ${i.texto}</span></li>`).join("")}</ol>`
    : `<p class="muted small">Viradas, eleitos e marcos de apuração aparecem aqui assim que o TSE publicar um arquivo novo.</p>`;
  return `<aside class="live-feed" aria-label="Acontecimentos ao vivo"><details class="live-feed-d" data-k="live-feed"${celular() ? "" : " open"}>
    <summary>Acontecimentos <small>${itens.length ? `${itens.length} desde que você abriu` : "ao vivo"}</small></summary>
    ${lista}
    <p class="muted small">Todas as disputas acompanhadas, em hora do arquivo do TSE. Marcos a cada 10 pontos de seções (a cada ponto desde 90%). Nada fica guardado.</p></details></aside>`;
}
