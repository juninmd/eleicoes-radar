import { describe, expect, test } from "bun:test";
import { atualizar, renderNovidades, vazio } from "./apuracao-novidades.js";

// A file of a one-seat race. `secoes` is [totalizadas, total]; votos sum to the valid votes.
const arq = ({ votos = [400, 380, 100, 20], secoes = [980, 1000], hora = "21:04:25", apto = 1000, apurado = 950, situacao = [], nomes = ["ANA", "BRUNO", "CARLA", "DANI"], vagas = 1 } = {}) => {
  const total = votos.reduce((a, v) => a + v, 0);
  return {
    fase: secoes[0] >= secoes[1] ? "concluida" : secoes[0] > 0 ? "parcial" : "aguardando",
    versao: { data: "04/10/2026", hora },
    secoes: { totalizadas: secoes[0], total: secoes[1] },
    cargo: { vagas },
    eleitorado: { apto, apurado },
    votos: { validos: total },
    candidatos: votos.map((v, i) => ({ id: `c${i + 1}`, nome: nomes[i], partido: "P", votos: v, pct: v / total, situacao: situacao[i] ?? "" })),
  };
};
const gov = { cargo: "Governador", uf: "SP" };
const ler = (est, d, ctx = gov) => atualizar(est, d, ctx);
const textos = (est) => est.itens.map((i) => i.texto.replace(/<[^>]+>/g, ""));

describe("milestones of the count", () => {
  test("the first file seen says where the count stands, with the top two", () => {
    const est = ler(vazio(), arq({ secoes: [980, 1000] }));
    expect(textos(est)).toEqual(["Com 98% das seções totalizadas, Ana tem 44,4% e Bruno, 42,2%."]);
    expect(est.itens[0].hora).toBe("21:04");
    expect(est.itens[0].tipo).toBe("marco");
  });

  test("every 5 points up to 90%: a file inside the same step adds nothing, the next step adds one", () => {
    let est = ler(vazio(), arq({ secoes: [120, 1000], hora: "18:10:00" })); // 12%: milestone 10
    expect(textos(est)).toHaveLength(1);
    est = ler(est, arq({ secoes: [140, 1000], hora: "18:11:00" })); // 14%: still 10
    expect(textos(est)).toHaveLength(1);
    est = ler(est, arq({ secoes: [150, 1000], hora: "18:12:00" })); // 15%
    expect(textos(est)[0]).toStartWith("Com 15% das seções");
    expect(textos(est)).toHaveLength(2);
  });

  test("from 90% on, every point", () => {
    let est = ler(vazio(), arq({ secoes: [900, 1000], hora: "20:00:00" }));
    est = ler(est, arq({ secoes: [905, 1000], hora: "20:01:00" })); // 90,5%: still 90
    expect(textos(est)).toHaveLength(1);
    est = ler(est, arq({ secoes: [910, 1000], hora: "20:02:00" }));
    expect(textos(est)[0]).toStartWith("Com 91% das seções");
  });

  test("never 100% while sections are missing, like everywhere else on the page", () => {
    const est = ler(vazio(), arq({ secoes: [9996, 10000] }));
    expect(textos(est)[0]).toStartWith("Com 99% das seções");
  });

  test("newest on top", () => {
    let est = ler(vazio(), arq({ secoes: [900, 1000], hora: "20:00:00" }));
    est = ler(est, arq({ secoes: [950, 1000], hora: "20:30:00" }));
    expect(est.itens.map((i) => i.hora)).toEqual(["20:30", "20:00"]);
  });

  test("a file with fewer sections than one already seen never makes a milestone repeat", () => {
    let est = ler(vazio(), arq({ secoes: [950, 1000], hora: "20:30:00" }));
    est = ler(est, arq({ secoes: [900, 1000], hora: "20:31:00" })); // goes back
    est = ler(est, arq({ secoes: [951, 1000], hora: "20:32:00" })); // forward again, same milestone as before: nothing new
    expect(textos(est)).toHaveLength(1);
    expect(textos(est)[0]).toStartWith("Com 95% das seções");
  });

  test("below 5% of the sections there is nothing to say yet", () => {
    expect(ler(vazio(), arq({ secoes: [40, 1000] })).itens).toEqual([]);
  });

  test("files that carry no version are all taken: the lack of a key must not freeze the list", () => {
    const semVersao = (secoes) => ({ ...arq({ secoes }), versao: { data: "", hora: "" } });
    let est = ler(vazio(), semVersao([500, 1000]));
    est = ler(est, semVersao([900, 1000]));
    expect(textos(est).map((t) => t.slice(0, 11))).toEqual(["Com 90% das", "Com 50% das"]);
  });

  test("the same file twice, a count not started, or no file: the state is left as it was", () => {
    const est = ler(vazio(), arq());
    expect(ler(est, arq())).toBe(est);
    const antes = vazio();
    expect(ler(antes, arq({ secoes: [0, 1000] }))).toBe(antes);
    expect(ler(antes, null)).toBe(antes);
  });

  test("proportional offices count the candidates the TSE already marked", () => {
    const d = arq({ secoes: [980, 1000], situacao: ["Eleito", "Eleito por QP"] });
    expect(textos(ler(vazio(), d, { cargo: "Deputado Federal", uf: "SP" }))[0]).toBe("Com 98% das seções totalizadas, 2 candidatos têm situação de eleito no TSE.");
    expect(textos(ler(vazio(), arq(), { cargo: "Deputado Federal", uf: "SP" }))[0]).toBe("Com 98% das seções totalizadas, nenhum candidato tem situação de eleito no TSE.");
  });

  test("the list is capped", () => {
    let est = vazio();
    // A new status text in every file: a "tse" line per file plus the milestones, far more than the cap.
    for (let p = 5; p <= 80; p += 1) est = ler(est, arq({ secoes: [p * 10, 1000], hora: `20:${String(p % 60).padStart(2, "0")}:${p < 60 ? "00" : "30"}`, situacao: [`S${p}`] }));
    expect(est.itens).toHaveLength(30);
    expect(est.itens[0].hora).toBe("20:20"); // the newest survive, p = 80
  });
});

