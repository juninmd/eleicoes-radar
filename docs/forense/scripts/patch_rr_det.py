import subprocess, os, zipfile, pandas as pd, numpy as np
B = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
zp = os.path.join(B, "raw", "ds2022", "ds.zip")
mem = [i.filename for i in zipfile.ZipFile(zp).infolist() if i.filename.endswith("_RR.csv") and "BR" not in i.filename.replace("_RR", "")][0]
print(mem)
cols = ["CD_ELEICAO", "DS_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "QT_APTOS", "QT_COMPARECIMENTO", "QT_ABSTENCOES", "QT_VOTOS_NOMINAIS", "QT_VOTOS_BRANCOS", "QT_VOTOS_NULOS", "QT_VOTOS_LEGENDA", "QT_VOTOS_ANULADOS_APU_SEP", "NR_LOCAL_VOTACAO", "NM_LOCAL_VOTACAO", "DT_RECEBIMENTO_BU_HOR_TSE", "DT_PRIM_TOT_PARCIAL_HOR_TSE", "DS_ORIGEM_VOTO", "ST_SECAO_INSTALADA", "ST_SECAO_ANULADA", "CD_MODELO_URNA", "DS_MODELO_URNA"]
p = subprocess.Popen(["unzip", "-p", zp, mem], stdout=subprocess.PIPE)
d = pd.read_csv(p.stdout, sep=";", encoding="latin1", dtype=str, usecols=lambda c: c in cols)
print(d.groupby(["CD_ELEICAO", "DS_ELEICAO", "CD_CARGO"]).size().to_dict())
d = d[(d.CD_ELEICAO == "546") & d.CD_CARGO.isin(["3", "5"])].drop(columns=["CD_ELEICAO", "DS_ELEICAO"])
ren = {"NR_TURNO": "turno", "SG_UF": "uf", "CD_MUNICIPIO": "mun", "NR_ZONA": "zona", "NR_SECAO": "secao", "CD_CARGO": "cargo", "QT_APTOS": "aptos", "QT_COMPARECIMENTO": "comp", "QT_ABSTENCOES": "abst", "QT_VOTOS_NOMINAIS": "nom", "QT_VOTOS_BRANCOS": "bran", "QT_VOTOS_NULOS": "nul", "QT_VOTOS_LEGENDA": "leg", "QT_VOTOS_ANULADOS_APU_SEP": "anul", "NR_LOCAL_VOTACAO": "local", "NM_LOCAL_VOTACAO": "nm_local", "DT_RECEBIMENTO_BU_HOR_TSE": "dt_bu", "DT_PRIM_TOT_PARCIAL_HOR_TSE": "dt_parcial", "DS_ORIGEM_VOTO": "origem", "ST_SECAO_INSTALADA": "instalada", "ST_SECAO_ANULADA": "anulada", "CD_MODELO_URNA": "modelo", "DS_MODELO_URNA": "ds_modelo"}
d = d.rename(columns=ren)
for c in ["turno", "mun", "zona", "secao", "cargo", "aptos", "comp", "abst", "nom", "bran", "nul", "leg", "anul", "local"]:
    d[c] = pd.to_numeric(d[c], errors="coerce")
d = d.drop_duplicates(["turno", "uf", "mun", "zona", "secao", "cargo"])
det = pd.read_pickle(os.path.join(B, "work", "det_2022.pkl"))
det["uf"] = det["uf"].astype(str)
drop = (det.uf == "RR") & det.cargo.isin([3, 5])
print("remove", int(drop.sum()), "add", len(d))
det = pd.concat([det[~drop], d], ignore_index=True)
det["uf"] = det["uf"].astype("category")
det.to_pickle(os.path.join(B, "work", "det_2022.pkl"))
