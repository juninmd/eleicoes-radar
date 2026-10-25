// "Total consolidado" of the President in the Ao vivo tab: the 27 state files plus the exterior file (ZZ) added up, with the exterior's part
// shown on its own. The national file the hero shows (`br`) already holds the vote abroad; this block says how much of it comes from where,
// and whether the sum of the 28 files agrees with that national file. Only the TSE's numbers and sums of them; nobody is named a winner.
import { h, int, pct, titleName } from "./format.js";
import { avancoDe } from "./apuracao-nacional.js";
import { EXTERIOR } from "./apuracao-uf.js";
import type { Apuracao } from "./apuracao-tse.js";
import type { BrasilSnapshot } from "./apuracao-uf.js";

export interface LinhaConsolidada { id: string; nome: string; partido: string; estados: number; exterior: number; total: number; pct: number }
export interface Consolidado {
  candidatos: LinhaConsolidada[];
  validos: { estados: number; exterior: number; total: number };
  secoes: { estados: { total: number; totalizadas: number }; exterior: { total: number; totalizadas: number } | null };
  arquivos: { com: number; de: number };
  exterior: "ok" | "sem-arquivo" | "desatualizado";
  confere: { diferenca: number } | null; // sum of the files minus the national file; null without a national file
}

const TOP = 4;
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function consolidar(nac: BrasilSnapshot | null | undefined, br?: Apuracao | null): Consolidado | null {
  const todos = Object.entries(nac?.ufs ?? {});
  const estados = todos.filter(([uf, u]) => uf !== EXTERIOR && u.dados).map(([, u]) => u.dados!);
  const zz = nac?.ufs[EXTERIOR];
  const ext = zz?.dados ?? null;
  if (!estados.length && !ext) return null;
  const por = new Map<string, LinhaConsolidada>();
  const junta = (d: Apuracao, onde: "estados" | "exterior") => {
    for (const c of d.candidatos) {
      const x = por.get(c.id) ?? { id: c.id, nome: c.nome, partido: c.partido, estados: 0, exterior: 0, total: 0, pct: 0 };
      x[onde] += c.votos;
      por.set(c.id, x);
    }
  };
  estados.forEach((d) => junta(d, "estados"));
  if (ext) junta(ext, "exterior");
  const lista = [...por.values()].map((x) => ({ ...x, total: x.estados + x.exterior }));
  const votos = soma(lista.map((x) => x.total));
  const candidatos = lista.sort((a, b) => b.total - a.total).map((x) => ({ ...x, pct: votos > 0 ? x.total / votos : 0 }));
  const vEst = soma(estados.map((d) => soma(d.candidatos.map((c) => c.votos))));
  const vExt = ext ? soma(ext.candidatos.map((c) => c.votos)) : 0;
  const brSoma = br ? soma(br.candidatos.map((c) => c.votos)) : 0;
  return {
    candidatos,
    validos: { estados: vEst, exterior: vExt, total: vEst + vExt },
    secoes: {
      estados: { total: soma(estados.map((d) => d.secoes.total)), totalizadas: soma(estados.map((d) => d.secoes.totalizadas)) },
      exterior: ext ? ext.secoes : null,
    },
    arquivos: { com: estados.length + (ext ? 1 : 0), de: todos.length },
    exterior: !ext ? "sem-arquivo" : zz && (zz.status === "erro" || zz.status === "ausente") ? "desatualizado" : "ok",
    confere: br && brSoma > 0 ? { diferenca: vEst + vExt - brSoma } : null,
  };
}

const virgula = (x: number) => x.toFixed(1).replace(".", ",");

export function renderConsolidado(c: Consolidado | null, cor: (partido: string) => string): string {
  if (!c) return "";
  const parteExt = c.validos.total > 0 ? c.validos.exterior / c.validos.total : 0;
  const linhas = c.candidatos.slice(0, TOP).map((x) => `<tr style="--lado:${h(cor(x.partido))}">
      <th scope="row"><i class="key" style="background:${h(cor(x.partido))}"></i>${h(titleName(x.nome))} <small>${h(x.partido)}</small></th>
      <td>${int(x.estados)}</td><td>${c.exterior === "sem-arquivo" ? "–" : int(x.exterior)}</td><td><b>${int(x.total)}</b></td><td><b>${pct(x.pct, 1)}</b></td></tr>`).join("");
  const ext = c.secoes.exterior;
  const aviso = c.exterior === "sem-arquivo" ? `<p class="apu-aviso small"><b>Exterior ainda sem arquivo do TSE:</b> o total abaixo soma só os estados e passa a incluir o exterior quando ele for publicado.</p>`
    : c.exterior === "desatualizado" ? `<p class="apu-aviso small"><b>Exterior desatualizado:</b> o TSE não entregou o arquivo agora; a soma usa o último recebido.</p>` : "";
  const confere = c.confere === null ? "" : c.confere.diferenca === 0 ? " A soma confere com o arquivo nacional do TSE."
    : ` A soma difere do arquivo nacional do TSE em ${int(Math.abs(c.confere.diferenca))} votos: os arquivos são de horários diferentes.`;
  return `<section class="live-consol" aria-labelledby="live-consol-t">
    <h4 id="live-consol-t">Total consolidado <small>27 estados + exterior</small></h4>
    ${aviso}
    <div class="scroll"><table class="apu-tabela live-consol-t"><caption class="sr">Votos por candidatura nos estados, no exterior e no total</caption>
      <thead><tr><th scope="col">Candidatura</th><th scope="col">Estados</th><th scope="col">Exterior</th><th scope="col">Total</th><th scope="col">%</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <p class="muted small">O exterior pesa ${virgula(parteExt * 100)}% dos votos somados${ext ? ` e tem ${pct(avancoDe(ext), 1)} das seções totalizadas` : ""}. O total soma ${int(c.arquivos.com)} de ${int(c.arquivos.de)} arquivos; o destaque acima usa o arquivo nacional do TSE, que já inclui o exterior.${confere}</p>
  </section>`;
}
