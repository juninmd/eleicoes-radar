// Shared fixtures for the Apuração tests: a results file with the fields the parser reads.
export const cand = (sqcand, n, nmu, seq, vap, pvap, e = "n", st = "") => ({ n, sqcand, nm: nmu, nmu, seq, e, st, vap, pvap });
export const file = ({ cargo = {}, s = {}, v = {}, cands = [], agr } = {}) => ({
  dg: "04/10/2026", hg: "19:41:07",
  s: { ts: "1000", st: "400", ...s },
  e: { te: "500000", est: "200000", c: "160000", a: "40000" },
  v: { tv: "160000", vvc: "140000", vv: "140000", vb: "8000", tvn: "12000", ...v },
  carg: [{ cd: "3", nmn: "Governador", nv: "1", agr: agr ?? [{ n: "1", nm: "A", com: "AAA", par: [{ n: "10", sg: "AAA", cand: cands }] }], ...cargo }],
});
export const dois = [cand("a1", "10", "ANA SOUZA", "1", "6000", "60,00", "s", "Eleito"), cand("b2", "20", "BETO LIMA", "2", "4000", "40,00", "n", "Não eleito")];
export const avatar = (c) => `<i class="av">${c.id}</i>`;
export const byId = new Map([["a1", { id: "a1" }]]);
