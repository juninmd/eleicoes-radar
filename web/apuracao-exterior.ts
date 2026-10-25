// "Exterior" view (President only): the vote abroad, which the TSE publishes as one file of its own (ZZ), set against the country, and
// the final 1st round by city abroad from the municipal file the build already has. No file per city is fetched: the TSE has none live.
import { h, int, pct, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { EXTERIOR } from "./apuracao-uf.js";
import type { Apuracao, Turno } from "./apuracao-tse.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { MunArquivo } from "./apuracao-municipios.js";

export interface ExteriorProps {
  nac: BrasilSnapshot | null; br?: Apuracao | null; mun?: MunArquivo | null; // mun: undefined while loading, null when it failed
  cor: (chave: string) => string; turno: Turno; simulado?: boolean; compacto?: boolean;
}

const TOP = 6, CIDADES = 15;
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const secoesTxt = (s: Apuracao["secoes"]) => pct(avancoDe(s), 1);

function placar(z: Apuracao, br: Apuracao | null | undefined, cor: ExteriorProps["cor"]) {
  const noPais = new Map((br?.candidatos ?? []).map((c) => [c.id, c.pct]));
  return `<ul class="bancadas apu-votos">${z.candidatos.slice(0, TOP).map((c) => {
    const p = noPais.get(c.id);
    return `<li><span class="nome"><i class="key" style="background:${h(cor(c.partido))}"></i>${h(titleName(c.nome))} <small>${h(c.partido)}</small></span>
      <span class="bar"><span class="fill" style="width:${(c.pct * 100).toFixed(1)}%;background:${h(cor(c.partido))}"></span></span>
      <b>${pct(c.pct, 1)}</b><small>${int(c.votos)} votos${p !== undefined ? ` · no país ${pct(p, 1)}` : ""}</small></li>`;
  }).join("")}</ul>`;
}

function peso(z: Apuracao, nac: BrasilSnapshot | null, br: Apuracao | null | undefined) {
  const dados = Object.values(nac?.ufs ?? {}).flatMap((u) => (u.dados ? [u.dados] : []));
  const apto = dados.reduce((s, d) => s + d.eleitorado.apto, 0);
  const falta = Math.max(0, z.eleitorado.apto - z.eleitorado.apurado);
  const validosBr = br?.votos.validos ?? dados.reduce((s, d) => s + d.votos.validos, 0);
  return `<dl class="apu-chances">
    <div><dt>Seções totalizadas no exterior</dt><dd>${secoesTxt(z.secoes)}</dd></div>
    <div><dt>Eleitorado apto no exterior</dt><dd>${int(z.eleitorado.apto)}${apto > 0 ? ` <small>${pct(ratio(z.eleitorado.apto, apto), 1)} do país</small>` : ""}</dd></div>
    <div><dt>Comparecimento nas seções totalizadas</dt><dd>${pct(ratio(z.eleitorado.comparecimento, z.eleitorado.apurado), 1)}</dd></div>
    <div><dt>Votos válidos até agora</dt><dd>${int(z.votos.validos)}${validosBr > 0 ? ` <small>${pct(ratio(z.votos.validos, validosBr), 2)} dos válidos do país</small>` : ""}</dd></div>
  </dl>
  <p class="muted small">Eleitores das seções do exterior ainda não totalizadas: ${int(falta)} (inclui quem não vai votar). O comparecimento no exterior costuma ser bem menor que no Brasil.</p>`;
}

function cidades(arq: MunArquivo, turno: Turno) {
  const zz = arq.cidades.filter((c) => c[2] === EXTERIOR).map(([cod, nome, , a, b, o]) => ({ cod, nome, a, b, o, t: a + b + o })).sort((x, y) => y.t - x.t || x.nome.localeCompare(y.nome, "pt-BR"));
  if (!zz.length) return "";
  const [na, nb] = [arq.a, arq.b].map((f) => h(titleName(f.nome)));
  const linha = (c: (typeof zz)[number]) => `<tr><th scope="row">${h(titleName(c.nome))}</th><td class="num">${int(c.t)}</td><td class="num">${pct(ratio(c.a, c.t), 1)}</td><td class="num">${pct(ratio(c.b, c.t), 1)}</td><td class="num">${pct(ratio(c.o, c.t), 1)}</td></tr>`;
  const tabela = (rows: typeof zz, legenda: string) => `<div class="scroll"><table class="exp-bars"><caption class="sr">${legenda}</caption>
    <thead><tr><th scope="col">Cidade</th><th scope="col" class="num">Válidos</th><th scope="col" class="num">${na}</th><th scope="col" class="num">${nb}</th><th scope="col" class="num">Outros</th></tr></thead>
    <tbody>${rows.map(linha).join("")}</tbody></table></div>`;
  const total = zz.reduce((s, c) => s + c.t, 0);
  return `<h3>1º turno por cidade no exterior <small>resultado final</small></h3>
    <p class="muted small">${int(zz.length)} cidades, ${int(total)} votos válidos. Parcela de cada um dos ${turno === 2 ? "dois finalistas" : "dois mais votados no país"} e dos demais candidatos, do arquivo de votação por município do TSE. ${turno === 2 ? "No 2º turno o TSE só publica o exterior como um total, acima." : ""}</p>
    ${tabela(zz.slice(0, CIDADES), `As ${CIDADES} cidades do exterior com mais votos válidos no 1º turno`)}
    ${zz.length > CIDADES ? `<details class="how" data-k="ext-cidades"><summary>Todas as ${int(zz.length)} cidades</summary>${tabela(zz, "Todas as cidades do exterior, 1º turno")}</details>` : ""}`;
}

export function renderExterior({ nac, br, mun, cor, turno, simulado = false, compacto = false }: ExteriorProps): string {
  const zz = nac?.ufs[EXTERIOR];
  const vivo = !zz || zz.status === "carregando" ? `<p class="muted">Consultando o arquivo do exterior…</p>`
    : !zz.dados ? `<p class="empty">${zz.status === "ausente" ? "O TSE ainda não publicou o arquivo do exterior." : `Não foi possível consultar o arquivo do exterior agora${zz.erro ? `: ${h(zz.erro)}` : ""}.`}</p>`
    : zz.dados.fase === "aguardando" ? `<p class="empty">O TSE ainda não totalizou nenhuma seção do exterior.</p>`
    : `${zz.status !== "ok" ? `<p class="apu-aviso"><b>Números desatualizados:</b> o TSE não respondeu na última consulta; abaixo está o último arquivo recebido.</p>` : ""}
       <p class="exp-meta">Arquivo do exterior de ${h(zz.dados.versao.data)} ${h(zz.dados.versao.hora)} · ${secoesTxt(zz.dados.secoes)} das seções</p>
       ${placar(zz.dados, br, cor)}${compacto ? "" : peso(zz.dados, nac, br)}`;
  if (compacto) return vivo;
  const tabela = simulado ? `<p class="muted small">Na simulação o resultado por cidade fica de fora: ele traz as candidaturas reais.</p>`
    : mun === undefined ? `<p class="muted">Carregando o 1º turno por cidade…</p>` : mun ? cidades(mun, turno) : `<p class="muted small">Não foi possível carregar o 1º turno por cidade.</p>`;
  return `<h3>Votos do exterior</h3>
    <p class="muted small">Brasileiros que votam fora do país formam uma unidade à parte no TSE (código ZZ), com um arquivo próprio: ele entra na soma do país, mas não tem estado no mapa.</p>
    ${vivo}
    ${tabela}`;
}
