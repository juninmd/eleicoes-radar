// bun run radar:camara [--max 24] [--dias 10]
// Collects the data of the "Câmara" tab from dadosabertos.camara.leg.br/api/v2 (no key): the latest roll-call votes of the Plenário (with the
// leaders' orientation), the agenda of the next days, the history of the bills voted, plus deputy photos and party logos as local data: URIs
// (the page CSP only allows 'self' and data: images). Writes web/data/camara/{painel,fotos,partidos}.json (outside git, deployed with web/data).
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { formarEvento, formarProposicao, formarVotacao, NOMINAL, novoDicionario } from "./painel-forma.js";
import type { AfetadaApi, EventoApi, OrientApi, PautaApi, ProposicaoApi, TramApi, VotacaoApi, VotoApi } from "./painel-forma.js";
import type { EventoPauta, FotosCamara, PainelCamara, PartidosCamara, Proposicao, VotacaoCamara } from "./painel-tipos.js";

const API = "https://dadosabertos.camara.leg.br/api/v2";
const OUT = "web/data/camara";
const PLENARIO = 180;
const JANELA_DIAS = 85; // /votacoes refuses a range longer than 3 months
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (nome: string, padrao: number) => { const i = process.argv.indexOf(`--${nome}`); return i > 0 ? Number(process.argv[i + 1]) || padrao : padrao; };
const dia = (d: Date) => d.toISOString().slice(0, 10);

// The API answers 504 now and then (deputados, partidos, blocos): wait longer each time. A 4xx is a real error and is not retried.
async function bruto(url: string, tipo: "json" | "bin"): Promise<ArrayBuffer | unknown> {
  let ultimo = "";
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: tipo === "json" ? "application/json" : "*/*" } });
      if (r.ok) return tipo === "json" ? await r.json() : await r.arrayBuffer();
      if (r.status >= 400 && r.status < 500) throw new Error(`${r.status} ${url}`);
      ultimo = `${r.status}`;
    } catch (e) {
      if (/^4\d\d /.test((e as Error).message)) throw e;
      ultimo = (e as Error).message;
    }
    await esperar(1500 * 2 ** i);
  }
  throw new Error(`falhou (${ultimo}): ${url}`);
}
const dados = async <T>(caminho: string): Promise<T> => ((await bruto(`${API}/${caminho}`, "json")) as { dados: T }).dados;

async function emParalelo<T, R>(itens: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => { while (i < itens.length) { const k = i++; out[k] = await f(itens[k]!); } }));
  return out;
}

async function nominais(max: number): Promise<VotacaoApi[]> {
  const achadas: VotacaoApi[] = [];
  let fim = new Date();
  for (let j = 0; j < 14 && achadas.length < max; j++) { // up to ~3 years back, about one legislature
    const ini = new Date(fim.getTime() - JANELA_DIAS * 864e5);
    for (let pag = 1; achadas.length < max; pag++) {
      const lote = await dados<VotacaoApi[]>(`votacoes?dataInicio=${dia(ini)}&dataFim=${dia(fim)}&idOrgao=${PLENARIO}&itens=100&pagina=${pag}&ordenarPor=dataHoraRegistro&ordem=DESC`);
      achadas.push(...lote.filter((v) => NOMINAL.test(v.descricao ?? "")));
      if (lote.length < 100) break;
    }
    fim = new Date(ini.getTime() - 864e5);
  }
  return achadas.slice(0, max);
}

