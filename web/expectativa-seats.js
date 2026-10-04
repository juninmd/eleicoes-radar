// Deputies: no public poll per candidate, so the chance comes from the model trained on past elections.
import { displayName, h, int, pct } from "./format.js";
import { chance, listName, rotulo } from "./prev.js";

// The 2022 hit rate of the top bands, said as a sentence a voter can weigh.
function calibracaoTexto(cal) {
  const top = cal.filter((b) => b.n >= 30 && b.previsto >= 0.5).slice(-2);
  return top.map((b) => `Em 2022, ${pct(b.observado)} das ${int(b.n)} candidaturas que o modelo pôs em ${h(b.faixa)} foram eleitas.`).join(" ");
}

const why = (c, ano) => {
  const ex = c.prev.ex;
  if (!ex) return "";
  return `<small class="why">${int(ex.r)}ª arrecadação · dinheiro de ${h(listName(c))} ≈ ${ex.vl.toFixed(1).replace(".", ",")} vagas · ${int(ex.lr)}º na lista${ex.dep ? " · já é deputado(a)" : ""}${ex.el ? ` · eleito(a) em ${h(ano)}` : ""}${ex.rep ? " · número repete o do partido" : ""}</small>`;
};

export function seats(exp, cargo, uf, cands, avatar, limit) {
  const m = exp.modelo;
  const vagas = exp.vagas[`${uf}|${cargo.toUpperCase()}`] ?? 0;
  const list = cands.filter((c) => c.cargo === cargo && c.uf === uf && c.prev).sort((a, b) => b.prev.p - a.prev.p);
  if (!m || !list.length) return `<p class="empty">O modelo de deputados ainda não foi gerado (<code>bun run radar:model</code>).</p>`;
  const bancadas = new Map();
  for (const c of list) bancadas.set(listName(c), (bancadas.get(listName(c)) ?? 0) + c.prev.p);
  const top = [...bancadas].sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.5).slice(0, 12);
  const maxB = top[0]?.[1] ?? 1;
  const bt = m.backtest;
  const ano = m.anterior ?? 2022;
  const provaveis = list.filter((c) => c.prev.p >= 0.6).length;
  const disputa = list.filter((c) => c.prev.p >= 0.3 && c.prev.p < 0.6).length;
  return `
    <section class="exp-card" aria-labelledby="exp-t">
      <h2 id="exp-t">${h(cargo)} · ${h(uf)} · ${int(vagas)} vagas</h2>
      <p class="exp-lead"><b>${int(provaveis)}</b> candidaturas com eleição provável (60%+) e <b>${int(disputa)}</b> em disputa aberta (30–60%). Não há pesquisa pública por candidato a deputado: a chance vem de um modelo treinado nas eleições de ${h(m.treino ?? "2022")}.</p>
      <p class="exp-read">As ${int(vagas)} vagas do estado são divididas entre as listas (partido ou federação), e dentro de cada lista ficam os mais votados. Por isso o modelo olha para a <b>lista</b> e para a <b>posição da pessoa nela</b>, não só para o dinheiro dela. As chances de todos os candidatos somam aproximadamente as ${int(vagas)} vagas.</p>
      <p class="muted exp-meta">Em 2022, com os dados de 7 dias antes da eleição, o modelo acertou <b>${pct(bt.acerto)}</b> dos eleitos (olhar só o dinheiro acertava ${pct(bt.acertoBaseline)}). Usa: arrecadação da campanha, força da lista (partido ou federação), se a pessoa já é deputada, o resultado dela e dos partidos da lista na eleição anterior, e se o número da urna repete o do partido (como 2222 no 22).</p>
      <h3>Bancadas esperadas <small>soma das chances da lista = cadeiras que o modelo espera para ela</small></h3>
      <ul class="bancadas">${top.map(([k, v]) => `<li><span>${h(k)}</span><span class="bar"><span class="fill" style="width:${(v / maxB) * 100}%"></span></span><b>${v.toFixed(1).replace(".", ",")}</b></li>`).join("")}</ul>
      <h3>Chance de eleição <small>a linha tracejada marca o fim das ${int(vagas)} vagas</small></h3>
      <ol class="exp-seats">${list.slice(0, limit).map((c, i) => `
        <li class="${i === vagas - 1 ? "corte" : ""}"><button type="button" class="linkish" data-open="${h(c.id)}">${avatar(c, "xs")}<span>${h(displayName(c))} <small>${h(c.partido)} · ${h(c.num)}</small>${why(c, ano)}</span></button>
          <span class="bar" aria-hidden="true"><span class="fill" style="width:${c.prev.p * 100}%"></span></span><b>${chance(c.prev.p)}</b><span class="sr">${h(rotulo(c.prev.p).txt)}</span></li>`).join("")}</ol>
      ${list.length > limit ? `<button type="button" id="exp-mais" class="ghost">Mostrar mais</button>` : ""}
      <details class="how"><summary>Quão confiável é? Calibração em 2022</summary>
        <p class="muted small">${calibracaoTexto(bt.calibracao)}</p>
        <table class="agenda"><thead><tr><th>Chance prevista</th><th class="num">Média prevista</th><th class="num">Eleitos de fato</th><th class="num">Candidaturas</th></tr></thead>
        <tbody>${bt.calibracao.filter((b) => b.n).map((b) => `<tr><td>${h(b.faixa)}</td><td class="num">${pct(b.previsto, 1)}</td><td class="num">${pct(b.observado, 1)}</td><td class="num">${int(b.n)}</td></tr>`).join("")}</tbody></table>
        <p class="muted small">Validação cruzada por estado: cada UF foi prevista por um modelo que não a viu. A chance não considera votos de legenda nem as regras de sobras em detalhe; é um sinal de competitividade, não uma previsão de votos.</p>
      </details>
    </section>`;
}
