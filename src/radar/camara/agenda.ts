// Alignment with a user-defined agenda: how each deputy voted on a curated list of
// roll calls (src/radar/agenda.json). Only "Sim"/"Não" count; absences and
// obstruction are not read as a position.
import type { Row } from "../csv";

export interface AgendaVote {
  id: string;
  proposicao: string;
  data: string;
  resumo: string;
  posicao: "Sim" | "Não";
  porque: string;
}
export interface AgendaConfig {
  descricao: string;
  temas: Record<string, { nome: string; votos: AgendaVote[] }>;
}
export interface AgendaStats {
  temas: Record<string, { alinhado: number; total: number }>;
  votos: Record<string, string>; // vote id -> how the deputy voted
}

export function computeAgenda(votos: Iterable<Row>, config: AgendaConfig): Map<number, AgendaStats> {
  const byVote = new Map<string, { tema: string; posicao: string }>();
  for (const [tema, t] of Object.entries(config.temas)) for (const v of t.votos) byVote.set(v.id, { tema, posicao: v.posicao });

  const out = new Map<number, AgendaStats>();
  for (const r of votos) {
    const ref = byVote.get(r.idVotacao ?? "");
    if (!ref) continue;
    const id = Number(r.deputado_id);
    const s = out.get(id) ?? { temas: {}, votos: {} };
    s.votos[r.idVotacao!] = r.voto ?? "";
    if (r.voto === "Sim" || r.voto === "Não") {
      const t = (s.temas[ref.tema] ??= { alinhado: 0, total: 0 });
      t.total++;
      if (r.voto === ref.posicao) t.alinhado++;
    }
    out.set(id, s);
  }
  return out;
}
