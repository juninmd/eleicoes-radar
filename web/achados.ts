// The four summary cards above the list. Each says exactly what it counts.
import { int, moneyShort, pct } from "./format.js";
import type { Candidatura } from "./types.js";

const MIN_INCUMBENTS = 3; // a median over one or two people is not a finding

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

const card = (big: string, text: string) => `<div><b>${big}</b><span>${text}</span></div>`;

// list: the candidacies of the open ballot after the filters.
export function achados(list: Candidatura[]) {
  const comReceita = list.filter((c) => c.fin.total > 0);
  const total = list.reduce((a, c) => a + c.fin.total, 0);
  const publico = list.reduce((a, c) => a + c.fin.publico, 0);
  const count = (status: string) => list.filter((c) => c.perfil?.status === status).length;
  const naoVerificado = list.filter((c) => !c.perfil || c.perfil.status === "nao-verificado").length;
  const situacao = [
    count("reeleicao") ? `${int(count("reeleicao"))} tentam reeleição` : "",
    count("novo") ? `${int(count("novo"))} estreantes` : "",
    naoVerificado ? `${int(naoVerificado)} sem situação verificável` : "",
  ].filter(Boolean).join(", ");
  const semDoador = comReceita.filter((c) => c.fin.doadoresPF === 0).length;
  const incumbents = list.filter((c) => c.mandato?.votos);
  const presenca = median(incumbents.map((c) => c.mandato!.votos!.votou / c.mandato!.votos!.possiveis));
  const dinheiro = median(comReceita.map((c) => c.fin.total));
  return [
    card(int(list.length), `candidaturas, ${int(comReceita.length)} com receita declarada${situacao ? ` · ${situacao}` : ""}`),
    card(total ? pct(publico / total) : "–", `do dinheiro arrecadado (${moneyShort(total)}) veio de fundos públicos`),
    card(int(semDoador), `de ${int(comReceita.length)} campanhas com receita não têm nenhum doador pessoa física`),
    incumbents.length >= MIN_INCUMBENTS
      ? card(pct(presenca), `presença mediana dos ${int(incumbents.length)} que já são deputados federais`)
      : card(dinheiro === null ? "–" : moneyShort(dinheiro), "arrecadação mediana por campanha com receita"),
  ].join("");
}
