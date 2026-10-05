// "Matematicamente eleito": a proof on the TSE's own numbers, not a forecast. A candidate is decided when no way
// of splitting the votes still to come can change the result. The worst case gives every elector of the sections
// not yet totalized (apto - apurado) to the rival and none to the candidate; abstentions only help the proof.
// The TSE marks "Eleito" on its own, in its own time: that text is shown separately and always wins.
const UMA_VAGA = new Set(["Presidente", "Governador"]);

// The TSE's own status text for a winner ("Eleito", "Eleito por QP"); "Não eleito" does not match.
export const eleitoTse = (c) => /^eleit/i.test(c.situacao);

// Ids of the candidates already decided. Empty when the proof does not hold, or when the file cannot be trusted.
// `uf` is the file's scope: a state file of the presidential race is a slice, only the national one ("BR") is a result.
export function decididos(d, cargo, uf) {
  const nenhum = new Set();
  const majoritario = UMA_VAGA.has(cargo) || cargo === "Senador";
  if (!d || !majoritario || d.fase === "aguardando") return nenhum;
  if (cargo === "Presidente" && uf !== "BR") return nenhum;
  const { apto, apurado } = d.eleitorado ?? {};
  const validos = d.votos?.validos;
  const vagas = d.cargo?.vagas;
  if (!(apto > 0) || !(apurado >= 0) || apurado > apto || !(validos > 0)) return nenhum;
  // The label is keyed by candidate id: a missing or repeated id would label everyone who shares it.
  const ids = d.candidatos.map((c) => c.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return nenhum;
  const falta = apto - apurado; // the most votes anyone can still gain
  const ordem = [...d.candidatos].sort((a, b) => b.votos - a.votos);

  let prova = nenhum;
  if (UMA_VAGA.has(cargo)) {
    // Absolute majority of the valid votes, and no more of them can exist than the ones counted plus every elector left.
    if (vagas !== 1) return nenhum;
    // The candidates' own sum can exceed the file's valid-vote total (seen in 2026: RJ by 3%); the larger one is the safe base.
    const base = Math.max(validos, ordem.reduce((a, c) => a + c.votos, 0));
    if (ordem[0] && ordem[0].votos > (base + falta) / 2) prova = new Set([ordem[0].id]);
  } else {
    // Senate: the last seat holder stays ahead of the first one left out even if that one gets every vote left.
    const ultimo = ordem[vagas - 1];
    const fora = ordem[vagas];
    if (ultimo && fora && ultimo.votos > 0 && ultimo.votos - fora.votos > falta) prova = new Set(ordem.slice(0, vagas).map((c) => c.id));
  }
  // The TSE contradicting the proof, either way (not "eleito" on a pick, "eleito" on someone else): claim nothing.
  const contradiz = d.candidatos.some((c) => (prova.has(c.id) ? c.situacao && !eleitoTse(c) : eleitoTse(c)));
  return contradiz ? nenhum : prova;
}
