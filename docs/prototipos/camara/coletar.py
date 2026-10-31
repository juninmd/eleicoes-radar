#!/usr/bin/env python3
"""Coleta da API de Dados Abertos da Câmara para os protótipos (docs/prototipos/camara).

Uso:  python3 -I docs/prototipos/camara/coletar.py
Grava dados/votacoes.js, dados/pauta.js e dados/tramitacao.js (window.DADOS_*),
para as páginas abrirem direto por file://, sem servidor.

Armadilhas da API (conferidas em 2026-10-31):
- /votacoes/{id}/votos NÃO aceita `itens` (400 "Parâmetro(s) inválido(s)"): sem paginação, vem tudo.
- /votacoes: intervalo dataInicio..dataFim de no máximo 3 meses (400 acima disso).
- Votação simbólica (a maioria das de Plenário) devolve `votos: []`; nominal tem "Sim: N; Não: M" na descrição.
- 504 aleatório (deputados, partidos, blocos): repetir com espera crescente.
- Campos aninhados vêm com sufixo "_" (`deputado_`, `proposicao_`).
- Sem CPF em nada disso; só dados públicos de parlamentares (nome, partido, UF, voto).
"""
import json, os, re, subprocess, sys, time, datetime, concurrent.futures as cf

B = "https://dadosabertos.camara.leg.br/api/v2"
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "dados")
HOJE = datetime.date.today().isoformat()


def get(caminho):
    for i in range(5):
        r = subprocess.run(
            ["curl", "-s", "-m", "60", "-w", "\n%{http_code}", "-H", "Accept: application/json", f"{B}/{caminho}"],
            capture_output=True, text=True)
        corpo, _, cod = r.stdout.rpartition("\n")
        if cod == "200":
            return json.loads(corpo)
        time.sleep(2 * (i + 1))
    raise SystemExit(f"falhou: {caminho} ({cod})")


def dados(caminho):
    return get(caminho)["dados"]


def grava(nome, valor):
    os.makedirs(SAIDA, exist_ok=True)
    with open(os.path.join(SAIDA, nome + ".js"), "w", encoding="utf-8") as f:
        f.write(f"window.DADOS_{nome.upper()} = " + json.dumps(valor, ensure_ascii=False, separators=(",", ":")) + ";\n")


def nominais(n=4):
    """Últimas votações nominais do Plenário (3 meses para trás)."""
    ini = (datetime.date.today() - datetime.timedelta(days=85)).isoformat()
    achadas = []
    for pag in range(1, 5):
        lote = dados(f"votacoes?dataInicio={ini}&dataFim={HOJE}&idOrgao=180&itens=100&pagina={pag}"
                     "&ordenarPor=dataHoraRegistro&ordem=DESC")
        achadas += [v for v in lote if re.search(r"Sim: \d+", v.get("descricao") or "")]
        if len(lote) < 100 or len(achadas) >= n:
            break
    return achadas[:n]


def votacao(v):
    d = get(f"votacoes/{v['id']}")["dados"]
    votos = dados(f"votacoes/{v['id']}/votos")
    orient = dados(f"votacoes/{v['id']}/orientacoes")
    afet = d.get("proposicoesAfetadas") or []
    p = afet[0] if afet else {}
    return {
        "id": v["id"], "data": v["data"], "hora": v["dataHoraRegistro"],
        "descricao": re.sub(r"\s+", " ", v["descricao"]),
        "aprovacao": v.get("aprovacao"),
        "prop": {"sigla": p.get("siglaTipo"), "numero": p.get("numero"), "ano": p.get("ano"), "ementa": p.get("ementa")},
        "orient": [[o["codTipoLideranca"], o["siglaPartidoBloco"], o["orientacaoVoto"]] for o in orient],
        # [id, nome, partido, uf, voto]
        "votos": [[x["deputado_"]["id"], x["deputado_"]["nome"], x["deputado_"]["siglaPartido"],
                   x["deputado_"]["siglaUf"], x["tipoVoto"]] for x in votos],
    }


def evento(e):
    pauta = dados(f"eventos/{e['id']}/pauta")
    itens = []
    for it in pauta:
        pr = it.get("proposicao_") or {}
        rel = it.get("relator")
        itens.append({
            "ordem": it["ordem"], "topico": it.get("topico"), "regime": it.get("regime"), "titulo": it.get("titulo"),
            "ementa": (pr.get("ementa") or "")[:400], "parecer": (it.get("textoParecer") or "")[:300],
            "relator": {"nome": rel["nome"], "partido": rel["siglaPartido"], "uf": rel["siglaUf"]} if rel else None,
            "situacao": it.get("situacaoItem"),
        })
    return {
        "id": e["id"], "inicio": e["dataHoraInicio"], "fim": e.get("dataHoraFim"), "situacao": e.get("situacao"),
        "tipo": e.get("descricaoTipo"), "descricao": e.get("descricao"),
        "local": (e.get("localExterno") or (e.get("localCamara") or {}).get("nome")),
        "orgaos": [{"sigla": o["sigla"], "nome": o["nome"]} for o in e.get("orgaos", [])],
        "pauta": itens,
    }


def proposicao(pid):
    p = get(f"proposicoes/{pid}")["dados"]
    tr = dados(f"proposicoes/{pid}/tramitacoes")
    au = dados(f"proposicoes/{pid}/autores")
    te = dados(f"proposicoes/{pid}/temas")
    return {
        "id": pid, "titulo": f"{p['siglaTipo']} {p['numero']}/{p['ano']}", "tipo": p["descricaoTipo"],
        "ementa": p["ementa"], "apresentacao": p["dataApresentacao"], "inteiroTeor": p.get("urlInteiroTeor"),
        "autores": [{"nome": a["nome"], "tipo": a.get("tipo")} for a in au],
        "temas": [t["tema"] for t in te],
        # [data, orgao, tramitacao, situacao, regime, despacho]
        "tram": [[t["dataHora"][:10], t["siglaOrgao"], t["descricaoTramitacao"], t.get("descricaoSituacao"),
                  t.get("regime"), re.sub(r"\s+", " ", t.get("despacho") or "")[:320]] for t in tr],
    }


def main():
    print("votações nominais…")
    vs = nominais(4)
    with cf.ThreadPoolExecutor(4) as ex:
        grava("votacoes", {"geradoEm": HOJE, "votacoes": list(ex.map(votacao, vs))})

    print("pauta…")
    ev = dados(f"eventos?dataInicio={HOJE}&dataFim={(datetime.date.today() + datetime.timedelta(days=10)).isoformat()}"
               "&itens=100&ordenarPor=dataHoraInicio&ordem=ASC")
    with cf.ThreadPoolExecutor(6) as ex:
        grava("pauta", {"geradoEm": HOJE, "eventos": list(ex.map(evento, ev))})

    print("tramitação…")
    # as proposições das votações nominais acima (a primeira de cada uma que for projeto de lei)
    ids = []
    for v in vs:
        for p in (get(f"votacoes/{v['id']}")["dados"].get("proposicoesAfetadas") or []):
            if p["siglaTipo"] in ("PL", "PLP", "PEC", "PDL") and p["id"] not in ids:
                ids.append(p["id"])
    with cf.ThreadPoolExecutor(4) as ex:
        grava("tramitacao", {"geradoEm": HOJE, "proposicoes": list(ex.map(proposicao, ids[:4]))})
    print("ok →", SAIDA)


if __name__ == "__main__":
    sys.exit(main())
