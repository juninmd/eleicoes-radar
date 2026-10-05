import { describe, expect, test } from "bun:test";
import { parseApuracao } from "./apuracao-tse.js";
import { renderApuracao, semRelogio } from "./apuracao.js";
import type { RenderProps } from "./apuracao.js";
import { createCores } from "./apuracao-nacional.js";
import { PALETA } from "./apuracao-mapa.js";
import { createProjecao } from "./apuracao-projecao-estado.js";
import { avatar, byId, cand, dois, file } from "./apuracao-fixtures.js";
import type { FixAgr } from "./apuracao-fixtures.js";

describe("vistas Projeção e Cadeiras, e o ritmo do TSE", () => {
  const parsed = () => parseApuracao(file({ cands: dois }));
  const ver = (over: Partial<RenderProps> = {}) => renderApuracao({ snap: { status: "ok", dados: parsed(), buscadoEm: new Date("2026-10-04T22:45:00Z"), erro: null }, cargo: "Governador", uf: "SP", byId, avatar, limit: 40, cor: createCores(PALETA), ...over });
  // File time is 19:41:07 in Brasília (22:41:07Z). The query at 22:45:00Z is 3 min later; at 23:15:00Z, 34 min.
  const proporcional = (agr: FixAgr[]) => parseApuracao(file({ cargo: { cd: "7", nmn: "Deputado Estadual", nv: "3", agr } }));
  const agr = [
    { n: "10", nm: "L1", com: "L1", vag: "2", par: [{ n: "10", sg: "L1", cand: [cand("a1", "10123", "ANA", "1", "900", "9,00"), cand("a2", "10124", "ANTONIO", "2", "800", "8,00"), cand("a3", "10125", "ALICE", "3", "790", "7,90")] }] },
    { n: "20", nm: "L2", com: "L2", vag: "1", par: [{ n: "20", sg: "L2", cand: [cand("b1", "20123", "BIA", "1", "500", "5,00")] }] },
  ];

  test("the Projeção tab exists for one-seat races only, and with no analysis yet it says it is loading", () => {
    const html = ver({ vista: "projecao", proj: null });
    expect(html).toMatch(/data-vista="projecao"[^>]*aria-pressed="true"/);
    expect(html).toContain("Consultando o TSE");
    expect(ver({ cargo: "Senador", vista: "projecao" })).toMatch(/data-vista="placar"[^>]*aria-pressed="true"/); // falls back
  });

  test("with an analysis the Projeção tab labels it as the Radar's estimate and shows the formulas", () => {
    const proj = { analise: null, partes: [], nomes: {}, esperadas: 1 };
    const html = ver({ vista: "projecao", proj });
    expect(html).toContain("Estimativa do Radar");
    expect(html).toContain("Aguardando votos suficientes");
  });

  test("a Projeção built on a file the TSE stopped answering says so on the page, like the Placar does", () => {
    const proj = { ...createProjecao().ler([["SP", parsed(), true]]), esperadas: 1 };
    const html = ver({ vista: "projecao", proj, snap: { status: "erro", dados: parsed(), buscadoEm: new Date("2026-10-04T22:45:00Z"), erro: "HTTP 503" } });
    expect(html).toContain("Estimativa do Radar");
    expect(html).toMatch(/1 arquivo está com números desatualizados: SP/);
  });

  test("the Cadeiras tab reads the seats of a proportional race, list by list, inside the usual page", () => {
    const html = ver({ cargo: "Deputado Estadual", vista: "cadeiras", snap: { status: "ok", dados: proporcional(agr), buscadoEm: new Date("2026-10-04T22:45:00Z"), erro: null } });
    expect(html).toMatch(/data-vista="cadeiras"[^>]*aria-pressed="true"/);
    expect(html).toContain("Leitura da contagem de hoje");
    expect(html).toContain("L1");
    expect(html).toContain("seções totalizadas"); // the progress and file line stay on top
    expect(html).not.toContain('class="exp-bars"'); // not the scoreboard table
  });

  test("a stalled count gets a banner without minutes in it, and a fresh one does not", () => {
    const parada = ver({ snap: { status: "ok", dados: parsed(), buscadoEm: new Date("2026-10-04T23:15:00Z"), erro: null } });
    expect(parada).toContain("Sem arquivo novo do TSE há mais de 10 minutos");
    const maisTarde = ver({ snap: { status: "ok", dados: parsed(), buscadoEm: new Date("2026-10-04T23:30:00Z"), erro: null } });
    expect(semRelogio(parada)).toBe(semRelogio(maisTarde)); // 15 minutes later the banner is the same text: no redraw while the stall lasts
    expect(ver()).not.toContain("Sem arquivo novo do TSE");
  });

  test("the age of the file shows next to its time, and only that span changes between two polls of the same file", () => {
    const a = ver();
    expect(a).toMatch(/<span id="apu-idade">\(há 3 min\)<\/span>/);
    const b = ver({ snap: { status: "ok", dados: parsed(), buscadoEm: new Date("2026-10-04T22:46:02Z"), erro: null } });
    expect(a).not.toBe(b);
    expect(semRelogio(a)).toBe(semRelogio(b)); // so the page is not redrawn for a minute going by
  });

  test("a finished count and one not started show no stall banner, whatever the age of the file", () => {
    const tarde = new Date("2026-10-04T23:59:00Z");
    const concluida = ver({ snap: { status: "ok", dados: parseApuracao(file({ s: { ts: "1000", st: "1000" }, cands: dois })), buscadoEm: tarde, erro: null } });
    const antes = ver({ snap: { status: "ok", dados: parseApuracao(file({ s: { st: "0" }, v: { tv: "0", vvc: "0", vv: "0", vb: "0", tvn: "0" }, cands: dois })), buscadoEm: tarde, erro: null } });
    expect(concluida).not.toContain("Sem arquivo novo");
    expect(antes).not.toContain("Sem arquivo novo");
  });
});
