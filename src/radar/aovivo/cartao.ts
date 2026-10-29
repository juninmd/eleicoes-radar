// The picture of a push notification: a bar of the two front-runners' share of their valid votes (the white line is 50%) over a bar of the
// sections counted. No text and no party colours on purpose: the title and body say who is who, in the same left-to-right order, and the
// picture never suggests a side. Drawn pixel by pixel and encoded as PNG with zlib, so there is no dependency and no font to ship.
import { deflateSync } from "node:zlib";

export const LARGURA = 720, ALTURA = 360; // 2:1, what notification images are cropped to
export const PASSOS_DUELO = 200; // 0,5 p.p. steps: few distinct pictures, so the cache stays small and a flood of query strings costs nothing
export const PASSOS_SECOES = 100;

const FUNDO: Rgb = [27, 31, 42], LIDER: Rgb = [42, 157, 143], OUTRO: Rgb = [233, 162, 59], LINHA: Rgb = [255, 255, 255], TRILHO: Rgb = [58, 64, 80], CONTADAS: Rgb = [196, 202, 216];
type Rgb = [number, number, number];

const TABELA = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Uint8Array): number => { let c = 0xffffffff; for (const x of b) c = TABELA[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function bloco(tipo: string, dados: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + dados.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, dados.length);
  for (let i = 0; i < 4; i++) out[4 + i] = tipo.charCodeAt(i);
  out.set(dados, 8);
  v.setUint32(8 + dados.length, crc32(out.subarray(4, 8 + dados.length)));
  return out;
}

type Bytes = Uint8Array<ArrayBuffer>;

export function png(largura: number, altura: number, pixel: (x: number, y: number) => Rgb): Bytes {
  const linhas = new Uint8Array((largura * 3 + 1) * altura); // each row starts with filter byte 0
  for (let y = 0; y < altura; y++) {
    let o = y * (largura * 3 + 1) + 1;
    for (let x = 0; x < largura; x++) { const [r, g, b] = pixel(x, y); linhas[o++] = r; linhas[o++] = g; linhas[o++] = b; }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, largura); v.setUint32(4, altura);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, no interlace
  const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(linhas, { level: 9 })), bloco("IEND", new Uint8Array())];
  const out: Bytes = new Uint8Array(new ArrayBuffer(partes.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const p of partes) { out.set(p, at); at += p.length; }
  return out;
}

const MARGEM = 40, DUELO = [100, 220], LINHA_DUELO = [80, 240], SECOES = [268, 296];
const dentro = (v: number, [a, b]: number[]) => v >= a! && v < b!;

// duelo: 0..PASSOS_DUELO (the front-runner's share of the two, in 0,5 p.p.); secoes: 0..PASSOS_SECOES (% of sections counted).
export function cartaoPng(duelo: number, secoes: number): Bytes {
  const d = Math.min(PASSOS_DUELO, Math.max(0, Math.round(duelo)));
  const s = Math.min(PASSOS_SECOES, Math.max(0, Math.round(secoes)));
  const util = LARGURA - 2 * MARGEM;
  const corte = MARGEM + Math.round((util * d) / PASSOS_DUELO);
  const fim = MARGEM + Math.round((util * s) / PASSOS_SECOES);
  const meio = MARGEM + util / 2;
  return png(LARGURA, ALTURA, (x, y) => {
    if (dentro(x, [meio - 2, meio + 2]) && dentro(y, LINHA_DUELO)) return LINHA;
    if (dentro(y, DUELO) && dentro(x, [MARGEM, LARGURA - MARGEM])) return x < corte ? LIDER : OUTRO;
    if (dentro(y, SECOES) && dentro(x, [MARGEM, LARGURA - MARGEM])) return x < fim ? CONTADAS : TRILHO;
    return FUNDO;
  });
}

// "/api/aovivo/cartao.png?a=..&s=.." for the share of the front-runner among the two (0..1) and the fraction of sections counted (0..1).
export const cartaoUrl = (lider: number, avanco: number): string =>
  `/api/aovivo/cartao.png?a=${Math.round(Math.min(1, Math.max(0, lider)) * PASSOS_DUELO)}&s=${Math.round(Math.min(1, Math.max(0, avanco)) * PASSOS_SECOES)}`;

// A small bounded cache (the picture is a pure function of two small integers).
export function criarCartoes(max = 300) {
  const cache = new Map<string, Bytes>();
  return (d: number, s: number): Bytes => {
    const k = `${d}:${s}`;
    const achado = cache.get(k);
    if (achado) { cache.delete(k); cache.set(k, achado); return achado; }
    const novo = cartaoPng(d, s);
    cache.set(k, novo);
    if (cache.size > max) cache.delete(cache.keys().next().value as string);
    return novo;
  };
}
