"""Empacota os datasets (ds/*.json, gerados por build_ds.py e build_gov.py) nos arquivos que a aba Auditoria do
Radar lê: web/data/auditoria/{auditoria,impressao,mapa,governadores}.json. Saída: AUDITORIA_OUT ou web/data/auditoria."""
import json, os, sys, datetime

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
FORENSE = os.environ.get("FORENSE_DIR") or os.path.join(REPO, "data", "forense")
DS = os.path.join(FORENSE, "ds")
OUT = os.environ.get("AUDITORIA_OUT") or os.path.join(REPO, "web", "data", "auditoria")
os.makedirs(OUT, exist_ok=True)


def rd(name):
    with open(os.path.join(DS, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def wr(name, obj):
    p = os.path.join(OUT, name + ".json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(name, os.path.getsize(p) // 1024, "KB")


SIMPLES = ["eleicoes", "catalogo", "fontes", "uf_dispersao", "para_conferir", "subdispersao", "aritmetica_caso", "ultima_secao",
           "ajuste_perfil", "entre_turnos", "entre_turnos_top", "urna", "tempo_bu", "eleitorado_resumo", "eleitorado_top",
           "eleitorado_uf", "eleitorado_porte", "eleitorado_persistencia", "eleitorado_voto", "crescimento", "crescimento_top",
           "poder", "poder_base"]
aud = {"gerado": datetime.date.today().isoformat()}
for k in SIMPLES:
    aud[k] = rd(k)
comp = {}
for r in rd("comparecimento"):
    comp.setdefault(r["id"], [0] * 50)[r["bin"]] = r["n"]
if os.path.exists(os.path.join(DS, "biometria.json")):  # gerado por bio.py agg
    aud["biometria"] = rd("biometria")
aud["comparecimento"] = comp
dig = {}
for r in rd("digitos"):
    dig.setdefault(r["id"], {}).setdefault(r["serie"], [0.0] * 10)[r["d"]] = r["freq"]
aud["digitos"] = dig
wr("auditoria", aud)

imp = {}
for r in rd("impressao"):
    imp.setdefault(r["id"], []).append([r["x"], r["y"], r["n"]])
wr("impressao", imp)
wr("mapa", rd("eleitorado_mapa"))
if os.path.exists(os.path.join(DS, "mapa_voto.json")):  # gerado por mapa_voto.py; alinhado linha a linha ao mapa acima
    wr("mapa-voto", rd("mapa_voto"))
if os.path.exists(os.path.join(DS, "correl.json")):  # gerado por correl_ds.py; também alinhado ao mapa
    wr("correl", rd("correl"))
# sem nome de candidato nos sinais de disputas estaduais (AGENTS.md)
wr("governadores", [{k: v for k, v in r.items() if k not in ("a_nome", "b_nome")} for r in rd("governadores")])