async function imagem(url: string | null | undefined, largura: number, altura: number, fit: "cover" | "contain", formato: "jpeg" | "png"): Promise<string | null> {
  if (!url || !/^https:\/\/www\.camara\.leg\.br\//.test(url)) return null; // only the Câmara's own host is fetched and embedded
  try {
    const bin = Buffer.from((await bruto(url, "bin")) as ArrayBuffer);
    const s = sharp(bin).resize(largura, altura, { fit, ...(fit === "cover" ? { position: "attention" } : { background: { r: 0, g: 0, b: 0, alpha: 0 } }) });
    const buf = formato === "jpeg" ? await s.jpeg({ quality: 72, mozjpeg: true }).toBuffer() : await s.png({ palette: true }).toBuffer();
    return `data:image/${formato};base64,${buf.toString("base64")}`;
  } catch { return null; } // a missing photo or logo falls back to initials or the party sigla on the page
}

async function main() {
  const max = arg("max", 24), diasPauta = arg("dias", 10);
  const dic = novoDicionario();
  console.log(`[camara] votações nominais do Plenário (até ${max})…`);
  const lista = await nominais(max);
  const votacoes = (await emParalelo(lista, 4, async (v) => {
    const [det, votos, orient] = await Promise.all([dados<VotacaoApi & { proposicoesAfetadas?: AfetadaApi[] }>(`votacoes/${v.id}`), dados<VotoApi[]>(`votacoes/${v.id}/votos`), dados<OrientApi[]>(`votacoes/${v.id}/orientacoes`)]);
    return formarVotacao({ ...det, aprovacao: v.aprovacao ?? det.aprovacao }, votos, orient, dic);
  })).filter((v): v is VotacaoCamara => v !== null);
  console.log(`[camara] ${votacoes.length} votações, ${dic.lista.length} deputados, ${dic.siglas.length} partidos`);

  console.log("[camara] pauta dos próximos dias…");
  const hoje = new Date();
  const eventos = await dados<EventoApi[]>(`eventos?dataInicio=${dia(hoje)}&dataFim=${dia(new Date(hoje.getTime() + diasPauta * 864e5))}&itens=100&ordenarPor=dataHoraInicio&ordem=ASC`);
  const pauta: EventoPauta[] = await emParalelo(eventos, 6, async (e) => formarEvento(e, await dados<PautaApi[]>(`eventos/${e.id}/pauta`).catch(() => [])));

  console.log("[camara] tramitação dos projetos votados…");
  const ids = [...new Set(votacoes.map((v) => v.prop?.id).filter((x): x is number => !!x))].slice(0, 8);
  const proposicoes: Proposicao[] = await emParalelo(ids, 4, async (id) => {
    const [p, tram, aut, temas] = await Promise.all([dados<ProposicaoApi>(`proposicoes/${id}`), dados<TramApi[]>(`proposicoes/${id}/tramitacoes`), dados<{ nome: string; tipo?: string }[]>(`proposicoes/${id}/autores`), dados<{ tema: string }[]>(`proposicoes/${id}/temas`)]);
    return formarProposicao(p, tram, aut, temas);
  });

  const painel: PainelCamara = { geradoEm: dia(hoje), deputados: dic.lista, partidos: dic.siglas, votacoes, pauta, proposicoes };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/painel.json`, JSON.stringify(painel));

  console.log("[camara] logos dos partidos…");
  const lista57 = await dados<{ id: number; sigla: string }[]>("partidos?idLegislatura=57&itens=100");
  const partidos: PartidosCamara = {};
  await emParalelo(dic.siglas, 6, async (sigla) => {
    const base = lista57.find((p) => p.sigla === sigla);
    const det = base ? await dados<{ nome: string; urlLogo?: string | null }>(`partidos/${base.id}`).catch(() => null) : null;
    partidos[sigla] = { nome: det?.nome ?? sigla, logo: await imagem(det?.urlLogo, 96, 64, "contain", "png") };
  });
  writeFileSync(`${OUT}/partidos.json`, JSON.stringify(partidos));

  console.log(`[camara] fotos de ${dic.lista.length} deputados…`);
  const fotos: FotosCamara = {};
  await emParalelo(dic.lista, 8, async ([id]) => {
    const f = await imagem(`https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`, 80, 100, "cover", "jpeg");
    if (f) fotos[String(id)] = f;
  });
  writeFileSync(`${OUT}/fotos.json`, JSON.stringify(fotos));
  const sem = dic.lista.length - Object.keys(fotos).length;
  console.log(`[camara] pronto: painel.json, partidos.json (${Object.values(partidos).filter((p) => p.logo).length}/${dic.siglas.length} logos), fotos.json (${sem} sem foto)`);
}

if (import.meta.main) main().catch((e) => { console.error(e); process.exit(1); });
