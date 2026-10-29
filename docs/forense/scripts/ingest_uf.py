"""Votos por votavel de Governador (3) e Senador (5): arquivos por UF. uso: ingest_uf.py <ano>"""
import subprocess, sys, os, zipfile
import pandas as pd
ANO = int(sys.argv[1])
BASE = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
D = os.path.join(BASE, "raw", f"vu{ANO}")
os.makedirs(D, exist_ok=True)
UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split()
B = "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao"
cols = ["NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "NR_VOTAVEL", "NM_VOTAVEL", "QT_VOTOS", "NR_LOCAL_VOTACAO"]
parts, nomes = [], {}
for uf in UFS:
    zp = os.path.join(D, f"{uf}.zip")
    if not os.path.exists(zp):
        subprocess.run(["curl", "-s", "-A", "Mozilla/5.0", "--retry", "3", "-o", zp, f"{B}/votacao_secao_{ANO}_{uf}.zip"], check=True)
    mem = [i.filename for i in zipfile.ZipFile(zp).infolist() if i.filename.endswith(".csv")]
    mem = [m for m in mem if f"_{uf}." in m] or mem
    for m in mem:
        p = subprocess.Popen(["unzip", "-p", zp, m], stdout=subprocess.PIPE)
        for ch in pd.read_csv(p.stdout, sep=";", encoding="latin1", dtype=str, chunksize=1_500_000, usecols=lambda c: c in cols):
            ch = ch[ch.CD_CARGO.isin(["3", "5"])]
            if ch.empty:
                continue
            for r in ch[["CD_CARGO", "NR_VOTAVEL", "NM_VOTAVEL"]].drop_duplicates().itertuples(index=False):
                nomes[(uf, int(r[0]), int(r[1]))] = r[2]
            ch = ch.drop(columns="NM_VOTAVEL")
            for c in ["NR_TURNO", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "NR_VOTAVEL", "QT_VOTOS", "NR_LOCAL_VOTACAO"]:
                ch[c] = pd.to_numeric(ch[c], errors="coerce")
            ch.columns = ["turno", "uf", "mun", "zona", "secao", "cargo", "votavel", "votos", "local"]
            parts.append(ch)
        p.stdout.close(); p.wait()
    os.remove(zp)
    print(ANO, uf, sum(len(x) for x in parts), flush=True)
v = pd.concat(parts, ignore_index=True)
v = v.drop_duplicates(["turno", "uf", "mun", "zona", "secao", "cargo", "votavel"])
v["uf"] = v["uf"].astype("category")
v.to_pickle(os.path.join(BASE, "work", f"votuf_{ANO}.pkl"))
pd.to_pickle(nomes, os.path.join(BASE, "work", f"nomesuf_{ANO}.pkl"))
print("ok", ANO, len(v))
