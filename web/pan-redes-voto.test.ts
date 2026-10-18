import { describe, expect, test } from "bun:test";
import { juntar, MIN_CELULA, MIN_VOTO, tercis, votoView } from "./pan-redes-voto.js";
import type { Apuracao } from "./apuracao-tse.js";
import type { RedesCand } from "./pan-redes.js";

const cand = (id: string, o: Partial<RedesCand> = {}): RedesCand => ({ id, cargo: "Deputado Federal", partido: "AAA", nome: `Fulano ${id}`, ...o });
const ap = (candidatos: Partial<Apuracao["candidatos"][number]>[], o: Partial<Apuracao> = {}): Apuracao => ({
  versao: { data: "", hora: "" }, cargo: { codigo: "6", nome: "Deputado Federal", vagas: 10 }, fase: "concluida",
  secoes: { total: 10, totalizadas: 10 }, eleitorado: { apto: 1, apurado: 1, comparecimento: 1, abstencao: 0 },
  votos: { total: 1, validos: 1, brancos: 0, nulos: 0 }, quociente: null, partidos: [],
  candidatos: candidatos.map((c, i) => ({ id: String(i), num: "1", nome: "X", partido: "AAA", votos: 0, pct: 0, destaque: false, situacao: "Não eleito", lista: "L", ...c })), ...o,
});
const canais = (...r: string[]) => r.map((x) => ({ r: x, u: `https://${x}.com/a` })) as RedesCand["canais"];

// A proportional race where the money tier, not the channels, explains the votes.
function corrida(n: number) {
  const cands: RedesCand[] = [], res: Partial<Apuracao["candidatos"][number]>[] = [];
  for (let i = 0; i < n; i++) {
    const gastos = 1000 * (i + 1);
    cands.push(cand(String(i), { canais: canais(...(i % 2 ? ["instagram", "x", "tiktok"] : [])), fin: { gastos, impuls: i % 2 ? gastos / 10 : 0 } as RedesCand["fin"] }));
    res.push({ id: String(i), votos: gastos, situacao: i >= n - 3 ? "Eleito por QP" : "Não eleito" });
  }
  return { cands, ap: ap(res) };
}

describe("juntar", () => {
  test("joins by the TSE sequence id, drops what only one side knows, and does not count Câmara links", () => {
    const l = juntar(
      [cand("1", { canais: [{ r: "instagram", u: "https://instagram.com/a" }, { r: "x", u: "https://x.com/a", c: 1 }] }), cand("9")],
      ap([{ id: "1", votos: 10, situacao: "Eleito" }, { id: "2", votos: 5 }]),
    );
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: "1", plataformas: 1, eleito: true });
  });
  test("'Não eleito' and 'Suplente' are not elected; only the TSE's own 'Eleito...' wording is", () => {
    const l = juntar([cand("1"), cand("2"), cand("3"), cand("4")], ap([{ id: "1", situacao: "Eleito por QP" }, { id: "2", situacao: "Não eleito" }, { id: "3", situacao: "Suplente" }, { id: "4", situacao: "" }]));
    expect(l.map((x) => x.eleito)).toEqual([true, false, false, false]);
  });
});

describe("tercis", () => {
  test("splits spenders into three tiers by total spending and ignores those who spent nothing", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ gastos: i, plataformas: 0, impuls: 0, votos: 0, pct: 0, eleito: false, id: String(i), nome: "", partido: "" }));
    const [a, b, c] = tercis(rows);
    expect([a!.length, b!.length, c!.length]).toEqual([2, 4, 2]); // gastos 0 is out; 8 spenders: floor(8/3)=2 at each end
    expect(Math.max(...a!.map((x) => x.gastos))).toBeLessThan(Math.min(...c!.map((x) => x.gastos)));
  });
});

describe("votoView", () => {
  test("a proportional race compares channel bands and boosting inside each spending tier", () => {
    const { cands, ap: a } = corrida(MIN_VOTO + 60);
    const html = votoView({ cands, ap: a, cargo: "Deputado Federal" });
    expect(html).toContain("Nenhuma plataforma");
    expect(html).toContain("3 ou mais");
    expect(html).toContain("Não pagou");
    expect(html).toContain("eleitos");
    expect(html).toContain("associação, não uma causa");
    expect(html).not.toContain("Fulano"); // proportional view never lists people
  });
  test("a group under the minimum shows no median, and a count in progress shows no elected share", () => {
    const { cands, ap: a } = corrida(MIN_VOTO + 3);
    const html = votoView({ cands, ap: { ...a, fase: "parcial", secoes: { total: 10, totalizadas: 4 } }, cargo: "Deputado Federal" });
    expect(html).toContain("Apuração em andamento (40,0%");
    expect(html).not.toContain("eleitos<");
    expect(html).toContain(`n&lt;${MIN_CELULA}`);
  });
  test("an open count never reads as 100% of sections, and a finished count without 'Eleito' shows no elected share", () => {
    const { cands, ap: a } = corrida(MIN_VOTO + 3);
    const open = votoView({ cands, ap: { ...a, fase: "parcial", secoes: { total: 10000, totalizadas: 9996 } }, cargo: "Deputado Federal" });
    expect(open).toContain("99,9%");
    expect(open).not.toContain("100");
    const semMarca = { ...a, candidatos: a.candidatos.map((c) => ({ ...c, situacao: "" })) };
    expect(votoView({ cands, ap: semMarca, cargo: "Deputado Federal" })).not.toContain("eleitos<");
  });
  test("too few matched deputies are not compared", () => {
    const { cands, ap: a } = corrida(MIN_VOTO - 1);
    expect(votoView({ cands, ap: a, cargo: "Deputado Federal" })).toContain("poucas para comparar");
  });
  test("a majority race lists the few names, escaped, with the no-effect warning", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const html = votoView({ cands: [cand("1", { cargo: "Governador", urna: evil, canais: canais("instagram") })], ap: ap([{ id: "1", votos: 9, pct: 0.5 }]), cargo: "Governador" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("não permite estimar efeito");
  });
  test("a file with no votes yet says so instead of drawing empty tables", () => {
    expect(votoView({ cands: [cand("1")], ap: ap([], { fase: "aguardando" }), cargo: "Deputado Federal" })).toContain("ainda não publicou");
  });
});
