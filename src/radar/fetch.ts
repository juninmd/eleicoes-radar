// Downloads the Chamber bulk files the radar needs (idempotent: skips files already present).
// TSE files cannot be fetched from here (WAF 403) — see README for the manual step.
import { existsSync, mkdirSync, statSync } from "node:fs";

const DIR = "data/camara";
const BASE = "https://dadosabertos.camara.leg.br/arquivos";
const YEARS = [2023, 2024, 2025, 2026];
const KINDS = ["proposicoes", "proposicoesAutores", "votacoes", "votacoesVotos", "votacoesOrientacoes"];
const FORCE = process.argv.includes("--force");

const targets: [string, string][] = [
  ...YEARS.flatMap((y) => KINDS.map((k): [string, string] => [`${DIR}/${k}-${y}.csv`, `${BASE}/${k}/csv/${k}-${y}.csv`])),
  ...YEARS.map((y): [string, string] => [`${DIR}/Ano-${y}.csv.zip`, `https://www.camara.leg.br/cotas/Ano-${y}.csv.zip`]),
  [`${DIR}/deputados-57.json`, "https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57&itens=1000"],
  [`${DIR}/deputados.csv`, "https://dadosabertos.camara.leg.br/arquivos/deputados/csv/deputados.csv"],
  ["data/senado/senadores-atual.json", "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json"],
];

mkdirSync(DIR, { recursive: true });
mkdirSync("data/senado", { recursive: true });
let failed = 0;
for (const [path, url] of targets) {
  // --force re-downloads: the 2026 files grow daily until the term ends.
  if (!FORCE && existsSync(path) && statSync(path).size > 0) continue;
  const res = await fetch(url, { headers: { Accept: "application/json, text/csv" }, signal: AbortSignal.timeout(600_000) });
  if (!res.ok) {
    console.error(`[fetch] ${res.status} ${url}`);
    failed++;
    continue;
  }
  await Bun.write(path, res);
  console.log(`[fetch] ${path}`);
}

// Exercise history per deputy: the only reliable denominator for attendance,
// since titulars take leave (e.g. to become state secretaries) mid-term.
const HIST = `${DIR}/historico-57.json`;
if (FORCE || !existsSync(HIST)) {
  const deps: { id: number }[] = JSON.parse(await Bun.file(`${DIR}/deputados-57.json`).text()).dados;
  const out: Record<number, { dataHora: string; situacao: string | null }[]> = {};
  const queue = [...deps];
  const worker = async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      const res = await fetch(`https://dadosabertos.camara.leg.br/api/v2/deputados/${d.id}/historico`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`[fetch] historico ${d.id}: ${res.status}`);
      const json = (await res.json()) as { dados: { idLegislatura: number; dataHora: string; situacao: string | null }[] };
      out[d.id] = json.dados.filter((h) => h.idLegislatura === 57).map(({ dataHora, situacao }) => ({ dataHora, situacao }));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await Bun.write(HIST, JSON.stringify(out));
  console.log(`[fetch] ${HIST} (${deps.length} deputados)`);
}

if (failed) process.exit(1);
