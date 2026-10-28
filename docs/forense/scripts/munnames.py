import subprocess, zipfile, re, os, sys
import pandas as pd
BASE = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
z = os.path.join(BASE, "raw", "ds2022", "ds.zip")
mem = [i.filename for i in zipfile.ZipFile(z).infolist() if re.search(r"_[A-Z]{2}\.csv$", i.filename) and not i.filename.endswith("_BR.csv")]
rows = []
for m in mem:
    p = subprocess.Popen(["unzip", "-p", z, m], stdout=subprocess.PIPE)
    df = pd.read_csv(p.stdout, sep=";", encoding="latin1", dtype=str, usecols=["SG_UF", "CD_MUNICIPIO", "NM_MUNICIPIO"])
    rows.append(df.drop_duplicates())
d = pd.concat(rows).drop_duplicates()
d.columns = ["uf", "mun", "nome"]
d["mun"] = d["mun"].astype(int)
d.to_pickle(os.path.join(BASE, "work", "munnames.pkl"))
print(len(d), d.head())
