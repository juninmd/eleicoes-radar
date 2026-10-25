// Where the simulated night gets its files: the real final 1st-round files from the TSE (read once, kept in memory), renamed by
// apuracao-sim.ts and, for a runoff, turned into the derived runoff file. The tab then asks for "this file at step k" and gets it
// synchronously, so moving the cursor of the night never waits for the network. Pure of the DOM: the loader and the runoff
// parameters are injected.
import { loadResultado, HttpError } from "./apuracao-feed.js";
import { ufsDo } from "./apuracao-uf.js";
import { tseUrl, TSE_BASE, turnoDe } from "./apuracao-tse.js";
import { alphaSim, anonimizar, chaveCand, criarNomeador, marcarEleito, parcial, segundoTurno, somar, versionar } from "./apuracao-sim.js";
import type { Params } from "./municipio-modelo.js";
import type { Loader, FeedStatus } from "./apuracao-feed.js";
import type { Apuracao, Cargo, Turno } from "./apuracao-tse.js";

export interface Pedido { cargo: Cargo; uf: string; turno: Turno }
export interface Quadro { status: FeedStatus; dados: Apuracao | null; erro: string | null }
type Base = { st: "carregando" } | { st: "ok"; dados: Apuracao } | { st: "ausente" } | { st: "erro"; erro: string };

const PRESIDENTE = "Presidente";
const CONCORRENCIA = 6;

export interface FonteOpcoes {
  load?: Loader;
  url?: (cargo: Cargo, uf: string) => string;
  // kappa, eta and the vote ratio of the runoff model by office (data/municipal/index.json); null when they could not be read
  params: () => Promise<Record<string, Params> | null>;
  onPronto?: () => void; // a file finished loading (or failed): the tab redraws
}

