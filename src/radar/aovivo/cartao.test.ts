import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { ALTURA, cartaoPng, cartaoUrl, criarCartoes, LARGURA, PASSOS_DUELO } from "./cartao";

// Decodes the PNG back (signature, IHDR, IDAT) so the test reads real pixels instead of trusting the encoder.
function ler(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(v.getUint32(16)).toBe(LARGURA);
  expect(v.getUint32(20)).toBe(ALTURA);
  let at = 8, idat: Uint8Array = new Uint8Array();
  while (at < b.length) {
    const n = v.getUint32(at), tipo = String.fromCharCode(...b.subarray(at + 4, at + 8));
    if (tipo === "IDAT") idat = b.subarray(at + 8, at + 8 + n);
    at += 12 + n;
  }
  const cru = inflateSync(idat);
  return (x: number, y: number) => { const o = y * (LARGURA * 3 + 1) + 1 + x * 3; return [cru[o], cru[o + 1], cru[o + 2]]; };
}

describe("cartão do aviso", () => {
  test("is a valid PNG whose bars follow the numbers: the front-runner's share on the left, sections counted below", () => {
    const px = ler(cartaoPng(120, 25)); // 60% of the two, 25% of the sections
    const util = LARGURA - 80;
    expect(px(40 + Math.floor(util * 0.4), 150)).toEqual([42, 157, 143]); // inside the front-runner's part (before the 60% cut)
    expect(px(40 + Math.floor(util * 0.7), 150)).toEqual([233, 162, 59]); // after the cut
    expect(px(40 + Math.floor(util * 0.2), 280)).toEqual([196, 202, 216]); // counted
    expect(px(40 + Math.floor(util * 0.6), 280)).toEqual([58, 64, 80]); // not counted yet
    expect(px(40 + util / 2, 90)).toEqual([255, 255, 255]); // the 50% line rises above the bar
    expect(px(5, 5)).toEqual([27, 31, 42]);
  });
  test("out-of-range input is clamped, not trusted", () => {
    expect(cartaoPng(-5, 900)).toEqual(cartaoPng(0, 100));
    expect(cartaoPng(PASSOS_DUELO + 50, 0)).toEqual(cartaoPng(PASSOS_DUELO, 0));
  });
  test("the url encodes the same steps the endpoint accepts, and the cache is bounded", () => {
    expect(cartaoUrl(0.6, 0.25)).toBe("/api/aovivo/cartao.png?a=120&s=25");
    expect(cartaoUrl(5, -1)).toBe("/api/aovivo/cartao.png?a=200&s=0");
    const cartoes = criarCartoes(2);
    const a = cartoes(10, 10);
    expect(cartoes(10, 10)).toBe(a); // cached
    cartoes(11, 10); cartoes(12, 10);
    expect(cartoes(10, 10)).not.toBe(a); // the oldest was evicted
  });
});
