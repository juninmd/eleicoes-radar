// Baixa o Boletim de Urna oficial do TSE (dados abertos) e grava um JSON compacto por UF e cargo majoritário.
// Uso: bun run radar:bu [ano] [UFs separadas por vírgula] [turno]
// Ex.: bun run radar:bu 2026 SP        (1º turno; o padrão)
//      bun run radar:bu 2026 SP,AC 1
// O CSV do BU tem uma linha por seção × cargo × votável; é lido em stream e nunca fica no web/data.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { forEachZipRow } from "../zip-csv";
import { novoAgregador, type BuArquivo, type CargoBu } from "./aggregate";

const ANO = Number(process.argv[2] ?? 2026);
const UFS = (process.argv[3] ?? "AC").split(",").map((u) => u.trim().toUpperCase()).filter(Boolean);
const TURNO = (process.argv[4] === "2" ? 2 : 1) as 1 | 2;
const DATASET = `resultados-${ANO}-boletim-de-urna`;
const API = `https://dadosabertos.tse.jus.br/api/3/action/package_show?id=${DATASET}`;
const OUT = "web/data/bu";
const CACHE = "data/tse";

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "-");
const turnoTxt = TURNO === 2 ? "Segundo turno" : "Primeiro turno";

interface Recurso { name: string; url: string }

async function recursos(): Promise<Recurso[]> {
  // O WAF do TSE já devolveu 403 ao fetch do Bun; o curl é o caminho que funciona (ver AGENTS.md).
  const p = Bun.spawnSync(["curl", "--max-time", "60", "-s", "-A", "Mozilla/5.0", API]);
  if (p.exitCode !== 0) throw new Error("não foi possível consultar o catálogo do TSE");
  const json = JSON.parse(p.stdout.toString()) as { result?: { resources?: Recurso[] } };
  return json.result?.resources ?? [];
}

async function baixar(url: string, destino: string): Promise<void> {
  if (existsSync(destino) && statSync(destino).size > 0) return;
  mkdirSync(CACHE, { recursive: true });
  console.log(`[bu] baixando ${basename(destino)}…`);
  const p = Bun.spawnSync(["curl", "-L", "--fail", "-sS", "-A", "Mozilla/5.0", "-o", destino, url]);
  if (p.exitCode !== 0 || !existsSync(destino) || statSync(destino).size === 0) throw new Error(`falha ao baixar ${url}`);
}

function indice(): void {
  const arquivos = readdirSync(OUT).filter((n) => n.endsWith(".json") && n !== "index.json");
  const itens = arquivos.flatMap((arquivo) => {
    try {
      const b = JSON.parse(readFileSync(`${OUT}/${arquivo}`, "utf8")) as BuArquivo;
      return [{ arquivo, uf: b.uf, cargo: b.cargo, turno: b.turno, ano: b.ano, geradoEm: b.geradoEm, municipios: b.municipios.length, secoes: b.total.secoes, fonteUrl: b.fonteUrl }];
    } catch { return []; }
  }).sort((a, b) => a.uf.localeCompare(b.uf) || a.cargo.localeCompare(b.cargo));
  writeFileSync(`${OUT}/index.json`, `${JSON.stringify({ geradoEm: new Date().toISOString(), itens }, null, 2)}\n`);
}

async function main() {
  const todos = await recursos();
  mkdirSync(OUT, { recursive: true });
  for (const uf of UFS) {
    const candidatos = todos.filter((r) => r.url.endsWith(".zip") && new RegExp(`^${uf} - Boletim de Urna - ${turnoTxt}`, "i").test(r.name));
    if (!candidatos.length) {
      console.warn(`[bu] ${uf}: sem arquivo do ${turnoTxt} no catálogo (${DATASET}); nada a fazer`);
      continue;
    }
    // Se o TSE publicar mais de um arquivo para o mesmo turno, o mais novo (data no nome) vence.
    const recurso = candidatos.sort((a, b) => b.name.localeCompare(a.name))[0]!;
    const zip = `${CACHE}/${basename(recurso.url)}`;
    await baixar(recurso.url, zip);
    const csv = `${basename(recurso.url, ".zip")}.csv`;
    const t0 = Date.now();
    const agg = novoAgregador();
    const linhas = await forEachZipRow(zip, csv, (r) => agg.push(r));
    const saida = agg.resultado(ANO, uf, TURNO, "https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna");
    for (const b of saida) {
      const nome = `${uf.toLowerCase()}-${slug(b.cargo)}-${TURNO}t.json`;
      writeFileSync(`${OUT}/${nome}`, `${JSON.stringify(b)}\n`);
      console.log(`[bu] ${uf} ${b.cargo}: ${b.municipios.length} municípios, ${b.total.secoes} seções, ${b.total.candidatos.length} candidatos -> ${nome}`);
    }
    console.log(`[bu] ${uf}: ${linhas} linhas em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  indice();
}

await main();
export type { CargoBu };