describe("changes of status", () => {
  test("the TSE marking someone is a line of its own, above the milestone", () => {
    const antes = ler(vazio(), arq({ secoes: [980, 1000], hora: "21:04:00" }));
    const est = ler(antes, arq({ secoes: [990, 1000], hora: "21:05:00", situacao: ["", "2º turno"] }));
    expect(textos(est).slice(0, 2)).toEqual(['Bruno: o TSE marcou "2º turno".', "Com 99% das seções totalizadas, Ana tem 44,4% e Bruno, 42,2%."]);
    expect(est.itens[0].tipo).toBe("tse");
  });

  test("a whole deputy race getting its marks in one file is one line per text, and the milestone survives", () => {
    const dep = { cargo: "Deputado Federal", uf: "SP" };
    const votos = Array.from({ length: 300 }, (_, i) => 300 - i);
    const marcas = Array.from({ length: 300 }, (_, i) => (i < 70 ? "Eleito" : "Suplente"));
    const antes = ler(vazio(), arq({ votos, secoes: [950, 1000], hora: "21:00:00" }), dep);
    const est = ler(antes, arq({ votos, secoes: [1000, 1000], hora: "21:30:00", situacao: marcas }), dep);
    expect(textos(est).slice(0, 3)).toEqual([
      'O TSE marcou "Eleito" em 70 candidatos.',
      'O TSE marcou "Suplente" em 230 candidatos.',
      "Com 100% das seções totalizadas, 70 candidatos têm situação de eleito no TSE.",
    ]);
    expect(est.itens).toHaveLength(4); // plus the 95% line of the first file
  });

  test("up to two names are said, more than that is a count", () => {
    const d = (situacao) => arq({ secoes: [990, 1000], hora: "21:30:00", situacao });
    const antes = ler(vazio(), arq({ secoes: [980, 1000], hora: "21:00:00" }));
    expect(textos(ler(antes, d(["2º turno", "2º turno"])))[0]).toBe('Ana e Bruno: o TSE marcou "2º turno".');
    expect(textos(ler(antes, d(["2º turno", "2º turno", "2º turno"])))[0]).toBe('O TSE marcou "2º turno" em 3 candidatos.');
  });

  test("a mark that was already there when the tab opened is not news", () => {
    const est = ler(vazio(), arq({ situacao: ["2º turno", "2º turno"] }));
    expect(est.itens.every((i) => i.tipo === "marco")).toBe(true);
  });

  test("the same mark in the next file is not repeated", () => {
    const d = (hora, secoes) => arq({ secoes, hora, situacao: ["", "2º turno"] });
    let est = ler(vazio(), arq({ secoes: [980, 1000], hora: "21:04:00" }));
    est = ler(est, d("21:05:00", [985, 1000]));
    const n = est.itens.length;
    est = ler(est, d("21:06:00", [986, 1000]));
    expect(est.itens).toHaveLength(n);
  });
});

