"""Perfil do eleitorado por secao -> features (idade, escolaridade, genero). uso: perfil.py <ano>"""
import subprocess, sys, os, zipfile
import numpy as np, pandas as pd
ANO = int(sys.argv[1])
BASE = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
D = os.path.join(BASE, "raw", f"pf{ANO}")
os.makedirs(D, exist_ok=True)
UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO ZZ".split()
B = "https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitor_secao"
parts = []
for uf in UFS:
    zp = os.path.join(D, f"{uf}.zip")
    if not os.path.exists(zp):
        subprocess.run(["curl", "-s", "-A", "Mozilla/5.0", "--retry", "3", "-o", zp, f"{B}/perfil_eleitor_secao_{ANO}_{uf}.zip"], check=True)
    mem = [i.filename for i in zipfile.ZipFile(zp).infolist() if i.filename.endswith(".csv")][0]
    p = subprocess.Popen(["unzip", "-p", zp, mem], stdout=subprocess.PIPE)
    acc = None
    for ch in pd.read_csv(p.stdout, sep=";", encoding="latin1", dtype=str, chunksize=1_000_000,
                          usecols=["SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "DS_GENERO", "CD_FAIXA_ETARIA", "CD_GRAU_ESCOLARIDADE", "QT_ELEITORES_PERFIL", "QT_ELEITORES_BIOMETRIA"]):
        ch["n"] = pd.to_numeric(ch.QT_ELEITORES_PERFIL, errors="coerce").fillna(0)
        ch["bio"] = pd.to_numeric(ch.QT_ELEITORES_BIOMETRIA, errors="coerce").fillna(0)
        age = pd.to_numeric(ch.CD_FAIXA_ETARIA, errors="coerce") // 100
        ch["a"] = np.select([age < 18, age < 25, age < 35, age < 45, age < 60, age >= 60], ["16-17", "18-24", "25-34", "35-44", "45-59", "60+"], "?")
        edu = pd.to_numeric(ch.CD_GRAU_ESCOLARIDADE, errors="coerce")
        ch["e"] = np.select([edu <= 3, edu <= 6, edu <= 8], ["edu_baixa", "edu_media", "edu_alta"], "edu_nd")
        ch["g"] = np.where(ch.DS_GENERO.str.upper().str.startswith("FEM"), "fem", "oth")
        key = ["SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO"]
        tot = ch.groupby(key).agg(tot=("n", "sum"), bio=("bio", "sum"))
        a = ch.pivot_table(index=key, columns="a", values="n", aggfunc="sum", fill_value=0)
        e = ch.pivot_table(index=key, columns="e", values="n", aggfunc="sum", fill_value=0)
        g = ch[ch.g == "fem"].groupby(key).n.sum().rename("fem")
        cur = tot.join(a).join(e).join(g).fillna(0)
        acc = cur if acc is None else acc.add(cur, fill_value=0)
    p.stdout.close(); p.wait()
    acc = acc.reset_index()
    parts.append(acc)
    print(ANO, uf, len(acc), flush=True)
    os.remove(zp)
f = pd.concat(parts, ignore_index=True)
f.columns = [c if c not in ("SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO") else {"SG_UF": "uf", "CD_MUNICIPIO": "mun", "NR_ZONA": "zona", "NR_SECAO": "secao"}[c] for c in f.columns]
for c in ("mun", "zona", "secao"):
    f[c] = pd.to_numeric(f[c]).astype("int64")
f.to_pickle(os.path.join(BASE, "work", f"perfil_{ANO}.pkl"))
print("ok", ANO, len(f), list(f.columns))
