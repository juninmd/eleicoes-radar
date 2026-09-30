import { describe, expect, test } from "bun:test";
import { isValidCnpj } from "./cnpj";
import { addCampaign, addCeap, type Directory, type Suppliers } from "./collect";
import { supplierFlags } from "./flags";
import { byPolitician, supplierView } from "./view";
import type { Empresa } from "./receita";

const OK = "11222333000181";
const camp = (over: Record<string, string>) => ({
  SQ_CANDIDATO: "10", NR_CPF_CNPJ_FORNECEDOR: OK, NM_FORNECEDOR_RFB: "GRAFICA LTDA", DS_ORIGEM_DESPESA: "Publicidade",
  SQ_CANDIDATO_FORNECEDOR: "-1", DT_DESPESA: "08/09/2026", VR_DESPESA_CONTRATADA: "1.000,00", ...over,
});

describe("cnpj", () => {
  test("validates check digits and rejects repeated digits", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
  });
});

describe("collect", () => {
  test("keeps only vendors: skips individuals, bank fees and campaign-to-campaign transfers", () => {
    const all: Suppliers = new Map();
    addCampaign(all, camp({}));
    addCampaign(all, camp({ NR_CPF_CNPJ_FORNECEDOR: "12345678901" }));
    addCampaign(all, camp({ DS_ORIGEM_DESPESA: "Encargos financeiros, taxas bancárias" }));
    addCampaign(all, camp({ SQ_CANDIDATO_FORNECEDOR: "77" }));
    expect([...all.keys()]).toEqual([OK]);
    expect(all.get(OK)!.pagos.get("10")!.valor).toBe(1000);
  });

  test("a deputy who is also a candidate counts once across campaign and quota", () => {
    const all: Suppliers = new Map();
    const dir: Directory = new Map();
    addCampaign(all, camp({}));
    addCeap(all, dir, new Map([[5, "10"]]), { codLegislatura: "57", ideCadastro: "5", txtCNPJCPF: "11.222.333/0001-81", txtFornecedor: "GRAFICA LTDA", vlrLiquido: "500", datEmissao: "2025-01-02T00:00:00", txNomeParlamentar: "X", sgUF: "SP", sgPartido: "P" });
    const s = all.get(OK)!;
    expect(s.pagos.size).toBe(1);
    expect(s.pagos.get("10")!.valor).toBe(1500);
    expect([...s.pagos.get("10")!.via].sort()).toEqual(["campanha", "cota"]);
    expect(s.primeiroPagamento).toBe("2025-01-02");
  });
});

describe("flags", () => {
  const base = { cnpj: OK, total: 200_000, primeiroPagamento: "2026-09-01", mesmoEndereco: 0 };
  const emp = (o: Partial<Empresa>): Empresa => ({ cnpj: OK, encontrada: true, situacao: "ATIVA", abertura: "2010-01-01", capital: 1_000_000, ...o });
  test("a healthy old active company raises nothing", () => {
    expect(supplierFlags({ ...base, empresa: emp({}) })).toEqual([]);
  });
  test("flags young company, inactive status, tiny capital, shared address and unknown CNPJ", () => {
    const f = supplierFlags({ ...base, mesmoEndereco: 5, empresa: emp({ abertura: "2026-06-01", situacao: "BAIXADA", capital: 1000 }) });
    expect(f.length).toBe(4);
    expect(supplierFlags({ ...base, empresa: { cnpj: OK, encontrada: false } })).toEqual(["CNPJ não localizado na base da Receita Federal"]);
    expect(supplierFlags({ ...base, cnpj: "11222333000182" })).toEqual(["CNPJ com dígito verificador inválido"]);
  });
  test("small totals never trip the capital rule", () => {
    expect(supplierFlags({ ...base, total: 5000, empresa: emp({ capital: 0 }) })).toEqual([]);
  });
});

describe("view", () => {
  test("lists the other politicians served, excluding the one being viewed", () => {
    const all: Suppliers = new Map();
    addCampaign(all, camp({ SQ_CANDIDATO: "10" }));
    addCampaign(all, camp({ SQ_CANDIDATO: "11", VR_DESPESA_CONTRATADA: "9.000,00" }));
    const dir: Directory = new Map([["10", { id: "10", nome: "A", cargo: "Governador", uf: "SP", partido: "P1" }], ["11", { id: "11", nome: "B", cargo: "Senador", uf: "RJ", partido: "P2" }]]);
    const v = supplierView("10", byPolitician(all).get("10")!, dir, new Map(), new Map());
    expect(v[0]!.outros).toBe(1);
    expect(v[0]!.outrosTop[0]).toMatchObject({ nome: "B", uf: "RJ", valor: 9000 });
    expect(v[0]!.cnpj).toBe("11.222.333/0001-81");
    expect(v[0]!.empresa).toBeNull();
  });
});

describe("graph", () => {
  test("excludes placeholder CNPJs (invalid check digits) and single-politician suppliers", async () => {
    const { buildRede } = await import("./graph");
    const all: Suppliers = new Map();
    const dir: Directory = new Map([["10", { id: "10", nome: "A", cargo: "X", uf: "SP", partido: "P1" }], ["11", { id: "11", nome: "B", cargo: "X", uf: "SP", partido: "P2" }]]);
    for (const cnpj of [OK, "00000000000006"]) {
      addCampaign(all, camp({ SQ_CANDIDATO: "10", NR_CPF_CNPJ_FORNECEDOR: cnpj }));
      addCampaign(all, camp({ SQ_CANDIDATO: "11", NR_CPF_CNPJ_FORNECEDOR: cnpj }));
    }
    addCampaign(all, camp({ SQ_CANDIDATO: "10", NR_CPF_CNPJ_FORNECEDOR: "53721430000169" }));
    const r = buildRede(all, dir, new Map(), new Map());
    expect(r.fornecedores.map((f) => f.id)).toEqual([OK]);
    expect(r.arestas.map((e) => e.p).sort()).toEqual(["P1", "P2"]);
  });
});

describe("new companies", () => {
  test("ranks only valid-CNPJ suppliers opened <1 year before the first payment, above the minimum total", async () => {
    const { buildRede } = await import("./graph");
    const all: Suppliers = new Map();
    const dir: Directory = new Map([["10", { id: "10", nome: "A", cargo: "X", uf: "SP", partido: "P1" }]]);
    const other = "53721430000169";
    addCampaign(all, camp({ SQ_CANDIDATO: "10", VR_DESPESA_CONTRATADA: "80.000,00", DT_DESPESA: "01/09/2026" })); // OK: young
    addCampaign(all, camp({ SQ_CANDIDATO: "10", NR_CPF_CNPJ_FORNECEDOR: other, VR_DESPESA_CONTRATADA: "80.000,00", DT_DESPESA: "01/09/2026" })); // old
    const emp = (cnpj: string, abertura: string): Empresa => ({ cnpj, encontrada: true, situacao: "ATIVA", abertura, capital: 1e6 });
    const r = buildRede(all, dir, new Map([[OK, emp(OK, "2026-03-01")], [other, emp(other, "2010-01-01")]]), new Map());
    expect(r.novas.map((n) => n.id)).toEqual([OK]);
    expect(r.novas[0]!.diasAntes).toBe(184);
    const v = supplierView("10", byPolitician(all).get("10")!, dir, new Map([[OK, emp(OK, "2026-03-01")], [other, emp(other, "2010-01-01")]]), new Map());
    expect(v.find((f) => f.cnpj === "11.222.333/0001-81")!.nova).toBe(true);
    expect(v.find((f) => f.cnpj !== "11.222.333/0001-81")!.nova).toBe(false);
  });
});
