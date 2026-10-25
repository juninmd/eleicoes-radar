import { describe, expect, test } from "bun:test";
import { caminho, dominio2t, numeros, ondeFalta, parDe, pesquisas2t } from "./apuracao-aovivo-2t.js";
import type { PesquisaBruta } from "./apuracao-aovivo-2t.js";
import type { LadoPrev, Previsao } from "./apuracao-previsao.js";
import type { Apuracao, Fase } from "./apuracao-tse.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";

const A = "280000000001", B = "280000000002";
const cand = (id: string, votos: number, pct: number) => ({ id, nome: id === A ? "ANA ALFA" : "BETO BETA", partido: id === A ? "AAA" : "BBB", num: "1", votos, pct, destaque: false, situacao: "", lista: "" });
const arq = ({ a, b, apto = 1000, apurado = 500, validos, fase = "parcial", total = 100, tot = 50 }: { a: number; b: number; apto?: number; apurado?: number; validos?: number; fase?: Fase; total?: number; tot?: number }) => ({
  fase, versao: { data: "25/10/2026", hora: "20:00:00" }, secoes: { total, totalizadas: tot },
  eleitorado: { apto, apurado, comparecimento: Math.round(apurado * 0.8), abstencao: Math.round(apurado * 0.2) },
  votos: { total: Math.round(apurado * 0.8), validos: validos ?? a + b, brancos: 10, nulos: 30 },
  candidatos: [cand(a >= b ? A : B, Math.max(a, b), a + b > 0 ? Math.max(a, b) / (a + b) : 0), cand(a >= b ? B : A, Math.min(a, b), a + b > 0 ? Math.min(a, b) / (a + b) : 0)],
}) as unknown as Apuracao;
const poll = (instituto: string, fim: string, a: number, b: number, extra: Partial<PesquisaBruta> = {}): PesquisaBruta => ({ instituto, fim, votos: { [A]: a, [B]: b }, amostra: 2000, margem: 2, indecisos: 5, ...extra });
const par = { a: { id: A, nome: "ANA ALFA", partido: "AAA" }, b: { id: B, nome: "BETO BETA", partido: "BBB" } };

describe("parDe", () => {
  test("puts the one ahead in the poll average first, whichever leads the count", () => {
    expect(parDe(arq({ a: 100, b: 300 }), [{ a: A, b: B, qa: 0.52 }])!.a.id).toBe(A);
    expect(parDe(arq({ a: 300, b: 100 }), [{ a: A, b: B, qa: 0.48 }])!.a.id).toBe(B);
    expect(parDe(arq({ a: 300, b: 100 }), [{ a: B, b: A, qa: 0.6 }])!.a.id).toBe(B); // the average is stored the other way round
  });
  test("without an average the order is by id, so it does not flip with the count; no pair, no panel", () => {
    expect(parDe(arq({ a: 100, b: 300 }))!.a.id).toBe(A);
    expect(parDe(arq({ a: 300, b: 100 }))!.a.id).toBe(A);
    expect(parDe(null)).toBeNull();
    expect(parDe({ candidatos: [cand(A, 1, 1)] } as unknown as Apuracao)).toBeNull();
  });
});

describe("pesquisas2t", () => {
  const corrida = {
    confrontos: [{ a: A, b: B, qa: 0.5086, n: 22 }],
    segundoTurno: [poll("Velho", "2026-10-20", 46, 49), poll("Novo", "2026-10-24", 47, 48), poll("Novo", "2026-10-22", 40, 40), poll("Outro", "2026-10-23", 48.4, 49.9, { indecisos: 1.7 })],
  };

  test("turns each poll into the share of A among the two, newest first, one per institute", () => {
    const p = pesquisas2t(corrida, par)!;
    expect(p.linhas.map((l) => l.instituto)).toEqual(["Novo", "Outro", "Velho"]);
    expect(p.linhas[0]!.qa).toBeCloseTo(47 / 95, 10);
    expect(p.linhas[0]!.fim).toBe("2026-10-24"); // the newest of "Novo", not the 2026-10-22 one
    expect(p.linhas[1]!.qa).toBeCloseTo(48.4 / 98.3, 10);
  });

  test("the average is read in the orientation asked, and the count is compared with it", () => {
    const p = pesquisas2t(corrida, par, arq({ a: 520, b: 480 }))!;
    expect(p.media).toBeCloseTo(0.5086, 10);
    expect(p.nMedia).toBe(22);
    expect(p.atual).toBeCloseTo(0.52, 10);
    expect(p.dif).toBeCloseTo(0.52 - 0.5086, 10);
    expect(p.concluida).toBe(false);
    const invertido = pesquisas2t(corrida, { a: par.b, b: par.a }, arq({ a: 520, b: 480 }))!;
    expect(invertido.media).toBeCloseTo(1 - 0.5086, 10);
    expect(invertido.atual).toBeCloseTo(0.48, 10);
  });

  test("ignores polls without both names or with unusable numbers; nothing to show is null", () => {
    const sujo = { segundoTurno: [{ instituto: "X", fim: "2026-10-24", votos: { [A]: 50 } }, { instituto: "Y", fim: "2026-10-24", votos: { [A]: 0, [B]: 0 } }, { instituto: "Z", fim: "2026-10-24", votos: { [A]: Number.NaN, [B]: 40 } }] } as { segundoTurno: PesquisaBruta[] };
    expect(pesquisas2t(sujo, par)).toBeNull();
    expect(pesquisas2t(undefined, par)).toBeNull();
    expect(pesquisas2t({ confrontos: [{ a: A, b: B, qa: 0.5, n: 3 }] }, par)!.linhas).toEqual([]); // the average alone still has a panel
  });

  test("before any vote there is no count to compare", () => {
    const p = pesquisas2t(corrida, par, arq({ a: 0, b: 0, fase: "aguardando" }))!;
    expect(p.atual).toBeNull();
    expect(p.dif).toBeNull();
  });
});

