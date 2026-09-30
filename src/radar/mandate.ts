// Chamber of Deputies track record (57th legislature, 2023-2026), keyed by the
// normalised civil name: TSE masks CPFs in the 2026 files, so names are the only join key.
import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { decodeLatin1, parseCsv, type Row } from "./csv";
import { normalizeName } from "./stats";
import { legislatureStartYear } from "./incumbency";
import { computeVotes, exerciseIntervals, type HistoryEvent, type VoteStats } from "./camara/votes";
import { computeBills, type BillStats } from "./camara/bills";
import { computeCeap, monthsInExercise, type CeapStats } from "./camara/ceap";
import { computeEmendas, type EmendaStats } from "./camara/emendas";
import { computeAgenda, type AgendaConfig, type AgendaStats } from "./camara/agenda";

export interface Mandate {
  deputadoId: number;
  nome: string;
  partido: string;
  uf: string;
  votos: VoteStats | null;
  bills: BillStats | null;
  ceap: CeapStats | null;
  emendas: EmendaStats | null;
  agenda: AgendaStats | null;
  atual: boolean; // holds the seat now (in office or on leave)
  desde: number | null; // year of first Chamber legislature
}

const YEARS = [2023, 2024, 2025, 2026];
const CAMARA = "data/camara";

// Lazy, one file in memory at a time: the roll-call files hold ~1.5M rows.
function* rowsOf(paths: string[]): Generator<Row> {
  for (const p of paths) {
    if (!existsSync(p)) {
      console.warn(`[camara] missing ${p}, run 'bun run radar:fetch'`);
      continue;
    }
    yield* parseCsv(readFileSync(p, "utf8"));
  }
}

export function* ceapRows(): Generator<Row> {
  for (const y of YEARS) {
    const zip = `${CAMARA}/Ano-${y}.csv.zip`;
    if (!existsSync(zip)) {
      console.warn(`[camara] missing ${zip}, run 'bun run radar:fetch'`);
      continue;
    }
    for (const data of Object.values(unzipSync(readFileSync(zip)))) yield* parseCsv(new TextDecoder().decode(data));
  }
}

export interface MandateIndex {
  byName: Map<string, Mandate[]>;
  byCpf: Map<string, Mandate>;
}

export async function loadMandates(agendaConfig: AgendaConfig): Promise<MandateIndex> {
  const deps: { id: number; nome: string; siglaPartido: string; siglaUf: string }[] =
    JSON.parse(await Bun.file(`${CAMARA}/deputados-57.json`).text()).dados;

  const files = (k: string) => YEARS.map((y) => `${CAMARA}/${k}-${y}.csv`);
  const histPath = `${CAMARA}/historico-57.json`;
  const history = new Map<number, HistoryEvent[]>(
    existsSync(histPath) ? Object.entries(JSON.parse(readFileSync(histPath, "utf8"))).map(([k, v]) => [Number(k), v as HistoryEvent[]]) : [],
  );
  const votes = computeVotes(rowsOf(files("votacoes")), rowsOf(files("votacoesVotos")), rowsOf(files("votacoesOrientacoes")), history);
  const agenda = computeAgenda(rowsOf(files("votacoesVotos")), agendaConfig);
  const bills = computeBills(rowsOf(files("proposicoes")), rowsOf(files("proposicoesAutores")));
  const ceap = computeCeap(ceapRows());
  const lastCeapMonth = [...ceap.values()].map((c) => c.ultimoMes).sort().at(-1) ?? "";
  for (const [id, c] of ceap) {
    const meses = monthsInExercise(exerciseIntervals(history.get(id) ?? []), lastCeapMonth);
    if (meses >= c.meses) Object.assign(c, { meses, mediaMensal: meses ? c.total / meses : 0 });
  }
  const emendasCsv = "data/EmendasParlamentares.csv";
  const emendas = existsSync(emendasCsv)
    ? computeEmendas(parseCsv(decodeLatin1(readFileSync(emendasCsv))), deps)
    : new Map<number, EmendaStats>();

  const civil = new Map<number, string>();
  const firstLeg = new Map<number, number>();
  for (const r of rowsOf([`${CAMARA}/deputados.csv`])) {
    const id = Number(r.uri?.split("/").pop());
    civil.set(id, normalizeName(r.nomeCivil ?? ""));
    if (r.idLegislaturaInicial) firstLeg.set(id, Number(r.idLegislaturaInicial));
  }
  // Last status "Exercício" or "Licença" means the seat is still theirs; substitutes
  // who returned end on "SUPLENCIA"/"VACANCIA".
  const holdsSeat = (id: number) => {
    const last = (history.get(id) ?? []).filter((e) => e.situacao).sort((a, b) => a.dataHora.localeCompare(b.dataHora)).at(-1);
    return last?.situacao === "Exercício" || last?.situacao === "Licença";
  };

  const byName = new Map<string, Mandate[]>();
  for (const d of deps) {
    const name = civil.get(d.id);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    byName.set(name, list);
    list.push({
      deputadoId: d.id,
      nome: d.nome,
      partido: d.siglaPartido,
      uf: d.siglaUf,
      votos: votes.get(d.id) ?? null,
      bills: bills.get(d.id) ?? null,
      ceap: ceap.get(d.id) ?? null,
      emendas: emendas.get(d.id) ?? null,
      agenda: agenda.get(d.id) ?? null,
      atual: holdsSeat(d.id),
      desde: firstLeg.has(d.id) ? legislatureStartYear(firstLeg.get(d.id)!) : null,
    });
  }
  console.log(`[camara] ${deps.length} deputados na 57ª legislatura, ${civil.size} com nome civil`);
  // CEAP carries the deputy's CPF; with the TSE registry this is an exact join.
  const byCpf = new Map<string, Mandate>();
  for (const list of byName.values()) for (const m of list) if (m.ceap?.cpf) byCpf.set(m.ceap.cpf, m);
  return { byName, byCpf };
}
