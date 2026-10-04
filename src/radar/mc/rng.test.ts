import { describe, expect, test } from "bun:test";
import { makeRng } from "./rng";

describe("rng", () => {
  test("the same seed gives the same sequence, another seed a different one", () => {
    const a = makeRng("SP|DEPUTADO FEDERAL");
    const b = makeRng("SP|DEPUTADO FEDERAL");
    const c = makeRng("RJ|DEPUTADO FEDERAL");
    const xs = Array.from({ length: 5 }, () => a.normal());
    expect(Array.from({ length: 5 }, () => b.normal())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c.normal())).not.toEqual(xs);
  });

  test("uniforms stay in [0, 1) and normals have mean 0 and sd 1", () => {
    const r = makeRng("moments");
    const u = Array.from({ length: 20000 }, () => r.uniform());
    expect(Math.min(...u)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...u)).toBeLessThan(1);
    const z = Array.from({ length: 40000 }, () => r.normal());
    const mean = z.reduce((s, x) => s + x, 0) / z.length;
    const sd = Math.sqrt(z.reduce((s, x) => s + (x - mean) ** 2, 0) / z.length);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sd - 1)).toBeLessThan(0.02);
  });

  test("tails are normal-sized: about 5% beyond 1.96 sd", () => {
    const r = makeRng("tails");
    const z = Array.from({ length: 40000 }, () => r.normal());
    const share = z.filter((x) => Math.abs(x) > 1.96).length / z.length;
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.06);
  });
});
