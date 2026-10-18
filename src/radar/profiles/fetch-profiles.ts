// Network step: builds data/perfis.json (birthplace, career, photo) for candidates
// that official or Wikidata sources can identify. Idempotent via on-disk caches.
import { readFileSync, writeFileSync } from "node:fs";
import { loadCandidates } from "../candidates";
import { loadMandates } from "../mandate";
import { linkMandate, loadSenators } from "../build";
import { parseCsv } from "../csv";
import { normalizeName } from "../stats";
import { legislatureStartYear } from "../incumbency";
import { senatorProfile } from "./senado";
import { findPerson, toProfile, type Position, type Seguidores } from "./wikidata";
import { commonsPhoto, thumbnail } from "./photos";
import { camaraExtra, senadoExtra, wikipediaResumo, type Extra } from "./extra";

const WIKI_RACES = new Set(["Presidente", "Governador", "Senador"]);

export interface Profile extends Partial<Extra> {
  naturalidade: string | null;
  nascimento: string | null;
  trajetoria: (Position & { fonte: string })[];
  foto: { file: string; credito: string } | null;
  wikidata: string | null;
  seguidores?: Seguidores[];
}

const cands = await loadCandidates();
const mandates = await loadMandates(JSON.parse(readFileSync("src/radar/agenda.json", "utf8")));
const senators = loadSenators();
const senRaw: any[] = JSON.parse(readFileSync("data/senado/senadores-atual.json", "utf8")).ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
const senByName = new Map(senRaw.map((p) => [normalizeName(p.IdentificacaoParlamentar.NomeCompletoParlamentar), p.IdentificacaoParlamentar]));
const deps = new Map<number, Record<string, string>>();
for (const r of parseCsv(readFileSync("data/camara/deputados.csv", "utf8"))) deps.set(Number(r.uri?.split("/").pop()), r);

// One failing keyless endpoint must not sink a 20k-candidate run; it is logged and skipped.
async function safe<T>(f: () => Promise<T>): Promise<T | undefined> {
  try {
    return await f();
  } catch (e) {
    console.warn(String(e));
  }
}

const out: Record<string, Profile> = {};
let n = 0;
for (const c of cands) {
  const p: Profile = { naturalidade: null, nascimento: null, trajetoria: [], foto: null, wikidata: null };
  const m = linkMandate(c, mandates);
  if (m) {
    const d = deps.get(m.deputadoId);
    if (d?.municipioNascimento) p.naturalidade = `${d.municipioNascimento}/${d.ufNascimento}`;
    p.nascimento = d?.dataNascimento || null;
    if (d?.idLegislaturaInicial) {
      p.trajetoria.push({ cargo: `Deputado federal por ${m.uf}`, inicio: `${legislatureStartYear(Number(d.idLegislaturaInicial))}`, fim: null, fonte: "Câmara" });
    }
    Object.assign(p, await safe(() => camaraExtra(m.deputadoId)));
    const file = await thumbnail(`camara-${m.deputadoId}`, `https://www.camara.leg.br/internet/deputado/bandep/${m.deputadoId}.jpg`);
    if (file) p.foto = { file, credito: "Câmara dos Deputados" };
  }
  const senMatches = senators.get(normalizeName(c.nome)) ?? [];
  const sen = senMatches.length === 1 ? senByName.get(normalizeName(c.nome)) : null;
  if (sen) {
    const s = await senatorProfile(sen.CodigoParlamentar, sen.UrlFotoParlamentar);
    p.naturalidade ??= s.naturalidade;
    p.nascimento ??= s.nascimento;
    Object.assign(p, await safe(() => senadoExtra(s.codigo)));
    p.trajetoria.push(...s.mandatos.map((x) => ({ ...x, fonte: "Senado" })));
    const file = await thumbnail(`senado-${s.codigo}`, s.foto);
    if (file) p.foto = { file, credito: "Agência Senado" };
  }
  if (WIKI_RACES.has(c.cargo)) {
    const e = await findPerson(c.nome);
    if (e) {
      const w = await toProfile(e);
      p.wikidata = w.qid;
      if (w.seguidores.length) p.seguidores = w.seguidores;
      p.resumo = await safe(() => wikipediaResumo(w.qid)) ?? null;
      p.naturalidade ??= w.naturalidade;
      p.nascimento ??= w.nascimento;
      // Official Chamber/Senate records win for legislative seats; Wikidata adds the rest.
      const official = p.trajetoria.length > 0;
      p.trajetoria.push(...w.cargos.filter((x) => !official || !/deputad|senador/i.test(x.cargo)).map((x) => ({ ...x, fonte: "Wikidata" })));
      if (!p.foto && w.imagem) {
        const ph = await commonsPhoto(w.imagem);
        const file = ph && (await thumbnail(`wiki-${w.qid}`, ph.url));
        if (file) p.foto = { file, credito: ph!.credito };
      }
    }
  }
  if (p.naturalidade || p.trajetoria.length || p.foto || p.atuacao || p.resumo) out[c.sq] = p;
  if (++n % 500 === 0) console.log(`[perfis] ${n}/${cands.length}`);
}
writeFileSync("data/perfis.json", JSON.stringify(out));
const vals = Object.values(out);
console.log(`[perfis] ${vals.length} perfis · ${vals.filter((p) => p.foto).length} fotos · ${vals.filter((p) => p.wikidata).length} no Wikidata`);
