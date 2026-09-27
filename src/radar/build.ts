// Builds web/data/*.json: one file per UF (national races in BR.json).
// Candidates are linked to a Chamber mandate by exact civil name; homonyms are
// disambiguated by UF and left unlinked when still ambiguous.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Profile } from "./profiles/fetch-profiles";
import { dataUri } from "./profiles/photos";
import { loadTsePhotos } from "./profiles/tse-photos";
import { loadCandidates } from "./candidates";
import { loadMandates, type Mandate, type MandateIndex } from "./mandate";
import { computeIndicators, type Scored } from "./indicators";
import { normalizeName, round } from "./stats";
import type { Candidate } from "./tse";
import type { AgendaConfig } from "./camara/agenda";
import { classify, RENOVACAO, type Senator } from "./incumbency";
import { buildExpectativa, type Prev } from "./expectativa";

export function loadSenators(path = "data/senado/senadores-atual.json"): Map<string, Senator[]> {
  const out = new Map<string, Senator[]>();
  let list: any[] = [];
  try {
    list = JSON.parse(readFileSync(path, "utf8")).ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
  } catch {
    console.warn(`[senado] ${path} ausente ou inválido, rode 'bun run radar:fetch'; senadores ficam sem status`);
  }
  for (const p of list) {
    const id = p.IdentificacaoParlamentar;
    const s: Senator = {
      nome: normalizeName(id.NomeCompletoParlamentar ?? ""),
      uf: id.UfParlamentar,
      fimMandato: p.Mandato.SegundaLegislaturaDoMandato.DataFim,
      desde: Number(p.Mandato.PrimeiraLegislaturaDoMandato.DataInicio.slice(0, 4)),
    };
    out.set(s.nome, [...(out.get(s.nome) ?? []), s]);
  }
  return out;
}

const OUT = "web/data";
const AGENDA = process.env.AGENDA ?? "src/radar/agenda.json";

const r0 = (v: number) => Math.round(v);
export const slug = (s: string) => normalizeName(s).toLowerCase().replace(/ /g, "-");

export function linkMandate(c: Candidate, { byName, byCpf }: MandateIndex): Mandate | null {
  if (c.cpf && byCpf.has(c.cpf)) return byCpf.get(c.cpf)!;
  const found = byName.get(normalizeName(c.nome)) ?? [];
  if (found.length === 1) return found[0]!;
  const sameUf = found.filter((m) => m.uf === c.uf);
  return sameUf.length === 1 ? sameUf[0]! : null;
}

export function toPublic({ c, m, ind, perfil }: Scored, bio: Profile | null = null, fotoCredito: string | null = null, prev: Prev | null = null) {
  const f = c.finance;
  return {
    id: c.sq,
    nome: c.nome,
    urna: c.nomeUrna || null,
    ficha: c.nascimento !== undefined ? { nascimento: c.nascimento, ufNascimento: c.ufNascimento, ocupacao: c.ocupacao, instrucao: c.instrucao, federacao: c.federacao } : null,
    temContas: c.finance.dataRetrato !== "",
    num: c.numero,
    cargo: c.cargo,
    uf: c.uf,
    partido: c.partido,
    genero: c.genero,
    corRaca: c.corRaca,
    fin: {
      total: r0(f.total), publico: r0(f.publico), proprio: r0(f.proprio), pf: r0(f.pessoasFisicas),
      partido: r0(f.partidoPrivado), candidatos: r0(f.outrosCandidatos), doadoresPF: f.doadoresPF,
      maiorDoador: round(f.maiorDoadorShare), gastos: r0(f.despesasContratadas), maiorFornecedor: round(f.maiorFornecedorShare),
    },
    mandato: m && {
      id: m.deputadoId,
      nome: m.nome,
      partido: m.partido,
      uf: m.uf,
      votos: m.votos,
      projetos: m.bills,
      cota: m.ceap && {
        total: r0(m.ceap.total), meses: m.ceap.meses, mediaMensal: r0(m.ceap.mediaMensal),
        maiorFornecedor: m.ceap.maiorFornecedor, maiorFornecedorShare: round(m.ceap.maiorFornecedorShare),
      },
      agenda: m.agenda,
      emendas: m.emendas && { empenhado: r0(m.emendas.empenhado), pago: r0(m.emendas.pago), areas: m.emendas.areas.map((a) => ({ nome: a.nome, valor: r0(a.valor) })) },
    },
    perfil: perfil ?? null,
    fotoCredito,
    bio: bio && {
      naturalidade: bio.naturalidade,
      nascimento: bio.nascimento,
      trajetoria: bio.trajetoria,
      wikidata: bio.wikidata,
    },
    ind,
    prev,
  };
}

