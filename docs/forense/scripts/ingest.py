"""Le os zips do TSE (votacao_secao e detalhe_votacao_secao) e grava tabelas compactas (majoritarios).

uso: python3 -I ingest.py <ano>
saida: ../work/vot_<ano>.pkl (votos por votavel) e ../work/det_<ano>.pkl (detalhe por secao x cargo)
"""
import subprocess, sys, zipfile, io, os, re
import pandas as pd

ANO = int(sys.argv[1])
BASE = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
RAW = os.path.join(BASE, "raw")
WORK = os.path.join(BASE, "work")
os.makedirs(WORK, exist_ok=True)
CARGOS = {"1", "3", "5"}  # Presidente, Governador, Senador

def stream(zip_path, member, usecols, chunksize=1_500_000):
    p = subprocess.Popen(["unzip", "-p", zip_path, member], stdout=subprocess.PIPE)
    it = pd.read_csv(p.stdout, sep=";", encoding="latin1", dtype=str, usecols=lambda c: c in usecols,
                     chunksize=chunksize, quotechar='"', on_bad_lines="skip")
    for ch in it:
        yield ch
    p.stdout.close(); p.wait()

def members(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        return [i.filename for i in z.infolist() if i.filename.lower().endswith(".csv")]

def num(s):
    return pd.to_numeric(s, errors="coerce")

# ---------- votos por votavel ----------
vs_zip = os.path.join(RAW, f"vs{ANO}", "vs.zip")
vs_member = [m for m in members(vs_zip) if "BR" in m][0]
cols_v = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "NR_VOTAVEL",
          "NM_VOTAVEL", "QT_VOTOS", "NR_LOCAL_VOTACAO", "SQ_CANDIDATO"]
parts = []
nomes = {}
for ch in stream(vs_zip, vs_member, set(cols_v)):
    ch = ch[ch["CD_CARGO"].isin(CARGOS)]
    if ch.empty:
        continue
    for c in ["NR_TURNO", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "NR_VOTAVEL", "QT_VOTOS", "NR_LOCAL_VOTACAO"]:
        ch[c] = num(ch[c])
    nm = ch[["CD_CARGO", "NR_VOTAVEL", "NM_VOTAVEL"]].drop_duplicates()
    for r in nm.itertuples(index=False):
        nomes[(int(r[0]), int(r[1]))] = r[2]
    ch = ch.drop(columns=["NM_VOTAVEL", "ANO_ELEICAO", "SQ_CANDIDATO"], errors="ignore")
    ch.columns = ["turno", "uf", "mun", "zona", "secao", "cargo", "votavel", "votos", "local"]
    parts.append(ch)
v = pd.concat(parts, ignore_index=True)
for c in ["turno", "mun", "zona", "secao", "cargo", "votavel", "votos", "local"]:
    v[c] = v[c].astype("Int64").astype("int64") if v[c].notna().all() else v[c]
n0 = len(v)
v = v.drop_duplicates(["turno", "uf", "mun", "zona", "secao", "cargo", "votavel"])
print(ANO, "votos duplicados removidos", n0 - len(v), flush=True)
v["uf"] = v["uf"].astype("category")
v.to_pickle(os.path.join(WORK, f"vot_{ANO}.pkl"))
pd.to_pickle(nomes, os.path.join(WORK, f"nomes_{ANO}.pkl"))
print(ANO, "votos", len(v), flush=True)

# ---------- detalhe por secao ----------
ds_zip = os.path.join(RAW, f"ds{ANO}", "ds.zip")
mem = members(ds_zip)
brasil = [m for m in mem if "BRASIL" in m]
alvo = brasil if brasil else [m for m in mem if re.search(r"_[A-Z]{2}\.csv$", m) and not m.endswith("_BR.csv")]
cols_d = ["ANO_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "QT_APTOS",
          "QT_COMPARECIMENTO", "QT_ABSTENCOES", "QT_VOTOS_NOMINAIS", "QT_VOTOS_BRANCOS", "QT_VOTOS_NULOS",
          "QT_VOTOS_LEGENDA", "QT_VOTOS_ANULADOS_APU_SEP", "NR_LOCAL_VOTACAO", "NM_LOCAL_VOTACAO",
          "DT_RECEBIMENTO_BU_HOR_TSE", "DT_PRIM_TOT_PARCIAL_HOR_TSE", "DS_ORIGEM_VOTO", "ST_SECAO_INSTALADA",
          "ST_SECAO_ANULADA", "CD_MODELO_URNA", "DS_MODELO_URNA", "DS_ORIGEM_VOTO"]
parts = []
for m in alvo:
    for ch in stream(ds_zip, m, set(cols_d)):
        ch = ch[ch["CD_CARGO"].isin(CARGOS)]
        if ch.empty:
            continue
        parts.append(ch)
d = pd.concat(parts, ignore_index=True)
ren = {"NR_TURNO": "turno", "SG_UF": "uf", "CD_MUNICIPIO": "mun", "NR_ZONA": "zona", "NR_SECAO": "secao", "CD_CARGO": "cargo",
       "QT_APTOS": "aptos", "QT_COMPARECIMENTO": "comp", "QT_ABSTENCOES": "abst", "QT_VOTOS_NOMINAIS": "nom",
       "QT_VOTOS_BRANCOS": "bran", "QT_VOTOS_NULOS": "nul", "QT_VOTOS_LEGENDA": "leg", "QT_VOTOS_ANULADOS_APU_SEP": "anul",
       "NR_LOCAL_VOTACAO": "local", "NM_LOCAL_VOTACAO": "nm_local", "DT_RECEBIMENTO_BU_HOR_TSE": "dt_bu",
       "DT_PRIM_TOT_PARCIAL_HOR_TSE": "dt_parcial", "DS_ORIGEM_VOTO": "origem", "ST_SECAO_INSTALADA": "instalada",
       "ST_SECAO_ANULADA": "anulada", "CD_MODELO_URNA": "modelo", "DS_MODELO_URNA": "ds_modelo"}
d = d.drop(columns=["ANO_ELEICAO"], errors="ignore").rename(columns=ren)
for c in ["turno", "mun", "zona", "secao", "cargo", "aptos", "comp", "abst", "nom", "bran", "nul", "leg", "anul", "local"]:
    d[c] = num(d[c])
n0 = len(d)
d = d.drop_duplicates(["turno", "uf", "mun", "zona", "secao", "cargo"])
print(ANO, "detalhe duplicadas removidas", n0 - len(d), flush=True)
d["uf"] = d["uf"].astype("category")
d.to_pickle(os.path.join(WORK, f"det_{ANO}.pkl"))
print(ANO, "detalhe", len(d), list(d.columns), flush=True)
