// "Câmara" view for Deputado Federal: the seats the TSE has assigned to each party or federation,
// summed over the 27 states, drawn as a hemicycle. Only the TSE's own numbers: no projection.
import { h, int, pct } from "./format.js";
import { linhasUf } from "./apuracao-nacional.js";

const NEUTRO = "#d5d9d3";
const chave = (nome) => nome.trim().replace(/\s+/g, " ").toLowerCase();

export function vagasNacionais(linhas) {
  const soma = new Map();
  let emDisputa = 0;
  const com = linhas.filter((l) => l.dados);
  for (const l of com) {
    emDisputa += l.dados.cargo.vagas;
    for (const p of l.dados.partidos ?? []) {
      if (p.vagas <= 0) continue;
      const k = chave(p.nome);
      const x = soma.get(k) ?? { nome: p.nome.trim().replace(/\s+/g, " "), vagas: 0 };
      x.vagas += p.vagas;
      soma.set(k, x);
    }
  }
  const listas = [...soma.values()].sort((a, b) => b.vagas - a.vagas || a.nome.localeCompare(b.nome, "pt-BR"));
  return { listas, definidas: listas.reduce((a, l) => a + l.vagas, 0), emDisputa, cobertura: { com: com.length, de: linhas.length } };
}

const W = 640;
const RO = 300; // outer radius
const RI = 0.4 * RO;

// Seats on concentric arcs, sorted by angle: filling them in that order makes each list a wedge.
function posicoes(n) {
  const k = (2 * n * (RO - RI)) / (Math.PI * (RO + RI));
  const linhas = Math.max(1, Math.round((1 + Math.sqrt(1 + 4 * k)) / 2));
  const raios = Array.from({ length: linhas }, (_, i) => (linhas === 1 ? RO : RI + (i * (RO - RI)) / (linhas - 1)));
  const soma = raios.reduce((a, r) => a + r, 0);
  const porLinha = raios.map((r) => Math.round((n * r) / soma));
  porLinha[linhas - 1] += n - porLinha.reduce((a, b) => a + b, 0); // rounding never loses or adds a seat
  const pts = raios.flatMap((r, i) => Array.from({ length: Math.max(0, porLinha[i]) }, (_, j) => ({ r, fi: (Math.PI * (j + 0.5)) / porLinha[i] })));
  const passo = Math.min((Math.PI * soma) / n, linhas > 1 ? (RO - RI) / (linhas - 1) : Infinity);
  // Capped: with only a few seats (the total grows while the states load) the dots would swell past the drawing.
  return { pts: pts.sort((a, b) => a.fi - b.fi || a.r - b.r), raio: Math.min(14, Math.max(2, 0.42 * passo)) };
}

export function hemiciclo(listas, emDisputa, cor) {
  if (emDisputa <= 0) return "";
  const { pts, raio } = posicoes(emDisputa);
  const cores = listas.flatMap((l) => Array(l.vagas).fill(cor(l.nome))).slice(0, emDisputa);
  const cx = W / 2;
  const cy = RO + raio + 6;
  const dots = pts.map((p, i) => `<circle cx="${(cx - p.r * Math.cos(p.fi)).toFixed(1)}" cy="${(cy - p.r * Math.sin(p.fi)).toFixed(1)}" r="${raio.toFixed(1)}" fill="${cores[i] ?? NEUTRO}"/>`);
  const desc = `${listas.map((l) => `${l.nome} ${l.vagas}`).join(", ")}${listas.length ? "; " : ""}${emDisputa - Math.min(emDisputa, listas.reduce((a, l) => a + l.vagas, 0))} vagas ainda sem lista`;
  return `<svg class="apu-camara" viewBox="0 0 ${W} ${Math.ceil(cy + raio + 4)}" role="img" aria-label="Vagas por partido ou federação: ${h(desc)}">${dots.join("")}</svg>`;
}

export function renderCamara({ nac, cor }) {
  const linhas = linhasUf(nac?.ufs ?? {}, "Deputado Federal");
  if (!linhas.length || linhas.every((l) => !l.dados && l.status === "carregando")) return `<p class="muted">Consultando os 27 estados…</p>`;
  const v = vagasNacionais(linhas);
  const resumo = `<p class="exp-lead"><b>${int(v.definidas)} de ${int(v.emDisputa)} vagas</b> já atribuídas a partidos ou federações pelo TSE, em ${int(v.cobertura.com)} de ${int(v.cobertura.de)} estados lidos.</p>
    <p class="exp-read">Enquanto a apuração está aberta, as vagas por lista podem mudar: o TSE as define pelo quociente eleitoral de cada estado, e só depois escolhe os candidatos de cada lista.</p>`;
  if (!v.listas.length) return `${resumo}<p class="empty">O TSE ainda não publicou vagas por partido ou federação.</p>`;
  const demais = cor.resto === undefined ? 0 : v.listas.filter((l) => cor(l.nome) === cor.resto).length;
  const nota = demais ? `<p class="muted small">${demais === 1 ? "1 lista menor divide" : `${int(demais)} listas menores dividem`} a cor cinza escuro: as cores acabam. Os números de cada uma estão na tabela.</p>` : "";
  const linhasTab = v.listas.map((l) => `<tr><th scope="row"><i class="key" style="background:${cor(l.nome)}" aria-hidden="true"></i>${h(l.nome)}</th><td class="num">${int(l.vagas)}</td><td class="num">${pct(l.vagas / v.emDisputa, 1)}</td></tr>`).join("");
  return `${resumo}${hemiciclo(v.listas, v.emDisputa, cor)}${nota}
    <div class="scroll"><table class="exp-bars apu-listas"><caption class="sr">Vagas por partido ou federação, em ordem decrescente</caption>
    <thead><tr><th scope="col">Partido ou federação</th><th scope="col" class="num">Vagas</th><th scope="col" class="num">Das vagas em disputa</th></tr></thead><tbody>${linhasTab}</tbody></table></div>`;
}
