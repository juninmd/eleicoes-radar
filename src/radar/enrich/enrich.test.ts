import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { addBem, personKey } from "./bens";
import { loadMotivos } from "./cassacao";
import { safeLinks } from "../profiles/extra";
import { parseRegistry } from "../tse-cand";
import { maskCpf } from "../build";

describe("bens", () => {
  test("sums assets per candidacy and groups by type", () => {
    const m = new Map();
    const row = (v: string, t: string) => ({ SQ_CANDIDATO: "9", VR_BEM_CANDIDATO: v, DS_TIPO_BEM_CANDIDATO: t });
    addBem(m, row("1.000,50", "Casa"));
    addBem(m, row("500,00", "Veículo automotor terrestre: caminhão, automóvel"));
    addBem(m, row("250,00", "Casa"));
    addBem(m, { SQ_CANDIDATO: "9", VR_BEM_CANDIDATO: "" }); // skipped, not counted as zero
    const e = m.get("9");
    expect(e.total).toBe(1750.5);
    expect(e.n).toBe(3);
    expect(e.tipos.get("Casa")).toBe(1250.5);
    expect(e.tipos.get("Veículo automotor terrestre")).toBe(500);
  });

  test("person key uses CPF when unmasked, else name + birth date, else nothing", () => {
    expect(personKey("123.456.789-01", "Ana", "1980-01-01")).toBe("cpf:12345678901");
    expect(personKey("-4", "Ana Souza", "1980-01-01")).toBe("nome:ANA SOUZA|1980-01-01");
    expect(personKey("-4", "Ana Souza", null)).toBeNull();
  });
});

describe("motivos", () => {
  test("collects distinct grounds per candidacy from the BRASIL file", async () => {
    const csv = '"SQ_CANDIDATO";"DS_TP_MOTIVO";"DS_MOTIVO"\n"1";"x";"Ausência de quitação eleitoral"\n"1";"x";"Ausência de quitação eleitoral"\n"2";"x";"Outros"\n';
    const dir = mkdtempSync(join(tmpdir(), "motivo-"));
    const zip = join(dir, "m.zip");
    writeFileSync(zip, zipSync({ "motivo_cassacao_2026_BRASIL.csv": Buffer.from(csv, "latin1") }));
    const m = await loadMotivos(zip);
    expect(m.get("1")).toEqual(["Ausência de quitação eleitoral"]);
    expect(m.get("2")).toEqual(["Outros"]);
  });
});

describe("links", () => {
  test("keeps only https links to known social hosts (rendered as-is in the page)", () => {
    const out = safeLinks(["http://twitter.com/a", "https://www.instagram.com/b", "javascript:alert(1)", "https://evil.example/x", "https://facebook.com.evil.example/x"]);
    expect(out).toEqual(["https://twitter.com/a", "https://www.instagram.com/b"]);
  });
});

describe("registry", () => {
  test("keeps marital status and shows a coalition only when there is one", () => {
    const base = { SQ_CANDIDATO: "1", DS_CARGO: "DEPUTADO FEDERAL", NM_CANDIDATO: "A", DS_ESTADO_CIVIL: "CASADO(A)", NR_CPF_CANDIDATO: "-4" };
    const solo = parseRegistry([{ ...base, NM_COLIGACAO: "PARTIDO ISOLADO", DS_COMPOSICAO_COLIGACAO: "XYZ" }]).get("1")!;
    const coal = parseRegistry([{ ...base, NM_COLIGACAO: "FRENTE", DS_COMPOSICAO_COLIGACAO: "A / B" }]).get("1")!;
    expect(solo.estadoCivil).toBe("CASADO(A)");
    expect(solo.coligacao).toBe("");
    expect(coal.coligacao).toBe("FRENTE: A / B");
  });
});

describe("public output", () => {
  test("supplier names never carry a formatted CPF", () => {
    expect(maskCpf("CARLOS MOREIRA 489.909.226-15")).toBe("CARLOS MOREIRA (CPF omitido)");
    expect(maskCpf("EMPRESA LTDA 12.345.678/0001-90")).toBe("EMPRESA LTDA 12.345.678/0001-90");
  });
});