describe("dominio2t", () => {
  test("is centred on 50% and holds every poll and the count, never narrower than 4 p.p.", () => {
    const base = { linhas: [], media: 0.5, nMedia: 1, atual: 0.5, dif: 0, concluida: false };
    const [lo0, hi0] = dominio2t(base);
    expect(lo0).toBeCloseTo(0.46, 10);
    expect(hi0).toBeCloseTo(0.54, 10);
    const [lo, hi] = dominio2t({ ...base, atual: 0.62 });
    expect(hi).toBeGreaterThan(0.62);
    expect((lo + hi) / 2).toBeCloseTo(0.5, 10);
    expect(dominio2t({ ...base, atual: 0.99 })[1]).toBeLessThanOrEqual(1);
  });
});

describe("numeros", () => {
  test("is the count in figures: the margin in votes, blanks and nulls of the votes cast, abstention of the electorate counted", () => {
    const n = numeros(arq({ a: 600, b: 400, apurado: 500 }))!;
    expect(n.diferenca).toBe(200);
    expect(n.lider!.id).toBe(A);
    expect(n.abstencaoPct).toBeCloseTo(0.2, 10);
    expect(n.comparecimentoPct).toBeCloseTo(0.8, 10);
    expect(n.brancosPct).toBeCloseTo(10 / 400, 10);
    expect(n.nulosPct).toBeCloseTo(30 / 400, 10);
    expect(n.secoesFaltam).toBe(50);
    expect(n.avanco).toBe(0.5);
    expect(n.concluida).toBe(false);
    expect(n.candidatos).toBe(2);
    expect(numeros(arq({ a: 600, b: 400, fase: "concluida", tot: 100 }))!.concluida).toBe(true);
  });
  test("a tie has no leader, and a file before the count has no figures", () => {
    expect(numeros(arq({ a: 500, b: 500 }))!.lider).toBeNull();
    expect(numeros(arq({ a: 0, b: 0, fase: "aguardando" }))).toBeNull();
    expect(numeros(null)).toBeNull();
  });
});

const lado = (id: string, apuracao: number | null, mc: number): LadoPrev => ({ id, nome: id === A ? "ANA ALFA" : "BETO BETA", partido: "P", chance: 0.5, pesquisa: null, apuracao, mc: [mc - 0.02, mc, mc + 0.02] });
const prev = (fav: LadoPrev, out: LadoPrev, o: Partial<Previsao> = {}): Previsao => ({ turno: 2, favorito: fav, outro: out, nivel: "aberta", n: 2000, contados: 0.5, apurados: 50, faltam: 50, decideNoPrimeiro: null, segundoTurno: null, defasadas: [], ...o });

describe("caminho", () => {
  test("what the one behind needs of the votes to come: (half of all valid votes - what he has) / what is left", () => {
    // 50 counted (A has 46%: 23), 50 to come: to reach 50 of 100, A needs 27 of 50 = 54%.
    const c = caminho(prev(lado(B, 0.54, 0.51), lado(A, 0.46, 0.49)))!;
    expect(c.atras.id).toBe(A);
    expect(c.frente.id).toBe(B);
    expect(c.precisa).toBeCloseTo(0.54, 10);
    expect(c.alcancavel).toBe(true);
    expect(c.tem).toBeCloseTo(0.46, 10);
  });

  test("reads the model's median of the final share back as the share of the votes to come", () => {
    // final 49% of 100 = 49; A already has 23 -> 26 of the 50 to come = 52%.
    expect(caminho(prev(lado(B, 0.54, 0.51), lado(A, 0.46, 0.49)))!.esperado).toBeCloseTo(0.52, 10);
  });

  test("needing more than every vote to come is not reachable, and it never shows a number above 100%", () => {
    const c = caminho(prev(lado(B, 0.8, 0.8), lado(A, 0.2, 0.2), { apurados: 90, faltam: 10 }))!;
    expect(c.alcancavel).toBe(false);
    expect(c.precisa).toBeGreaterThan(1);
  });

  test("only a runoff with votes to come and a leader has a path", () => {
    expect(caminho(null)).toBeNull();
    expect(caminho(prev(lado(B, 0.5, 0.5), lado(A, 0.5, 0.5)))).toBeNull(); // dead even: nobody is behind
    expect(caminho(prev(lado(B, 0.6, 0.6), lado(A, 0.4, 0.4), { turno: 1 }))).toBeNull();
    expect(caminho(prev(lado(B, 0.6, 0.6), lado(A, 0.4, 0.4), { faltam: 0 }))).toBeNull();
    expect(caminho(prev(lado(B, null, 0.5), lado(A, null, 0.5)))).toBeNull();
  });
});

