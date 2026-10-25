// HTML of the discreet "online" chip and its panel: who is watching (by the state each person chose), the cheering poll, and the push notices.
// Pure strings, so it is tested without a DOM. Neutral on purpose: one ink colour, no party colours, no claim about the vote.
import { h, int, pct } from "./format.js";
import type { Estado } from "./social-api.js";
import type { EstadoPush } from "./social-push.js";

export interface MapaUf { viewBox: [number, number, number, number]; ufs: Record<string, { d: string }> }
export interface PainelProps { estado: Estado; mapa: MapaUf | null; push: EstadoPush; pushOcupado: boolean; pushErro: string; semRastro: boolean }

export const MIN_PERCENTUAL = 10; // under this many cheers the shares would mostly show noise
const hora = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const rotuloChip = (n: number): string => `${int(n)} ${n === 1 ? "pessoa" : "pessoas"} online`;

export function chip(n: number, aberto: boolean): string {
  return `<button type="button" class="soc-chip" data-soc-abrir aria-expanded="${aberto}" aria-controls="soc-painel" aria-label="${h(`${rotuloChip(n)} na tela Ao vivo. ${aberto ? "Fechar" : "Abrir"} o painel`)}">
    <span class="soc-ponto" aria-hidden="true"></span><b id="soc-n">${int(n)}</b><span class="soc-chip-txt"> online</span></button>`;
}

function mapaOnline(porUf: Record<string, number>, mapa: MapaUf | null): string {
  const top = Object.entries(porUf).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = top[0]?.[1] ?? 0;
  const lista = top.length ? top.slice(0, 6).map(([uf, n]) => `<li><b>${h(uf)}</b> ${int(n)}</li>`).join("") : "";
  const svg = mapa && max > 0
    ? `<svg class="soc-mapa" viewBox="${mapa.viewBox.join(" ")}" aria-hidden="true" focusable="false">${Object.entries(mapa.ufs).map(([uf, s]) => {
        const n = porUf[uf] ?? 0;
        return `<path d="${h(s.d)}" style="fill-opacity:${n ? (0.18 + 0.72 * Math.sqrt(n / max)).toFixed(2) : "0.06"}"><title>${h(uf)}: ${int(n)} online</title></path>`;
      }).join("")}</svg>`
    : "";
  return `${svg}${lista ? `<ul class="soc-top" aria-label="Estados com mais gente online">${lista}</ul>` : `<p class="muted small">Ninguém informou o estado ainda.</p>`}`;
}

function torcida(e: Estado, semRastro: boolean): string {
  const t = e.torcida;
  if (!t) return "";
  const mostra = t.total >= MIN_PERCENTUAL;
  const botoes = t.opcoes.map((o) => {
    const p = t.total ? o.votos / t.total : 0;
    return `<li><button type="button" class="soc-voto" data-soc-voto="${h(o.id)}" data-foco="v-${h(o.id)}" aria-pressed="${e.meu === o.id}"${semRastro ? " disabled" : ""}>
        <span class="soc-voto-nome">${h(o.nome)} <small>${h(o.partido)}</small></span>
        ${mostra ? `<span class="soc-voto-pct">${pct(p, 0)}</span><span class="soc-barra" aria-hidden="true"><i style="width:${(p * 100).toFixed(1)}%"></i></span>` : ""}
      </button></li>`;
  }).join("");
  return `<section class="soc-bloco" aria-labelledby="soc-t-torcida"><h3 id="soc-t-torcida">Torcida do Radar <small>${h(t.corrida)}</small></h3>
    <p class="soc-nota">Enquete aberta, <b>sem valor estatístico</b>: não é pesquisa e não indica voto. Um clique por navegador; dá para mudar.</p>
    <ul class="soc-votos">${botoes}</ul>
    <p class="soc-nota">${semRastro ? "Seu navegador pede para não ser rastreado: aqui você só vê a torcida, não entra nela." : mostra ? `${int(t.total)} ${t.total === 1 ? "torcida registrada" : "torcidas registradas"}.` : "Poucos votos ainda: os percentuais aparecem a partir de " + MIN_PERCENTUAL + "."}</p></section>`;
}

function avisos(p: PainelProps): string {
  const { push, estado } = p;
  if (!estado.push && push !== "ativo") return "";
  const texto = { ativo: "Avisos ligados neste navegador", inativo: "Receber avisos de eventos importantes", bloqueado: "", indisponivel: "" }[push];
  const botao = texto ? `<button type="button" class="ghost soc-push" data-soc-push data-foco="push" aria-pressed="${push === "ativo"}"${p.pushOcupado ? " disabled" : ""}>${h(push === "ativo" ? `${texto} · desligar` : texto)}</button>` : "";
  const nota = push === "bloqueado" ? "As notificações estão bloqueadas neste navegador. Libere nas configurações do site para receber avisos."
    : push === "indisponivel" ? "Este navegador não oferece avisos push. No iPhone, adicione o Radar à tela de início e abra por lá."
    : "Um aviso quando a apuração começar, a contagem virar, passar de 50% e 90% das seções, a conta do Radar fechar uma disputa (não é a marcação do TSE) e quando o TSE marcar “Eleito”.";
  const lista = estado.eventos.length
    ? `<ol class="soc-eventos">${estado.eventos.map((v) => `<li><time>${h(hora(v.t))}</time> <span><b>${h(v.titulo)}</b><br>${h(v.texto)}</span></li>`).join("")}</ol>`
    : `<p class="soc-nota">Nenhum aviso ainda.</p>`;
  return `<section class="soc-bloco" aria-labelledby="soc-t-avisos"><h3 id="soc-t-avisos">Avisos</h3>
    <p class="soc-nota">${h(nota)}</p>${botao}${p.pushErro ? `<p class="soc-erro" role="alert">${h(p.pushErro)}</p>` : ""}${lista}</section>`;
}

export function painel(p: PainelProps): string {
  const e = p.estado;
  const semUf = e.semUf ? `<p class="soc-nota">${int(e.semUf)} ${e.semUf === 1 ? "pessoa não informou" : "pessoas não informaram"} o estado.</p>` : "";
  return `<div class="soc-cab"><h2 id="soc-t">Quem acompanha agora</h2><button type="button" class="ghost soc-x" data-soc-fechar aria-label="Fechar o painel">×</button></div>
    <p class="soc-grande"><b>${int(e.online)}</b> ${e.online === 1 ? "navegador" : "navegadores"} com a tela Ao vivo aberta</p>
    <section class="soc-bloco" aria-labelledby="soc-t-mapa"><h3 id="soc-t-mapa">Onde <small>pelo estado que cada pessoa escolheu</small></h3>${mapaOnline(e.porUf, p.mapa)}${semUf}</section>
    ${torcida(e, p.semRastro)}${avisos(p)}
    <p class="soc-nota soc-priv">Cada navegador usa um código aleatório, sem nome, e-mail, IP ou localização. O servidor guarda só a contagem do momento, a escolha da torcida e o aviso push, na memória; reiniciar apaga tudo. ${p.semRastro ? "“Não rastrear” está ligado: nada é enviado daqui." : ""}</p>`;
}

