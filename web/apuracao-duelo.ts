// Head-to-head of a one-seat race (Presidente, Governador): the two with the most votes on one bar, a line at half of the
// valid votes, the gap in points and in votes, and what is still to be counted. The runoff banner is the Radar's arithmetic
// (segundoTurno, apuracao-eleito.js) and says so; every number a bar draws is also printed beside it.
import { h, int, pct, titleName } from "./format.js";
import { pp } from "./prev.js";
import { segundoTurno } from "./apuracao-eleito.js";
import { PALETA } from "./apuracao-mapa.js";

const UMA_VAGA = new Set(["Presidente", "Governador"]);

// "2,9 milhões", "1,2 milhão", "233 mil": votes in a sentence. 999.500 and up already reads as a million.
export function extenso(v) {
  if (v >= 999500) {
    const m = Math.round(v / 1e5) / 10; // rounded first: 1.999.999 is "2,0 milhões", not "2,0 milhão"
    return `${m.toFixed(1).replace(".", ",")} ${m < 2 ? "milhão" : "milhões"}`;
  }
  return v >= 1000 ? `${int(Math.round(v / 1000))} mil` : int(Math.round(v));
}

const nome = (c) => `<b>${h(titleName(c.nome))}</b> <small>${h(c.partido)}</small>`;

// The two on the bar must tell apart. The session's colour memory runs out after a few parties and hands the rest one grey
// (or one colour twice): then the bar uses its own pair rather than draw both leaders as "the others".
function coresDoPar(a, b, cor) {
  const [ca, cb] = [cor(a.partido), cor(b.partido)];
  return ca === cor.resto || cb === cor.resto || ca === cb ? [PALETA[0], PALETA[1]] : [ca, cb];
}

function turno2(d, cargo, uf) {
  const t = segundoTurno(d, cargo, uf);
  if (!t) return "";
  const [a, b] = [...d.candidatos].sort((x, y) => y.votos - x.votos);
  // The claim, who is in it and its label stay in view; the rule behind it folds away so a phone shows the bar without a screenful of text first.
  const quem = t.finalistas ? `Disputam: ${nome(a)} e ${nome(b)}.` : "Quem fica em segundo ainda não está fechado.";
  const porque = t.finalistas
    ? "O terceiro colocado não alcançaria o segundo nem com todos esses votos."
    : "A diferença entre o 2º e o 3º é menor do que o número de eleitores que faltam.";
  const regra = `Mesmo que todos os eleitores das seções ainda não totalizadas votassem em ${nome(a)}, a parcela de ${nome(a)} nos votos válidos continuaria em 50% ou menos. ${porque}`;
  return `<div class="apu-decidido apu-turno2"><p><b>Segundo turno garantido.</b> ${quem} É uma conta do Radar sobre os números do TSE: não é a marcação do TSE.</p>
    <details data-k="regra-2t"><summary>Como a conta funciona</summary><p>${regra}</p></details></div>`;
}

export function renderDuelo({ d, cargo, uf, cor }) {
  if (!d || !UMA_VAGA.has(cargo) || d.fase === "aguardando") return "";
  const [a, b, ...demais] = [...d.candidatos].sort((x, y) => y.votos - x.votos);
  if (!a || !b || !(a.votos > 0)) return "";
  const resto = Math.max(0, 1 - a.pct - b.pct);
  const falta = d.eleitorado.apto - d.eleitorado.apurado;
  const [corA, corB] = coresDoPar(a, b, cor);
  const linha = (c, cc) => `<li><i class="key" style="background:${cc}"></i><span class="lg-nm">${nome(c)} <b>${pct(c.pct, 2)}</b></span> <span class="lg-fl">${c.pct > 0.5 ? "acima de 50% dos votos válidos até agora" : `faltam ${pp(0.5 - c.pct)} p.p. para 50%`}</span></li>`;
  const aria = `Votos válidos até agora: ${titleName(a.nome)} ${pct(a.pct, 1)}, ${titleName(b.nome)} ${pct(b.pct, 1)}, demais ${pct(resto, 1)}. A linha do meio marca 50%.`;
  return `${turno2(d, cargo, uf)}
    <div class="apu-duelo">
      <div class="apu-duelo-trilho"><div class="apu-duelo-bar" role="img" aria-label="${h(aria)}">
        <span class="seg" style="width:${(a.pct * 100).toFixed(2)}%;background:${corA}"></span><span class="seg" style="width:${(b.pct * 100).toFixed(2)}%;background:${corB}"></span><span class="seg resto"></span>
      </div><span class="apu-duelo-tick" aria-hidden="true"></span></div>
      <ul class="apu-legenda apu-duelo-leg">${linha(a, corA)}${linha(b, corB)}${demais.length ? `<li><i class="key resto"></i><span class="lg-nm">${demais.length === 1 ? "1 outra candidatura" : `Demais ${int(demais.length)} candidaturas`} <b>${pct(resto, 1)}</b></span></li>` : ""}</ul>
      <p class="exp-read">Diferença entre os dois: <b>${pp(a.pct - b.pct)} p.p.</b> (${extenso(a.votos - b.votos)} de votos). A linha marca 50% dos votos válidos. Eleitores das seções que ainda faltam: <b>${extenso(falta)}</b>, contando quem não comparece.</p>
    </div>`;
}
