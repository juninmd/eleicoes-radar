// "Matematicamente eleito": a proof on the TSE's own numbers, not a forecast. A candidate is decided when no way
// of splitting the votes still to come can change the result. The worst case gives every elector of the sections
// not yet totalized (apto - apurado) to the rival and none to the candidate; abstentions only help the proof.
// The TSE marks "Eleito" on its own, in its own time: that text is shown separately and always wins.
import type { Apuracao, Candidato, Cargo } from "./apuracao-tse.js";

const UMA_VAGA = new Set<string>(["Presidente", "Governador"]);

// The TSE's own status text for a winner ("Eleito", "Eleito por QP"); "Não eleito" does not match.
export const eleitoTse = (c: Pick<Candidato, "situacao">): boolean => /^eleit/i.test(c.situacao);

// What both proofs read: the file's numbers, or null when they cannot be trusted or the race is not one a proof covers.
// `uf` is the file's scope: a state file of the presidential race is a slice, only the national one ("BR") is a result.
interface Contexto { validos: number; ordem: Candidato[]; soma: number; falta: number }

function contexto(d: Apuracao | null | undefined, cargo: Cargo, uf?: string): Contexto | null {
  const majoritario = UMA_VAGA.has(cargo) || cargo === "Senador";
  if (!d || !majoritario || d.fase === "aguardando") return null;
  if (cargo === "Presidente" && uf !== "BR") return null;
  const { apto, apurado } = d.eleitorado ?? ({} as Apuracao["eleitorado"]);
  const validos = d.votos?.validos;
  if (!(apto > 0) || !(apurado >= 0) || apurado > apto || !(validos > 0)) return null;
  // The label is keyed by candidate id: a missing or repeated id would label everyone who shares it.
  const ids = d.candidatos.map((c) => c.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
  const ordem = [...d.candidatos].sort((a, b) => b.votos - a.votos);
  return { validos, ordem, soma: ordem.reduce((a, c) => a + c.votos, 0), falta: apto - apurado }; // falta: the most votes anyone can still gain
}

// Ids of the candidates already decided. Empty when the proof does not hold, or when the file cannot be trusted.
export function decididos(d: Apuracao | null | undefined, cargo: Cargo, uf?: string): Set<string> {
  const nenhum = new Set<string>();
  const ctx = contexto(d, cargo, uf);
  if (!ctx) return nenhum;
  const { ordem, falta } = ctx;
  const vagas = d!.cargo?.vagas;

  let prova = nenhum;
  if (UMA_VAGA.has(cargo)) {
    // Absolute majority of the valid votes, and no more of them can exist than the ones counted plus every elector left.
    if (vagas !== 1) return nenhum;
    // The candidates' own sum can exceed the file's valid-vote total (seen in 2026: RJ by 3%); the larger one is the safe base.
    const base = Math.max(ctx.validos, ctx.soma);
    if (ordem[0] && ordem[0].votos > (base + falta) / 2) prova = new Set([ordem[0].id]);
  } else {
    // Senate: the last seat holder stays ahead of the first one left out even if that one gets every vote left.
    const ultimo = ordem[vagas - 1];
    const fora = ordem[vagas];
    if (ultimo && fora && ultimo.votos > 0 && ultimo.votos - fora.votos > falta) prova = new Set(ordem.slice(0, vagas).map((c) => c.id));
  }
  // The TSE contradicting the proof, either way (not "eleito" on a pick, "eleito" on someone else): claim nothing.
  const contradiz = d!.candidatos.some((c) => (prova.has(c.id) ? c.situacao && !eleitoTse(c) : eleitoTse(c)));
  return contradiz ? nenhum : prova;
}

const TSE_2T = /^2\s*[ºo°]?\s*turno/i; // the TSE's own text for someone going to the runoff

// "Second round guaranteed": the leader cannot pass half of the valid votes even if every elector still to be counted votes for
// them. Here the SMALLER valid-vote base is the safe one (the opposite of decididos: a smaller base lets the leader reach half sooner).
// { finalistas: [id, id] } when no third place can catch the second either; { finalistas: null } when the runoff is certain but who
// takes the second place is not. Null when the proof does not hold, the file cannot be trusted, or the TSE says otherwise.
export function segundoTurno(d: Apuracao | null | undefined, cargo: Cargo, uf?: string): { finalistas: [string, string] | null } | null {
  const ctx = UMA_VAGA.has(cargo) && d?.cargo?.vagas === 1 ? contexto(d, cargo, uf) : null;
  if (!ctx || ctx.ordem.length < 3) return null;
  const [a, b, terceiro] = ctx.ordem;
  const { falta } = ctx;
  if (!(a.votos > 0) || a.votos + falta > (Math.min(ctx.validos, ctx.soma) + falta) / 2) return null; // the leader could still pass half
  const fechada = b.votos - terceiro.votos > falta; // the third could take every vote left and still not pass the second
  const marcados = d!.candidatos.filter((c) => TSE_2T.test(c.situacao)).map((c) => c.id);
  // The TSE contradicting the proof: someone "Eleito" in the first round, a runoff mark on a candidate outside the pair, or runoff
  // marks while the Radar still cannot name the pair (the TSE already knows more, so its table speaks and the Radar stays out).
  if (d!.candidatos.some(eleitoTse)) return null;
  if (marcados.length && (!fechada || marcados.some((id) => id !== a.id && id !== b.id))) return null;
  return { finalistas: fechada ? [a.id, b.id] : null };
}
