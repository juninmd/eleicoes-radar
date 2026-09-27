// "Expectativa" view: who is likely to win. Majoritarian races use the poll average
// (Wikipedia compilation of registered polls); deputies use the 2022-calibrated model.
import { displayName, h, int, pct } from "./format.js";

const MAJORITARIAN = new Set(["Presidente", "Governador", "Senador"]);
const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "–");
const chance = (p) => (p >= 0.995 ? ">99%" : p > 0 && p < 0.005 ? "<1%" : pct(p));

export function renderExpectativa({ exp, cargo, uf, cands, avatar, limit }) {
  if (!exp) return `<p class="empty">Os dados de expectativa ainda não foram gerados (<code>bun run radar:polls</code> e <code>radar:model</code>).</p>`;
  const byId = new Map(cands.map((c) => [c.id, c]));
  return MAJORITARIAN.has(cargo) ? race(exp, cargo, uf, byId, avatar) : seats(exp, cargo, uf, cands, avatar, limit);
}

function race(exp, cargo, uf, byId, avatar) {
  const r = exp.corridas.find((x) => x.cargo === cargo && x.uf === uf);
  const fonte = exp.fontes.find((f) => f.uf === uf);
  if (!r) return `<p class="empty">Nenhuma pesquisa com os candidatos registrados foi encontrada para ${h(cargo)} ${h(uf === "BR" ? "" : uf)}.</p>`;
  const rows = r.candidatos.map((id) => byId.get(id)).filter(Boolean);
  const lead = rows[0];
  const shown = rows.filter((c, i) => i < 4 || (c.prev?.media ?? 0) >= 0.01);
  const twoRounds = cargo !== "Senador";
  const max = Math.max(...shown.map((c) => c.prev?.hi ?? 0), 0.5);
  const headline = twoRounds
    ? `<b>${h(displayName(lead))}</b> tem <b>${chance(lead.prev.p)}</b> de chance de vencer. Chance de a disputa acabar no 1º turno: <b>${chance(r.p1turno)}</b>.`
    : `${r.vagas} ${r.vagas > 1 ? "vagas" : "vaga"} em disputa. Mais prováveis: ${rows.slice(0, r.vagas).map((c) => `<b>${h(displayName(c))}</b> (${chance(c.prev.p)})`).join(" e ")}.`;
  return `
    <section class="exp-card" aria-labelledby="exp-t">
      <h2 id="exp-t">${h(cargo)}${uf === "BR" ? "" : ` · ${h(uf)}`}</h2>
      <p class="exp-lead">${headline}</p>
      <p class="muted exp-meta">Média de ${int(r.pesquisas)} pesquisas (a mais recente de cada instituto) de ${fmtDate(r.desde)} a ${fmtDate(r.ultima)}: ${h(r.institutos.join(", "))}.</p>
      <table class="exp-bars">
        <caption class="sr">Média das pesquisas em votos válidos, intervalo de 90% e chance de ${twoRounds ? "vitória" : "eleição"}</caption>
        <thead><tr><th scope="col">Candidato</th><th scope="col">Votos válidos (média e faixa de 90%)</th>${twoRounds ? `<th scope="col" class="num">2º turno</th>` : ""}<th scope="col" class="num">${twoRounds ? "Vence" : "Eleito"}</th></tr></thead>
        <tbody>${shown.map((c) => {
          const p = c.prev;
          return `<tr>
            <th scope="row"><button type="button" class="linkish" data-open="${h(c.id)}">${avatar(c, "xs")}<span>${h(displayName(c))} <small>${h(c.partido)} · ${h(c.num)}</small></span></button></th>
            <td><div class="bar" title="${h(displayName(c))}: ${pct(p.media, 1)} (faixa ${pct(p.lo, 1)}–${pct(p.hi, 1)})">
              <span class="range" style="left:${(p.lo / max) * 100}%;width:${((p.hi - p.lo) / max) * 100}%"></span>
              <span class="mean" style="left:${(p.media / max) * 100}%"></span>
              <span class="lbl">${pct(p.media, 1)}</span>
            </div></td>
            ${twoRounds ? `<td class="num">${chance(p.p2t ?? 0)}</td>` : ""}
            <td class="num"><b>${chance(p.p)}</b></td></tr>`;
        }).join("")}</tbody>
      </table>
      ${twoRounds && r.p1turno < 1 ? runoffs(r, byId) : ""}
      ${pollTable("Pesquisas recentes (1º turno)", r.primeiroTurno, shown.slice(0, 5))}
      <p class="muted small">Fonte: pesquisas registradas no TSE pelos institutos, compiladas na <a href="${h(fonte?.url ?? "https://pt.wikipedia.org")}" rel="noopener" target="_blank">Wikipédia</a> (CC BY-SA). Isto é uma média de pesquisas com simulação de erro, <b>não é uma pesquisa eleitoral</b>.</p>
    </section>`;
}

