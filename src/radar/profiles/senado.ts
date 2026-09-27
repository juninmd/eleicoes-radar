// Current senators: birthplace, birth date and Senate mandates (official API).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Position } from "./wikidata";

const BASE = "https://legis.senado.leg.br/dadosabertos/senador";
const CACHE = "data/senado/detalhe";

export interface SenatorProfile {
  codigo: string;
  naturalidade: string | null;
  nascimento: string | null;
  mandatos: Position[];
  foto: string;
}

async function get(key: string, url: string): Promise<any> {
  const file = `${CACHE}/${key}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`[senado] ${res.status} ${url}`);
  const json = await res.json();
  writeFileSync(file, JSON.stringify(json));
  return json;
}

const asList = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export async function senatorProfile(codigo: string, foto: string): Promise<SenatorProfile> {
  const det = (await get(`${codigo}`, `${BASE}/${codigo}`)).DetalheParlamentar.Parlamentar.DadosBasicosParlamentar ?? {};
  const mand = asList((await get(`${codigo}-mandatos`, `${BASE}/${codigo}/mandatos`)).MandatoParlamentar.Parlamentar.Mandatos?.Mandato);
  const mandatos = mand.map((m: any) => ({
    cargo: `${m.DescricaoParticipacao === "Titular" ? "Senador" : `Senador (${m.DescricaoParticipacao})`} por ${m.UfParlamentar}`,
    inicio: m.PrimeiraLegislaturaDoMandato?.DataInicio ?? null,
    fim: m.SegundaLegislaturaDoMandato?.DataFim ?? m.PrimeiraLegislaturaDoMandato?.DataFim ?? null,
  }));
  return {
    codigo,
    naturalidade: det.Naturalidade ? `${det.Naturalidade}/${det.UfNaturalidade}` : null,
    nascimento: det.DataNascimento ?? null,
    mandatos,
    foto: foto.replace(/^http:/, "https:"),
  };
}
