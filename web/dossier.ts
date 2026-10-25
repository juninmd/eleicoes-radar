import { INDICATORS } from "./score.js";
import { fornecedoresBlock } from "./fornecedores.js";
import type { FornEstado } from "./fornecedores-carga.js";
import { prevBlock } from "./prev.js";
import { canaisBlock } from "./dossier-canais.js";
import type { ExpPrev } from "./prev.js";
import type { score } from "./score.js";
import type { SourceKey } from "./charts.js";
import type { Candidatura } from "./types.js";
import type { AgendaConfig } from "../src/radar/camara/agenda";
import { displayName, ELEICAO, h, int, money, moneyShort, pct, STATUS, titleName } from "./format.js";

// Fixed categorical order: identity never depends on rank.
const SOURCES: { key: SourceKey; nome: string; cls: string }[] = [
  { key: "publico", nome: "Fundos públicos", cls: "s1" },
  { key: "partido", nome: "Partido (recurso privado)", cls: "s2" },
  { key: "pf", nome: "Pessoas físicas", cls: "s3" },
  { key: "proprio", nome: "Próprio candidato", cls: "s4" },
  { key: "outros", nome: "Outros", cls: "s5" },
];

function moneyBar(fin: Candidatura["fin"]) {
  const outros = Math.max(0, fin.total - fin.publico - fin.partido - fin.pf - fin.proprio);
  const vals = { ...fin, outros };
  if (!fin.total) return `<p class="muted">Nenhuma receita declarada até o retrato do TSE.</p>`;
  const parts = SOURCES.filter((s) => vals[s.key] > 0);
  return `
    <div class="stack" role="img" aria-label="Composição da receita">
      ${parts.map((s) => `<span class="seg ${s.cls}" style="flex-grow:${vals[s.key]}" title="${h(s.nome)}: ${money(vals[s.key])} (${pct(vals[s.key] / fin.total)})"></span>`).join("")}
    </div>
    <table class="kv">
      ${parts.map((s) => `<tr><th><i class="key ${s.cls}"></i>${h(s.nome)}</th><td>${money(vals[s.key])}</td><td class="muted">${pct(vals[s.key] / fin.total)}</td></tr>`).join("")}
    </table>`;
}

function indicatorRows(c: Candidatura) {
  return INDICATORS.map(({ key, nome, desc }) => {
    const v = c.ind[key];
    const bar = typeof v === "number"
      ? `<span class="meter"><span style="width:${Math.max(2, v * 100)}%"></span></span><b>${Math.round(v * 100)}</b>`
      : `<span class="nd">sem dado</span>`;
    return `<li><div><strong>${h(nome)}</strong><small>${h(desc)}</small></div><div class="ival">${bar}</div></li>`;
  }).join("");
}

