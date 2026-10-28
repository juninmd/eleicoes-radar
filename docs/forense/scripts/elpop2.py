import os
import sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forense import *
e10 = pd.read_pickle(os.path.join(WORK, "elpop_2010.pkl")); e22 = pd.read_pickle(os.path.join(WORK, "elpop_2022.pkl"))
j = e10[["uf", "mun", "ratio", "pop16"]].merge(e22[["uf", "mun", "ratio", "pop16", "nome"]], on=["uf", "mun"], suffixes=("10", "22")).dropna()
j = j[j.uf != "ZZ"]
out = {"n_comum": int(len(j)), "corr_log": round(float(np.corrcoef(np.log(j.ratio10), np.log(j.ratio22))[0, 1]), 3),
       "gt1_ambos": int(((j.ratio10 > 1) & (j.ratio22 > 1)).sum()), "gt1_2010": int((j.ratio10 > 1).sum()), "gt1_2022": int((j.ratio22 > 1).sum()),
       "gt13_ambos": int(((j.ratio10 > 1.3) & (j.ratio22 > 1.3)).sum()), "gt13_2022": int((j.ratio22 > 1.3).sum())}
bins = [0, 5000, 10000, 20000, 50000, 100000, 1e9]
lab = ["<5 mil", "5-10 mil", "10-20 mil", "20-50 mil", "50-100 mil", ">100 mil"]
j["porte"] = pd.cut(j["pop1622"], bins=bins, labels=lab)
g = j.groupby("porte", observed=True).agg(n=("ratio22", "size"), mediana=("ratio22", "median"), p_gt1=("ratio22", lambda v: float((v > 1).mean())))
out["por_porte"] = {k: {"n": int(r.n), "mediana": round(float(r.mediana), 3), "p_gt1": round(float(r.p_gt1), 3)} for k, r in g.iterrows()}
res = []
for ano, tt, e in ((2022, 1, e22), (2022, 2, e22), (2010, 2, e10)):
    v = vot(ano)
    v = v[(v.turno == tt) & (v.cargo == 1) & (v.votavel < 90)]
    tot = v.groupby("votavel").votos.sum().sort_values(ascending=False)
    A = tot.index[0]
    mv = v.assign(isA=np.where(v.votavel == A, v.votos, 0)).groupby(["uf", "mun"], observed=True).agg(A=("isA", "sum"), V=("votos", "sum")).reset_index()
    mv["uf"] = mv.uf.astype(str)
    x = e.merge(mv, on=["uf", "mun"]).dropna()
    x = x[(x.V > 0) & (x.uf != "ZZ")]
    x["sh"] = x.A / x.V
    q = pd.qcut(x.ratio, 5, labels=False)
    quint = [{"q": int(i) + 1, "ratio_med": round(float(x.ratio[q == i].median()), 3), "shareA": round(float(x.A[q == i].sum() / x.V[q == i].sum()), 4), "n": int((q == i).sum())} for i in range(5)]
    xr = x.ratio - x.groupby("uf").ratio.transform("mean"); xs = x.sh - x.groupby("uf").sh.transform("mean")
    res.append({"ano": ano, "turno": tt, "A": int(A), "corr_municipios": round(float(np.corrcoef(x.ratio, x.sh)[0, 1]), 3),
                "corr_dentro_uf": round(float(np.corrcoef(xr, xs)[0, 1]), 3), "quintis": quint})
out["razao_x_voto"] = res
json.dump(out, open(os.path.join(OUT, "elpop2.json"), "w"))
print(json.dumps({k: v for k, v in out.items() if k != "razao_x_voto"}))
for r in res: print(r["ano"], r["turno"], r["A"], r["corr_municipios"], r["corr_dentro_uf"], [(q["ratio_med"], q["shareA"]) for q in r["quintis"]])