const snap = (ufs: Record<string, Apuracao | null>, status: "ok" | "erro" = "ok"): BrasilSnapshot => ({ cargo: "Presidente", ciclo: 1, buscadoEm: null, ufs: Object.fromEntries(Object.entries(ufs).map(([k, d]) => [k, { status, dados: d, erro: null, buscadoEm: null }])) });

describe("ondeFalta", () => {
  // SP: 100 valid votes counted of 500 electorate counted out of 1000 -> 100 more to come; MG: 40 counted, 20 of 100 -> 160 to come.
  const nac = snap({
    SP: arq({ a: 60, b: 40, apto: 1000, apurado: 500, validos: 100 }),
    MG: arq({ a: 15, b: 25, apto: 600, apurado: 100, validos: 40 }),
    RR: arq({ a: 0, b: 0, fase: "aguardando", apto: 300, apurado: 0, tot: 0 }),
  });

  test("the votes to come follow the Projeção's formula, biggest first, with the leader and the margin of each place", () => {
    const o = ondeFalta(nac, { RR: 120 })!;
    expect(o.linhas.map((l) => l.uf)).toEqual(["MG", "RR", "SP"]);
    expect(o.linhas[0]!.faltam).toBeCloseTo((40 * (600 - 100)) / 100, 10);
    expect(o.linhas[2]!.faltam).toBeCloseTo((100 * (1000 - 500)) / 500, 10);
    expect(o.linhas[2]!.lider!.id).toBe(A);
    expect(o.linhas[2]!.margem).toBeCloseTo(0.2, 10); // 60% to 40%: the TSE's own shares, not a projection
    expect(o.total).toBeCloseTo(200 + 120 + 100, 10);
  });

  test("a state with no votes yet falls back to the model's estimate, or to nothing; it never has a leader", () => {
    expect(ondeFalta(nac, { RR: 120 })!.linhas.find((l) => l.uf === "RR")).toMatchObject({ faltam: 120, lider: null, estimado: true });
    expect(ondeFalta(nac)!.linhas.find((l) => l.uf === "RR")!.faltam).toBe(0);
    expect(ondeFalta(nac)!.aguardando).toBe(1);
  });

  test("counts the places each finalist leads, and flags the files kept after a failure", () => {
    const o = ondeFalta(nac)!;
    expect(o.placar).toEqual([{ id: A, n: 1 }, { id: B, n: 1 }].sort((x, y) => x.id.localeCompare(y.id)));
    expect(ondeFalta(snap({ SP: arq({ a: 60, b: 40 }) }, "erro"))!.linhas[0]!.defasada).toBe(true);
  });

  test("says why a place has no leader, and lists the files kept after a failure", () => {
    const sem = (status: "ok" | "erro" | "ausente" | "carregando", dados: Apuracao | null) => ({ status, dados, erro: null, buscadoEm: null });
    const o = ondeFalta({ cargo: "Presidente", ciclo: 1, buscadoEm: null, ufs: {
      SP: sem("ok", arq({ a: 60, b: 40 })), RR: sem("ok", arq({ a: 0, b: 0, fase: "aguardando", tot: 0 })),
      AC: sem("carregando", null), AM: sem("ausente", null), AP: sem("erro", null), MG: sem("erro", arq({ a: 15, b: 25 })),
    } })!;
    const de = (uf: string) => o.linhas.find((l) => l.uf === uf)!.situacao;
    expect([de("SP"), de("RR"), de("AC"), de("AM"), de("AP"), de("MG")]).toEqual(["contando", "aguardando", "carregando", "sem-arquivo", "erro", "contando"]);
    expect(o.defasadas.sort()).toEqual(["AM", "AP", "MG"]);
    expect(o.aguardando).toBe(4);
  });

  test("a place without a file only counts as missing once the feed has finished a cycle", () => {
    expect(ondeFalta({ ...nac, ciclo: 0 })!.pronto).toBe(false);
    expect(ondeFalta(nac)!.pronto).toBe(true);
  });

  test("no feed, no table", () => {
    expect(ondeFalta(null)).toBeNull();
    expect(ondeFalta(snap({}))).toBeNull();
  });
});
