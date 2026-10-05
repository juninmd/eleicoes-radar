import { expect, test } from "bun:test";
import { score } from "./score.js";

const w = { presenca: 2, producao: 2, economia: 1, apoio: 1, diversificacao: 1, independencia: 0 };

test("missing indicators count as median, so partial evidence cannot top a full record", () => {
  const onlyCampaign = score({ apoio: 1, diversificacao: 1 }, w);
  const solidRecord = score({ presenca: 0.8, producao: 0.8, economia: 0.8, apoio: 0.8, diversificacao: 0.8 }, w);
  expect(onlyCampaign.nota).toBe(64);
  expect(onlyCampaign.cobertura).toBeCloseTo(2 / 7);
  expect(solidRecord.nota).toBeGreaterThan(onlyCampaign.nota!);
});

test("zero weight on everything yields no score instead of NaN", () => {
  expect(score({ apoio: 1 }, {}).nota).toBeNull();
});

test("no evidence for any chosen indicator yields no score, not a made-up 50", () => {
  // A governor has no Chamber votes: every chosen indicator is missing, so the median fill would print 50 for everyone.
  const r = score({ apoio: 1 }, { presenca: 3, producao: 2 });
  expect(r.nota).toBeNull();
  expect(r.cobertura).toBe(0);
});

test("one indicator with evidence is enough to score; the rest still count as the median", () => {
  const r = score({ presenca: 1 }, { presenca: 1, producao: 1 });
  expect(r.nota).toBe(75);
  expect(r.cobertura).toBe(0.5);
});
