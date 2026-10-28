import subprocess, os, pandas as pd
B = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
zp = os.path.join(B, "raw", "rr22", "rr.zip")
cols = ["CD_ELEICAO", "DS_ELEICAO", "NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "NR_VOTAVEL", "NM_VOTAVEL", "QT_VOTOS", "NR_LOCAL_VOTACAO"]
p = subprocess.Popen(["unzip", "-p", zp, "votacao_secao_2022_RR.csv"], stdout=subprocess.PIPE)
parts, nomes = [], {}
for ch in pd.read_csv(p.stdout, sep=";", encoding="latin1", dtype=str, chunksize=1_500_000, usecols=cols):
    ch = ch[ch.CD_CARGO.isin(["3", "5"])]
    if ch.empty: continue
    print(ch.groupby(["CD_ELEICAO", "DS_ELEICAO", "NR_TURNO"]).size().to_dict())
    ch = ch[ch.CD_ELEICAO == "546"]
    for r in ch[["CD_CARGO", "NR_VOTAVEL", "NM_VOTAVEL"]].drop_duplicates().itertuples(index=False):
        nomes[("RR", int(r[0]), int(r[1]))] = r[2]
    ch = ch.drop(columns=["CD_ELEICAO", "DS_ELEICAO", "NM_VOTAVEL"])
    for c in ["NR_TURNO", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "NR_VOTAVEL", "QT_VOTOS", "NR_LOCAL_VOTACAO"]:
        ch[c] = pd.to_numeric(ch[c], errors="coerce")
    ch.columns = ["turno", "uf", "mun", "zona", "secao", "cargo", "votavel", "votos", "local"]
    parts.append(ch)
rr = pd.concat(parts, ignore_index=True)
rr = rr.drop_duplicates(["turno", "uf", "mun", "zona", "secao", "cargo", "votavel"])
v = pd.read_pickle(os.path.join(B, "work", "votuf_2022.pkl"))
v["uf"] = v["uf"].astype(str)
v = v[v.uf != "RR"]
v = pd.concat([v, rr], ignore_index=True)
v["uf"] = v["uf"].astype("category")
v.to_pickle(os.path.join(B, "work", "votuf_2022.pkl"))
n = pd.read_pickle(os.path.join(B, "work", "nomesuf_2022.pkl"))
n = {k: x for k, x in n.items() if k[0] != "RR"}
n.update(nomes)
pd.to_pickle(n, os.path.join(B, "work", "nomesuf_2022.pkl"))
print("ok", len(rr))
