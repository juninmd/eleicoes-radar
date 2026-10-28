// HTML of the Auditoria tab, one function per section. Pure: data in, string out. A signal is always worded as
// "para conferir" with the fact beside it; nothing here calls an election, a person or a company fraudulent.
import { h, int } from "./format.js";
import {
  CENARIOS, COLUNAS_PODER, dec, maiorCurtose, media, nomeSinalGov, paraConferir, pc, posicaoNoLocal, reducoes, sinaisGov, sinal, statusDe, TESTES, totais,
} from "./auditoria-dados.js";
import { balde, barrasH, coeficientes, colunas, halteres, heat2d, histograma, mapaPontos, obsEsp, ultimoDigito } from "./auditoria-graficos.js";
import type { Coef, ObsEsp } from "./auditoria-graficos.js";
import type { Auditoria, Eleicao, Governador, Impressao, PontoMunicipio } from "./auditoria-tipos.js";

export const SECOES: [string, string][] = [
  ["resumo", "Resumo"], ["eleicao", "Por eleição"], ["investiga", "Investigações"], ["populacao", "Eleitorado × população"],
  ["governos", "Governadores"], ["poder", "Poder dos testes"], ["metodo", "Método e limites"],
];

const rot = (e: Eleicao) => e.rotulo.replace(" · ", " ");
const chips = (itens: [string, string][], atual: string, attr: string) =>
  `<div class="pan-seg" role="group">${itens.map(([k, nome]) => `<button type="button" data-${attr}="${h(k)}" aria-pressed="${k === atual}">${h(nome)}</button>`).join("")}</div>`;
const sec = (titulo: string, sub: string, corpo: string) => `<section class="au-sec"><h3 class="au-h">${h(titulo)}</h3>${sub ? `<p class="muted au-sub">${sub}</p>` : ""}${corpo}</section>`;
const card = (titulo: string, corpo: string) => `<div class="au-card"><h4>${h(titulo)}</h4>${corpo}</div>`;
const nota = (corpo: string, cls = "") => `<div class="au-nota ${cls}">${corpo}</div>`;
const kv = (linhas: [string, string][]) => `<dl class="au-kv">${linhas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>`;
const pill = (s: number) => `<span class="au-pill st${s}">${h(statusDe(s))}</span>`;

