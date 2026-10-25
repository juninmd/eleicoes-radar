import { describe, expect, test } from "bun:test";
import type { Estado } from "./social-api";
import { chip, MIN_PERCENTUAL, painel, rotuloChip, type MapaUf, type PainelProps } from "./social-view";

const estado = (o: Partial<Estado> = {}): Estado => ({
  online: 12, porUf: { SP: 7, RJ: 3, AC: 1 }, semUf: 1, meu: null, push: true, eventos: [],
  torcida: { corrida: "Presidente · 2º turno", total: 0, opcoes: [{ id: "a1", nome: "Ana Souza", partido: "AAA", votos: 0 }, { id: "b2", nome: "Beto Lima", partido: "BBB", votos: 0 }] }, ...o,
});
const mapa: MapaUf = { viewBox: [0, 0, 100, 100], ufs: { SP: { d: "M0 0L1 1" }, RJ: { d: "M2 2L3 3" }, AC: { d: "M4 4L5 5" }, AM: { d: "M6 6L7 7" } } };
const props = (o: Partial<PainelProps> = {}): PainelProps => ({ estado: estado(), mapa, push: "inativo", pushOcupado: false, pushErro: "", semRastro: false, ...o });

describe("chip", () => {
  test("says how many people are online, in the singular too, and tells assistive tech what the button does", () => {
    expect(rotuloChip(1)).toBe("1 pessoa online");
    expect(rotuloChip(1234)).toBe("1.234 pessoas online");
    expect(chip(1234, false)).toContain('aria-expanded="false"');
    expect(chip(1234, true)).toContain("Fechar o painel");
    expect(chip(3, false)).toContain("<b id=\"soc-n\">3</b>");
  });
});

describe("painel", () => {
  test("the map shades states by how many are online and has a text list for those who cannot see it", () => {
    const html = painel(props());
    expect(html).toContain("<title>SP: 7 online</title>");
    expect(html).toContain("<title>AM: 0 online</title>");
    const op = (uf: string) => Number(new RegExp(`fill-opacity:([0-9.]+)"><title>${uf}:`).exec(html)![1]);
    expect(op("SP")).toBeGreaterThan(op("RJ"));
    expect(op("RJ")).toBeGreaterThan(op("AM"));
    expect(html).toMatch(/<ul class="soc-top"[^>]*><li><b>SP<\/b> 7<\/li><li><b>RJ<\/b> 3<\/li>/);
    expect(html).toContain("1 pessoa não informou o estado");
  });
  test("without the map file or anyone with a state, the panel says so instead of drawing an empty map", () => {
    expect(painel(props({ mapa: null }))).not.toContain("<svg");
    expect(painel(props({ estado: estado({ porUf: {}, semUf: 4 }) }))).toContain("Ninguém informou o estado ainda");
  });
  test("the cheering poll is labelled as an open poll, not a survey or a recommendation", () => {
    const html = painel(props());
    expect(html).toContain("sem valor estatístico");
    expect(html).toContain("não é pesquisa e não indica voto");
    expect(html).not.toMatch(/vencedor|venceu|vai ganhar|será eleit|vai vencer|recomend/i);
  });
  test("shares appear only once there are enough cheers, and my pick is marked", () => {
    const poucos = painel(props({ estado: estado({ meu: "a1", torcida: { corrida: "x", total: MIN_PERCENTUAL - 1, opcoes: [{ id: "a1", nome: "Ana", partido: "A", votos: 5 }, { id: "b2", nome: "Beto", partido: "B", votos: 4 }] } }) }));
    expect(poucos).not.toContain("soc-voto-pct");
    expect(poucos).toContain("Poucos votos ainda");
    const muitos = painel(props({ estado: estado({ meu: "a1", torcida: { corrida: "x", total: 100, opcoes: [{ id: "a1", nome: "Ana", partido: "A", votos: 60 }, { id: "b2", nome: "Beto", partido: "B", votos: 40 }] } }) }));
    expect(muitos).toContain(">60%<");
    expect(muitos).toContain(">40%<");
    expect(muitos).toMatch(/data-soc-voto="a1"[^>]*aria-pressed="true"/);
    expect(muitos).toMatch(/data-soc-voto="b2"[^>]*aria-pressed="false"/);
  });
  test("with Do Not Track on, the poll is read-only and the page says nothing is sent", () => {
    const html = painel(props({ semRastro: true }));
    expect(html.match(/data-soc-voto/g)!.length).toBe(2);
    expect(html.match(/ disabled/g)!.length).toBe(2);
    expect(html).toContain("pede para não ser rastreado");
    expect(html).toContain("nada é enviado daqui");
  });
  test("a candidate name from the server can never inject markup", () => {
    const ruim = estado({ torcida: { corrida: "<b>x</b>", total: 0, opcoes: [{ id: 'a"><img src=x onerror=1>', nome: "<img src=x onerror=alert(1)>", partido: "<script>", votos: 0 }] } });
    const html = painel(props({ estado: ruim, mapa: null }));
    expect(html).not.toMatch(/<img|<script/i);
    expect(html).not.toContain('"><img');
  });
  test("the privacy note says what is kept and what is not", () => {
    const html = painel(props());
    expect(html).toContain("sem nome, e-mail, IP ou localização");
    expect(html).toContain("reiniciar apaga tudo");
  });
});

describe("avisos (push)", () => {
  test("offers the button when the server has push on, and flips to turn-off once active", () => {
    expect(painel(props({ push: "inativo" }))).toContain("Receber avisos de eventos importantes");
    const ativo = painel(props({ push: "ativo" }));
    expect(ativo).toContain("Avisos ligados neste navegador · desligar");
    expect(ativo).toContain('aria-pressed="true"');
  });
  test("is absent when the server has no keys, and explains a blocked or unsupported browser", () => {
    expect(painel(props({ estado: estado({ push: false }) }))).not.toContain("data-soc-push");
    const bloqueado = painel(props({ push: "bloqueado" }));
    expect(bloqueado).toContain("bloqueadas neste navegador");
    expect(bloqueado).not.toContain("data-soc-push");
    expect(painel(props({ push: "indisponivel" }))).toContain("tela de início");
  });
  test("says what triggers a notice without promising a winner, and keeps the Radar's proof apart from the TSE's mark", () => {
    const html = painel(props());
    expect(html).toContain("não é a marcação do TSE");
    expect(html).toContain("quando o TSE marcar");
  });
  test("lists recent events with their time, and shows a failure as an alert", () => {
    const t = new Date(2026, 9, 25, 19, 5).getTime();
    const html = painel(props({ pushErro: "falhou", estado: estado({ eventos: [{ id: "e1", t, titulo: "Presidente: a apuração começou", texto: "As primeiras seções chegaram.", rotulo: "Presidente" }] }) }));
    expect(html).toContain("<time>19:05</time>");
    expect(html).toContain("Presidente: a apuração começou");
    expect(html).toContain('role="alert">falhou');
  });
});
