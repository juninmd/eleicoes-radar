import "./db";
import { coletarDeputados, coletarProposicoes, enriquecerStatusProposicoes, coletarDiscursos } from "./fetch-camara-api";
import { coletarCeap } from "./fetch-ceap";
import { coletarEmendas } from "./fetch-emendas";
import { importarCandidatosPresidenteViaCnpj } from "./fetch-candidatos-cnpj";
import { importarCandidatos } from "./fetch-tse-candidatos";
import { gerarRanking } from "./analysis/score";
import { mkdirSync } from "node:fs";

async function main() {
  console.log("=== eleicoes-radar: coleta ===");
  const deputados = await coletarDeputados();
  const ids = new Set(deputados.map((d) => d.id));

  await coletarProposicoes(deputados);
  await enriquecerStatusProposicoes();
  await coletarDiscursos(deputados);
  await coletarCeap(ids);
  await coletarEmendas();
  await importarCandidatosPresidenteViaCnpj();
  await importarCandidatos(); // no-op se consulta_cand_2026.csv não foi baixado manualmente

  console.log("=== eleicoes-radar: análise ===");
  const resultado = gerarRanking();

  mkdirSync("data", { recursive: true });
  await Bun.write("data/ranking.json", JSON.stringify(resultado, null, 2));

  console.log(`\nTop 5 (melhor nota):`);
  for (const r of resultado.ranking.slice(0, 5)) {
    console.log(`  ${r.notaGeral.toFixed(1)}  ${r.nome} (${r.partido})`);
  }
  console.log(`\nBottom 5 (pior nota):`);
  for (const r of resultado.ranking.slice(-5).reverse()) {
    console.log(`  ${r.notaGeral.toFixed(1)}  ${r.nome} (${r.partido})`);
  }
  console.log(`\nClãs políticos (sobrenome compartilhado): ${resultado.clas.length}`);
  console.log(`\n-> data/ranking.json salvo. Rode 'bun run dashboard' pra gerar o painel.`);
}

main().catch((e) => {
  console.error("Falha no pipeline:", e);
  process.exit(1);
});
