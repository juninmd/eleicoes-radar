import { expect, test, describe } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sidecarOf } from "./sidecar";
import type { FornecedorView } from "./view";

const sup = (cnpj: string, nome = "EMPRESA LTDA"): FornecedorView => ({
  nome, cnpj, valor: 100, via: ["campanha"], cnae: "", empresa: null, nova: false, outros: 0, outrosTop: [], flags: [],
});

// Every string value except the candidate and politician ids (SQ, 11 digits by design).
function textos(v: unknown, out: string[] = [], chave = ""): string[] {
  if (typeof v === "string") { if (chave !== "id") out.push(v); }
  else if (Array.isArray(v)) for (const x of v) textos(x, out, chave);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) textos(x, out, k);
  return out;
}
const CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}|(?<!\d)\d{11}(?!\d)/;

describe("supplier sidecar", () => {
  test("keys each list by candidate id and drops candidates with no suppliers", () => {
    const side = sidecarOf([["10", [sup("11222333000181")]], ["11", []], ["12", [sup("53721430000169"), sup("11444777000161")]]]);
    expect(Object.keys(side)).toEqual(["10", "12"]);
    expect(side["12"]).toHaveLength(2);
  });

  test("no entries gives an empty object, so a UF with no suppliers still writes a valid file", () => {
    expect(sidecarOf([])).toEqual({});
  });
});

// Regression: the generated files (sidecar included) must not carry a CPF. Runs only where web/data was built.
describe.skipIf(!existsSync("web/data/uf"))("generated UF files", () => {
  test("no CPF in any UF file or sidecar, outside the candidate and politician ids", () => {
    const ficheiros = readdirSync("web/data/uf").filter((f) => f.endsWith(".json"));
    expect(ficheiros.length).toBeGreaterThan(0);
    for (const f of ficheiros) {
      const dados = JSON.parse(readFileSync(join("web/data/uf", f), "utf8"));
      // Counts only: a failure must not print the value it found.
      expect({ arquivo: f, cpf: textos(dados).filter((t) => CPF.test(t)).length }).toEqual({ arquivo: f, cpf: 0 });
    }
  });
});
