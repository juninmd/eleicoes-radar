import { expect, test } from "bun:test";
import { maskCpf } from "./privacy";

test("masks a CPF formatted or not, with or without a label, and nothing else", () => {
  expect(maskCpf("CARLOS MOREIRA 489.909.226-15")).toBe("CARLOS MOREIRA (CPF omitido)");
  expect(maskCpf("JOAO DA SILVA 12345678901")).toBe("JOAO DA SILVA (CPF omitido)");
  expect(maskCpf("MARIA SOUZA CPF: 123.456.789-01.")).toBe("MARIA SOUZA (CPF omitido).");
  expect(maskCpf("ANA - 123.456.789-01 ME")).toBe("ANA - (CPF omitido) ME");
});

test("an 11-digit phone with area code is masked too: it is indistinguishable from a CPF, so it fails safe", () => {
  expect(maskCpf("LOJA 11987654321")).toBe("LOJA (CPF omitido)");
});

test("CNPJs, shorter numbers and longer digit runs are left alone", () => {
  expect(maskCpf("EMPRESA LTDA 12.345.678/0001-90")).toBe("EMPRESA LTDA 12.345.678/0001-90");
  expect(maskCpf("EMPRESA 11222333000181")).toBe("EMPRESA 11222333000181");
  expect(maskCpf("LOJA 123456789")).toBe("LOJA 123456789");
  expect(maskCpf("")).toBe("");
});
