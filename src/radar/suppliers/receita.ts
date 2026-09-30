// Company registry lookup (Receita Federal data through BrasilAPI, no API key).
// Results are appended to a JSONL cache so the multi-hour run can be stopped and resumed.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { UA } from "../profiles/wikidata";

const CACHE = "data/receita/cnpj.jsonl";
// Two keyless mirrors with the same schema; workers alternate so each one's rate limit applies to half the load.
const PROVIDERS = ["https://brasilapi.com.br/api/cnpj/v1", "https://minhareceita.org"];

export interface Empresa {
  cnpj: string;
  encontrada: boolean;
  razao?: string;
  situacao?: string; // ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA
  situacaoDesde?: string;
  abertura?: string; // ISO date
  capital?: number;
  porte?: string;
  cnae?: string;
  endereco?: { logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string; cep: string };
}

export function loadCache(path = CACHE): Map<string, Empresa> {
  const out = new Map<string, Empresa>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const e: Empresa = JSON.parse(line);
      out.set(e.cnpj, e);
    } catch {
      // torn last line from an interrupted run: the CNPJ is simply fetched again
    }
  }
  return out;
}

const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");

export function toEmpresa(cnpj: string, j: any): Empresa {
  const tipo = s(j.descricao_tipo_de_logradouro);
  return {
    cnpj,
    encontrada: true,
    razao: s(j.razao_social),
    situacao: s(j.descricao_situacao_cadastral),
    situacaoDesde: s(j.data_situacao_cadastral) || undefined,
    abertura: s(j.data_inicio_atividade) || undefined,
    capital: typeof j.capital_social === "number" ? j.capital_social : undefined,
    porte: s(j.porte) || s(j.descricao_porte) || undefined,
    cnae: s(j.cnae_fiscal_descricao) || undefined,
    endereco: {
      logradouro: [tipo, s(j.logradouro)].filter(Boolean).join(" "),
      numero: s(j.numero),
      complemento: s(j.complemento),
      bairro: s(j.bairro),
      municipio: s(j.municipio),
      uf: s(j.uf),
      cep: s(j.cep),
    },
  };
}

// null = transient failure (do not cache; retried on the next run).
export async function lookup(cnpj: string, prefer = 0): Promise<Empresa | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const api = PROVIDERS[(prefer + attempt) % PROVIDERS.length]!;
    let res: Response;
    try {
      res = await fetch(`${api}/${cnpj}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    } catch {
      continue; // the other mirror takes the next attempt
    }
    if (res.status === 200) return toEmpresa(cnpj, await res.json());
    if (res.status === 404 || res.status === 400) return { cnpj, encontrada: false };
    await Bun.sleep(Number(res.headers.get("retry-after") || 0) * 1000 || 1500 * (attempt + 1)); // 429/5xx
  }
  return null;
}

export function remember(e: Empresa, path = CACHE) {
  mkdirSync("data/receita", { recursive: true });
  appendFileSync(path, JSON.stringify(e) + "\n");
}
