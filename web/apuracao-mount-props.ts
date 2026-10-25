// The props of the views that read the municipal files of a runoff race (data/municipal/): Cidades, Chance ao vivo and Exterior.
// Pure of the DOM: the mount hands over its state and gets the props back.
import { pesquisaDoPar } from "./apuracao-municipios.js";
import { turnoDe } from "./apuracao-tse.js";
import type { createChance } from "./apuracao-chance.js";
import type { Contexto } from "./apuracao-mount.js";
import type { RenderProps } from "./apuracao.js";
import type { FeedSnapshot } from "./apuracao-feed.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";
import type { Cargo, Turno } from "./apuracao-tse.js";
import type { MunArquivo, MunIndice } from "./apuracao-municipios.js";
import type { Disputa } from "./apuracao-municipios-view.js";
import type { Quem } from "./apuracao-chance-view.js";

export interface EstadoMun {
  ctx: Contexto; turno: Turno; snap: FeedSnapshot | null; nac: BrasilSnapshot | null;
  indice: MunIndice | null | undefined; // undefined: not asked yet; null: it failed
  disputa: Disputa | null; arquivo: MunArquivo | null | undefined;
  simulado: boolean; idSim: (cargo: Cargo, uf: string, num: string) => string | null; // the fictional id of a real candidate number
}

// The live chance of a runoff: the municipal file gives the prior, the TSE files (or the simulated ones) the count.
export function chanceProps(e: EstadoMun, leitor: ReturnType<typeof createChance>): RenderProps["chance"] {
  const { ctx, snap, nac, indice, disputa, arquivo: arq } = e;
  if (turnoDe(ctx.cargo, e.turno) !== 2) return null;
  if (indice && !disputa) return { estado: "sem-disputa" };
  if (!indice || !arq) return { estado: "carregando" };
  const cargo = ctx.cargo as "Presidente" | "Governador";
  const presidente = cargo === "Presidente";
  const [idA, idB] = e.simulado ? [e.idSim(cargo, ctx.uf, arq.a.n), e.idSim(cargo, ctx.uf, arq.b.n)] : [arq.a.sq, arq.b.sq];
  // The president's chance sums the 28 files: it waits for every one to answer once, like the Projeção.
  if (!idA || !idB || (presidente && !(nac && nac.ciclo >= 1))) return { estado: "carregando" };
  const fontes: [string, FeedSnapshot["dados"]][] = presidente ? Object.entries(nac!.ufs).map(([uf, u]) => [uf, u.dados]) : [[ctx.uf, snap?.dados ?? null]];
  const corrida = e.simulado ? undefined : ctx.exp?.corridas?.find((x) => x.cargo === cargo && x.uf === ctx.uf);
  const ancora = corrida?.confrontos ? pesquisaDoPar(corrida.confrontos, arq.a.sq, arq.b.sq) : null;
  const leitura = leitor.ler({ params: indice.params[cargo], erros: indice.erros[cargo] ?? null, arq, fontes, idA, idB, ancora });
  const d = snap?.dados;
  // Names come from the count (fictional in the simulation); before the first file only the real race may fall back to the model's file.
  const quem = (id: string, f: MunArquivo["a"]): Quem | null => {
    const c = d?.candidatos.find((x) => x.id === id);
    return c ? { id, nome: c.nome, partido: c.partido } : e.simulado ? null : { id, nome: f.nome, partido: f.partido };
  };
  const a = quem(idA, arq.a), b = quem(idB, arq.b);
  if (!a || !b) return { estado: "carregando" };
  return { estado: "ok", leitura, a, b, concluida: d?.fase === "concluida" };
}

// The vote abroad, live, and the 1st round by city from the president's municipal file.
export function exteriorProps(e: EstadoMun): RenderProps["exterior"] {
  if (e.ctx.cargo !== "Presidente") return null;
  const mun = e.indice === null ? null : e.indice === undefined ? undefined : e.disputa ? e.arquivo : null;
  return { nac: e.nac, br: e.snap?.dados ?? null, mun, simulado: e.simulado };
}

// The municipal files, loaded on demand: the index of the races that have one, then the file of the open race. A failure is
// kept as null (the view says so) and asked again on the next visit.
export function criarMunicipais(getJson: <T>(url: string) => Promise<T>, aoCarregar: () => void) {
  let indice: MunIndice | null | undefined; // undefined: not asked yet; null: it failed
  let buscando = false;
  const arqs = new Map<string, MunArquivo | null | undefined>(); // by file name; undefined while loading
  const disputa = (ctx: Contexto): Disputa | null => (indice ? indice.disputas.find((d) => d.cargo === ctx.cargo && d.uf === (ctx.cargo === "Presidente" ? "BR" : ctx.uf)) ?? null : null);
  const carregar = (ctx: Contexto): void => {
    if (!indice && !buscando) {
      buscando = true;
      getJson<MunIndice>("data/municipal/index.json")
        .then((i) => { indice = i; })
        .catch((e) => { console.error("apuração: municípios", e); indice = null; })
        .then(() => { buscando = false; if (indice) carregar(ctx); aoCarregar(); });
      return;
    }
    const d = disputa(ctx);
    if (d && !arqs.has(d.arquivo)) {
      arqs.set(d.arquivo, undefined);
      getJson<MunArquivo>(`data/municipal/${d.arquivo}`)
        .then((a) => { arqs.set(d.arquivo, a); })
        .catch((e) => { console.error("apuração: municípios", e); arqs.set(d.arquivo, null); })
        .then(aoCarregar);
    }
  };
  return { indice: () => indice, disputa, arquivo: (ctx: Contexto) => { const d = disputa(ctx); return d ? arqs.get(d.arquivo) : undefined; }, carregar };
}
