import { expect, test } from "bun:test";
import { score } from "./score.js";

const w = { presenca: 2, producao: 2, economia: 1, apoio: 1, diversificacao: 1, independencia: 0 };

test("missing indicators count as median, so partial evidence cannot top a full record", () => {
  const onlyCampaign = score({ apoio: 1, diversificacao: 1 }, w);
  const solidRecord = score({ presenca: 0.8, producao: 0.8, economia: 0.8, apoio: 0.8, diversificacao: 0.8 }, w);
  expect(onlyCampaign.nota).toBe(64);
  expect(onlyCampaign.cobertura).toBeCloseTo(2 / 7);
  expect(solidRecord.nota).toBeGreaterThan(onlyCampaign.nota);
});

test("zero weight on everything yields no score instead of NaN", () => {
  expect(score({ apoio: 1 }, {}).nota).toBeNull();
});
