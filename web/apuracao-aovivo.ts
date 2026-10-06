// "Ao vivo": every race of the voter's ballot at once (President, Governor, Senator and the deputies of the chosen state), each one
// with its own TSE file, plus one timeline of who has been elected across all of them. It reads the same files as the Apuração tab and
// adds no arithmetic of its own beyond what apuracao-eleito.js already proves; the TSE's text wins everywhere. In memory only.
import { h, int, pct, titleName } from "./format.js";
import { createFeed, POLL_MS } from "./apuracao-feed.js";
import { tseUrl } from "./apuracao-tse.js";
import { decididos, eleitoTse } from "./apuracao-eleito.js";
import { atualizar, vazio } from "./apuracao-eleitos.js";
import { idadeTxt, pausaDoTse } from "./apuracao-ritmo.js";
import { repaint, relogio, idade, semRelogio } from "./apuracao-dom.js";
import { avancoDe } from "./apuracao-nacional.js";
import type { Apuracao, Cargo, Fase } from "./apuracao-tse.js";
import type { FeedSnapshot } from "./apuracao-feed.js";
import type { EstadoEleitos } from "./apuracao-eleitos.js";

export interface Corrida { cargo: Cargo; uf: string }
export interface Linha extends Corrida { snap: FeedSnapshot | null; eleitos: EstadoEleitos }

const FASES: Record<Fase, string> = { aguardando: "Aguardando", parcial: "Em andamento", concluida: "Concluída" };
const proporcional = (c: Cargo) => /^Deputado/.test(c);
const MAX_LINHA = 20;

// The five races a voter in `uf` sees on the ballot. The Federal District has no state deputies: it elects district ones.
export const corridasDe = (uf: string): Corrida[] => [
  { cargo: "Presidente", uf: "BR" }, { cargo: "Governador", uf }, { cargo: "Senador", uf }, { cargo: "Deputado Federal", uf },
  { cargo: uf === "DF" ? "Deputado Distrital" : "Deputado Estadual", uf },
];

const pctSecoes = ({ totalizadas, total }: Apuracao["secoes"]) => pct(total > 0 ? (totalizadas >= total ? 1 : Math.floor((totalizadas / total) * 1000) / 1000) : 0, 1);

function topo(d: Apuracao, cargo: Cargo, uf: string): string {
  const dec = decididos(d, cargo, uf);
  const lista = d.candidatos.slice(0, 3).map((c, i) => {
    const marca = eleitoTse(c) ? `<span class="rot alta">${h(c.situacao)}</span>` : dec.has(c.id) && !c.situacao ? `<span class="rot alta mat">Matematicamente eleito(a) <small>(conta do Radar)</small></span>` : c.situacao ? `<span class="rot baixa">${h(c.situacao)}</span>` : "";
    return `<li><span class="live-nome"><b>${h(titleName(c.nome))}</b> <small>${h(c.partido)}</small> ${marca}</span>
      <span class="live-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, c.pct * 100))}%;${i === 0 ? "" : "opacity:.65"}"></i></span><b class="live-pct">${pct(c.pct, 1)}</b></li>`;
  });
  return `<ol class="live-top">${lista.join("")}</ol>`;
}

function resumo(d: Apuracao, cargo: Cargo): string {
  const [a, b] = d.candidatos;
  if (proporcional(cargo)) {
    const n = d.candidatos.filter(eleitoTse).length;
    return `<b>${int(n)}</b> de ${int(d.cargo.vagas)} ${d.cargo.vagas === 1 ? "vaga" : "vagas"} com situação de eleito no TSE.`;
  }
  if (!a?.votos) return "";
  if (d.cargo.vagas > 1) return `${int(d.cargo.vagas)} vagas: os mais votados até agora.`;
  return b ? `Diferença de <b>${((a.pct - b.pct) * 100).toFixed(1).replace(".", ",")} p.p.</b> entre os dois primeiros${a.pct < 0.5 ? `; faltam ${((0.5 - a.pct) * 100).toFixed(1).replace(".", ",")} p.p. para o 1º chegar a 50%` : ""}.` : "";
}

