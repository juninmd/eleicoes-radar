import os
import sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forense import *
res = {}
for ano in ANOS:
    for t in (1, 2):
        m, A, B, cc, tot = prep(ano, t)
        phi = median_ratio(m, A)
        o, z = outliers(m, A, B, phi, simulate=False)
        o.pop("_flag_idx"); o.pop("_flag_z")
        m["k"] = m.groupby("lid").secao.transform("size")
        m["rank"] = m.groupby("lid").secao.rank(method="first")
        fl = z[z.abs() > 5].index
        f = m.loc[fl]
        last = (f["rank"] == f.k)
        res[f"{ano}-{t}"] = {"n": int(len(f)), "ultima": int(last.sum()), "esperado": round(float((1 / f.k).sum()), 1),
                             "primeira": int((f["rank"] == 1).sum()), "alto_ultima": int(((z[fl] > 0) & last).sum()),
                             "top": [{"uf": m.loc[i, "uf"], "zona": int(m.loc[i, "zona"]), "secao": int(m.loc[i, "secao"]), "k": int(m.loc[i, "k"]), "rank": int(m.loc[i, "rank"])} for i in z[fl].abs().sort_values(ascending=False).index[:12]]}
        print(ano, t, res[f"{ano}-{t}"]["n"], res[f"{ano}-{t}"]["ultima"], res[f"{ano}-{t}"]["esperado"], flush=True)
json.dump(res, open(os.path.join(OUT, "ultima.json"), "w"))
