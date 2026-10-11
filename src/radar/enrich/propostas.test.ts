import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { loadPropostas, parsePropostaName } from "./propostas";
import { propostaBlock } from "../../../web/dossier";

describe("propostas", () => {
  test("reads SQ and version from the TSE file name, ignores leiame", () => {
    expect(parsePropostaName("AC/2026AC10002532492_01.pdf")).toEqual({ sq: "10002532492", versao: 1 });
    expect(parsePropostaName("BR/2026BR280002538811_02.pdf")).toEqual({ sq: "280002538811", versao: 2 });
    expect(parsePropostaName("AC/leiame.pdf")).toBeNull();
  });

  test("copies the newest version per candidacy unchanged, skips empty files", () => {
    const dir = mkdtempSync(join(tmpdir(), "prop-"));
    const out = join(dir, "out");
    const pdf = (s: string) => new TextEncoder().encode(s);
    writeFileSync(
      join(dir, "proposta_governo_2026_AC.zip"),
      zipSync({
        "AC/2026AC111_01.pdf": pdf("old"),
        "AC/2026AC111_02.pdf": pdf("newer version"),
        "AC/2026AC222_01.pdf": new Uint8Array(0),
        "AC/leiame.pdf": pdf("x"),
      }),
    );
    writeFileSync(join(dir, "other.zip"), "ignored");
    const m = loadPropostas(dir, out);
    expect([...m.keys()]).toEqual(["111"]);
    expect(m.get("111")).toEqual({ kb: 0 });
    expect(readFileSync(join(out, "111.pdf"), "utf8")).toBe("newer version");
    expect(existsSync(join(out, "222.pdf"))).toBe(false);
    expect(loadPropostas(join(dir, "missing"), out).size).toBe(0);
  });
});

describe("propostaBlock", () => {
  test("nothing without a plan; download link with size otherwise", () => {
    expect(propostaBlock(null, "1")).toBe("");
    const a = propostaBlock({ kb: 512 }, "10002532492");
    expect(a).toContain('href="data/propostas/10002532492.pdf"');
    expect(a).toContain("download=");
    expect(a).toContain("512 KB");
    expect(propostaBlock({ kb: 5188 }, "1")).toContain("5,1 MB");
  });
});