function mandateBlock(m: Candidatura["mandato"]) {
  if (!m) {
    return `<section><h3>Mandato na Câmara</h3><p class="muted">Sem mandato de deputado federal em 2023–2026. Os indicadores de trabalho legislativo não se aplicam, e a nota usa só os dados de campanha.</p></section>`;
  }
  const v = m.votos, p = m.projetos, cota = m.cota, e = m.emendas;
  const link = `https://www.camara.leg.br/deputados/${m.id}`;
  return `
    <section>
      <h3>Mandato na Câmara <a class="ext" href="${link}" target="_blank" rel="noopener">perfil oficial ↗</a></h3>
      <p class="muted">Como <b>${h(m.nome)}</b> (${h(m.partido)}-${h(m.uf)}), legislatura 2023–2026.</p>
      <div class="facts">
        ${v ? `<div><span class="big">${pct(v.votou / v.possiveis)}</span><span>presença em ${int(v.possiveis)} votações nominais</span></div>` : ""}
        ${p ? `<div><span class="big">${int(p.aprovadasCamara)}</span><span>de ${int(p.autorPrincipal)} projetos próprios aprovados (${int(p.leis)} viraram lei)</span></div>` : ""}
        ${cota ? `<div><span class="big">${moneyShort(cota.mediaMensal)}</span><span>por mês de cota parlamentar em ${int(cota.meses)} meses</span></div>` : ""}
        ${v && v.comparaveisPartido ? `<div><span class="big">${pct(v.alinhadoPartido / v.comparaveisPartido)}</span><span>dos votos seguiram a orientação do partido</span></div>` : ""}
        ${v && v.comparaveisGoverno ? `<div><span class="big">${pct(v.alinhadoGoverno / v.comparaveisGoverno)}</span><span>dos votos seguiram a orientação do governo</span></div>` : ""}
        ${e ? `<div><span class="big">${moneyShort(e.pago)}</span><span>em emendas pagas de ${moneyShort(e.empenhado)} empenhados</span></div>` : ""}
      </div>
      ${cota && cota.maiorFornecedorShare >= 0.4 ? `<p class="flag"><b>Para conferir:</b> ${pct(cota.maiorFornecedorShare)} da cota foi para um só fornecedor (${h(cota.maiorFornecedor)}). Concentração alta não é irregularidade por si só; os recibos estão no perfil oficial.</p>` : ""}
      ${e?.areas?.length ? `<p class="muted">Emendas por área: ${e.areas.map((a) => `${h(a.nome)} ${moneyShort(a.valor)}`).join(" · ")}</p>` : ""}
      ${p?.destaques?.length ? `<h4>Projetos próprios que avançaram</h4><ul class="bills">${p.destaques.map((b) => `<li><a href="https://www.camara.leg.br/propostas-legislativas/${b.id}" target="_blank" rel="noopener">${h(b.sigla)}</a> ${h(b.ementa)} <em>${h(b.situacao)}</em></li>`).join("")}</ul>` : ""}
    </section>`;
}

