import { describe, expect, test } from "bun:test";
import { novoAgregador } from "./aggregate";
import type { Row } from "../csv";

const row = (over: Partial<Row>): Row => ({
  DS_CARGO_PERGUNTA: "Presidente", CD_MUNICIPIO: "1", NM_MUNICIPIO: "ALFA", NR_ZONA: "1", NR_SECAO: "1",
  QT_APTOS: "100", QT_COMPARECIMENTO: "80", QT_ABSTENCOES: "20", CD_TIPO_VOTAVEL: "1",
  NR_VOTAVEL: "13", NM_VOTAVEL: "LULA", SG_PARTIDO: "PT", QT_VOTOS: "0", DT_GERACAO: "05/10/2026", HH_GERACAO: "14:00:00", DT_BU_RECEBIDO: "2026-10-04 18:00:00",
  ...over,
});

describe("agregação do Boletim de Urna", () => {
  test("conta aptos/comparecimento/abstenções uma vez por seção e soma os votos por município", () => {
    const a = novoAgregador();
    a.push(row({ NR_SECAO: "1", NR_VOTAVEL: "13", QT_VOTOS: "30" }));
    a.push(row({ NR_SECAO: "1", NR_VOTAVEL: "22", NM_VOTAVEL: "FLAVIO", SG_PARTIDO: "PL", QT_VOTOS: "20" }));
    a.push(row({ NR_SECAO: "1", CD_TIPO_VOTAVEL: "2", NR_VOTAVEL: "95", NM_VOTAVEL: "Branco", QT_VOTOS: "5" }));
    a.push(row({ NR_SECAO: "1", CD_TIPO_VOTAVEL: "3", NR_VOTAVEL: "96", NM_VOTAVEL: "Nulo", QT_VOTOS: "5" }));
    a.push(row({ NR_SECAO: "2", NR_VOTAVEL: "13", QT_VOTOS: "10" }));
    a.push(row({ NR_SECAO: "2", NR_VOTAVEL: "22", NM_VOTAVEL: "FLAVIO", SG_PARTIDO: "PL", QT_VOTOS: "10" }));
    const [p] = a.resultado(2026, "AC", 1, "https://exemplo");
    expect(p!.municipios).toHaveLength(1);
    expect(p!.municipios[0]).toMatchObject({ cd: "1", nome: "ALFA", secoes: 2, aptos: 200, comparecimento: 160, abstencoes: 40, brancos: 5, nulos: 5 });
    expect(p!.total.candidatos.map((c) => [c.nr, c.votos])).toEqual([["13", 40], ["22", 30]]);
    expect(p!.total).toMatchObject({ secoes: 2, aptos: 200, comparecimento: 160, abstencoes: 40, brancos: 5, nulos: 5 });
    expect(p!.buGeradoEm).toBe("05/10/2026 14:00:00");
    expect(p!.recebidoAte).toBe("2026-10-04 18:00:00");
  });

  test("separa cargos e municípios e ignora cargos proporcionais", () => {
    const a = novoAgregador();
    a.push(row({ CD_MUNICIPIO: "1", NR_VOTAVEL: "13", QT_VOTOS: "5" }));
    a.push(row({ CD_MUNICIPIO: "2", NM_MUNICIPIO: "BETA", NR_ZONA: "3", NR_SECAO: "9", NR_VOTAVEL: "13", QT_VOTOS: "7" }));
    a.push(row({ DS_CARGO_PERGUNTA: "Governador", CD_MUNICIPIO: "1", NR_VOTAVEL: "30", NM_VOTAVEL: "ZEMA", SG_PARTIDO: "NOVO", QT_VOTOS: "9" }));
    a.push(row({ DS_CARGO_PERGUNTA: "Deputado Federal", CD_MUNICIPIO: "1", NR_VOTAVEL: "1234", NM_VOTAVEL: "DEP", QT_VOTOS: "99" }));
    const r = a.resultado(2026, "MG", 1, "https://exemplo");
    expect(r.map((x) => x.cargo)).toEqual(["Presidente", "Governador"]);
    expect(r[0]!.municipios.map((m) => m.nome)).toEqual(["ALFA", "BETA"]);
    expect(r[0]!.total.candidatos[0]!.votos).toBe(12);
    expect(r[1]!.total.candidatos[0]!).toMatchObject({ nr: "30", nome: "ZEMA", votos: 9 });
  });

  test("sem linhas do cargo, não inventa arquivo", () => {
    const r = novoAgregador().resultado(2026, "AC", 1, "https://exemplo");
    expect(r).toEqual([]);
  });
});