function card({ cargo, uf, snap, eleitos }: Linha): string {
  const d = snap?.dados;
  const local = uf === "BR" ? "Brasil" : uf;
  const chave = `${cargo}|${uf}`;
  const abrir = `<button type="button" class="ghost live-abrir" data-abrir-corrida="${h(chave)}">Abrir a apuração</button>`;
  if (!d) {
    const msg = snap?.status === "ausente" ? "O TSE ainda não publicou o arquivo desta disputa." : snap?.status === "erro" ? `Não foi possível consultar o TSE: ${h(snap.erro)}.` : "Consultando o TSE…";
    return `<article class="live-card" aria-label="${h(cargo)} ${h(local)}"><header><h3>${h(cargo)} <small>${h(local)}</small></h3></header><p class="muted small">${msg}</p>${abrir}</article>`;
  }
  const velha = snap!.status === "erro" || snap!.status === "ausente";
  const tse = eleitos.itens.filter((e) => e.tipo === "tse").length;
  return `<article class="live-card" aria-label="${h(cargo)} ${h(local)}">
    <header><h3>${h(cargo)} <small>${h(local)}</small></h3><span class="rot ${d.fase === "parcial" ? "aberta" : d.fase === "concluida" ? "alta" : "baixa"}">${FASES[d.fase]}</span></header>
    ${velha ? `<p class="apu-aviso small"><b>Números desatualizados:</b> o TSE não entregou o arquivo agora; vale o último recebido.</p>` : ""}
    <progress class="apu-prog" max="${d.secoes.total || 1}" value="${d.secoes.totalizadas}" aria-label="Seções totalizadas">${pctSecoes(d.secoes)}</progress>
    <p class="exp-meta"><b>${pctSecoes(d.secoes)}</b> das seções · arquivo de ${h(d.versao.hora.slice(0, 5))}</p>
    ${d.fase === "aguardando" ? `<p class="muted small">A apuração ainda não começou nesta disputa.</p>` : `${topo(d, cargo, uf)}<p class="live-res">${resumo(d, cargo)}</p>`}
    ${tse ? `<p class="small"><b>${int(tse)}</b> ${tse === 1 ? "candidato marcado" : "candidatos marcados"} "Eleito" pelo TSE.</p>` : ""}
    ${abrir}</article>`;
}

// One timeline across the races: newest hour on top. Hours are "HH:MM" of the same night, so a string sort is enough.
function linhaGeral(linhas: Linha[]): string {
  const itens = linhas.flatMap((l) => l.eleitos.itens.map((e) => ({ ...e, onde: `${l.cargo}${l.uf === "BR" ? "" : ` · ${l.uf}`}` })));
  itens.sort((a, b) => b.hora.localeCompare(a.hora));
  if (!itens.length) return `<p class="empty">Ninguém tem situação de eleito ainda em nenhuma disputa. Esta linha preenche sozinha a cada arquivo novo do TSE.</p>`;
  return `<ol class="apu-linha" aria-label="Quem foi eleito, do mais recente ao mais antigo">${itens.slice(0, MAX_LINHA).map((e) => `<li class="${e.tipo}"><time>${h(e.hora)}</time>
    <span><b>${h(titleName(e.nome))}</b> <small>${h(e.partido)} · ${h(e.onde)}</small>
    <em>${e.tipo === "tse" ? 'O TSE marcou "Eleito"' : "Matematicamente eleito (conta do Radar, não é a marcação do TSE)"}${e.ja ? " · já constava quando você abriu a aba" : ""} · com ${pct(Math.floor(e.avanco * 1000) / 1000, 1)} das seções</em></span></li>`).join("")}</ol>
    ${itens.length > MAX_LINHA ? `<p class="muted small">Mostrando as ${MAX_LINHA} mais recentes de ${int(itens.length)}.</p>` : ""}`;
}

