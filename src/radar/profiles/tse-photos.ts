// Official TSE portraits from foto_cand2026_<UF>_div.zip (downloaded manually: the
// TSE CDN rejects automated clients). File names carry the SQ_CANDIDATO.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";
import sharp from "sharp";

const SRC = "data/tse";
const OUT = "data/fotos";
const NAME = /^F[A-Z]{2}(\d+)_div\.jpe?g$/i;

export const sqFromPhotoName = (name: string): string | null => NAME.exec(name.split("/").pop() ?? "")?.[1] ?? null;

export async function loadTsePhotos(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!existsSync(SRC)) return out;
  mkdirSync(OUT, { recursive: true });
  for (const zip of readdirSync(SRC).filter((f) => /^foto_cand2026_[A-Z]{2}_div\.zip$/.test(f))) {
    const files = unzipSync(readFileSync(`${SRC}/${zip}`), { filter: (f) => sqFromPhotoName(f.name) !== null });
    for (const [name, data] of Object.entries(files)) {
      const sq = sqFromPhotoName(name)!;
      const file = `${OUT}/tse-${sq}.jpg`;
      if (!existsSync(file)) {
        try {
          writeFileSync(file, await sharp(data).resize(72, 90, { fit: "cover", position: "attention" }).jpeg({ quality: 70, mozjpeg: true }).toBuffer());
        } catch (e) {
          console.warn(`[fotos] ${zip}/${name} ilegível: ${(e as Error).message}`);
          continue;
        }
      }
      out.set(sq, file);
    }
    console.log(`[fotos] ${zip}: ${Object.keys(files).length} fotos`);
  }
  return out;
}