function agendaBlock(m: Candidatura["mandato"], agenda: AgendaConfig | null) {
  if (!agenda) return "";
  if (!m) return `<section><h3>Votos na sua agenda</h3><p class="muted">Sem mandato na Câmara: não há votos para comparar. Na nota, esses indicadores contam como medianos (50).</p></section>`;
  const votos = m.agenda?.votos ?? {};
  const rows = Object.values(agenda.temas).flatMap((t) => t.votos.map((v) => {
    const voto = votos[v.id];
    const status = !voto ? ["nd", "não votou"] : voto === v.posicao ? ["ok", "alinhado"] : voto === "Sim" || voto === "Não" ? ["no", "contrário"] : ["nd", voto];
    return `<tr><td><b>${h(t.nome)}</b><br>${h(v.proposicao)} · ${h(v.resumo)}<br><small class="muted">Voto da agenda: ${h(v.posicao)}. ${h(v.porque)}</small></td>
      <td class="voto">${h(voto ?? "–")}</td><td><span class="pill ${status[0]}">${h(status[1])}</span></td></tr>`;
  })).join("");
  return `<section><h3>Votos na sua agenda <small>(lista editável em src/radar/agenda.json)</small></h3>
    <div class="scroll"><table class="agenda"><thead><tr><th>Votação</th><th>Votou</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function idade(nasc: string) {
  const d = new Date(`${nasc}T00:00:00`);
  if (isNaN(d as unknown as number)) return null;
  let a = ELEICAO.getFullYear() - d.getFullYear();
  if (ELEICAO < new Date(ELEICAO.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
const ano = (s: unknown) => (s ? String(s).slice(0, 4) : "");

function trajetoriaBlock(c: Candidatura) {
  const bio = c.bio, f = c.ficha;
  const nasc = f?.nascimento || bio?.nascimento;
  const age = nasc ? idade(nasc) : null;
  const natural = bio?.naturalidade || (f?.ufNascimento ? `nascido(a) em ${f.ufNascimento}` : null);
  const ficha = [
    natural && (bio?.naturalidade ? `Natural de <b>${h(bio.naturalidade)}</b>` : h(natural)),
    age && `${age} anos no dia da eleição`,
    f?.ocupacao && `Ocupação declarada: ${h(titleName(f.ocupacao))}`,
    f?.instrucao && h(titleName(f.instrucao)),
    f?.estadoCivil && h(titleName(f.estadoCivil)),
    f?.federacao && `Federação: ${h(titleName(f.federacao))}`,
    f?.coligacao && `Coligação: ${h(titleName(f.coligacao))}`,
  ].filter(Boolean).join(" · ");
  if (!bio) return `<section><h3>Ficha e trajetória</h3>${ficha ? `<p>${ficha}</p>` : ""}<p class="muted">Sem cargos públicos registrados nas fontes consultadas (Câmara, Senado, Wikidata).</p></section>`;
  const itens = bio.trajetoria.map((t) => `<li><span class="anos">${h(ano(t.inicio) || "?")}–${h(ano(t.fim) || (t.fim === null && t.inicio ? "" : "?"))}</span><span>${h(t.cargo)}</span><span class="fonte">${h(t.fonte)}</span></li>`).join("");
  return `<section><h3>Ficha e trajetória${bio.wikidata ? ` <a class="ext" href="https://www.wikidata.org/wiki/${h(bio.wikidata)}" target="_blank" rel="noopener">Wikidata ↗</a>` : ""}</h3>
    ${ficha ? `<p>${ficha}</p>` : ""}
    ${itens ? `<ul class="traj">${itens}</ul>` : `<p class="muted">Nenhum cargo público registrado nas fontes consultadas.</p>`}
    ${bio.trajetoria.some((t) => t.fonte === "Wikidata") ? `<p class="muted small">Itens marcados Wikidata vêm de base colaborativa; confira no link.</p>` : ""}
  </section>`;
}

function patrimonioBlock(p: Candidatura["patrimonio"]) {
  if (!p) return "";
  const antes = p.total2022;
  const delta = antes !== null && antes > 0 ? (p.total - antes) / antes : null;
  const cmp = antes === null ? "" : `<p class="muted">Em 2022 declarou ${money(antes)}${delta !== null ? `: variação nominal de ${delta >= 0 ? "+" : "−"}${pct(Math.abs(delta))}, sem descontar inflação` : ""}.</p>`;
  return `<section><h3>Patrimônio declarado <small>ao TSE</small></h3>
    <div class="facts"><div><span class="big">${moneyShort(p.total)}</span><span>em ${int(p.n)} ${p.n === 1 ? "bem" : "bens"} declarados</span></div></div>
    ${p.tipos.length ? `<p class="muted">Maiores grupos: ${p.tipos.map((t) => `${h(t.tipo)} ${moneyShort(t.valor)}`).join(" · ")}</p>` : ""}${cmp}
    <p class="muted small">Valores autodeclarados, em reais nominais; não passam por auditoria.</p></section>`;
}

function registroBlock(motivos: Candidatura["motivos"]) {
  if (!motivos) return "";
  return `<section><h3>Situação do registro <small>Justiça Eleitoral</small></h3>
    <p class="flag"><b>Para conferir:</b> a candidatura tem fundamento de indeferimento ou impugnação registrado no TSE: ${motivos.map(h).join("; ")}.</p>
    <p class="muted small">Não é condenação nem decisão final: pode haver recurso ou regularização. Confirme o andamento no DivulgaCandContas.</p></section>`;
}

export function propostaBlock(p: Candidatura["proposta"], id: string) {
  if (!p) return "";
  const tam = p.kb >= 1024 ? `${(p.kb / 1024).toFixed(1).replace(".", ",")} MB` : `${int(p.kb)} KB`;
  return `<section><h3>Proposta de governo <small>registrada no TSE</small></h3>
    <p><a class="ext" href="data/propostas/${h(id)}.pdf" download="proposta-${h(id)}.pdf">Baixar o plano (PDF, ${tam}) ↓</a></p>
    <p class="muted small">Arquivo original enviado pela candidatura ao TSE, sem alteração. O Radar não resume nem avalia o conteúdo.</p></section>`;
}

function atuacaoBlock(bio: Candidatura["bio"]) {
  const a = bio?.atuacao;
  if (!a) return "";
  const com = a.comissoes.map((c) => `<li><span>${h(c.nome)} <small class="muted">(${h(c.sigla)})</small></span><span class="fonte">${h(c.titulo)}</span></li>`).join("");
  return `<section><h3>Atuação parlamentar <small>legislatura 2023–2026</small></h3>
    <p class="muted">${a.discursos !== null ? `${int(a.discursos)} discursos em plenário · ` : ""}${a.frentes ? `${int(a.frentes)} frentes parlamentares` : ""}</p>
    ${com ? `<h4>Comissões</h4><ul class="traj">${com}</ul>` : ""}
    ${a.frentesDestaque?.length ? `<p class="muted small">Frentes (amostra): ${a.frentesDestaque.map(h).join(" · ")}</p>` : ""}</section>`;
}

function resumoBlock(bio: Candidatura["bio"]) {
  const r = bio?.resumo;
  return r ? `<section><h3>Resumo <a class="ext" href="${h(r.url)}" target="_blank" rel="noopener noreferrer">Wikipédia ↗</a></h3><p>${h(r.texto)}</p><p class="muted small">Texto de enciclopédia colaborativa; confira no link.</p></section>` : "";
}

export function renderDossier(c: Candidatura, s: ReturnType<typeof score>, inCola: boolean, agenda: AgendaConfig | null, foto: string, exp: ExpPrev | null, forn: FornEstado = "pronto") {
  const f = c.fin;
  return `
    <header class="dhead">
      <figure class="dfoto">${foto}${c.fotoCredito && foto.startsWith("<img") ? `<figcaption>Foto: ${h(c.fotoCredito)}</figcaption>` : ""}</figure>
      <div class="num" aria-label="Número na urna">${h(c.num)}</div>
      <div>
        <h2>${h(displayName(c))}</h2>
        ${c.urna && c.urna !== c.nome ? `<p class="civil">${h(titleName(c.nome))}</p>` : ""}
        <p>${h(c.partido)} · ${h(c.cargo)} · ${h(c.uf)}</p>
        ${c.perfil ? `<p class="status">${h(STATUS[c.perfil.status].longo)}${c.perfil.casa ? ` · ${h(c.perfil.casa)}${c.perfil.desde ? ` desde ${c.perfil.desde}` : ""}` : ""}</p>` : ""}
      </div>
      <button type="button" class="close" data-close aria-label="Fechar dossiê">×</button>
    </header>
    <div class="scoreline">
      <div><span class="nota">${s.nota ?? "–"}</span><span class="muted">nota técnica com seus pesos</span></div>
      <div><span class="nota small">${pct(s.cobertura)}</span><span class="muted">do peso com evidência</span></div>
      <button type="button" class="btn-confirma" data-cola="${h(c.id)}">${inCola ? "Tirar da cola" : "Pôr na cola"}</button>
    </div>
    ${prevBlock(c, exp)}
    ${resumoBlock(c.bio)}
    ${propostaBlock(c.proposta, c.id)}
    ${registroBlock(c.motivos)}
    ${trajetoriaBlock(c)}
    ${atuacaoBlock(c.bio)}
    ${patrimonioBlock(c.patrimonio)}
    ${agendaBlock(c.mandato, agenda)}
    <section><h3>Indicadores <small>(0 a 100)</small></h3><ul class="inds">${indicatorRows(c)}</ul></section>
    <section>
      <h3>Dinheiro da campanha</h3>
      ${c.temContas === false ? `<p class="muted">Ainda sem prestação de contas no retrato do TSE.</p>` : ""}<p class="muted">${money(f.total)} arrecadados · ${int(f.doadoresPF)} doadores pessoa física · maior fonte única: ${pct(f.maiorDoador)} · ${money(f.gastos)} em gastos contratados</p>
      ${moneyBar(f)}
    </section>
    ${fornecedoresBlock(c, forn)}
    ${mandateBlock(c.mandato)}
    ${canaisBlock(c)}`;
}