export function renderAoVivo({ linhas, agora }: { linhas: Linha[]; agora: Date }): string {
  const dados = linhas.map((l) => l.snap?.dados ?? null);
  const ativos = dados.filter((d): d is Apuracao => !!d && d.fase !== "aguardando");
  const media = ativos.length ? ativos.reduce((s, d) => s + avancoDe(d.secoes), 0) / ativos.length : 0;
  const pausa = ativos.some((d) => d.fase === "parcial") ? pausaDoTse(ativos, agora) : null;
  const consultas = linhas.map((l) => l.snap?.buscadoEm).filter((x): x is Date => !!x);
  const quando = consultas.length ? new Date(Math.max(...consultas.map((x) => x.getTime()))) : null;
  return `<section class="exp-card apu live" aria-labelledby="live-t">
    <h2 id="live-t">Ao vivo <span class="rot aberta">${ativos.length} de ${linhas.length} disputas com apuração</span></h2>
    <p class="muted exp-meta">${quando ? `Consultado às <span id="apu-quando">${h(quando.toLocaleTimeString("pt-BR"))}</span> · ` : ""}atualiza sozinho a cada ${POLL_MS / 1000} s enquanto você estiver nesta aba. Média das seções totalizadas: <b>${pct(Math.floor(media * 1000) / 1000, 1)}</b>${pausa ? ` · arquivo mais recente <span id="apu-idade">(${idadeTxt(pausa.idadeMs)})</span>` : ""}.</p>
    ${pausa?.parado ? `<p class="apu-aviso apu-pausa"><b>Sem arquivo novo do TSE há mais de 10 minutos.</b> A pausa é do TSE, que publica em rodadas.</p>` : ""}
    <div class="live-grid">${linhas.map(card).join("")}</div>
    <h3>Quem foi eleito <small>em todas as disputas, desde que você abriu a aba</small></h3>
    ${linhaGeral(linhas)}
    <p class="muted small">Cada cartão mostra os números do TSE e o texto de situação que ele publica; o Radar não projeta vencedor. "Matematicamente eleito" é uma conta do Radar sobre os números do TSE (Presidente nacional, Governador e Senado). Nada fica guardado ao fechar a aba. Fonte: <a href="https://resultados.tse.jus.br/" rel="noopener" target="_blank">resultados.tse.jus.br</a>.</p>
  </section>`;
}

export function mountAoVivo(el: HTMLElement) {
  let linhas: Linha[] = [];
  let feeds: ReturnType<typeof createFeed>[] = [];
  let ctx: { uf: string; abrir: (cargo: Cargo, uf: string) => void } | null = null;
  let painted: string | null = null;

  const paint = () => {
    if (!ctx) return;
    const html = renderAoVivo({ linhas, agora: new Date() });
    const key = semRelogio(html);
    const quando = el.querySelector<HTMLElement>("#apu-quando");
    if (key === painted && quando) {
      quando.textContent = relogio(html) ?? quando.textContent;
      const i = el.querySelector<HTMLElement>("#apu-idade");
      if (i) i.textContent = idade(html) ?? i.textContent;
      return;
    }
    painted = key;
    repaint(el, html);
  };

  const parar = () => { feeds.forEach((f) => f.stop()); feeds = []; linhas = []; painted = null; };

  el.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-abrir-corrida]");
    if (!t || !ctx) return;
    const [cargo, uf] = t.dataset.abrirCorrida!.split("|");
    ctx.abrir(cargo as Cargo, uf);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) feeds.forEach((f) => f.refresh()); });

  return {
    show(next: { uf: string; abrir: (cargo: Cargo, uf: string) => void }) {
      if (ctx && ctx.uf === next.uf && feeds.length) { ctx = next; paint(); return; }
      parar();
      ctx = next;
      linhas = corridasDe(next.uf).map((c) => ({ ...c, snap: null, eleitos: vazio() }));
      feeds = linhas.map((l, i) => {
        const f = createFeed({
          onChange: (s) => {
            const novo = { ...linhas[i], snap: s };
            if (s.dados && s.status === "ok") novo.eleitos = atualizar(novo.eleitos, s.dados, { cargo: l.cargo, uf: l.uf });
            linhas = linhas.map((x, k) => (k === i ? novo : x));
            paint();
          },
        });
        f.follow(tseUrl(l.cargo, l.uf));
        return f;
      });
      paint();
    },
    hide() { parar(); ctx = null; el.innerHTML = ""; },
  };
}
