// Legal grounds recorded against a registration (motivo_cassacao): candidacies the
// courts challenged or denied. A ground is not a final verdict; appeals may be pending.
import { existsSync } from "node:fs";
import { forEachZipRow } from "../zip-csv";

const ZIP = "data/tse/motivo_cassacao_2026.zip";

export async function loadMotivos(zip = ZIP): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!existsSync(zip)) return out;
  await forEachZipRow(zip, "motivo_cassacao_2026_BRASIL.csv", (r) => {
    const m = r.DS_MOTIVO?.trim();
    if (!r.SQ_CANDIDATO || !m) return;
    const list = out.get(r.SQ_CANDIDATO) ?? [];
    if (!list.includes(m)) list.push(m);
    out.set(r.SQ_CANDIDATO, list);
  });
  return out;
}