describe("the Radar's own proofs are lines too, and say whose they are", () => {
  test("the runoff becoming certain, then the pair becoming closed", () => {
    // 400/300/200/100 with 200 electors left: runoff certain, second place open. Then the third falls back.
    const aberto = (hora) => arq({ votos: [400, 300, 200, 100], apto: 1200, apurado: 1000, hora, secoes: [830, 1000] });
    const cedo = arq({ votos: [450, 300, 200, 50], apto: 1200, apurado: 1000, hora: "20:00:00", secoes: [820, 1000] }); // leader 450 + 200 > half
    let est = ler(vazio(), cedo);
    est = ler(est, aberto("20:05:00"));
    expect(textos(est)[0]).toBe("Segundo turno garantido (conta do Radar, não é a marcação do TSE).");
    const fechado = arq({ votos: [400, 380, 100, 20], apto: 1000, apurado: 950, hora: "20:10:00", secoes: [950, 1000] });
    est = ler(est, fechado);
    expect(textos(est).slice(0, 2)).toContain("Disputam o 2º turno: Ana e Bruno (conta do Radar, não é a marcação do TSE).");
    expect(est.itens.filter((i) => i.tipo === "radar").map((i) => i.texto).join("")).not.toMatch(/vai vencer|será eleito/i);
  });

  test("someone becoming mathematically elected, once", () => {
    const antes = ler(vazio(), arq({ votos: [450, 300, 100], apto: 1000, apurado: 850, hora: "20:00:00", secoes: [850, 1000] }));
    const prova = arq({ votos: [600, 150, 50], apto: 1000, apurado: 800, hora: "20:01:00", secoes: [860, 1000] });
    let est = ler(antes, prova);
    expect(textos(est)[0]).toBe("Ana: matematicamente eleito(a) (conta do Radar, não é a marcação do TSE).");
    const n = est.itens.length;
    est = ler(est, { ...prova, versao: { data: "04/10/2026", hora: "20:02:00" } });
    expect(est.itens).toHaveLength(n); // already proven: not news again
  });

  test("a proof that held when the tab opened is not announced as news", () => {
    const est = ler(vazio(), arq({ votos: [600, 150, 50], apto: 1000, apurado: 800 }));
    expect(est.itens.every((i) => i.tipo === "marco")).toBe(true);
  });
});

describe("the list on the page", () => {
  test("nothing when there is nothing", () => {
    expect(renderNovidades([])).toBe("");
  });

  test("an open <details> told apart by data-k, newest first, times in the TSE's clock, only the latest ones", () => {
    let est = vazio();
    // 5%, 10% ... 85%, then 90% ... 99%: 27 milestones, one file each, clock running from 18:05.
    for (let p = 5; p <= 99; p += 1) est = ler(est, arq({ secoes: [p * 10, 1000], hora: `${18 + Math.floor(p / 60)}:${String(p % 60).padStart(2, "0")}:00` }));
    expect(est.itens).toHaveLength(27);
    const out = renderNovidades(est.itens);
    expect(out).toContain('data-k="novidades" open');
    expect(out.indexOf("<time>19:39</time>")).toBeGreaterThan(-1); // the latest file
    expect(out.indexOf("<time>19:39</time>")).toBeLessThan(out.indexOf("<time>19:38</time>")); // newest first
    expect(out).not.toContain("<time>19:09</time>"); // 13th and older are left out
    expect((out.match(/<li /g) ?? []).length).toBe(12);
    expect(out).toContain("desde que você abriu a aba");
  });

  test("names are escaped", () => {
    const est = ler(vazio(), arq({ nomes: ["<IMG SRC=X>", "B", "C", "D"] }));
    const out = renderNovidades(est.itens);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img Src=x&gt;");
  });
});
