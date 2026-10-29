// "Auditoria" tab: statistical consistency tests over the TSE section files, 2002 to 2026. The numbers come from
// web/data/auditoria/ (docs/forense/scripts + bun run radar:auditoria); this module only loads and draws them.
// The small main file loads with the tab; the three big ones (fingerprint grid, municipal map, governors) only when their section opens.
import { h } from "./format.js";
import { keepFocus } from "./focus.js";
import { aguardando, biometriaView, eleicaoView, governosView, investigaView, mapaVotoView, metodoView, poderView, populacaoView, resumoView, SECOES, semDados } from "./auditoria-view.js";
import type { MapaCtx } from "./auditoria-view.js";
import type { Auditoria, Governador, Impressao, MapaVoto, PontoMunicipio } from "./auditoria-tipos.js";

export const DADOS = "data/auditoria";
type Ler = <T>(caminho: string) => Promise<T>;
const lerJson: Ler = async <T>(caminho: string) => {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`${r.status} ${caminho}`);
  return (await r.json()) as T;
};

export interface Estado { sec: string; eleicao: string; urna: string; ano: string; gturno: number; gsel: string | null; bio: string; mv: string }
export const estadoInicial = (): Estado => ({ sec: "resumo", eleicao: "2022-1", urna: "2022-1", ano: "2022", gturno: 1, gsel: null, bio: "2022-1", mv: "2022-2" });

export function mountAuditoria(root: HTMLElement, ler: Ler = lerJson) {
  const st = estadoInicial();
  let dados: Auditoria | null = null, falhou = false, aberto = false;
  const extra: { imp?: Impressao; mapa?: MapaCtx; gov?: Governador[]; mv?: MapaVoto } = {};
  const pedidos = new Map<string, Promise<void>>(); // one request per file; a failure is forgotten, so the next draw asks again

  const pedir = (chave: string, quando: () => Promise<void>): void => {
    if (pedidos.has(chave)) return;
    pedidos.set(chave, quando().then(() => { if (aberto) desenhar(); }).catch(() => { pedidos.delete(chave); }));
  };

  // What the open section still needs, fetched once the main file is in.
  const garantir = () => {
    if (st.sec === "eleicao") pedir("imp", async () => { extra.imp = await ler<Impressao>(`${DADOS}/impressao.json`); });
    if (st.sec === "governos") pedir("gov", async () => { extra.gov = await ler<Governador[]>(`${DADOS}/governadores.json`); });
    if (st.sec === "populacao" || st.sec === "mapavoto") {
      pedir("mapa", async () => {
        const [pontos, uf] = await Promise.all([ler<PontoMunicipio[]>(`${DADOS}/mapa.json`), ler<{ viewBox: number[]; ufs: Record<string, { d: string }> }>("mapa-uf.json")]);
        extra.mapa = { pontos, ufs: uf.ufs, viewBox: uf.viewBox };
      });
    }
    if (st.sec === "mapavoto") pedir("mv", async () => { extra.mv = await ler<MapaVoto>(`${DADOS}/mapa-voto.json`); });
  };

  const corpo = (): string => {
    if (!dados) return falhou ? semDados() : aguardando("a auditoria");
    switch (st.sec) {
      case "eleicao": return eleicaoView(dados, extra.imp ?? null, st.eleicao);
      case "investiga": return investigaView(dados, st.urna);
      case "populacao": return populacaoView(dados, extra.mapa ?? null, st.ano);
      case "mapavoto": return mapaVotoView(extra.mv ?? null, extra.mapa ?? null, st.mv);
      case "governos": return extra.gov ? governosView(extra.gov, st.gturno, st.gsel) : aguardando("os governadores");
      case "biometria": return biometriaView(dados, st.bio);
      case "poder": return poderView(dados);
      case "metodo": return metodoView(dados);
      default: return resumoView(dados);
    }
  };

  const moldura = () => `<section class="exp-card pan au-root" aria-labelledby="aud-t">
    <h2 id="aud-t">Auditoria <small>boletins de urna, 2002 a 2026</small></h2>
    <p class="muted au-aviso">Inconsistência estatística não é fraude. Cada item "para conferir" é um fato verificável nos dados públicos do TSE, sem acusação a pessoa ou instituição. Resultado sem sinal também não prova integridade: veja o que os testes enxergam em "Poder dos testes".</p>
    <div class="pan-seg au-sec-nav" role="group" aria-label="Seção da auditoria">${SECOES.map(([k, nome]) => `<button type="button" data-aud-sec="${h(k)}" aria-pressed="${k === st.sec}">${h(nome)}</button>`).join("")}</div>
    <div class="au-corpo">${corpo()}</div></section>`;

  function desenhar() {
    keepFocus(root, () => { root.innerHTML = moldura(); });
    if (dados) garantir();
  }

  const carregar = () => {
    if (dados || pedidos.has("main")) return;
    pedidos.set("main", ler<Auditoria>(`${DADOS}/auditoria.json`).then((d) => { dados = d; falhou = false; }).catch(() => { falhou = true; pedidos.delete("main"); }).then(() => { if (aberto) desenhar(); }));
  };

  root.addEventListener("click", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-aud-sec],[data-aud-go],[data-aud-eleicao],[data-aud-urna],[data-aud-ano],[data-aud-gturno],[data-aud-gsel],[data-aud-bio],[data-aud-mv]");
    if (!alvo) return;
    const d = alvo.dataset;
    if (d.audSec) st.sec = d.audSec;
    else if (d.audGo) { st.sec = "eleicao"; st.eleicao = d.audGo; }
    else if (d.audEleicao) st.eleicao = d.audEleicao;
    else if (d.audUrna) st.urna = d.audUrna;
    else if (d.audAno) st.ano = d.audAno;
    else if (d.audGturno) { st.gturno = Number(d.audGturno); st.gsel = null; }
    else if (d.audGsel) st.gsel = d.audGsel;
    else if (d.audBio) st.bio = d.audBio;
    else if (d.audMv) st.mv = d.audMv;
    desenhar();
    if (d.audGo) root.querySelector<HTMLElement>(".au-root")?.scrollIntoView({ block: "start" });
  });

  return {
    show() { aberto = true; carregar(); desenhar(); },
    hide() { aberto = false; },
    /** For tests: the section the tab is on. */
    get secao() { return st.sec; },
  };
}
