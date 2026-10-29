// What deserves a push, read from the TSE file alone. Every event has a stable id, so seeing the same fact twice (or after a restart,
// which seeds silently) never notifies twice. Wording follows the live tab: only the TSE's own text says "Eleito"; the Radar's proof is
// labelled as a calculation, and nothing says who "will" win.
import type { Apuracao, Cargo } from "../../../web/apuracao-tse.js";
import { decididos, eleitoTse } from "../../../web/apuracao-eleito.js";
import { titleName } from "../../../web/format.js";
import { cartaoUrl } from "./cartao.js";

export interface Disputa { cargo: Cargo; uf: string; rotulo: string; marcos: boolean }
export interface Evento { id: string; t: number; tipo: string; titulo: string; texto: string; rotulo: string; cartao?: string }
export interface EstadoDisputa { lider: string | null; avanco: number; ultimaVirada: number; viradas: number; emitidos: Set<string> }

export const AVANCO_MINIMO = 0.1; // below this the first urns are noise (same bar as the live tab's "virou")
export const INTERVALO_VIRADA_MS = 10 * 60_000; // a neck-and-neck count must not buzz a phone every minute
const MARCOS: [string, number][] = [["m50", 0.5], ["m90", 0.9]];
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const nome = (c: { nome: string }) => titleName(c.nome);

export const avancoDe = (d: Apuracao): number => (d.secoes.total > 0 ? d.secoes.totalizadas / d.secoes.total : 0);

export function detectar(prev: EstadoDisputa | null, d: Apuracao, disp: Disputa, agora: number): { estado: EstadoDisputa; eventos: Evento[] } {
  const k = `${disp.cargo}-${disp.uf}`;
  const rot = disp.rotulo;
  const ordem = [...d.candidatos].sort((a, b) => b.votos - a.votos);
  const [a, b] = ordem;
  const avanco = avancoDe(d);
  const comVotos = d.fase !== "aguardando" && !!a && a.votos > 0;
  const par = a && b ? `${nome(a)} ${pct(a.pct)} · ${nome(b)} ${pct(b.pct)} dos votos válidos` : "";
  // The picture is the two front-runners' share of their valid votes and the sections counted; with fewer than two candidates there is none.
  const cartao = a && b && a.votos + b.votos > 0 ? cartaoUrl(a.votos / (a.votos + b.votos), avanco) : undefined;
  const mk = (id: string, tipo: string, titulo: string, texto: string, imagem = true): Evento => ({ id: `${k}:${id}`, t: agora, tipo, titulo, texto, rotulo: rot, ...(imagem && cartao ? { cartao } : {}) });

  const fatos: Evento[] = [];
  if (d.fase !== "aguardando") fatos.push(mk("inicio", "inicio", `${rot}: a apuração começou`, "As primeiras seções chegaram do TSE.", false));
  if (disp.marcos) for (const [id, lim] of MARCOS) if (avanco >= lim) fatos.push(mk(id, "marco", `${rot}: ${Math.round(lim * 100)}% das seções apuradas`, par));
  for (const id of decididos(d, disp.cargo, disp.uf)) {
    const c = d.candidatos.find((x) => x.id === id);
    if (c) fatos.push(mk(`prova:${id}`, "prova", `${rot}: matematicamente decidido`, `Pela conta do Radar sobre os números do TSE, ${nome(c)} não pode mais ser alcançado(a), nem se todos os eleitores restantes votarem no rival. Ainda não é a marcação do TSE.`));
  }
  for (const c of d.candidatos.filter(eleitoTse)) fatos.push(mk(`tse:${c.id}`, "tse", `${rot}: o TSE marcou "${c.situacao}"`, `${nome(c)} (${c.partido}), ${pct(c.pct)} dos votos válidos.`));
  if (d.fase === "concluida") fatos.push(mk("fim", "fim", `${rot}: apuração concluída`, "Todas as seções apuradas. Vale o resultado publicado pelo TSE."));

  // First sight of this race (or after a restart): remember what already holds, announce nothing.
  const lider = comVotos ? a.id : null;
  if (!prev) return { estado: { lider, avanco, ultimaVirada: 0, viradas: 0, emitidos: new Set(fatos.map((e) => e.id)) }, eventos: [] };

  const eventos = fatos.filter((e) => !prev.emitidos.has(e.id));
  const estado: EstadoDisputa = { lider: lider ?? prev.lider, avanco, ultimaVirada: prev.ultimaVirada, viradas: prev.viradas, emitidos: new Set([...prev.emitidos, ...eventos.map((e) => e.id)]) };
  if (lider && prev.lider && lider !== prev.lider) {
    const anterior = ordem.find((c) => c.id === prev.lider);
    if (prev.avanco >= AVANCO_MINIMO && anterior && agora - prev.ultimaVirada < INTERVALO_VIRADA_MS) estado.lider = prev.lider; // held back: say it once the interval passes, if it still holds
    else if (prev.avanco >= AVANCO_MINIMO && anterior) {
      estado.viradas = prev.viradas + 1;
      estado.ultimaVirada = agora;
      eventos.push(mk(`virada:${estado.viradas}`, "virada", `${rot}: virada na contagem`, `${nome(a)} passou à frente de ${nome(anterior)} (${par}; ${pct(avanco)} das seções).`));
    }
  }
  return { estado, eventos };
}

// When one round brings several events a single push goes out, and the service worker reads the most important one.
const PRIORIDADE: Record<string, number> = { tse: 0, prova: 1, fim: 2, virada: 3, marco: 4, inicio: 5 };
export const destaque = (eventos: Evento[]): Evento | null => eventos.reduce<Evento | null>((m, x) => (!m || (PRIORIDADE[x.tipo] ?? 9) < (PRIORIDADE[m.tipo] ?? 9) ? x : m), null);
