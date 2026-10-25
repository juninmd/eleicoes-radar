// "Boletim de Urna" view: the official TSE BU aggregated per municipality, and the live partial while the
// BU of the round is not published. It never calls a partial result the official BU and never infers a winner.
import { h, int, pct, titleName } from "./format.js";
import type { SnapView } from "./apuracao.js";
import type { Cargo, Turno } from "./apuracao-tse.js";

export interface BuCandidato { nr: string; nome: string; partido: string; votos: number }
export interface BuMunicipio {
  cd: string;
  nome: string;
  secoes: number;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  brancos: number;
  nulos: number;
  candidatos: BuCandidato[];
}
export interface BuTotal {
  secoes: number;
  aptos: number;
  comparecimento: number;
  abstencoes: number;
  brancos: number;
  nulos: number;
  candidatos: BuCandidato[];
}
export interface BuData {
  ano: number;
  turno: 1 | 2;
  uf: string;
  cargo: Cargo;
  geradoEm: string;
  buGeradoEm: string | null;
  recebidoAte: string | null;
  fonte: string;
  fonteUrl: string;
  municipios: BuMunicipio[];
  total: BuTotal;
}

export interface BuProps {
  bu?: BuData | null;
  carregando?: boolean;
  snap?: SnapView | null;
  cargo: Cargo;
  uf: string; // state of the BU table
  raceUf: string; // state of the open race ("BR" for the President)
  turno: Turno;
  busca?: string;
  limit?: number;
  ufOpcoes?: string[];
}

const URL_DATASET = (ano: number) => `https://dadosabertos.tse.jus.br/dataset/resultados-${ano}-boletim-de-urna`;
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const turnoNome = (t: number) => (t === 2 ? "2º turno" : "1º turno");
const dataBr = (s: string | null) => {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : s;
};
const cel = (n: number) => int(Math.round(n));
const filtros = (busca: string) => `<div class="bu-filtros"><label class="field" for="bu-busca">Buscar município<input type="search" id="bu-busca" value="${h(busca)}" placeholder="ex.: São Paulo" autocomplete="off"></label></div>`;

function cards(total: BuTotal): string {
  const comp = total.aptos > 0 ? total.comparecimento / total.aptos : 0;
  return `<div class="bu-cards">
    <div><b>${int(total.secoes)}</b><span>seções</span></div>
    <div><b>${cel(total.aptos)}</b><span>eleitores aptos</span></div>
    <div><b>${cel(total.comparecimento)}</b><span>comparecimento (${pct(comp, 1)})</span></div>
    <div><b>${cel(total.abstencoes)}</b><span>abstenções</span></div>
    <div><b>${cel(total.brancos)}</b><span>brancos</span></div>
    <div><b>${cel(total.nulos)}</b><span>nulos</span></div>
  </div>`;
}

function comparacao(bu: BuData, snap: SnapView | null | undefined, raceUf: string): string {
  const d = snap?.dados;
  if (!d || raceUf !== bu.uf || bu.turno !== 1 || d.cargo.nome !== bu.cargo) return "";
  const difs = bu.total.candidatos.map((c) => {
    const tse = d.candidatos.find((x) => x.num === c.nr);
    return tse ? c.votos - tse.votos : null;
  }).filter((x): x is number => x !== null);
  if (!difs.length) return "";
  const soma = difs.reduce((a, b) => a + b, 0);
  const iguais = difs.every((x) => x === 0);
  return iguais
    ? `<p class="bu-confere"><b>Confere com o TSE:</b> a soma dos candidatos no BU é igual à do arquivo de resultados.</p>`
    : `<p class="bu-difere"><b>Difere do TSE em ${int(Math.abs(soma))} votos.</b> O arquivo do TSE e o BU podem ser de momentos diferentes; confira os horários antes de tratar como divergência.</p>`;
}

function tabela(bu: BuData, busca: string, limit: number): string {
  const top = bu.total.candidatos.slice(0, 5);
  const filtro = semAcento(busca.trim());
  const todos = filtro ? bu.municipios.filter((m) => semAcento(m.nome).includes(filtro)) : bu.municipios;
  const rows = todos.slice(0, Math.max(1, limit));
  const cols = top.map((c) => `<th scope="col">${h(titleName(c.nome))}<small>${h(c.partido)}</small></th>`).join("");
  const corpo = rows.map((m) => {
    const vals = top.map((c) => m.candidatos.find((x) => x.nr === c.nr)?.votos ?? 0);
    const comp = m.aptos > 0 ? m.comparecimento / m.aptos : 0;
    return `<tr><th scope="row">${h(titleName(m.nome))}</th><td>${int(m.secoes)}</td><td>${pct(comp, 1)}</td><td>${cel(m.abstencoes)}</td><td>${cel(m.brancos)}</td><td>${cel(m.nulos)}</td>${vals.map((v) => `<td><b>${cel(v)}</b></td>`).join("")}</tr>`;
  }).join("");
  const vals = top.map((c) => bu.total.candidatos.find((x) => x.nr === c.nr)?.votos ?? 0);
  const totalComp = bu.total.aptos > 0 ? bu.total.comparecimento / bu.total.aptos : 0;
  return `<div class="scroll bu-tabela-wrap"><table class="apu-tabela bu-tabela">
    <caption class="sr">Votos do Boletim de Urna por município, com comparecimento, abstenções, brancos, nulos e os principais candidatos</caption>
    <thead><tr><th scope="col">Município</th><th scope="col">Seções</th><th scope="col">Comp.</th><th scope="col">Abst.</th><th scope="col">Brancos</th><th scope="col">Nulos</th>${cols}</tr></thead>
    <tbody>${corpo || `<tr><td colspan="${6 + top.length}" class="muted">Nenhum município encontrado.</td></tr>`}</tbody>
    <tfoot><tr><th scope="row">Total (${int(bu.municipios.length)} municípios)</th><td>${int(bu.total.secoes)}</td><td>${pct(totalComp, 1)}</td><td>${cel(bu.total.abstencoes)}</td><td>${cel(bu.total.brancos)}</td><td>${cel(bu.total.nulos)}</td>${vals.map((v) => `<td><b>${cel(v)}</b></td>`).join("")}</tr></tfoot>
  </table></div>
  <p class="muted small">Mostrando ${int(rows.length)} de ${int(todos.length)} municípios.${todos.length > rows.length ? ` Use a busca ou "Ver mais" para chegar aos demais.` : ""}</p>
  ${todos.length > rows.length ? `<button type="button" id="bu-mais" class="ghost">Ver mais municípios</button>` : ""}`;
}

