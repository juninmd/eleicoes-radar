import { describe, expect, test } from "bun:test";
import { candHash, isCandHash, parseCandLink } from "./cand-link.js";

// A malformed hash comes from a pasted or edited URL: it must read as "no link", never throw.
describe("link direto de candidato (#cand=)", () => {
  test("accepts an SQ id with the UF, normalizing the UF case", () => {
    expect(parseCandLink("#cand=250001234567&uf=sp")).toEqual({ id: "250001234567", uf: "SP" });
  });

  test("without a UF the id alone is kept (the current UF is used)", () => {
    expect(parseCandLink("#cand=250001234567")).toEqual({ id: "250001234567" });
  });

  test("uf=BR is dropped: the national list is always loaded, so BR as a state would load it twice", () => {
    expect(parseCandLink("#cand=250001234567&uf=BR")).toEqual({ id: "250001234567" });
  });

  test("a lone percent sign is not a link and does not throw", () => {
    expect(parseCandLink("#cand=%")).toBeNull();
  });

  test("an invalid escape sequence is not a link and does not throw", () => {
    expect(parseCandLink("#cand=%E0")).toBeNull();
  });

  test("an id with letters is rejected: SQ ids are digits only", () => {
    expect(parseCandLink("#cand=abc")).toBeNull();
    expect(parseCandLink("#cand=2500x")).toBeNull();
  });

  test("an id longer than any SQ is rejected", () => {
    expect(parseCandLink(`#cand=${"1".repeat(21)}`)).toBeNull();
  });

  test("an empty id, an empty hash and another screen's hash are not links", () => {
    expect(parseCandLink("#cand=")).toBeNull();
    expect(parseCandLink("")).toBeNull();
    expect(parseCandLink("#sobre")).toBeNull();
    expect(parseCandLink("#apuracao?c=Presidente&uf=BR")).toBeNull();
  });

  test("extra parameters make the hash unknown instead of half-parsed", () => {
    expect(parseCandLink("#cand=250001234567&uf=SP&x=1")).toBeNull();
  });

  test("the hash this app writes parses back to the same candidate and UF", () => {
    expect(parseCandLink(candHash("250001234567", "RJ"))).toEqual({ id: "250001234567", uf: "RJ" });
  });

  test("only #cand= hashes are cleared when the dossier closes", () => {
    expect(isCandHash("#cand=250001234567&uf=SP")).toBe(true);
    expect(isCandHash("#apuracao?c=Presidente")).toBe(false);
    expect(isCandHash("")).toBe(false);
  });
});
