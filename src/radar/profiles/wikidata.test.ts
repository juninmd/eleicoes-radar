import { expect, test } from "bun:test";
import { seguidoresDe } from "./wikidata";

const claim = (amount: string, qualifier: string, date: string | null, rank = "normal") => ({
  mainsnak: { datavalue: { value: { amount } } },
  rank,
  qualifiers: { [qualifier]: [{ datavalue: { value: "id" } }], ...(date ? { P585: [{ datavalue: { value: { time: `+${date}T00:00:00Z` } } }] } : {}) },
});

test("keeps the most recent count per platform, named by the account-id qualifier", () => {
  const e = { id: "Q1", claims: { P8687: [claim("+9000000", "P6552", "2024-01-01"), claim("+9440106", "P6552", "2025-02-26"), claim("+1460000", "P2397", "2025-03-10")] } };
  expect(seguidoresDe(e)).toEqual([
    { rede: "x", n: 9440106, em: "2025-02-26" },
    { rede: "youtube", n: 1460000, em: "2025-03-10" },
  ]);
});

test("ignores undated, deprecated, zero and platform-less counts", () => {
  const e = {
    id: "Q1",
    claims: {
      P8687: [claim("+5", "P6552", null), claim("+7", "P2397", "2025-01-01", "deprecated"), claim("+0", "P12546", "2025-01-01"), claim("+9", "P9999", "2025-01-01")],
    },
  };
  expect(seguidoresDe(e)).toEqual([]);
  expect(seguidoresDe({ id: "Q2" })).toEqual([]);
});
