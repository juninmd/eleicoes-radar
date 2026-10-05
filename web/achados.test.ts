import { expect, test } from "bun:test";
import { achados } from "./achados.js";
import type { Candidatura } from "./types.js";

const c = (o = {}) => ({ fin: { total: 0, publico: 0, doadoresPF: 0 }, ...o }) as unknown as Candidatura;
const withVotes = (votou: number, possiveis: number) => c({ mandato: { votos: { votou, possiveis } } });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the first card counts every candidacy and says how many of them declared income", () => {
  const out = text(achados([c({ fin: { total: 100, publico: 0, doadoresPF: 1 } }), c(), c()]));
  expect(out).toContain("3 candidaturas, 1 com receita declarada");
});

test("situation counts include those that cannot be verified instead of hiding them", () => {
  const out = text(achados([c({ perfil: { status: "reeleicao" } }), c({ perfil: { status: "novo" } }), c({ perfil: { status: "nao-verificado" } }), c()]));
  expect(out).toContain("1 tentam reeleição, 1 estreantes, 2 sem situação verificável");
});

test("share of public money uses only money raised; no money shows a dash, not 0%", () => {
  expect(text(achados([c({ fin: { total: 200, publico: 150, doadoresPF: 0 } })]))).toContain("75%");
  expect(text(achados([c()]))).toContain("– do dinheiro arrecadado");
});

test("the donor card only counts campaigns that raised money", () => {
  const out = text(achados([c({ fin: { total: 10, publico: 0, doadoresPF: 0 } }), c({ fin: { total: 10, publico: 0, doadoresPF: 4 } }), c()]));
  expect(out).toContain("1 de 2 campanhas com receita não têm nenhum doador pessoa física");
});

test("attendance card appears only with enough incumbents, else it falls back to median money", () => {
  const few = text(achados([withVotes(9, 10), withVotes(8, 10), c({ fin: { total: 1000, publico: 0, doadoresPF: 1 } })]));
  expect(few).not.toContain("presença mediana");
  expect(few).toContain("arrecadação mediana");
  const many = text(achados([withVotes(9, 10), withVotes(8, 10), withVotes(7, 10)]));
  expect(many).toContain("80%");
  expect(many).toContain("presença mediana dos 3 que já são deputados federais");
});

test("an empty list renders four cards without NaN or crashing", () => {
  const html = achados([]);
  expect(html.match(/<div>/g)).toHaveLength(4);
  expect(html).not.toContain("NaN");
});