export function renderBu({ bu, carregando = false, snap, cargo, uf, raceUf, turno, busca = "", limit = 40, ufOpcoes = [] }: BuProps): string {
  const seletor = ufOpcoes.length ? `<label class="field bu-uf" for="bu-uf">Estado do BU<select id="bu-uf">${ufOpcoes.map((u) => `<option value="${h(u)}"${u === uf ? " selected" : ""}>${h(u)}</option>`).join("")}</select></label>` : "";
  const oficial = bu && bu.turno === turno;
  const ref = bu && !oficial ? `<details class="bu-ref"><summary>Boletim de Urna do ${turnoNome(bu.turno)} do ${h(bu.uf)} (referência)</summary>
    <p class="muted small">Este é o BU oficial do ${turnoNome(bu.turno)}, não do ${turnoNome(turno)}. Ele fica aqui como referência até o TSE publicar o BU deste turno.</p>
    ${cards(bu.total)}${filtros(busca)}${tabela(bu, busca, limit)}
    <p class="muted small">Fonte: <a href="${h(bu.fonteUrl || URL_DATASET(bu.ano))}" rel="noopener noreferrer" target="_blank">${h(bu.fonte)}</a>.</p></details>` : "";
  if (oficial && bu) {
    return `<section class="bu" aria-labelledby="bu-t">
      <div class="bu-topo"><div><h3 id="bu-t">Boletim de Urna <small>${h(bu.cargo)} · ${h(bu.uf)} · ${turnoNome(bu.turno)}</small></h3>
        <p class="muted small">${h(bu.fonte)} · ${bu.buGeradoEm ? `arquivo de ${h(bu.buGeradoEm)}` : "arquivo oficial"}${bu.recebidoAte ? ` · último BU recebido em ${h(dataBr(bu.recebidoAte))}` : ""}</p></div><span class="rot alta">Oficial</span></div>
      ${seletor}
      ${cards(bu.total)}
      ${comparacao(bu, snap, raceUf)}
      ${filtros(busca)}
      ${tabela(bu, busca, limit)}
      <p class="muted small">O BU é o boletim impresso em cada urna, publicado pelo TSE; os totais são a soma dos municípios. Fonte: <a href="${h(bu.fonteUrl || URL_DATASET(bu.ano))}" rel="noopener noreferrer" target="_blank">dados abertos do TSE</a>. Compare com o parcial do estado na aba Placar.</p>
    </section>`;
  }
  const d = snap?.dados;
  const parcial = `<div class="bu-parcial">
    <div class="bu-topo"><div><h3>Parcial do ${raceUf === "BR" ? "país" : `estado (${h(raceUf)})`} <small>${h(cargo)} · ${turnoNome(turno)}</small></h3>
      <p class="muted small">${carregando ? "Carregando o Boletim de Urna…" : "O TSE ainda não publicou o BU por município deste turno. Até o arquivo oficial chegar, estes são os números do arquivo de resultados."}</p></div>
      <span class="rot aberta">Parcial</span></div>
    ${d ? `${cards({ secoes: d.secoes.totalizadas, aptos: d.eleitorado.apurado, comparecimento: d.eleitorado.comparecimento, abstencoes: d.eleitorado.abstencao, brancos: d.votos.brancos, nulos: d.votos.nulos, candidatos: [] })}
      <ul class="bu-cands">${d.candidatos.slice(0, 5).map((c) => `<li><span>${h(titleName(c.nome))} <small>${h(c.partido)}</small></span><b>${int(c.votos)}</b><span>${pct(c.pct, 1)}</span></li>`).join("")}</ul>
      <p class="muted small">${pct(d.secoes.totalizadas / Math.max(1, d.secoes.total), 1)} das seções totalizadas neste arquivo.</p>`
      : `<p class="empty">Consultando o TSE…</p>`}
    ${raceUf === "BR" ? `<p class="muted small">Para o Presidente, o parcial acima é nacional; o BU por município é de um estado e aparece quando o TSE publicar o arquivo. Use o seletor de estado para ver o BU do 1º turno.</p>` : ""}
  </div>`;
  return `<section class="bu" aria-labelledby="bu-t"><h3 id="bu-t" class="sr">Boletim de Urna</h3>${seletor}${parcial}${ref}</section>`;
}


