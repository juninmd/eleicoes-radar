// Reaproveita deputados/proposições/discursos já coletados; só refaz CEAP + score.
import "./db";
import { db } from "./db";
import { coletarCeap } from "./fetch-ceap";
import { gerarRanking } from "./analysis/score";

const ids = new Set(
  db.query<{ id: number }, []>(`SELECT id FROM deputados`).all().map((r) => r.id)
);
console.log(`Reusando ${ids.size} deputados já coletados.`);

await coletarCeap(ids);

const resultado = gerarRanking();
await Bun.write("data/ranking.json", JSON.stringify(resultado, null, 2));

console.log(`\nTop 5 (melhor nota):`);
for (const r of resultado.ranking.slice(0, 5)) console.log(`  ${r.notaGeral.toFixed(1)}  ${r.nome} (${r.partido})`);
console.log(`\nBottom 5 (pior nota):`);
for (const r of resultado.ranking.slice(-5).reverse()) console.log(`  ${r.notaGeral.toFixed(1)}  ${r.nome} (${r.partido})`);
