import os
"""Governador (cargo 3): metricas centrais por (ano, turno, UF)."""
import sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forense import *

NM = pd.read_pickle(os.path.join(WORK, "munnames.pkl"))
NM_MAP = {(r.uf, int(r.mun)): r.nome for r in NM.itertuples()}


def gov_table(ano, turno):
    v = pd.read_pickle(os.path.join(WORK, f"votuf_{ano}.pkl"))
    v = v[(v.turno == turno) & (v.cargo == 3)]
    d = det(ano)
    d = d[(d.turno == turno) & (d.cargo == 3)].copy()
    d["uf"] = d["uf"].astype(str)
    v = v.copy()
    v["uf"] = v["uf"].astype(str)
    w = v.pivot_table(index=KEY, columns="votavel", values="votos", aggfunc="sum", fill_value=0)
    w.columns = [f"c{int(c)}" if c < 95 else f"x{int(c)}" for c in w.columns]
    w = w.reset_index()
    m = d.merge(w, on=KEY, how="inner")
    return m


def one(m, nomes_uf, uf, ano, turno):
    cc = [c for c in m.columns if c.startswith("c") and c[1:].isdigit()]
    for c in cc + ["aptos", "comp", "bran", "nul", "nom"]:
        m[c] = m[c].fillna(0)
    tot = m[cc].sum().sort_values(ascending=False)
    if len(tot) < 2 or tot.iloc[1] <= 0:
        return None
    A, B = tot.index[0], tot.index[1]
    m["valid"] = m[cc].sum(axis=1)
    m = m[m.valid > 0].copy()
    m["lid"] = m.groupby(["mun", "zona", "local"], sort=False).ngroup()
    m["mid"] = m.groupby(["mun"], sort=False).ngroup()
    m = m.reset_index(drop=True)
    r = {"ano": ano, "turno": turno, "uf": uf, "secoes": int(len(m)), "valid": int(m.valid.sum()),
         "A": {"nr": int(A[1:]), "nome": nomes_uf.get((uf, 3, int(A[1:])), A), "votos": int(tot[A])},
         "B": {"nr": int(B[1:]), "nome": nomes_uf.get((uf, 3, int(B[1:])), B), "votos": int(tot[B])}}
    r["margem"] = int(tot[A] - tot[B])
    r["margem_pct"] = round(float((tot[A] - tot[B]) / m.valid.sum() * 100), 2)
    r["share_A"] = round(float(tot[A] / m.valid.sum() * 100), 2)
    # aritmetica
    r["comp_gt_aptos"] = int((m.comp > m.aptos).sum())
    r["nao_fecha"] = int((m.comp != (m.nom + m.bran + m.nul + m.leg.fillna(0) + m.anul.fillna(0))).sum())
    r["votos_vs_nom"] = int((m[cc].sum(axis=1) != m.nom).sum())
    # fingerprint
    s = m[(m.aptos >= 100) & (m.valid >= 50)]
    if len(s) >= 200:
        t = (s.comp / s.aptos).values
        a = (s[A] / s.valid).values
        mu_, sd_ = float(t.mean()), float(t.std())
        r["fp"] = {"n": int(len(s)), "turn": round(float(np.average(t, weights=s.aptos)), 4), "t95": int((t >= 0.95).sum()), "t90": int((t >= 0.90).sum()),
                   "t95_exp": round(float(len(t) * stats.norm.sf((0.95 - mu_) / max(sd_, 1e-6))), 2), "t_mu": round(mu_, 4), "t_sd": round(sd_, 4),
                   "corr": round(float(np.corrcoef(t, a)[0, 1]), 3), "corner": int(((a >= .9) & (t >= .9)).sum()),
                   "A90": int((a >= .9).sum())}
        if r["fp"]["corner"] >= 10:
            sel = s[(t >= .9) & (a >= .9)]
            top = sel.groupby("mun").size().sort_values(ascending=False).head(3)
            r["fp"]["corner_top"] = [{"mun": NM_MAP.get((uf, int(k)), str(k)), "n": int(v)} for k, v in top.items()]
            if "nm_local" in sel.columns:
                nl = sel["nm_local"].fillna("").str.lower()
                r["fp"]["corner_indig"] = int(nl.str.contains("indigen|ind[ií]gena|aldeia|tikuna|yanomami|funai").sum())
                r["fp"]["corner_nl"] = int((nl != "").sum())
    # dispersao
    for lab, col in (("A", A), ("B", B)):
        ag = dispersion(m, col)
        if len(ag) >= 30:
            lowc = int((ag.p_low < 0.001).sum())
            exp = len(ag) * 0.001
            pbin = float(stats.binom.sf(lowc - 1, len(ag), 0.001)) if lowc else 1.0
            lowc01 = int((ag.p_low < 0.01).sum())
            r[f"disp_{lab}"] = {"locais": int(len(ag)), "ratio": round(float(ag.ratio.median()), 3), "low001": lowc, "p_excesso": pbin,
                                "low01": lowc01, "exp01": round(len(ag) * 0.01, 1), "ratio_p05": round(float(ag.ratio.quantile(0.05)), 3)}
            if lab == "A":
                phi = float(ag.ratio.median())
    # digitos
    if "phi" in dir():
        pass
    dd = digit_tests(m[A].values)
    if dd["n"] >= 1500:
        gl = m.groupby("lid")
        p_loc = (gl[A].transform("sum") / gl.valid.transform("sum").clip(lower=1)).clip(0.001, 0.999).values
        vs = []
        for _ in range(3):
            sx = simulate_counts(m.valid.values, p_loc, 0.001)
            vs.append(digit_tests(sx)["last_cramerV"])
        r["dig_A"] = {"n": dd["n"], "p": dd["last_p"], "V": round(dd["last_cramerV"], 4), "V_sim": round(float(np.mean(vs)), 4)}
    # zeros
    z = zero_blank_null2(m)
    if z["n"] >= 200:
        mu = z["esperado_zero"]
        r["zero_inv"] = {"obs": z["obs_zero"], "esp": mu, "p": float(stats.poisson.sf(z["obs_zero"] - 1, max(mu, 1e-9))) if z["obs_zero"] else 1.0}
    # outliers
    if "disp_A" in r:
        o, zz = outliers(m, A, B, max(phi, 1.0), simulate=False)
        fi, fz = o.pop("_flag_idx"), o.pop("_flag_z")
        r["out"] = {k: v for k, v in o.items()}
        r["out_top"] = [{"mun": NM_MAP.get((uf, int(m.loc[i, "mun"])), ""), "zona": int(m.loc[i, "zona"]), "secao": int(m.loc[i, "secao"]), "z": z_, "shareA": round(float(m.loc[i, A] / m.loc[i, "valid"]), 3), "valid": int(m.loc[i, "valid"])} for i, z_ in zip(fi[:5], fz[:5])]
    return r


def run(ano):
    out = []
    nm = pd.read_pickle(os.path.join(WORK, f"nomesuf_{ano}.pkl"))
    for turno in (1, 2):
        try:
            T = gov_table(ano, turno)
        except Exception as e:
            print("sem", ano, turno, e); continue
        for uf, g in T.groupby("uf"):
            g = g.copy()
            r = one(g, nm, uf, ano, turno)
            if r:
                out.append(r)
        print(ano, turno, len(out), flush=True)
    json.dump(out, open(os.path.join(OUT, f"gov_{ano}.json"), "w"))


if __name__ == "__main__":
    for a in sys.argv[1:]:
        run(int(a))
