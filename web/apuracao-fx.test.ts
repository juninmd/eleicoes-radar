import { afterEach, describe, expect, test } from "bun:test";
import { caixaDe, celulas, CHAVE_FX, decimos, efeitosAtivos, eixoMax, gravarPref, iniciais, lerPref, MARCOS, marcosCruzados, movimentoReduzido, odometroHtml, pct1, ultrapassagens } from "./apuracao-fx.js";

const g = globalThis as Record<string, unknown>;
const guardado = { localStorage: g.localStorage, matchMedia: g.matchMedia };
afterEach(() => { g.localStorage = guardado.localStorage; g.matchMedia = guardado.matchMedia; });

describe("odômetro e números", () => {
  test("one cell per digit, the separators stay put, and a number never goes negative", () => {
    expect(celulas(1234567)).toEqual([{ d: "1" }, { s: "." }, { d: "2" }, { d: "3" }, { d: "4" }, { s: "." }, { d: "5" }, { d: "6" }, { d: "7" }]);
    expect(celulas(0)).toEqual([{ d: "0" }]);
    expect(celulas(-5)).toEqual([{ d: "0" }]);
    expect(celulas(41.6)).toEqual([{ d: "4" }, { d: "2" }]);
  });

  test("the column of a digit is the same ten digits, and its position is the digit itself", () => {
    const html = odometroHtml(305);
    expect(html.match(/class="dg"/g)).toHaveLength(3);
    expect(html).toContain('style="--d:3"');
    expect(html).toContain('style="--d:0"');
    expect(html).toContain('style="--d:5"');
    expect(html.match(/<i>0<\/i><i>1<\/i><i>2<\/i><i>3<\/i><i>4<\/i><i>5<\/i><i>6<\/i><i>7<\/i><i>8<\/i><i>9<\/i>/g)).toHaveLength(3);
  });

  test("the share handed to the CSS counter is tenths of a point; the text twin has a decimal comma", () => {
    expect(decimos(0.382)).toBe("382.00");
    expect(decimos(0.0005)).toBe("0.50");
    expect(pct1(0.382)).toBe("38,2%");
    expect(pct1(0)).toBe("0,0%");
    expect(pct1(1)).toBe("100,0%");
  });

  test("the scale of the bars leaves room above the leader and keeps 50% reachable when it can matter", () => {
    expect(eixoMax(0.382)).toBe(0.6);
    expect(eixoMax(0.5)).toBe(0.7);
    expect(eixoMax(0.05)).toBe(0.3); // never tighter than 30%
    expect(eixoMax(0.95)).toBe(1); // never past 100%
    for (const x of [0.1, 0.2, 0.3, 0.45, 0.58, 0.8]) expect(eixoMax(x)).toBeGreaterThan(x);
  });
});

describe("quem passou quem", () => {
  test("a candidate that climbs past another is reported once, with the one it passed", () => {
    expect(ultrapassagens(["a", "b", "c"], ["b", "a", "c"])).toEqual([{ sobe: "b", desce: "a" }]);
  });

  test("a jump over several places reports every candidate passed", () => {
    expect(ultrapassagens(["a", "b", "c", "d"], ["d", "a", "b", "c"])).toEqual([{ sobe: "d", desce: "a" }, { sobe: "d", desce: "b" }, { sobe: "d", desce: "c" }]);
  });

  test("the same order, or only entries and exits, passes nobody", () => {
    expect(ultrapassagens(["a", "b"], ["a", "b"])).toEqual([]);
    expect(ultrapassagens(["a", "b"], ["a", "x", "b"])).toEqual([]); // x entered: it did not pass anyone, b did not pass x
    expect(ultrapassagens(["a", "b", "c"], ["a", "c"])).toEqual([]); // b left
    expect(ultrapassagens([], ["a"])).toEqual([]);
  });

  test("two swaps at once are two overtakes, and the pairs are never mirrored", () => {
    const r = ultrapassagens(["a", "b", "c", "d"], ["b", "a", "d", "c"]);
    expect(r).toHaveLength(2);
    expect(r).toContainEqual({ sobe: "b", desce: "a" });
    expect(r).toContainEqual({ sobe: "d", desce: "c" });
  });
});

describe("marcos da apuração", () => {
  test("a milestone is reported once, in the step that crosses it; jumping over several reports all", () => {
    expect(marcosCruzados(0.2, 0.26)).toEqual([0.25]);
    expect(marcosCruzados(0.26, 0.3)).toEqual([]);
    expect(marcosCruzados(0.2, 0.8)).toEqual([0.25, 0.5, 0.75]);
    expect(marcosCruzados(0.98, 1)).toEqual([0.99, 1]);
    expect(MARCOS[MARCOS.length - 1]).toBe(1);
  });
});

describe("rosto sem foto e caixa do estado", () => {
  test("initials follow the app's avatar: capitalised words, the first two", () => {
    expect(iniciais("HELENA CARDOSO")).toBe("HC");
    expect(iniciais("PROFESSORA MARIA DO CARMO")).toBe("PM");
    expect(iniciais("OTÁVIO")).toBe("O");
    expect(iniciais("")).toBe("");
  });

  test("the box of a path is read from its coordinate pairs", () => {
    expect(caixaDe("M10 20L30.5 25L12 40Z")).toEqual([10, 20, 30.5, 40]);
    expect(caixaDe("M-5.5 1L5 -2Z")).toEqual([-5.5, -2, 5, 1]);
    expect(caixaDe("M1")).toBeNull();
    expect(caixaDe("")).toBeNull();
  });
});

describe("preferências", () => {
  const guarda = (valor: string | null) => { g.localStorage = { getItem: () => valor, setItem: (_k: string, v: string) => { valor = v; } }; return () => valor; };

  test("on by default; only an explicit 'off' turns it off; a browser without storage keeps the default", () => {
    delete g.localStorage;
    expect(lerPref(CHAVE_FX)).toBe(true);
    guarda(null); expect(lerPref(CHAVE_FX)).toBe(true);
    guarda("on"); expect(lerPref(CHAVE_FX)).toBe(true);
    guarda("off"); expect(lerPref(CHAVE_FX)).toBe(false);
  });

  test("writing stores on/off under the key the Ao vivo tab already uses, and never throws", () => {
    const le = guarda(null);
    gravarPref(CHAVE_FX, false); expect(le()).toBe("off");
    gravarPref(CHAVE_FX, true); expect(le()).toBe("on");
    expect(CHAVE_FX).toBe("radar:fx");
    g.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(() => gravarPref(CHAVE_FX, false)).not.toThrow();
    expect(lerPref(CHAVE_FX)).toBe(true);
  });

  test("the system's reduce-motion wins over the button", () => {
    guarda("on");
    g.matchMedia = () => ({ matches: true });
    expect(movimentoReduzido()).toBe(true);
    expect(efeitosAtivos()).toBe(false);
    g.matchMedia = () => ({ matches: false });
    expect(efeitosAtivos()).toBe(true);
    guarda("off");
    expect(efeitosAtivos()).toBe(false);
    delete g.matchMedia;
    expect(movimentoReduzido()).toBe(false);
  });
});
