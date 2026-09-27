// Gera o HTML final do dashboard com os dados JÁ CALCULADOS embutidos no
// arquivo (o artifact não tem backend, então os dados vão "assados" no HTML).
import { existsSync } from "node:fs";
import { gerarRanking } from "./analysis/score";

interface CandidatoCurado {
  nome: string;
  partido: string;
  numero: string;
  vice: string;
  bio: string;
}

async function carregarCandidatosCurados() {
  const path = "data/candidatos-2026-curado.json";
  if (!existsSync(path)) {
    return { fonte: "", atualizadoEm: "", presidente: [], governadorSP: [] };
  }
  return JSON.parse(await Bun.file(path).text()) as {
    fonte: string;
    atualizadoEm: string;
    presidente: CandidatoCurado[];
    governadorSP: CandidatoCurado[];
  };
}

async function main() {
  const resultado = gerarRanking();
  const candidatos = await carregarCandidatosCurados();

  const payload = JSON.stringify({ ...resultado, candidatos });
  const template = await Bun.file("dashboard/template.html").text();
  const html = template.replace("/*__DADOS__*/", `const DADOS = ${payload};`);

  await Bun.write("dashboard/dashboard.html", html);
  const totalCand = candidatos.presidente.length + candidatos.governadorSP.length;
  console.log(`[dashboard] dashboard/dashboard.html gerado (${resultado.ranking.length} deputados, ${totalCand} candidatos)`);
  console.log(`Publique manualmente com o Artifact tool quando quiser revisar antes.`);
}

main();
