// "Cidades" view of the runoff: the Radar's estimate of the valid votes of each finalist in every municipality. It says what the
// first round of this election and the 2002-2022 runoffs imply, how wrong that kind of estimate has been, and that it is not the
// count. It never says who will win; "à frente na estimativa" is the strongest thing it prints.
import { h, int, pct, titleName } from "./format.js";
import { NOMES } from "./apuracao-mapa.js";
import { alvoDe, analisar, pesquisaDoPar } from "./apuracao-municipios.js";
import type { Analise, Cenario, Confronto, Erros, Filtro, Finalista, MunArquivo, MunIndice } from "./apuracao-municipios.js";
import type { Cargo } from "./apuracao-tse.js";
import type { Cor } from "./apuracao-projecao-view.js";

export type Disputa = MunIndice["disputas"][number];
export interface MunProps {
  cargo: Cargo; uf: string;
  indice: MunIndice | null | undefined; // undefined: loading; null: it failed
  arquivo: MunArquivo | null | undefined;
  disputa: Disputa | null; // the race's entry in the index; null when it had no runoff
  cenario: Cenario; filtro: Filtro; limit: number;
  confrontos?: readonly Confronto[]; ultimaPesquisa?: string | null; // head-to-head poll averages of this race, when the polls have one for the pair
  oficial?: { a: number; b: number; secoes: number } | null; // the TSE's count so far (shares of valid votes, fraction of sections)
  cor: Cor;
}

