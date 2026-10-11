// Government plans (proposta_governo_2026_<UF>.zip: one PDF per Presidente/Governador candidacy,
// file name 2026<UF><SQ_CANDIDATO>_<version>.pdf). The PDFs are copied unchanged to web/data/propostas/
// so the dossier can offer them for download; only the file size goes into the public JSON.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";

const SRC = "data/tse";
const OUT = "web/data/propostas";
const NAME = /(?:^|\/)2026[A-Z]{2}(\d+)_(\d+)\.pdf$/i;

export interface Proposta {
  kb: number;
}

export function parsePropostaName(name: string): { sq: string; versao: number } | null {
  const m = NAME.exec(name);
  return m ? { sq: m[1]!, versao: Number(m[2]) } : null;
}

export function loadPropostas(src = SRC, out = OUT): Map<string, Proposta> {
  const res = new Map<string, Proposta>();
  if (!existsSync(src)) return res;
  mkdirSync(out, { recursive: true });
  for (const zip of readdirSync(src).filter((f) => /^proposta_governo_2026_[A-Z]{2}\.zip$/.test(f))) {
    const latest = new Map<string, { versao: number; name: string; data: Uint8Array }>();
    const files = unzipSync(readFileSync(`${src}/${zip}`), { filter: (f) => parsePropostaName(f.name) !== null });
    for (const [name, data] of Object.entries(files)) {
      const p = parsePropostaName(name)!;
      if (data.length === 0) continue;
      if ((latest.get(p.sq)?.versao ?? -1) < p.versao) latest.set(p.sq, { versao: p.versao, name, data });
    }
    for (const [sq, { data }] of latest) {
      const file = `${out}/${sq}.pdf`;
      if (!existsSync(file) || statSync(file).size !== data.length) writeFileSync(file, data);
      res.set(sq, { kb: Math.round(data.length / 1024) });
    }
    console.log(`[propostas] ${zip}: ${latest.size} planos`);
  }
  return res;
}
