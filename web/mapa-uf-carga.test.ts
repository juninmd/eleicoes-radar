import { expect, test } from "bun:test";
import { carregarMapaUf } from "./mapa-uf-carga.js";

test("concurrent callers share one request; a failure is retried", async () => {
  let n = 0;
  const falha = (async () => { n++; return new Response("x", { status: 500 }); }) as unknown as typeof fetch;
  await expect(carregarMapaUf(falha)).rejects.toThrow("HTTP 500");
  const nulo = (async () => Response.json(null)) as unknown as typeof fetch;
  await expect(carregarMapaUf(nulo)).rejects.toThrow("vazio");
  const ok = (async () => { n++; return Response.json({ viewBox: [0, 0, 1, 1] }); }) as unknown as typeof fetch;
  const [a, b] = await Promise.all([carregarMapaUf(ok), carregarMapaUf(ok)]);
  expect(a).toBe(b);
  expect(n).toBe(2);
});
