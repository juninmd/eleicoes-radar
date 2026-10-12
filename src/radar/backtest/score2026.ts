// Scores the Radar's expectation algorithm (polls + deputy seat model) against official 2026 TSE results.
// Evaluates both the live web/data files and the updated buildExpectativa() logic directly.
// Usage: bun src/radar/backtest/score2026.ts
import { loadCandidates } from "../candidates";
import { buildExpectativa } from "../expectativa";
import { loadResultados } from "./resultados2026";

const candsList = await loadCandidates();
const candsMap = new Map(candsList.map((c) => [c.sq, c]));
const { porCandidato } = buildExpectativa(candsList);
const res = await loadResultados();

const eleito = (st: string) => /^eleito/i.test(st);
const brier = (rows: { p: number; y: number }[]) => rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / (rows.length || 1);
const logloss = (rows: { p: number; y: number }[]) => -rows.reduce((s, r) => s + (r.y ? Math.log(Math.max(r.p, 1e-4)) : Math.log(Math.max(1 - r.p, 1e-4))), 0) / (rows.length || 1);

function bins(rows: { p: number; y: number }[], edges = [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.97, 1.0001]) {
  const out: string[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const r = rows.filter((x) => x.p >= edges[i]! && x.p < edges[i + 1]!);
    if (!r.length) continue;
    const mp = r.reduce((s, x) => s + x.p, 0) / r.length;
    const my = r.reduce((s, x) => s + x.y, 0) / r.length;
    out.push(`  [${edges[i]}-${Math.min(edges[i + 1]!, 1)}) n=${String(r.length).padStart(5)} previsto ${(mp * 100).toFixed(1).padStart(5)}%  real ${(my * 100).toFixed(1).padStart(5)}%`);
  }
  return out.join("\n");
}

console.log("\n=======================================================");
console.log("AVALIAÇÃO DO ALGORITMO DE EXPECTATIVA VS RESULTADO TSE");
console.log("=======================================================");

// ---- Majoritarian: polls vs official share
for (const cargo of ["Presidente", "Governador", "Senador"]) {
  const errs: number[] = [];
  const rows: { p: number; y: number }[] = [];
  const rowsRunoff: { p: number; y: number }[] = [];
  let races = 0;
  let lider = 0;
  let semPesq = 0;
  let top2 = 0;
  let top2n = 0;
  const detalhe: string[] = [];

  for (const [key, a] of res) {
    if (!key.startsWith(`${cargo}|`)) continue;
    races++;
    const real = a.candidatos.filter((c) => candsMap.has(c.id));
    const nv = a.cargo.vagas;
    const withPoll = real.filter((c) => porCandidato.get(c.id)?.media !== undefined);
    if (!withPoll.length) {
      semPesq++;
      continue;
    }
    for (const c of real) {
      const pv = porCandidato.get(c.id);
      const m = pv?.media ?? 0;
      if (pv?.media !== undefined || c.pct >= 0.01) errs.push(m - c.pct);
      if (pv?.p !== undefined && pv.fonte === "pesquisas") {
        rows.push({ p: pv.p, y: eleito(c.situacao) ? 1 : 0 });
        if (cargo !== "Senador" && pv.p2t != null) {
          rowsRunoff.push({ p: pv.p2t, y: /2º/.test(c.situacao) ? 1 : 0 });
        }
      }
    }
    const byPoll = [...real].sort((x, y) => (porCandidato.get(y.id)?.media ?? 0) - (porCandidato.get(x.id)?.media ?? 0));
    const topPoll = byPoll.slice(0, nv).map((c) => c.id);
    const topReal = real.slice(0, nv).map((c) => c.id);
    if (topPoll.every((id) => topReal.includes(id))) lider++;
    else detalhe.push(`${key}: pesquisa ${topPoll.map((i) => candsMap.get(i)!.nome).join("/")} | real ${topReal.map((i) => candsMap.get(i)!.nome).join("/")}`);
    if (cargo !== "Senador") {
      const pp = byPoll.slice(0, 2).map((c) => c.id);
      const rr = real.slice(0, 2).map((c) => c.id);
      top2n++;
      if (pp.every((i) => rr.includes(i))) top2++;
    }
  }

  const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / (errs.length || 1));
  const bias = errs.reduce((s, e) => s + e, 0) / (errs.length || 1);
  console.log(`\n== ${cargo}: ${races} corridas (${semPesq} sem pesquisa), vencedor(es) = topo em ${lider}/${races - semPesq}${top2n ? `, 2 primeiros certos em ${top2}/${top2n}` : ""}`);
  console.log(`   RMSE da fatia: ${(rmse * 100).toFixed(2)} p.p. | viés médio: ${(bias * 100).toFixed(2)} p.p. (n=${errs.length})`);
  if (rows.length) {
    console.log(`   P(eleito): Brier ${brier(rows).toFixed(4)} | LogLoss ${logloss(rows).toFixed(4)} (n=${rows.length})\n${bins(rows)}`);
  }
  if (rowsRunoff.length) {
    console.log(`   P(ir para o 2º turno): Brier ${brier(rowsRunoff).toFixed(4)} | LogLoss ${logloss(rowsRunoff).toFixed(4)} (n=${rowsRunoff.length})\n${bins(rowsRunoff)}`);
  }
  for (const d of detalhe.slice(0, 10)) console.log("   discrepância:", d);
  if (detalhe.length > 10) console.log(`   ... e mais ${detalhe.length - 10} outras`);
}

// ---- Deputies: seat model vs elected
for (const cargo of ["Deputado Federal", "Deputado Estadual", "Deputado Distrital"]) {
  const rows: { p: number; y: number }[] = [];
  let hits = 0;
  let seats = 0;
  let expected = 0;
  const porUf: string[] = [];

  for (const [key, a] of res) {
    if (!key.startsWith(`${cargo}|`)) continue;
    const g = a.candidatos.filter((c) => porCandidato.get(c.id));
    for (const c of g) rows.push({ p: porCandidato.get(c.id)!.p, y: eleito(c.situacao) ? 1 : 0 });
    const n = a.cargo.vagas;
    const top = [...g].sort((x, y) => porCandidato.get(y.id)!.p - porCandidato.get(x.id)!.p).slice(0, n);
    const h = top.filter((c) => eleito(c.situacao)).length;
    hits += h;
    seats += n;
    expected += g.reduce((s, c) => s + porCandidato.get(c.id)!.p, 0);
    porUf.push(`${key.split("|")[1]} ${h}/${n}`);
  }
  if (!rows.length) continue;
  console.log(`\n== ${cargo}: ${rows.length} candidaturas com modelo; Top-N por UF acerta ${hits}/${seats} (${((hits / seats) * 100).toFixed(1)}%); Σp ${expected.toFixed(0)} vs ${seats} vagas`);
  console.log(`   Brier ${brier(rows).toFixed(4)} | LogLoss ${logloss(rows).toFixed(4)}\n${bins(rows)}`);
  console.log("   por UF:", porUf.join(", "));
}