interface Col<T> { h: string; num?: boolean; f: (r: T) => string }
function tabela<T>(legenda: string, cols: Col<T>[], rows: T[]): string {
  return `<div class="scroll"><table class="au-table"><caption class="sr">${h(legenda)}</caption><thead><tr>${cols.map((c) => `<th scope="col"${c.num ? ' class="num"' : ""}>${h(c.h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${cols.map((c) => `<td${c.num ? ' class="num"' : ""}>${c.f(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export const aguardando = (qual: string) => `<p class="empty" role="status">Carregando ${h(qual)}…</p>`;
export const semDados = () =>
  `<p class="empty">Os dados da auditoria ainda não foram gerados. Rode a análise em <code>docs/forense</code> e depois <code>bun run radar:auditoria</code>; o arquivo sai em <code>web/data/auditoria/</code>.</p>`;

// ------------------------------------------------------------------ Resumo
export function resumoView(a: Auditoria): string {
  const E = a.eleicoes, t = totais(E), caso = a.aritmetica_caso[0], sub = a.subdispersao.find((r) => r.id === "2026-1" && r.rank === 1);
  const matriz = `<div class="scroll"><div class="au-matrix" role="table" aria-label="Resultado de cada teste em cada turno">
    <div class="au-mrow" role="row"><span role="columnheader"></span>${E.map((e) => `<span class="au-mhead" role="columnheader">${e.ano}<small>${e.turno}º</small></span>`).join("")}</div>
    ${TESTES.map((te) => `<div class="au-mrow" role="row"><span class="au-mname" role="rowheader">${h(te.nome)}<small>${h(te.peq)}</small></span>${E.map((e) => {
      const s = e[te.k];
      return `<button type="button" role="cell" class="au-cell st${s}" data-aud-go="${h(e.id)}" aria-label="${h(te.nome)}, ${h(e.rotulo)}: ${statusDe(s)}">${["✓", "!", "·"][s] ?? "·"}</button>`;
    }).join("")}</div>`).join("")}</div></div>`;
  const explica = (teste: string, e: Eleicao): string => {
    if (teste === "s_arit" && caso) return `${h(e.rotulo)}: ${int(e.comp_gt_aptos)} seção com mais comparecimentos que eleitores aptos (${int(caso.comp)} para ${int(caso.aptos)}; ${h(caso.mun)}-${h(caso.uf)}, zona ${caso.zona}, seção ${caso.secao}). No 1º turno a mesma seção teve ${int(caso.comp_turno1)} votantes. Diferença de ${int(Math.abs(caso.a_votos - caso.b_votos))} votos na seção; efeito nulo sobre a margem nacional.`;
    if (teste === "s_zero") return `${h(e.rotulo)}: ${int(e.zero_obs)} seções com 100+ votantes e nenhum branco ou nulo, contra cerca de ${int(Math.round(e.zero_esp))} esperadas pelo padrão do local.`;
    if (teste === "s_disp" && sub) return `${h(e.rotulo)}: um local (${h(sub.mun)}-${h(sub.uf)}, zona ${sub.zona}) com ${int(sub.k)} seções de resultado praticamente igual entre si.`;
    return `${h(e.rotulo)}.`;
  };
  const conferir = paraConferir(E);
  const pontos = (chave: "disp_low001" | "zero_obs" | "dup_obs" | "dig_mad", esp: "disp_low001_esp" | "zero_esp" | "dup_sim" | "dig_mad_sim", flag: "s_disp" | "s_zero" | "s_dup" | "s_dig", so1 = false): ObsEsp[] =>
    E.filter((e) => !so1 || e.turno === 1).map((e) => ({ rotulo: rot(e), obs: e[chave], esp: e[esp], flag: e[flag] === 1 }));
  return `<p class="au-lede">Cruzamos <b>${int(t.secoes)}</b> boletins de seção em <b>${int(t.turnos)}</b> turnos de Presidente (2002 a 2026) com 8 testes de inconsistência. <b>${int(t.semSinal)}</b> de <b>${int(t.testes)}</b> verificações não acusaram sinal; <b>${int(t.paraConferir)}</b> ficaram "para conferir" e estão listadas abaixo. Fora esses pontos, os testes de manipulação (números fabricados, cópias de boletim, enchimento de urna) ficaram dentro do que a própria aleatoriedade das urnas produz.</p>
    <div class="au-legend"><span>${pill(0)}</span><span>${pill(1)}</span><span>${pill(2)}</span><span class="muted">toque numa célula para abrir a eleição</span></div>
    ${matriz}
    ${sec("O que ficou para conferir", "Cada item é um fato verificável, com o aviso de que inconsistência estatística não é irregularidade por si.",
      `<div class="au-grid">${conferir.map((c) => nota(`<b>${h(c.teste.nome)}</b><span>${explica(c.teste.k, c.e)}</span>`)).join("")}</div>`)}
    ${sec("Observado × esperado", "Cada ponto é um turno. O traço cinza é o que a aleatoriedade do voto produz (simulação ou conta exata); o ponto é o que os dados mostram. Fabricação de boletins empurraria o primeiro painel para a direita.",
      `<div class="au-grid w2">
        ${card("Locais com resultado uniforme demais", `<p class="muted small">Locais de votação (3+ seções) cuja dispersão cai abaixo de 0,1% do esperado. Abaixo do traço, em todos os turnos.</p>${obsEsp(pontos("disp_low001", "disp_low001_esp", "s_disp"), { fmt: (v) => dec(v, 1), label: "Locais uniformes demais, observado e esperado por turno" })}`)}
        ${card("Seções sem brancos nem nulos", `<p class="muted small">Seções com 100+ votantes. Âmbar: turnos marcados "para conferir".</p>${obsEsp(pontos("zero_obs", "zero_esp", "s_zero"), { fmt: (v) => int(Math.round(v)), label: "Seções sem brancos nem nulos, observado e esperado por turno" })}`)}
        ${card("Boletins idênticos (1º turno)", `<p class="muted small">Seções cujo vetor completo de votos repete o de outra. A referência é uma simulação com as fatias do local.</p>${obsEsp(pontos("dup_obs", "dup_sim", "s_dup", true), { fmt: (v) => int(Math.round(v)), label: "Boletins idênticos, observado e simulado por eleição" })}`)}
        ${card("Último dígito dos votos", `<p class="muted small">Desvio médio absoluto dos dígitos 0 a 9 frente aos 10% ideais; o traço é o desvio de uma simulação honesta.</p>${obsEsp(pontos("dig_mad", "dig_mad_sim", "s_dig"), { fmt: (v) => `${dec(v * 100, 4)} p.p.`, axis: (v) => dec(v * 100, 2), label: "Desvio do último dígito, observado e simulado por turno" })}`)}
      </div>`)}
    ${nota(`<b>Como ler</b><span>Sem sinal não prova que a eleição foi íntegra, e um sinal não prova fraude. Os testes procuram padrões que a aleatoriedade de milhares de urnas raramente produz. Em "Poder dos testes" está o que eles enxergam e o que deixam passar.</span>`, "info")}`;
}

// ------------------------------------------------------------------ Por eleição
export function eleicaoView(a: Auditoria, imp: Impressao | null, id: string): string {
  const e = a.eleicoes.find((x) => x.id === id) ?? a.eleicoes[0];
  const seletor = chips(a.eleicoes.map((x) => [x.id, x.rotulo] as [string, string]), e.id, "aud-eleicao");
  const arit: [string, string][] = [
    ["Seções com comparecimento &gt; aptos", int(e.comp_gt_aptos)], ["Boletim em que o total não fecha", int(e.detalhe_nao_fecha)], ["Abstenção ≠ aptos − comparecimento", int(e.abst_nao_fecha)],
    ["Votos por candidato ≠ nominais do boletim", int(e.votos_vs_nom)], ["Brancos divergentes entre arquivos", int(e.branco_vs_det)], ["Nulos divergentes entre arquivos", int(e.nulo_vs_det)],
  ];
  const linhas: [string, string, number][] = [
    ["Impressão digital: canto ≥ 90%/≥ 90%", `${pc(e.corner90, 3)} das seções`, e.s_imp],
    ["Comparecimento ≥ 95%", `${pc(e.t95, 2)} das seções`, e.s_comp],
    ["Subdispersão: locais com p &lt; 0,001", `${int(e.disp_low001)} (esperado ${dec(e.disp_low001_esp, 1)})`, e.s_disp],
    ["Último dígito (desvio médio)", `${dec(e.dig_mad * 100, 4)} p.p. (simulação ${dec(e.dig_mad_sim * 100, 4)})`, e.s_dig],
    ["Percentual inteiro da fatia", `${pc(e.int_obs, 2)} (simulação ${pc(e.int_sim, 2)})`, e.s_int],
    ["Seções sem brancos nem nulos", `${int(e.zero_obs)} (esperado ${int(Math.round(e.zero_esp))})`, e.s_zero],
    ["Boletins com vetor idêntico", `${int(e.dup_obs)} (simulação ${int(Math.round(e.dup_sim))})`, e.s_dup],
    ["Seções atípicas |z| &gt; 5", `${int(e.out_alto + e.out_baixo)} de ${int(e.out_testadas)} (normal puro: ${dec(e.out_normal, 1)})`, e.s_out],
    ["Sequências monótonas de seções irmãs", `${int(e.mono_obs)} (acaso: ${int(Math.round(e.mono_esp))})`, e.s_mono],
  ];
  const aritS = e.s_arit;
  const conf = a.para_conferir.filter((r) => r.id === e.id);
  const subd = a.subdispersao.filter((r) => r.id === e.id);
  const ufs = a.uf_dispersao.filter((r) => r.id === e.id).sort((x, y) => x.uf.localeCompare(y.uf));
  const bins = a.comparecimento[e.id] ?? [];
  const dig = a.digitos[e.id]?.A ?? [];
  return `${seletor}
    <div class="au-grid">
      ${card(`${e.a_nome} × ${e.b_nome}`, `<p class="au-grande">${int(e.margem)}</p><p class="muted small">votos de diferença entre os dois mais votados</p>${kv([["Seções analisadas", int(e.secoes)], ["Eleitores aptos", int(e.aptos)], ["Comparecimento", pc(e.turnout_medio, 1)], ["Votos válidos", int(e.validos)]])}`)}
      ${card("Aritmética do boletim", `<p class="muted small">Qualquer valor diferente de zero é erro de dado até prova em contrário. ${pill(aritS)}</p>${kv(arit)}`)}
      ${card("Resultado dos testes", `<dl class="au-kv wide">${linhas.map(([n, v, s]) => `<dt>${n}<small>${v}</small></dt><dd>${pill(s)}</dd>`).join("")}</dl>`)}
    </div>
    ${sec("Comparecimento × voto", "Cada seção vira um ponto: quanto compareceu e que fatia dos votos válidos foi para o primeiro colocado. Um enchimento de urna, se houvesse, deixaria uma cauda para o canto superior direito; a nuvem real fica concentrada no meio.",
      `<div class="au-grid w2">
        ${card("Impressão digital eleitoral", `${imp ? heat2d(imp[e.id] ?? []) : aguardando("o gráfico")}<p class="muted small">Escala por contagem de seções (raiz do log). Correlação entre comparecimento e fatia: <b>${dec(e.corr_t_a, 2)}</b>.</p>`)}
        ${card("Distribuição do comparecimento", `${bins.length ? histograma(bins) : ""}<p class="muted small">Seções com 50+ eleitores aptos. Sem pico perto de 100%.</p>`)}
      </div>`)}
    ${sec("Uniformidade e dígitos", "A dispersão compara as seções de um mesmo local de votação (escola). Votos reais variam entre seções; boletins fabricados com proporção fixa variam menos do que o acaso permite.",
      `<div class="au-grid w2">
        ${card("Dispersão mediana por UF", `${barrasH(ufs.map((r) => ({ k: r.uf === "ZZ" ? "Ext." : r.uf, v: r.ratio, flag: r.ratio < 0.8, tip: `${r.uf}: razão ${dec(r.ratio, 2)} · ${int(r.locais)} locais` })), { max: 2, ref: 1, fmt: (v) => dec(v, 2), label: "Razão de dispersão mediana por UF" })}<p class="muted small">Razão entre a variância observada e a binomial, mediana dos locais. Acima de 1 é o normal (bairros diferentes na mesma escola); perto de 0 seria suspeito.</p>`)}
        ${card("Último dígito dos votos do 1º colocado", `${dig.length ? ultimoDigito(dig, e.dig_n) : ""}<p class="muted small">Desvio médio ${dec(e.dig_mad * 100, 4)} p.p.; uma simulação honesta com a mesma heterogeneidade dá ${dec(e.dig_mad_sim * 100, 4)} p.p.</p>`)}
      </div>`)}
    ${sec("Seções para conferir", "As 12 seções que mais destoam das irmãs do mesmo local (z robusto, deixando a própria seção de fora). Destoar é frequente: a coluna Posição mostra que muitas vezes é a última seção da escola, que reúne eleitores cadastrados mais recentemente (mais jovens e escolarizados). Não é indício de irregularidade.",
      tabela("Seções que mais destoam das irmãs do mesmo local", [
        { h: "UF", f: (r) => h(r.uf) }, { h: "Município", f: (r) => h(r.mun) }, { h: "Zona/Seção", f: (r) => `${r.zona}/${r.secao}` }, { h: "Local", f: (r) => h(r.nm_local ?? "–") },
        { h: "Eleitores", num: true, f: (r) => int(r.aptos) }, { h: "Fatia do 1º", num: true, f: (r) => pc(r.shareA) }, { h: "z", num: true, f: (r) => dec(r.z, 1) },
        { h: "Posição no local", f: (r) => `${posicaoNoLocal(r.pos, r.k) ? `<span class="au-tag">${h(posicaoNoLocal(r.pos, r.k))}</span>` : ""}${r.tag ? ` <span class="au-tag k">${h(r.tag)}</span>` : ""}` },
      ], conf))}
    ${sec("Locais com resultado parecido demais", "Locais de votação em que as seções votaram quase igual entre si, mais do que o acaso explicaria.",
      `${tabela("Locais de votação com seções parecidas demais", [
        { h: "UF", f: (r) => h(r.uf) }, { h: "Município", f: (r) => h(r.mun) }, { h: "Zona", num: true, f: (r) => String(r.zona) }, { h: "Local", num: true, f: (r) => String(r.local) },
        { h: "Seções", num: true, f: (r) => String(r.k) }, { h: "Razão", num: true, f: (r) => dec(r.ratio, 3) }, { h: "p (cauda baixa)", num: true, f: (r) => (r.p < 0.0001 ? "&lt; 0,0001" : dec(r.p, 4)) },
      ], subd)}<p class="muted small">Com ${int(e.disp_locais)} locais testados, o esperado ao acaso é ${dec(e.disp_low001_esp, 1)} abaixo de p = 0,001; observado: ${int(e.disp_low001)}.</p>`)}`;
}

// ------------------------------------------------------------------ Investigações
export function investigaView(a: Auditoria, urnaId: string): string {
  const A = a.ajuste_perfil, lab = (id: string) => rot(a.eleicoes.find((x) => x.id === id) ?? ({ rotulo: id } as Eleicao));
  const a22 = A.find((r) => r.id === "2022-1") ?? A[0];
  const red = reducoes(A), ET = a.entre_turnos, mx = maiorCurtose(ET), etTop = a.entre_turnos_top.filter((r) => r.ano === mx.ano);
  const U = a.urna.filter((r) => r.id === urnaId);
  const coefs: Coef[] = [];
  for (const r of U) if (r.mun_pp != null) {
    const par: [number | null, number | null, number | null][] = [[r.mun_pp, r.mun_lo, r.mun_hi], [r.zona_pp, r.zona_lo, r.zona_hi], [r.local_pp, r.local_lo, r.local_hi]];
    par.forEach(([v, lo, hi], i) => { if (v != null && lo != null && hi != null) coefs.push({ modelo: r.modelo, spec: i, v, lo, hi, primeiro: i === 0 }); });
  }
  const urnas: [string, string][] = [["2022-1", "2022 · 1º turno"], ["2022-2", "2022 · 2º turno"], ["2026-1", "2026 · 1º turno"], ["2026-2", "2026 · 2º turno"]];
  const pp = (v: number | null) => (v == null ? "ref." : `${sinal(v, 2)} p.p.`);
  return `${sec("As seções atípicas têm explicação demográfica", "Seções que destoam das irmãs do mesmo local aparecem em toda eleição. Uma causa é estrutural: seções são numeradas por ordem de cadastro, então a última de cada escola reúne eleitores mais novos e mais escolarizados. Incluímos idade, escolaridade e gênero da seção na comparação.",
      `<div class="au-grid w2">
        ${card("Seções com |z| &gt; 5, antes e depois do ajuste", `${halteres(A.map((r) => ({ rotulo: lab(r.id), a: r.bruto_z5, b: r.adj_z5 })), { a: "sem ajuste", b: "com perfil", label: "Seções com |z| acima de 5, antes e depois do ajuste pelo perfil" })}<p class="muted small">Ponto cinza: sem ajuste. Ponto colorido: após descontar o perfil do eleitorado da seção, na mesma escala. O ajuste explica só ${pc(Math.min(...A.map((r) => r.r2)))} a ${pc(Math.max(...A.map((r) => r.r2)))} da variação dentro do local, mas elimina de ${pc(Math.min(...red))} a ${pc(Math.max(...red))} dos casos.</p>`)}
        ${card("Quase sempre é a última seção do local", `${obsEsp(a.ultima_secao.map((r) => ({ rotulo: lab(r.id), obs: r.pct_ultima, esp: r.pct_esperado })), { fmt: (v) => pc(v), axis: (v) => pc(v), label: "Parcela das seções atípicas que são a última do local, observada e esperada" })}<p class="muted small">Entre as seções com |z| &gt; 5, a parcela que é a última numerada do local (ponto) contra a esperada se a posição fosse irrelevante (traço): em média ${pc(media(a.ultima_secao.map((r) => r.pct_ultima)))} contra ${pc(media(a.ultima_secao.map((r) => r.pct_esperado)))}.</p>`)}
        ${card("Primeira × última seção do local", `${kv([["Eleitores de 18 a 24 anos, 1ª seção", pc(a22.idade1824_primeira, 1)], ["Eleitores de 18 a 24 anos, última seção", pc(a22.idade1824_ultima, 1)], ["Escolaridade baixa, 1ª seção", pc(a22.edu_baixa_primeira, 1)], ["Escolaridade baixa, última seção", pc(a22.edu_baixa_ultima, 1)]])}<p class="muted small">2022, 1º turno, locais com 4+ seções. Padrão semelhante em 2014 e 2018. Por isso as seções atípicas costumam ser a última do local, e os desvios seguem a idade do eleitor, não o resultado.</p>`)}
      </div>`)}
    ${sec("Do 1º para o 2º turno", "Para cada seção, a variação do voto entre os dois finalistas foi comparada com a das irmãs do mesmo local. Se houvesse transferência indevida de votos entre turnos, as caudas ficariam gordas.",
      `<div class="au-card">${tabela("Desvios entre turnos por ano", [
        { h: "Ano", f: (r) => String(r.ano) }, { h: "Seções testadas", num: true, f: (r) => int(r.testadas) }, { h: "|z| > 4", num: true, f: (r) => int(r.z4) }, { h: "esperado (normal)", num: true, f: (r) => dec(r.z4_normal, 1) },
        { h: "|z| > 5", num: true, f: (r) => int(r.z5) }, { h: "esperado", num: true, f: (r) => dec(r.z5_normal, 2) }, { h: "Curtose", num: true, f: (r) => dec(r.curtose, 2) }, { h: "Δ voto por +10 p.p. de comparecimento", num: true, f: (r) => dec(r.beta10, 3) },
      ], ET)}<p class="muted small">Curtose perto de zero indica caudas normais. A cauda mais pesada é a de ${mx.ano} (curtose ${dec(mx.curtose, 2)}; ${int(mx.z5)} seções com |z| &gt; 5 contra ${dec(mx.z5_normal, 2)} esperadas por uma normal). A última coluna mede se o aumento de comparecimento entre turnos favoreceu um lado: efeito próximo de zero em todos os anos.</p></div>
      <div class="au-card"><h4>Maiores desvios em ${mx.ano}</h4>${tabela(`Seções com maior desvio entre turnos em ${mx.ano}`, [
        { h: "UF", f: (r) => h(r.uf) }, { h: "Município", f: (r) => h(r.mun) }, { h: "Zona/Seção", f: (r) => `${r.zona}/${r.secao}` },
        { h: "1º turno (A × B)", num: true, f: (r) => `${int(r.a1)} × ${int(r.b1)}` }, { h: "2º turno (A × B)", num: true, f: (r) => `${int(r.a2)} × ${int(r.b2)}` }, { h: "z", num: true, f: (r) => dec(r.z, 1) },
      ], etTop)}</div>`)}
    ${sec("Modelo de urna (2022 e 2026)", "O TSE publica o modelo de cada urna. Em 2022 as urnas mais antigas (UE 2009 a 2015) aparecem com fatia maior do primeiro colocado. A comparação bruta mistura geografia: as antigas ficam em cidades menores. Controlando por município, zona e depois pelo mesmo local de votação, a diferença encolhe.",
      `${chips(urnas, urnaId, "aud-urna")}
      <div class="au-grid w2">
        ${card("Diferença para a urna UE 2020 (IC 95%)", `${coeficientes(coefs)}<p class="muted small">Referência: UE 2020. Perto de zero no mesmo local é o resultado esperado se o modelo da urna não influi.</p>`)}
        ${card("Fatia bruta por modelo", `${colunas(U.map((r) => ({ k: r.modelo.replace("UE ", ""), v: r.share_a, tip: `${r.modelo}: ${dec(r.share_a, 1)}% · ${int(r.secoes)} seções` })), { max: 70, fmt: (v) => dec(v, 1), axis: (v) => `${v}%`, xlabel: "modelo da urna (UE + ano)", label: "Fatia do 1º colocado por modelo de urna, sem controle", alt: 190 })}<p class="muted small">Sem controle nenhum. A diferença bruta é grande; a que sobra na comparação dentro do mesmo local de votação está na tabela abaixo.</p>`)}
      </div>
      <div class="au-card">${tabela(`Fatia do 1º colocado por modelo de urna, ${urnaId}`, [
        { h: "Modelo", f: (r) => h(r.modelo) }, { h: "Seções", num: true, f: (r) => int(r.secoes) }, { h: "Bruto", num: true, f: (r) => `${dec(r.share_a, 1)}%` },
        { h: "Mesmo município", num: true, f: (r) => pp(r.mun_pp) }, { h: "Mesma zona", num: true, f: (r) => pp(r.zona_pp) },
        { h: "Mesmo local", num: true, f: (r) => (r.local_pp == null ? "ref." : `${pp(r.local_pp)} <span class="muted small">[${dec(r.local_lo, 2)}; ${dec(r.local_hi, 2)}]</span>`) },
      ], U)}<p class="muted small">${int(U[0]?.locais_2_modelos ?? 0)} dos ${int(U[0]?.locais ?? 0)} locais usam mais de um modelo, e só neles a comparação "mesmo local" é possível. A associação residual pequena pode refletir o jeito como as seções são distribuídas entre urnas dentro da escola; a análise não permite concluir causa.</p></div>`)}
    ${sec("Horário de recebimento dos boletins", "O TSE registra quando recebeu o boletim de cada seção. Praticamente nenhum boletim doméstico chegou antes das 17h do horário local; o atraso mediano e a cauda longa seguem a geografia (áreas remotas transmitem mais tarde).",
      `<div class="au-card">${tabela("Atraso de recebimento dos boletins", [
        { h: "Turno", f: (r) => `${r.ano} · ${r.turno}º` }, { h: "Seções", num: true, f: (r) => int(r.n) }, { h: "Recebidos antes do fechamento", num: true, f: (r) => int(r.antes) },
        { h: "Atraso mediano (min)", num: true, f: (r) => int(r.mediana_min) }, { h: "Atraso p99 (min)", num: true, f: (r) => int(r.p99_min) }, { h: "Após 6 h", num: true, f: (r) => int(r.mais_6h) }, { h: "Boletim gerado por RED", num: true, f: (r) => int(r.red) },
      ], a.tempo_bu)}<p class="muted small">2018 usa horário de Brasília; 2022 e 2026 usam horário local da seção. Em 2018, 2º turno, 18 seções do Pará constam com 5 minutos de antecedência: diferença de relógio. RED = recuperador de dados da urna (cópia de segurança).</p></div>`)}`;
}

// ------------------------------------------------------------------ Eleitorado × população
export interface MapaCtx { pontos: PontoMunicipio[]; ufs: Record<string, { d: string }>; viewBox: number[] }
export function populacaoView(a: Auditoria, mapa: MapaCtx | null, ano: string): string {
  const R22 = a.eleitorado_resumo.find((r) => r.ano === 2022) ?? a.eleitorado_resumo[a.eleitorado_resumo.length - 1];
  const R = a.eleitorado_resumo.find((r) => String(r.ano) === ano) ?? R22, P = a.eleitorado_persistencia[0];
  const topo = a.eleitorado_top.filter((r) => String(r.ano) === ano);
  const V = (id: string) => a.eleitorado_voto.filter((r) => r.id === id).sort((x, y) => x.q - y.q);
  const v1 = V("2022-1"), v2 = V("2022-2");
  const key = ano === "2010" ? "r10" : "r22";
  const pts = mapa ? mapa.pontos.filter((p) => p[key] != null).map((p) => ({ uf: p.uf, mun: p.mun, x: p.x, y: p.y, aptos: p.aptos, pop16: p.pop16, v: p[key] as number })) : [];
  const legenda = [0.8, 0.9, 1, 1.1, 1.25, 1.5].map((v) => `<span><i class="au-sw ${balde(v) < 10 ? "lo" : "hi"}" style="--p:${balde(v) < 10 ? 14 + Math.round(76 * (balde(v) / 9)) : 24 + Math.round(76 * ((balde(v) - 10) / 9))}%"></i>${dec(v, 2)}</span>`).join("");
  const qb = (v: typeof v1) => colunas(v.map((r) => ({ k: `Q${r.q}`, v: r.share_a, tip: `Quintil ${r.q}: razão mediana ${dec(r.razao_med, 2)} · fatia ${pc(r.share_a, 1)} · ${int(r.n)} municípios` })), { max: 0.9, fmt: (x) => pc(x), axis: (x) => pc(x), xlabel: "quintil da razão eleitores/habitantes (Q1 menor, Q5 maior)", label: "Fatia do 1º colocado por quintil da razão eleitores/habitantes", alt: 190 });
  return `<p class="au-lede">Ter <b>mais eleitores do que habitantes</b> não é sinal de fraude: em <b>${int(R22.gt1)}</b> de <b>${int(R22.municipios)}</b> municípios o cadastro eleitoral de 2022 supera a população de 16+ anos do Censo 2022. A mediana é <b>${dec(R22.mediana, 2)}</b>. O padrão se repete em 2010 e é quase o mesmo município a município (correlação <b>${dec(P.corr_log, 2)}</b>), o que aponta para domicílio eleitoral mantido por quem migrou, e não para algo específico de uma eleição.</p>
    <section class="au-sec">${chips([["2022", "Censo 2022 × eleitorado 2022"], ["2010", "Censo 2010 × eleitorado 2010"]], ano, "aud-ano")}
      <div class="au-split">
        ${card(`Razão eleitores aptos / residentes com 16+ anos (${R.ano})`, `${mapa ? mapaPontos(mapa.ufs, mapa.viewBox, pts) : aguardando("o mapa")}<div class="au-legend">${legenda}<span class="muted">tamanho do ponto = eleitores aptos</span></div>`)}
        <div class="au-stack">
          ${card("Resumo", `${kv([["Municípios comparados", int(R.municipios)], ["Razão nacional", dec(R.razao_nacional, 3)], ["Municípios acima de 1,00", int(R.gt1)], ["Acima de 1,10", int(R.gt110)], ["Percentil 95 / 99", `${dec(R.q95, 2)} / ${dec(R.q99, 2)}`]])}<p class="muted small">No total do país o eleitorado fica abaixo da população (razão &lt; 1): o excesso está nas cidades pequenas, compensado pelas grandes.</p>`)}
          ${card("Por porte do município (2022)", `${colunas(a.eleitorado_porte.map((r) => ({ k: r.porte.replace(" mil", ""), v: r.mediana, tip: `${r.porte}: mediana ${dec(r.mediana, 2)} · ${pc(r.p_gt1)} acima de 1 · ${int(r.n)} municípios` })), { min: 0.6, max: 1.3, ref: 1, fmt: (v) => dec(v, 2), axis: (v) => dec(v, 1), xlabel: "população com 16+ anos (em mil habitantes)", label: "Mediana da razão por porte do município", alt: 190 })}<p class="muted small">Mediana da razão por faixa de população 16+. Cidades de até 5 mil: ${pc(a.eleitorado_porte[0]?.p_gt1 ?? 0)} têm mais eleitores que habitantes.</p>`)}
        </div>
      </div></section>
    ${sec(`Maiores razões em ${R.ano}`, "Extremos existem e se repetem: costumam ser municípios pequenos, com população que trabalha fora e vota onde nasceu, ou emancipações recentes. É um ponto de partida para conferir o cadastro, não um achado.",
      `<div class="au-card">${tabela(`Municípios com maior razão eleitores/habitantes em ${R.ano}`, [
        { h: "UF", f: (r) => h(r.uf) }, { h: "Município", f: (r) => h(r.mun) }, { h: "Eleitores aptos", num: true, f: (r) => int(r.aptos) }, { h: "Residentes 16+", num: true, f: (r) => int(r.pop16) }, { h: "Razão", num: true, f: (r) => dec(r.razao, 2) },
      ], topo)}</div>`)}
    ${sec("A razão e o voto", "Municípios com razão maior votaram mais no primeiro colocado. É uma associação entre municípios, não entre pessoas. A razão alta vem junto de cidades pequenas, mais pobres e do Nordeste, que já tinham outro padrão de voto; dentro de cada UF a relação cai, e em 2010 ela era mais fraca.",
      `<div class="au-grid w2">
        ${card("2022 · 1º turno: fatia do 1º colocado por quintil de razão", `${qb(v1)}<p class="muted small">Correlação entre municípios: <b>${dec(v1[0]?.corr_mun, 2)}</b>; dentro da UF: <b>${dec(v1[0]?.corr_uf, 2)}</b>.</p>`)}
        ${card("2022 · 2º turno", `${qb(v2)}<p class="muted small">Correlação entre municípios: <b>${dec(v2[0]?.corr_mun, 2)}</b>; dentro da UF: <b>${dec(v2[0]?.corr_uf, 2)}</b>.</p>`)}
      </div>`)}
    ${sec("Crescimento do eleitorado entre eleições", "Municípios cujo cadastro cresceu (ou encolheu) muito mais que o padrão da própria UF. Crescimento forte aparece em polos de migração (petróleo, agronegócio, loteamento); quedas coincidem com recadastramento biométrico.",
      `<div class="au-card">${tabela("Crescimento do cadastro eleitoral entre eleições", [
        { h: "Período", f: (r) => h(r.periodo) }, { h: "Municípios", num: true, f: (r) => int(r.municipios) }, { h: "Crescimento do total", num: true, f: (r) => pc(r.crescimento, 1) },
        { h: "Fora do padrão (alto)", num: true, f: (r) => int(r.z_alto) }, { h: "Fora do padrão (baixo)", num: true, f: (r) => int(r.z_baixo) },
        { h: "Maior alta", f: (r) => { const t = a.crescimento_top.find((x) => x.periodo === r.periodo && x.rank === 1); return t ? `${h(t.mun)}-${h(t.uf)} (${pc(t.cresc)})` : ""; } },
      ], a.crescimento)}</div>`)}
    ${nota(`<b>Bolsa Família × voto: não executado</b><span>Os arquivos mensais por município do Portal da Transparência (CGU) e do MDS negaram acesso a partir do ambiente da análise, e não há alternativa aberta equivalente. A malha municipal e os dados de voto por município já estão prontos; o cruzamento exige baixar o arquivo e repetir o recorte por quintil acima, com controle de renda do Censo. Só agregados por município entram; nome e NIS de beneficiário, nunca.</span>`, "info")}`;
}

// ------------------------------------------------------------------ Governadores
export function governosView(G: Governador[], turno: number, selId: string | null): string {
  const anos = [...new Set(G.map((r) => r.ano))].sort((x, y) => x - y), ufs = [...new Set(G.map((r) => r.uf))].sort();
  const idx = new Map(G.map((r) => [`${r.ano}|${r.uf}|${r.turno}`, r] as const));
  const sel = selId ? G.find((r) => r.id === selId) ?? null : null;
  const com = G.map((r) => ({ r, s: sinaisGov(r) })).filter((x) => x.s.length);
  const col = `style="grid-template-columns:44px repeat(${anos.length},minmax(40px,1fr))"`;
  const celula = (r: Governador | undefined) => {
    if (!r) return `<span class="au-cell none" aria-hidden="true">·</span>`;
    const n = sinaisGov(r).length;
    return `<button type="button" class="au-cell st${n ? 1 : 0}" data-aud-gsel="${h(r.id)}" aria-pressed="${r.id === selId}" aria-label="${h(r.uf)} ${r.ano}, ${r.turno}º turno: ${n ? `${n} para conferir` : "sem sinal"}">${n || "✓"}</button>`;
  };
  const quadro = `<div class="scroll"><div class="au-matrix"><div class="au-mrow gov" ${col}><span></span>${anos.map((y) => `<span class="au-mhead">${y}</span>`).join("")}</div>${ufs.map((u) => `<div class="au-mrow gov" ${col}><span class="au-mname">${h(u)}</span>${anos.map((y) => celula(idx.get(`${y}|${u}|${turno}`))).join("")}</div>`).join("")}</div></div>`;
  const detalhe = sel
    ? card(`${sel.uf} ${sel.ano} · ${sel.turno}º turno`, `${kv([
      ["Seções", int(sel.secoes)], ["Fatia do 1º colocado", `${dec(sel.share_a, 1)}%`], ["Margem", `${int(sel.margem)} votos (${dec(sel.margem_pct, 1)} p.p.)`],
      ["Seções com comparecimento ≥ 95%", `${int(sel.t95)} (esperado pela distribuição do estado: ${dec(sel.t95_exp, 1)})`],
      ["Canto 90%/90%", `${int(sel.corner)} seções (esperado se independentes: ${dec(sel.corner_esp, 1)})`], ...(sel.corner_top ? [["Onde", h(sel.corner_top)] as [string, string]] : []),
      ["Locais testados / abaixo de p = 0,001", `${int(sel.disp_locais)} / ${int(sel.disp_low001)}`], ["Razão de dispersão mediana", dec(sel.disp_ratio, 2)],
      ["Sem brancos nem nulos", sel.zero_obs == null ? "–" : `${int(sel.zero_obs)} (esperado ${dec(sel.zero_esp, 1)})`],
    ])}<p>${sinaisGov(sel).length ? sinaisGov(sel).map((k) => `<span class="au-tag">${h(nomeSinalGov(k))}</span>`).join(" ") : pill(0)}</p><p class="muted small">Toque noutra célula do quadro para trocar a disputa.</p>`)
    : card("Disputa selecionada", `<p class="muted small">Toque numa célula do quadro: o número é a quantidade de testes que ficaram "para conferir"; ✓ é sem sinal.</p>`);
  const lista = com.sort((x, y) => y.s.length - x.s.length || x.r.ano - y.r.ano).slice(0, 24);
  return `<p class="au-lede">Os mesmos testes, aplicados a <b>${int(G.length)}</b> disputas estaduais de Governador (${anos[0]} a ${anos[anos.length - 1]}, 1º e 2º turnos). Em <b>${int(com.length)}</b> delas ao menos um teste ficou "para conferir". Por serem estados menores, os testes têm menos poder e as regras exigem efeito mínimo para não gerar alarme falso.</p>
    <details class="au-regras muted small"><summary>Regras usadas nos estados</summary><p>Canto 90/90: ao menos 10 seções com comparecimento e fatia do 1º colocado ≥ 90% e mais que o dobro do esperado se as duas fossem independentes. Comparecimento ≥ 95%: ao menos 20 seções e mais que o dobro do esperado pela distribuição do próprio estado. Uniformidade: ao menos 3 locais com p &lt; 0,001 e excesso significativo sobre o acaso. Último dígito: p &lt; 1e-6, efeito acima de 0,02 e 1,5 vez o de uma simulação honesta. Sem brancos/nulos: ao menos 10 seções e p &lt; 1e-6. Aritmética: qualquer divergência. Nenhum nome de candidato aparece nesta aba.</p></details>
    ${chips([["1", "1º turno"], ["2", "2º turno (só onde houve)"]], String(turno), "aud-gturno")}
    <div class="au-split"><div class="au-card"><h4>Quadro por UF e eleição (${turno}º turno)</h4>${quadro}<p class="muted small">Células em branco: estados sem disputa naquele turno.</p></div>${detalhe}</div>
    ${sec("Disputas com algum teste para conferir", "O canto 90/90 costuma se concentrar em poucos municípios, onde o voto é homogêneo e o comparecimento alto; a última coluna mostra onde e, quando o nome do local consta no arquivo (2018 em diante), quantas seções são de escolas indígenas.",
      tabela("Disputas estaduais com algum teste para conferir", [
        { h: "Ano", f: (x) => String(x.r.ano) }, { h: "UF", f: (x) => h(x.r.uf) }, { h: "Turno", f: (x) => `${x.r.turno}º` }, { h: "Fatia do 1º", num: true, f: (x) => `${dec(x.r.share_a, 1)}%` },
        { h: "Seções", num: true, f: (x) => int(x.r.secoes) }, { h: "Testes para conferir", f: (x) => x.s.map((k) => `<span class="au-tag">${h(nomeSinalGov(k))}</span>`).join(" ") },
        { h: "Onde estão as seções do canto 90/90", f: (x) => (x.s.includes("corner") ? `${int(x.r.corner)} seções: ${h(x.r.corner_top ?? "")}${x.r.corner_indig ? `; ${int(x.r.corner_indig)} em escolas indígenas` : ""}` : "") },
      ], lista))}`;
}

// ------------------------------------------------------------------ Poder dos testes
export function poderView(a: Auditoria): string {
  const base = a.eleicoes.find((x) => x.id === "2022-1") ?? a.eleicoes[0];
  return `<p class="au-lede">Um teste sem sinal só vale se ele teria acusado o problema. Para medir isso, injetamos manipulações sintéticas em dados reais (2022, 1º turno, margem de <b>${int(base.margem)}</b> votos) e verificamos quais testes passam a acusar sinal. Um teste "acusa" quando seu valor supera o maior já visto nos 14 turnos reais e 1,5 vez o valor original.</p>
    ${CENARIOS.map((c) => sec(c.nome, c.desc, `<div class="au-card">${tabela(`${c.nome}: o que cada teste acusa`, [
      { h: "Fração das seções/locais", num: true, f: (r) => pc(r.f, 1) }, { h: "Unidades alteradas", num: true, f: (r) => int(r.unidades) },
      { h: "Efeito na margem", num: true, f: (r) => `${r.desloc_margem >= 0 ? "+" : "−"}${int(Math.abs(r.desloc_margem))} <span class="muted small">(${pc(Math.abs(r.desloc_margem) / r.margem_real, 1)})</span>` },
      ...COLUNAS_PODER.map((cp) => ({ h: cp.nome, num: true, f: (r: (typeof a.poder)[number]) => (r[cp.k] ? '<span class="au-pill st1">acusa</span>' : '<span class="muted">–</span>') })),
      { h: "Detectado?", f: (r) => (r.alguma ? '<span class="au-pill st1">sim</span>' : '<span class="au-pill st2">não</span>') },
    ], a.poder.filter((r) => r.cenario === c.k))}</div>`)).join("")}
    ${nota(`<b>O que os testes não veem</b><span>Troca de votos espalhada em poucas seções passa despercebida: mover 15% dos votos do segundo colocado em 3% das seções desloca a margem em centenas de milhares de votos e não acende nenhum teste de distribuição. Para isso o caminho é conferir o boletim impresso de uma amostra de urnas contra o publicado, auditoria que o Brasil permite porque o boletim de cada seção é público.</span>`)}`;
}

// ------------------------------------------------------------------ Método e limites
export function metodoView(a: Auditoria): string {
  return `${sec("Venezuela 2024: o que mudaria", "O Centro Carter declarou em 30 de julho de 2024 que não podia verificar nem corroborar o resultado anunciado pelo conselho eleitoral, e pediu a publicação das atas por mesa; o conselho divulgou só boletins agregados. As atas colhidas pela oposição foram depois analisadas por observadores (MOE Colômbia revisou 21.952, 73% do total; o Centro Carter revisou 24.533, 82%).",
      `<div class="au-grid w2">
        ${card("O que torna a auditoria possível no Brasil", `<p>Cada seção imprime o boletim de urna, que é público: votos por candidato, aptos, comparecimento, brancos e nulos, com horário de recebimento. É isso que permite os testes acima, e que qualquer pessoa refaça a soma. Na Venezuela a falta de publicação oficial por mesa foi o ponto central da disputa.</p>`)}
        ${card("O que os testes estatísticos fazem e não fazem", `<p>Os testes procuram padrões que a aleatoriedade de milhares de urnas raramente produz. Não substituem a conferência do boletim impresso contra o publicado, e um teste sem sinal não garante integridade. Um sinal só pede conferência.</p>`)}
      </div>
      <p class="muted small">Fontes: <a href="https://www.cartercenter.org/" target="_blank" rel="noopener">Centro Carter</a>, <a href="https://moe.org.co/wp-content/uploads/2024/08/20240803-Review-of-tally-sheets-and-electoral-documents-Venezuela-2024.pdf" target="_blank" rel="noopener">MOE Colômbia (PDF)</a>, <a href="https://arxiv.org/pdf/1811.08502" target="_blank" rel="noopener">revisão de métodos de forense eleitoral (arXiv)</a>. Não avaliamos aqui a eleição venezuelana; só mostramos por que a publicação por seção importa.</p>`)}
    ${sec("Catálogo de testes", "Cada teste, o que mede, como foi calculado, onde falha e a regra usada para marcar 'para conferir'.",
      tabela("Catálogo de testes", [
        { h: "Grupo", f: (r) => h(r.grupo) }, { h: "Teste", f: (r) => `<b>${h(r.nome)}</b>` }, { h: "O que procura", f: (r) => h(r.mede) }, { h: "Como", f: (r) => h(r.como) },
        { h: "Limite", f: (r) => h(r.limite) }, { h: "Regra", f: (r) => h(r.regra) }, { h: "Referência", f: (r) => h(r.ref) },
      ], a.catalogo))}
    ${sec("Fontes dos dados", "Tudo aberto e sem identificação de pessoas: seções, municípios e agregados. Nenhum dado individual de eleitor ou beneficiário entra na análise.",
      tabela("Fontes dos dados", [{ h: "Fonte", f: (r) => `<b>${h(r.nome)}</b>` }, { h: "Origem", f: (r) => h(r.origem) }, { h: "Conteúdo", f: (r) => h(r.conteudo) }, { h: "Endereço", f: (r) => h(r.endereco) }], a.fontes))}
    ${nota(`<b>Limites desta análise</b><span>Cobre os boletins publicados. Não verifica o voto de cada eleitor, o software da urna nem a cadeia de custódia. Os limiares das regras "para conferir" foram escolhidos pelos 14 turnos de Presidente e podem ser ajustados. Há ainda Deputados, Senador e eleições municipais, não incluídos. Dados gerados em ${h(a.gerado)}.</span>`, "info")}`;
}

