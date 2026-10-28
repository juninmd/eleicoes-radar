import os
"""Outliers ajustados pelo perfil do eleitorado da secao (idade, escolaridade, genero), dentro do local de votacao."""
import sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forense import *

COV = ["a1617", "a1824", "a2534", "a3544", "a4559", "e_baixa", "e_alta", "fem"]


def load_perfil(ano):
    f = pd.read_pickle(os.path.join(WORK, f"perfil_{ano}.pkl"))
    f = f.rename(columns={"16-17": "n1617", "18-24": "n1824", "25-34": "n2534", "35-44": "n3544", "45-59": "n4559", "60+": "n60"})
    tot = f.tot.clip(lower=1)
    out = f[["uf", "mun", "zona", "secao"]].copy()
    out["a1617"] = f.get("n1617", 0) / tot
    out["a1824"] = f.get("n1824", 0) / tot
    out["a2534"] = f.get("n2534", 0) / tot
    out["a3544"] = f.get("n3544", 0) / tot
    out["a4559"] = f.get("n4559", 0) / tot
    out["e_baixa"] = f.get("edu_baixa", 0) / tot
    out["e_alta"] = f.get("edu_alta", 0) / tot
    out["fem"] = f.get("fem", 0) / tot
    out["uf"] = out.uf.astype(str)
    return out


def run(ano, turno):
    m, A, B, cc, tot = prep(ano, turno)
    pf = load_perfil(ano)
    m = m.merge(pf, on=KEY, how="left")
    have = m[COV].notna().all(axis=1)
    cover = float(have.mean())
    m = m[have].copy().reset_index(drop=True)
    m["lid"] = m.groupby(["uf", "mun", "zona", "local"], sort=False).ngroup()
    s = m[m.valid >= 30].copy()
    g = s.groupby("lid")
    X, N, K = g[A].transform("sum"), g.valid.transform("sum"), g[A].transform("size")
    sibN = N - s.valid
    ok = (K >= 4) & (sibN >= 150)
    p_loo = ((X - s[A]) / sibN.clip(lower=1)).clip(0.01, 0.99)
    sh = s[A] / s.valid
    # medias das covariaveis das irmas (ponderadas por eleitores aptos)
    w = s.aptos.clip(lower=1).astype(float)
    cm = {}
    for c in COV:
        num = (s[c] * w).groupby(s.lid).transform("sum")
        den = w.groupby(s.lid).transform("sum")
        cm[c] = (num - s[c] * w) / (den - w).clip(lower=1)
    dX = pd.DataFrame({c: s[c] - cm[c] for c in COV})
    dy = sh - p_loo
    wt = s.valid.astype(float).where(ok, 0)
    Xm = dX.values
    beta = np.linalg.solve((Xm * wt.values[:, None]).T @ Xm, (Xm * wt.values[:, None]).T @ dy.values)
    adj = p_loo + dX.values @ beta
    adj = pd.Series(adj, index=s.index).clip(0.01, 0.99)
    out = {"ano": ano, "turno": turno, "A": A, "cobertura_perfil": round(cover, 4), "testadas": int(ok.sum()),
           "beta": {c: round(float(b), 3) for c, b in zip(COV, beta)}}
    # variancia explicada dentro do local
    r0 = (dy[ok]) ; r1 = (sh - adj)[ok]
    wv = s.valid[ok]
    out["r2_dentro_local"] = round(float(1 - (wv * r1 ** 2).sum() / (wv * r0 ** 2).sum()), 4)
    phi0 = None
    for lab, p in (("bruto", p_loo), ("ajustado", adj)):
        z = (s[A] - s.valid * p) / np.sqrt(s.valid * p * (1 - p))
        z = z.where(ok)
        phi = float(np.nanmedian(z ** 2) / 0.4549)
        if lab == "bruto":
            phi0 = phi
        zz = z / np.sqrt(phi)
        out[lab] = {"phi": round(phi, 3), "z5": int((zz.abs() > 5).sum()), "z5_pos": int((zz > 5).sum()), "z5_neg": int((zz < -5).sum()),
                    "z8": int((zz.abs() > 8).sum()), "z4": int((zz.abs() > 4).sum())}
    # mesma escala phi do bruto para comparar contagens
    z = ((s[A] - s.valid * adj) / np.sqrt(s.valid * adj * (1 - adj))).where(ok) / np.sqrt(phi0)
    out["ajustado_phi_bruto"] = {"z5": int((z.abs() > 5).sum()), "z5_pos": int((z > 5).sum()), "z5_neg": int((z < -5).sum())}
    # "ultima secao do local" e diferenca de idade
    m["rank_in_local"] = m.groupby("lid").secao.rank(method="first")
    m["k"] = m.groupby("lid").secao.transform("size")
    last = (m.rank_in_local == m.k) & (m.k >= 4)
    first = (m.rank_in_local == 1) & (m.k >= 4)
    wv_ = m.valid
    out["ultima_vs_primeira"] = {
        "shareA_ultima": round(float((m[A][last]).sum() / wv_[last].sum()), 4),
        "shareA_primeira": round(float((m[A][first]).sum() / wv_[first].sum()), 4),
        "idade_1824_ultima": round(float(m.a1824[last].mean()), 4), "idade_1824_primeira": round(float(m.a1824[first].mean()), 4),
        "edu_baixa_ultima": round(float(m.e_baixa[last].mean()), 4), "edu_baixa_primeira": round(float(m.e_baixa[first].mean()), 4)}
    return out


if __name__ == "__main__":
    res = []
    for ano in map(int, sys.argv[1:]):
        for t in (1, 2):
            r = run(ano, t)
            res.append(r)
            print(ano, t, r["bruto"], r["ajustado"], r["ajustado_phi_bruto"], "R2", r["r2_dentro_local"], r["ultima_vs_primeira"], flush=True)
    json.dump(res, open(os.path.join(OUT, "ajuste_" + "_".join(sys.argv[1:]) + ".json"), "w"))
