import { expect, test } from "bun:test";
import { disputasDoGiro, proxima } from "./apuracao-giro.js";

test("the rotation goes president, governor, senator and wraps", () => {
  const l = disputasDoGiro("MG");
  expect(l.map((d) => `${d.cargo}|${d.uf}`)).toEqual(["Presidente|BR", "Governador|MG", "Senador|MG"]);
  expect(proxima(l, l[0])).toEqual(l[1]);
  expect(proxima(l, l[2])).toEqual(l[0]);
  expect(proxima(l, { cargo: "Deputado Federal", uf: "MG" })).toEqual(l[0]);
});
