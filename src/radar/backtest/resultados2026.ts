// Official 2026 first-round results (resultados.tse.jus.br) vs the Radar's forecasts in web/data/uf.
// Fetches once into data/resultados/2026 (the files are final: 100% of sections), then scores the
// forecast: poll-based races (Presidente, Governador, Senador) and the deputy seat model.
// Usage: bun src/radar/backtest/resultados2026.ts [--refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseApuracao, tseUrl, type Apuracao } from "../../../web/apuracao-tse";

const DIR = "data/resultados/2026";
const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
const CARGOS = ["Presidente", "Governador", "Senador", "Deputado Federal", "Deputado Estadual", "Deputado Distrital"] as const;

export async function loadResultados(refresh = false): Promise<Map<string, Apuracao>> {
  mkdirSync(DIR, { recursive: true });
  const out = new Map<string, Apuracao>();
  const jobs: [string, string][] = [];
  for (const cargo of CARGOS) for (const uf of cargo === "Presidente" ? ["BR"] : UFS) jobs.push([cargo, uf]);
  const one = async ([cargo, uf]: [string, string]) => {
    const file = `${DIR}/${cargo.replace(/ /g, "_")}-${uf}.json`;
    let raw: unknown;
    if (!refresh && existsSync(file)) raw = JSON.parse(readFileSync(file, "utf8"));
    else {
      const res = await fetch(tseUrl(cargo, uf), { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return; // e.g. Deputado Distrital only exists in DF, Deputado Estadual not in DF
      raw = await res.json();
      writeFileSync(file, JSON.stringify(raw));
    }
    const a = parseApuracao(raw);
    if (a) out.set(`${cargo}|${uf}`, a);
  };
  for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(one));
  return out;
}

if (import.meta.main) {
  const res = await loadResultados(process.argv.includes("--refresh"));
  const incompletas = [...res].filter(([, a]) => a.fase !== "concluida").map(([k]) => k);
  console.log(`${res.size} corridas; incompletas: ${incompletas.join(", ") || "nenhuma"}`);
}