const PAGE_MUN = 40;
export { PAGE_MUN };
const pp = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
const votosCurto = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} mi` : v >= 1000 ? `${int(Math.round(v / 1000))} mil` : int(Math.round(v)));
const nome = (f: Finalista) => h(titleName(f.nome));
// Column headers carry the party, not the long ballot name: the longest word of a header sets the width of a phone's column.
const cab = (f: Finalista) => `${h(f.partido)}<span class="sr"> (${nome(f)})</span>`;
const rotuloUf = (uf: string) => (uf === "ZZ" ? "Exterior" : h(uf));
const chaveErro = (cargo: string): "Presidente" | "Governador" => (cargo === "Presidente" ? "Presidente" : "Governador");

const aviso = `<p class="apu-aviso"><b>Estimativa do Radar, não é resultado.</b> É uma conta sobre os votos do 1º turno desta eleição, calibrada nos segundos turnos de 2002 a 2022. Ela não vê o 2º turno: o que vale é a apuração do TSE.</p>`;
const msg = (txt: string) => `<p class="empty">${txt}</p>`;

// The scenario: where the race-wide share of A comes from. The reader picks; the page never picks silently.
function cenarios(c: Cenario, pesquisa: number | null, neutro: number, alvo: number, quem: string, ultima?: string | null) {
  // "Meu cenário" starts from the total the page shows now (data-alvo), inside the slider's range, so switching to it does not jump.
  const inicio = Math.min(0.6, Math.max(0.4, Math.round(alvo * 200) / 200));
  const b = (modo: Cenario["modo"], rot: string, off = false) => `<button type="button" data-mun-modo="${modo}"${modo === "meu" ? ` data-alvo="${inicio}"` : ""} aria-pressed="${c.modo === modo}"${off ? " disabled" : ""}>${rot}</button>`;
  return `<div class="apu-vistas mun-cenarios" role="group" aria-label="Cenário do total da disputa">
      ${b("neutro", "Sem âncora")}${b("pesquisa", "Pesquisas", pesquisa === null)}${b("meu", "Meu cenário")}
    </div>
    <p class="muted small" id="mun-cen-txt">${c.modo === "neutro" ? `Sem âncora: os eleitores dos demais candidatos se dividem como os de cada cidade (nenhuma informação além do 1º turno desta eleição). Isso dá ${pp(neutro * 100)}% para ${quem} no total, e esse total é a parte menos segura da conta.`
      : c.modo === "pesquisa" ? `Âncora nas pesquisas de 2º turno: média de ${pp((pesquisa ?? 0) * 100)}% dos votos válidos para ${quem}${ultima ? ` (a última, de ${h(ultima.split("-").reverse().join("/"))})` : ""}. As cidades se ajustam para somar esse total.`
      : `Seu cenário: escolha abaixo o total de ${quem}. As cidades se ajustam para somar esse total.`}</p>
    ${c.modo === "meu" ? `<label class="mun-alvo"><span>Total de ${quem}</span>
      <input type="range" id="mun-alvo" min="40" max="60" step="0.5" value="${(Math.min(0.6, Math.max(0.4, alvo)) * 100).toFixed(1)}" aria-describedby="mun-cen-txt">
      <output id="mun-alvo-txt" for="mun-alvo">${pp(Math.min(0.6, Math.max(0.4, alvo)) * 100)}%</output></label>` : ""}`;
}

function totais(a: Analise, fa: Finalista, fb: Finalista, cor: Cor) {
  const ca = cor(fa.partido), cb = cor(fb.partido);
  return `<div class="mun-tot">
    <div class="apu-duelo-bar" role="img" aria-label="${h(`${titleName(fa.nome)} ${pp(a.shareA * 100)}% e ${titleName(fb.nome)} ${pp((1 - a.shareA) * 100)}% dos votos válidos, estimativa`)}">
      <span class="seg" style="width:${(a.shareA * 100).toFixed(2)}%;background:${h(ca)}"></span><span class="seg" style="width:${((1 - a.shareA) * 100).toFixed(2)}%;background:${h(cb)}"></span>
    </div>
    <ul class="mun-tot-leg">
      <li><i class="key" style="background:${h(ca)}"></i><b>${nome(fa)}</b> <small>${h(fa.partido)}</small><span>${pp(a.shareA * 100)}% · ${votosCurto(a.votosA)} votos</span></li>
      <li><i class="key" style="background:${h(cb)}"></i><b>${nome(fb)}</b> <small>${h(fb.partido)}</small><span>${pp((1 - a.shareA) * 100)}% · ${votosCurto(a.votosB)} votos</span></li>
    </ul>
  </div>`;
}

function tabelaUf(a: Analise, fa: Finalista, fb: Finalista, sel: string) {
  if (a.porUf.length < 2) return "";
  return `<details class="how" data-k="mun-ufs"><summary>Estimativa por estado</summary>
    <div class="scroll"><table class="exp-bars mun-ufs"><caption class="sr">Estimativa de votos válidos por estado; selecione um estado para ver as cidades dele</caption>
      <thead><tr><th scope="col">Estado</th><th scope="col" class="num">Votos válidos</th><th scope="col" class="num">${cab(fa)}</th><th scope="col" class="num">${cab(fb)}</th></tr></thead>
      <tbody>${a.porUf.map((u) => `<tr${u.uf === sel ? ' class="eleito"' : ""}><th scope="row"><button type="button" class="linkish" data-mun-uf="${h(u.uf)}" aria-pressed="${u.uf === sel}" title="${h((NOMES as Record<string, string>)[u.uf] ?? u.uf)}">${rotuloUf(u.uf)}</button></th>
        <td class="num">${votosCurto(u.votos)}</td><td class="num">${pp(u.shareA * 100)}%</td><td class="num">${pp((1 - u.shareA) * 100)}%</td></tr>`).join("")}</tbody></table></div></details>`;
}

function linhas(a: Analise, fa: Finalista, fb: Finalista, cor: Cor, limit: number, comUf: boolean) {
  const ca = cor(fa.partido), cb = cor(fb.partido);
  const corpo = a.cidades.slice(0, limit).map((c) => {
    const sa = pp(c.shareA * 100), sb = pp((1 - c.shareA) * 100), m = Number.isFinite(c.pm) ? ` <small>±${pp(c.pm)}</small>` : "";
    return `<tr><th scope="row">${h(titleName(c.nome))}${comUf ? ` <small>${rotuloUf(c.uf)}</small>` : ""}</th>
      <td class="num">${int(Math.round(c.votos))}</td>
      <td><div class="mun-bar" role="img" aria-label="${h(`${titleName(fa.nome)} ${sa}%, ${titleName(fb.nome)} ${sb}%`)}"><i style="width:${(c.shareA * 100).toFixed(1)}%;background:${h(ca)}"></i><i style="width:${((1 - c.shareA) * 100).toFixed(1)}%;background:${h(cb)}"></i></div></td>
      <td class="num"><b>${sa}%</b>${m}</td><td class="num"><b>${sb}%</b></td>
      <td class="num mun-1t">${pp(c.a1 * 100, 0)}% · ${pp(c.b1 * 100, 0)}%</td></tr>`;
  }).join("");
  return `<div class="scroll"><table class="exp-bars mun-cid"><caption class="sr">Estimativa de votos válidos de cada finalista por município, do maior para o menor eleitorado</caption>
    <thead><tr><th scope="col">Município</th><th scope="col" class="num">Votos válidos</th><th scope="col" aria-hidden="true"></th>
      <th scope="col" class="num">${cab(fa)} <small>%</small></th><th scope="col" class="num">${cab(fb)} <small>%</small></th><th scope="col" class="num mun-1t">1º turno</th></tr></thead>
    <tbody>${corpo}</tbody></table></div>
    ${a.total > limit ? `<button type="button" id="mun-mais" class="ghost">Mostrar mais</button>` : ""}`;
}

function metodo(e: Erros | undefined, cargo: string, fa: Finalista) {
  const quem = cargo === "Presidente" ? `nos ${e?.disputas ?? "–"} segundos turnos de Presidente` : `nos ${e?.disputas ?? "–"} segundos turnos de Governador`;
  const medida = e
    ? `<li><b>Quanto erra.</b> Refeita ${quem}, de ${e.anos[0]} a ${e.anos[e.anos.length - 1]}, deixando cada eleição de fora do ajuste e sabendo o total da disputa, a estimativa errou a % de uma cidade em cerca de <b>${pp(e.cidade)} p.p.</b> (desvio típico; ${pp(e.porTamanho[0]?.rmse ?? e.cidade)} p.p. nas cidades pequenas, ${pp(e.porTamanho[e.porTamanho.length - 1]?.rmse ?? e.cidade)} p.p. nas grandes), apontou o lado à frente em cidades que somam ${pp(e.acertoVencedor, 0)}% dos votos e acertou os votos válidos de uma cidade com erro médio de ${pp(e.erroVotos, 0)}%. Isso é média: uma cidade pode errar bem mais, e uma eleição diferente das passadas também.</li>
       <li><b>O total da disputa.</b> Sem informação além do 1º turno, o total do 1º colocado do 1º turno errou em média <b>${pp(e.nacionalSemAncora)} p.p.</b> (desvio de ${pp(e.nacionalSemAncoraRmse)} p.p.). Por isso a página deixa você ancorar o total numa pesquisa ou num cenário seu. Com o total certo, o erro de cada cidade é o do item anterior; com o total errado, as cidades erram juntas, no mesmo sentido.</li>` : "";
  return `<details class="how" data-k="mun-metodo"><summary>Como é feita a estimativa</summary><ol class="muted small">
    <li><b>Ponto de partida.</b> Em cada município, os votos válidos do 1º turno de ${nome(fa)}, do outro finalista e de todos os demais (arquivo de votação por zona do TSE, 2026).</li>
    <li><b>O que se carrega do passado.</b> Nos segundos turnos de 2002 a 2022, uma cidade manteve a maior parte da inclinação que tinha entre os dois finalistas no 1º turno, e menos dela quanto mais eleitores tinham votado em outros candidatos. Esses dois números (e a razão entre votos válidos do 2º e do 1º turno) vêm de uma regressão feita só com o cargo desta disputa. Nenhum partido é classificado como esquerda ou direita, e a história própria de cada cidade não entrou: foi testada (partido por partido, nas disputas em que ele já tinha estado no 2º turno) e não melhorou a estimativa.</li>
    <li><b>O total da disputa não vem do passado.</b> É o cenário que você escolhe acima. A conta encontra o único ajuste uniforme que faz as cidades somarem esse total.</li>
    ${medida}
    <li><b>O que isto não é.</b> Não é pesquisa, não vê abstenção nem migração entre as eleições, e trata o município inteiro como um bloco. Cidade que mudou de candidato local, de aliança ou de tamanho desde o 1º turno foge da conta.</li>
  </ol></details>`;
}

export function renderMunicipios(p: MunProps): string {
  const { cargo, indice, arquivo, disputa, cenario, filtro, limit, cor } = p;
  if (indice === undefined) return `${aviso}${msg("Carregando a estimativa por município…")}`;
  if (!indice) return `${aviso}${msg("Não foi possível carregar a estimativa por município. Ela é gerada com <code>bun run radar:municipal</code> a partir do 1º turno por município do TSE.")}`;
  if (!disputa) return `${aviso}${msg(`${cargo === "Presidente" ? "O Presidente" : "Esta disputa"} não tem estimativa por município: ou não houve 2º turno aqui, ou só havia um município (como no Distrito Federal).`)}`;
  if (arquivo === undefined) return `${aviso}${msg("Carregando os municípios…")}`;
  if (!arquivo) return `${aviso}${msg("Não foi possível carregar os votos do 1º turno por município desta disputa.")}`;

  const params = indice.params[chaveErro(cargo)], erros = indice.erros[chaveErro(cargo)];
  const fa = arquivo.a, fb = arquivo.b;
  const pesquisa = pesquisaDoPar(p.confrontos, fa.sq, fb.sq);
  // A poll scenario that has no poll falls back to "sem âncora" instead of inventing a number.
  const efetivo: Cenario = cenario.modo === "pesquisa" && pesquisa === null ? { ...cenario, modo: "neutro" } : cenario.modo === "pesquisa" ? { modo: "pesquisa", alvo: pesquisa! } : cenario;
  const a = analisar(arquivo, params, efetivo, filtro, erros);
  const neutro = efetivo.modo === "neutro" ? a.shareA : analisar(arquivo, params, { modo: "neutro", alvo: 0.5 }, { uf: "", busca: "" }, erros).shareA;
  const alvo = alvoDe(efetivo) ?? neutro;
  const ufs = a.porUf.map((u) => u.uf);
  const comUf = cargo === "Presidente";

  const oficial = p.oficial
    ? `<p class="muted small">Apuração do TSE neste momento (${pp(p.oficial.secoes * 100)}% das seções): ${nome(fa)} ${pp(p.oficial.a * 100)}% · ${nome(fb)} ${pp(p.oficial.b * 100)}%. A estimativa acima não usa esses números.</p>` : "";
  const filtros = `<div class="mun-filtros">
      ${comUf ? `<label>Estado <select id="mun-uf"><option value="">Todos</option>${[...ufs].sort().map((u) => `<option value="${h(u)}"${u === filtro.uf ? " selected" : ""}>${u === "ZZ" ? "Exterior" : h(u)}</option>`).join("")}</select></label>` : ""}
      <label>Buscar município <input type="search" id="mun-busca" value="${h(filtro.busca)}" placeholder="nome da cidade" autocomplete="off"></label>
    </div>`;
  return `${aviso}
    <p class="exp-lead">Se o 2º turno repetir o padrão dos anteriores, a estimativa do Radar para os votos válidos é de <b>${pp(a.shareA * 100)}%</b> para <b>${nome(fa)}</b> e <b>${pp((1 - a.shareA) * 100)}%</b> para <b>${nome(fb)}</b>, em cerca de <b>${votosCurto(a.votos)}</b> votos válidos. ${nome(fa)} aparece à frente na estimativa em <b>${int(a.aFrente)}</b> municípios e ${nome(fb)} em <b>${int(a.bFrente)}</b>.</p>
    ${a.limitado ? `<p class="apu-aviso">O total pedido está fora do que o modelo consegue produzir; a conta ficou no limite mais próximo.</p>` : ""}
    ${totais(a, fa, fb, cor)}
    ${cenarios(efetivo.modo === cenario.modo ? cenario : { ...cenario, modo: efetivo.modo }, pesquisa, neutro, alvo, nome(fa), p.ultimaPesquisa)}
    ${oficial}
    ${tabelaUf(a, fa, fb, filtro.uf)}
    <h3>Municípios <small>${int(a.total)}${a.total === 1 ? " município" : " municípios"}${filtro.uf || filtro.busca ? " no filtro" : ""}</small></h3>
    ${filtros}
    ${a.total ? linhas(a, fa, fb, cor, limit, comUf) : msg("Nenhum município com esse filtro.")}
    <p class="muted small">Cada % tem a margem típica do tamanho da cidade (±, em pontos percentuais). A coluna "1º turno" mostra a % de votos válidos que cada finalista teve lá no 1º turno.</p>
    ${metodo(erros, cargo, fa)}`;
}

