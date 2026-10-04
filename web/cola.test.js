import { expect, test } from "bun:test";
import { colaRows, isPicked, normalizeCola, togglePick } from "./cola.js";

const BALLOTS = [
  { cargo: "Deputado Estadual", alt: "Deputado Distrital", digits: 5 },
  { cargo: "Senador", digits: 3, seats: 2 },
  { cargo: "Governador", digits: 2 },
];
const cand = (id, cargo = "Senador") => ({ id, cargo, num: id });
const pick = (id) => ({ id, num: id, nome: `N${id}`, partido: "X" });

test("Senador takes two picks; a third pushes out the oldest", () => {
  let cola = {};
  for (const id of ["111", "222", "333"]) cola = togglePick(cola, cand(id), pick(id), 2);
  expect(cola.Senador.map((p) => p.id)).toEqual(["222", "333"]);
});

test("a single-seat cargo is replaced, not stacked", () => {
  let cola = togglePick({}, cand("11", "Governador"), pick("11"), 1);
  cola = togglePick(cola, cand("22", "Governador"), pick("22"), 1);
  expect(cola.Governador.map((p) => p.id)).toEqual(["22"]);
});

test("toggling a picked candidate removes it and drops the empty cargo", () => {
  const once = togglePick({}, cand("111"), pick("111"), 2);
  expect(isPicked(once, cand("111"))).toBe(true);
  const none = togglePick(once, cand("111"), pick("111"), 2);
  expect(isPicked(none, cand("111"))).toBe(false);
  expect("Senador" in none).toBe(false);
});

test("the same senator cannot fill both votes", () => {
  let cola = togglePick({}, cand("111"), pick("111"), 2);
  cola = togglePick(cola, cand("222"), pick("222"), 2);
  cola = togglePick(cola, cand("111"), pick("111"), 2);
  expect(cola.Senador.map((p) => p.id)).toEqual(["222"]);
});

test("a cola saved before multi-seat ballots (one object per cargo) is migrated", () => {
  const cola = normalizeCola({ Senador: pick("111"), Governador: pick("11"), Lixo: null, Vazio: [] });
  expect(cola.Senador).toEqual([pick("111")]);
  expect(cola.Governador).toEqual([pick("11")]);
  expect("Lixo" in cola).toBe(false);
  expect("Vazio" in cola).toBe(false);
  expect(normalizeCola("corrupt")).toEqual({});
  expect(normalizeCola(null)).toEqual({});
});

test("rows: Senador gets two numbered votes, other cargos one", () => {
  const rows = colaRows({ Senador: [pick("111")] }, BALLOTS);
  expect(rows.map((r) => r.label)).toEqual(["Deputado Estadual", "Senador · 1º voto", "Senador · 2º voto", "Governador"]);
  expect(rows.map((r) => r.pick?.id)).toEqual([undefined, "111", undefined, undefined]);
});

test("rows: the DF alt cargo fills the Deputado Estadual slot", () => {
  const rows = colaRows({ "Deputado Distrital": [pick("12345")] }, BALLOTS);
  expect(rows[0].pick.id).toBe("12345");
});