function runoffs(r, byId) {
  const pairs = new Map();
  for (const p of r.segundoTurno) {
    const key = Object.keys(p.votos).sort().join("|");
    if (!pairs.has(key)) pairs.set(key, p);
  }
  const rows = [...pairs.values()].slice(0, 6).map((p) => {
    const [[a, va], [b, vb]] = Object.entries(p.votos).sort((x, y) => y[1] - x[1]);
    const ca = byId.get(a);
    const cb = byId.get(b);
    return ca && cb ? `<tr><td>${h(displayName(ca))} <b>${pct(va / 100)}</b> × ${h(displayName(cb))} ${pct(vb / 100)}</td><td>${h(p.instituto)}</td><td class="num">${fmtDate(p.fim)}</td></tr>` : "";
  });
  return rows.length ? `<h3>Cenários de 2º turno (pesquisa mais recente por par)</h3>
    <div class="scroll"><table class="agenda"><thead><tr><th>Cenário</th><th>Instituto</th><th class="num">Data</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : "";
}

function pollTable(title, polls, cols) {
  if (!polls.length) return "";
  return `<h3>${h(title)}</h3><div class="scroll"><table class="agenda exp-polls">
    <thead><tr><th>Instituto</th><th class="num">Data</th><th class="num">Amostra</th>${cols.map((c) => `<th class="num">${h(displayName(c))}</th>`).join("")}</tr></thead>
    <tbody>${polls.map((p) => `<tr><td>${h(p.instituto)}</td><td class="num">${fmtDate(p.fim)}</td><td class="num">${p.amostra ? int(p.amostra) : "–"}</td>${cols.map((c) => `<td class="num">${p.votos[c.id] === undefined ? "–" : pct(p.votos[c.id] / 100, p.votos[c.id] % 1 ? 1 : 0)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function seats(exp, cargo, uf, cands, avatar, limit) {
  const m = exp.modelo;
  const vagas = exp.vagas[`${uf}|${cargo.toUpperCase()}`] ?? 0;
  const list = cands.filter((c) => c.cargo === cargo && c.uf === uf && c.prev).sort((a, b) => b.prev.p - a.prev.p);
  if (!m || !list.length) return `<p class="empty">O modelo de deputados ainda não foi gerado (<code>bun run radar:model</code>).</p>`;
  const bancadas = new Map();
  for (const c of list) {
    // Federation names come as "Federação Brasil da Esperança - FE BRASIL": keep the acronym.
    const k = c.ficha?.federacao ? c.ficha.federacao.split(" - ").pop() : c.partido;
    bancadas.set(k, (bancadas.get(k) ?? 0) + c.prev.p);
  }
  const top = [...bancadas].sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.5).slice(0, 12);
  const maxB = top[0]?.[1] ?? 1;
  const bt = m.backtest;
  const provaveis = list.filter((c) => c.prev.p >= 0.7).length;
  const disputa = list.filter((c) => c.prev.p >= 0.3 && c.prev.p < 0.7).length;
  return `
    <section class="exp-card" aria-labelledby="exp-t">
      <h2 id="exp-t">${h(cargo)} · ${h(uf)} · ${int(vagas)} vagas</h2>
      <p class="exp-lead"><b>${int(provaveis)}</b> candidaturas com chance alta (70%+) e <b>${int(disputa)}</b> na disputa (30–70%). Não há pesquisa pública por candidato a deputado: a chance vem de um modelo treinado na eleição de 2022.</p>
      <p class="muted exp-meta">Em 2022, com os dados de 7 dias antes da eleição, o modelo acertou <b>${pct(bt.acerto)}</b> dos eleitos (olhar só o dinheiro acertava ${pct(bt.acertoBaseline)}). Usa: arrecadação da campanha, força da lista (partido ou federação) e se a pessoa já é deputada.</p>
      <h3>Bancadas esperadas <small>soma das chances por partido ou federação</small></h3>
      <ul class="bancadas">${top.map(([k, v]) => `<li><span>${h(k)}</span><span class="bar"><span class="fill" style="width:${(v / maxB) * 100}%"></span></span><b>${v.toFixed(1).replace(".", ",")}</b></li>`).join("")}</ul>
      <h3>Chance de eleição</h3>
      <ol class="exp-seats">${list.slice(0, limit).map((c, i) => `
        <li class="${i === vagas - 1 ? "corte" : ""}"><button type="button" class="linkish" data-open="${h(c.id)}">${avatar(c, "xs")}<span>${h(displayName(c))} <small>${h(c.partido)} · ${h(c.num)}</small></span></button>
          <span class="bar"><span class="fill" style="width:${c.prev.p * 100}%"></span></span><b>${chance(c.prev.p)}</b></li>`).join("")}</ol>
      ${list.length > limit ? `<button type="button" id="exp-mais" class="ghost">Mostrar mais</button>` : ""}
      <details><summary>Quão confiável é? Calibração em 2022</summary>
        <table class="agenda"><thead><tr><th>Chance prevista</th><th class="num">Média prevista</th><th class="num">Eleitos de fato</th><th class="num">Candidaturas</th></tr></thead>
        <tbody>${bt.calibracao.filter((b) => b.n).map((b) => `<tr><td>${h(b.faixa)}</td><td class="num">${pct(b.previsto, 1)}</td><td class="num">${pct(b.observado, 1)}</td><td class="num">${int(b.n)}</td></tr>`).join("")}</tbody></table>
        <p class="muted small">Validação cruzada por estado: cada UF foi prevista por um modelo que não a viu. A chance não considera votos de legenda nem as regras de sobras em detalhe; é um sinal de competitividade.</p>
      </details>
    </section>`;
}