async function main() {
  const t0 = performance.now();
  const cands = await loadCandidates();
  const agenda: AgendaConfig = JSON.parse(readFileSync(AGENDA, "utf8"));
  const mandates = await loadMandates(agenda);

  const items: Scored[] = cands.map((c) => ({ c, m: linkMandate(c, mandates), ind: {} }));
  const senators = loadSenators();
  computeIndicators(items);
  for (const s of items) {
    s.perfil = classify(s.c, s.m, senators);
    const r = RENOVACAO[s.perfil.status];
    if (r !== null) Object.assign(s.ind, { renovacao: r, experiencia: round(1 - r) });
  }

  // Profiles come from the network step 'bun run radar:profiles'; optional.
  const profiles: Record<string, Profile> = existsSync("data/perfis.json") ? JSON.parse(readFileSync("data/perfis.json", "utf8")) : {};
  // TSE portrait first (uniform, official); Chamber/Senate/Commons as fallback.
  const tsePhotos = await loadTsePhotos();
  const photoOf = (sq: string) => {
    const t = tsePhotos.get(sq);
    if (t) return { file: t, credito: "TSE (DivulgaCand)" };
    const p = profiles[sq]?.foto;
    return p && existsSync(p.file) ? p : null;
  };
  const { porCandidato, resumo } = buildExpectativa(cands);
  const byUf = new Map<string, ReturnType<typeof toPublic>[]>();
  for (const s of items) {
    const list = byUf.get(s.c.uf) ?? [];
    const foto = photoOf(s.c.sq);
    list.push(toPublic(s, profiles[s.c.sq] ?? null, foto?.credito ?? null, porCandidato.get(s.c.sq) ?? null));
    byUf.set(s.c.uf, list);
  }

  mkdirSync(`${OUT}/uf`, { recursive: true });
  const snapshot = cands.map((c) => c.finance.dataRetrato).sort().at(-1) ?? "";
  const ufs = [...byUf.keys()].sort();
  mkdirSync(`${OUT}/fotos`, { recursive: true });
  for (const uf of ufs) {
    const list = byUf.get(uf)!;
    writeFileSync(`${OUT}/uf/${uf}.json`, JSON.stringify(list));
    // Photos ship per UF + office so the page only loads the open ballot's portraits.
    const fotos = new Map<string, Record<string, string>>();
    for (const c of list) {
      const f = photoOf(c.id);
      if (!f) continue;
      const k = `${uf}-${slug(c.cargo)}`;
      fotos.set(k, { ...(fotos.get(k) ?? {}), [c.id]: dataUri(f.file) });
    }
    for (const [k, v] of fotos) writeFileSync(`${OUT}/fotos/${k}.json`, JSON.stringify(v));
  }
  const meta = {
    geradoEm: new Date().toISOString(),
    retratoTse: snapshot,
    total: items.length,
    comMandato: items.filter((s) => s.m).length,
    ufs: ufs.map((uf) => ({ uf, n: byUf.get(uf)!.length })),
  };
  writeFileSync(`${OUT}/agenda.json`, JSON.stringify(agenda));
  writeFileSync(`${OUT}/expectativa.json`, JSON.stringify(resumo));
  writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2));
  console.log(`[build] ${meta.total} candidatos, ${meta.comMandato} com mandato na Câmara, ${ufs.length} arquivos em ${OUT}/uf (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}

if (import.meta.main) await main();