export function criarFonteSim({ load = loadResultado, url = (c, uf) => tseUrl(c, uf, TSE_BASE, 1), params, onPronto = () => {} }: FonteOpcoes) {
  const nomes = criarNomeador();
  const t1 = new Map<string, Base>(); // by cargo|uf: the renamed real final file of the 1st round
  const t2 = new Map<string, Base>(); // by cargo|uf: the derived final runoff file
  let pars: Promise<Record<string, Params> | null> | null = null;
  let ctl = new AbortController();
  const fila: (() => Promise<void>)[] = [];
  let ativos = 0;

  const rodar = () => {
    while (ativos < CONCORRENCIA && fila.length) {
      ativos++;
      fila.shift()!().finally(() => { ativos--; rodar(); });
    }
  };
  const ler = (cargo: Cargo, uf: string) => {
    const k = `${cargo}|${uf}`;
    if (t1.has(k)) return;
    const marca: Base = { st: "carregando" };
    t1.set(k, marca);
    const sinal = ctl.signal;
    fila.push(() => load(url(cargo, uf), sinal)
      .then((d): Base => ({ st: "ok", dados: anonimizar(d, cargo, uf, nomes) }),
        (e: unknown): Base => (e instanceof HttpError && e.status === 404 ? { st: "ausente" } : { st: "erro", erro: e instanceof Error ? e.message : String(e) }))
      .then((b) => {
        if (sinal.aborted || t1.get(k) !== marca) return; // the simulation was left meanwhile: `parar` already dropped the entry
        t1.set(k, b);
        derivar();
        onPronto();
      }));
    rodar();
  };

  // The runoff of each place, once its 1st-round file (and, for the president, every state's) is in.
  const derivar = () => {
    if (!pars) return;
    pars.then((p) => {
      let mudou = false;
      for (const [k, b] of t1) {
        if (t2.has(k)) continue;
        const [cargo] = k.split("|") as [Cargo];
        if (cargo !== PRESIDENTE && cargo !== "Governador") continue;
        const r = runoff(k, b, p);
        if (r) { t2.set(k, r); mudou = true; }
      }
      if (mudou) onPronto();
    });
  };
  const finalistasPres = (): [string, string] | null => {
    const ufs = ufsDo(PRESIDENTE).map((uf) => t1.get(`${PRESIDENTE}|${uf}`));
    if (ufs.some((b) => !b || b.st === "carregando")) return null;
    const br = somar(ufs.flatMap((b) => (b?.st === "ok" ? [b.dados] : [])), 1);
    return br && br.candidatos.length >= 2 ? [br.candidatos[0]!.id, br.candidatos[1]!.id] : null;
  };
  const runoff = (k: string, b: Base, p: Record<string, Params> | null): Base | null => {
    if (b.st === "carregando") return null;
    if (b.st !== "ok") return b;
    const [cargo] = k.split("|");
    if (!p?.[cargo!]) return { st: "erro", erro: "parâmetros do modelo de 2º turno indisponíveis" };
    if (cargo === PRESIDENTE) {
      const f = finalistasPres();
      return f ? { st: "ok", dados: segundoTurno(b.dados, f, p[cargo]!, alphaSim(cargo, "BR")) } : null;
    }
    // A governor's runoff only exists where the TSE's own 1st-round text sent two candidates to it.
    const dupla = b.dados.candidatos.filter((c) => /2º turno/i.test(c.situacao));
    return dupla.length === 2 ? { st: "ok", dados: marcarEleito(segundoTurno(b.dados, [dupla[0]!.id, dupla[1]!.id], p[cargo]!, alphaSim(cargo!, k.split("|")[1]!))) } : { st: "ausente" };
  };

  // undefined: never asked for. A runoff whose 1st round is in but not yet derived (parameters, or the other states) is still loading.
  const base = ({ cargo, uf, turno }: Pedido): Base | undefined => {
    const k = `${cargo}|${uf}`;
    if (turnoDe(cargo, turno) === 1) return t1.get(k);
    return t2.get(k) ?? (t1.has(k) ? { st: "carregando" } : undefined);
  };
  const ufsPara = (cargo: Cargo, uf: string, nacional: boolean) => (cargo === PRESIDENTE || nacional ? ufsDo(cargo) : [uf]);

  const quadroDe = (p: Pedido, k: number): Quadro => {
    const t = turnoDe(p.cargo, p.turno);
    if (p.cargo === PRESIDENTE && p.uf === "BR") {
      const partes = ufsDo(PRESIDENTE).map((uf) => quadroDe({ ...p, uf }, k));
      if (partes.some((q) => q.status === "carregando")) return { status: "carregando", dados: null, erro: null };
      const falha = partes.find((q) => q.status === "erro");
      if (falha) return falha;
      const br = somar(partes.flatMap((q) => (q.dados ? [q.dados] : [])), t);
      return br ? { status: "ok", dados: versionar(br, k, t), erro: null } : { status: "ausente", dados: null, erro: null };
    }
    const b = base(p) ?? { st: "carregando" };
    if (b.st === "carregando") return { status: "carregando", dados: null, erro: null };
    if (b.st === "ausente") return { status: "ausente", dados: null, erro: null };
    if (b.st === "erro") return { status: "erro", dados: null, erro: b.erro };
    // A state slice of the presidential race never carries the national status texts (the same rule the real view follows).
    const d = parcial(b.dados, `${p.cargo}|${p.uf}|${t}`, k, { situacao: p.cargo !== PRESIDENTE });
    return { status: "ok", dados: versionar(d, k, t), erro: null };
  };

  return {
    // Starts loading what this race needs: its file, every state's for the president (the national file is their sum) or for a national view.
    preparar(p: Pedido, nacional = false): void {
      if (turnoDe(p.cargo, p.turno) === 2 && !pars) { pars = params().catch(() => null); }
      for (const uf of ufsPara(p.cargo, p.uf, nacional)) ler(p.cargo, uf);
      derivar();
    },
    // True when every file the race needs has answered (ok, absent or failed).
    pronto(p: Pedido, nacional = false): boolean {
      return ufsPara(p.cargo, p.uf, nacional).every((uf) => { const b = base({ ...p, uf }); return !!b && b.st !== "carregando"; });
    },
    quadro: quadroDe,
    // The same real candidate always gets the same fictional id: the chance and the exterior views find the finalists by it.
    idDe: (cargo: Cargo, uf: string, num: string) => nomes.buscar(chaveCand(cargo, uf, num)),
    parar(): void {
      ctl.abort();
      ctl = new AbortController();
      fila.length = 0;
      for (const [k, b] of t1) if (b.st === "carregando") t1.delete(k);
      // a failed read is tried again on the next visit; a runoff that could not be derived too
      for (const [k, b] of t2) if (b.st === "erro") t2.delete(k);
      pars = null;
    },
  };
}
export type FonteSim = ReturnType<typeof criarFonteSim>;
