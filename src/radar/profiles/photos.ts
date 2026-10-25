// Downloads a portrait once, stores a small JPEG thumbnail (the artifact CSP blocks
// external images, so thumbnails ship inside the page's data files).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { UA } from "./wikidata";

const DIR = "data/fotos";

export interface Photo {
  file: string;
  credito: string;
}

export async function thumbnail(key: string, url: string): Promise<string | null> {
  const file = `${DIR}/${key}-hd.jpg`; // -hd: older 96x120 caches are not reused
  if (existsSync(file)) return file;
  mkdirSync(DIR, { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    console.warn(`[fotos] ${res.status} ${url}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const out = await sharp(buf).resize(192, 240, { fit: "cover", position: "attention" }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  writeFileSync(file, out);
  return file;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// Commons files need author + license shown next to the image.
export async function commonsPhoto(fileName: string): Promise<{ url: string; credito: string } | null> {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${fileName}`)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=240&format=json`;
  const res = await fetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) return null;
  const page: any = Object.values((await res.json()).query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  const meta = info.extmetadata ?? {};
  const autor = stripHtml(meta.Artist?.value ?? "autor desconhecido").slice(0, 80);
  const licenca = stripHtml(meta.LicenseShortName?.value ?? "licença no Commons");
  return { url: info.thumburl, credito: `${autor} · ${licenca} · Wikimedia Commons` };
}

export const dataUri = (file: string) => `data:image/jpeg;base64,${readFileSync(file).toString("base64")}`;
