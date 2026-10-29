import os
"""Poder de deteccao: injeta manipulacoes sinteticas em dados reais (2022, 1o turno) e mede quais testes acendem."""
import sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forense import *

rng = np.random.default_rng(7)


def metrics(m, A, B, cc, phi):
    s = m[(m.aptos >= 100) & (m.valid >= 50)]
    t = (s.comp / s.aptos).values
    a = (s[A] / s.valid).values
    out = {"corner": float(((a >= .9) & (t >= .9)).mean()), "t95": float((t >= .95).mean()), "corr": float(np.corrcoef(t, a)[0, 1])}
    ag = dispersion(m, A)
    out["low_rate"] = float((ag.p_low < 0.001).mean())
    out["ratio_med"] = float(ag.ratio.median())
    o, z = outliers(m, A, B, phi, simulate=False)
    o.pop("_flag_idx"); o.pop("_flag_z")
    out["out_rate"] = float((o["z_gt"] + o["z_lt"]) / max(o["testadas"], 1))
    out["out_pos"] = o["z_gt"]
    out["V_last"] = float(digit_tests(m[A].values)["last_cramerV"])
    s2 = m[m.comp >= 50]
    cols = cc + ["bran", "nul"]
    key = pd.Series([hash(r.tobytes()) for r in s2[cols].values.astype(np.int64)], index=s2.index)
    out["dup"] = int((key.map(key.value_counts()) > 1).sum())
    out["margin"] = int(m[A].sum() - m[B].sum())
    return out


def refresh(m, cc):
    m["valid"] = m[cc].sum(axis=1)
    m["nom"] = m["valid"]
    return m


def scen_stuff(m, A, B, cc, f):
    m = m.copy()
    ok = m.index[(m.aptos >= 50) & (m.comp < 0.9 * m.aptos)]
    sel = rng.choice(ok, size=int(f * len(m)), replace=False)
    tgt = np.ceil(rng.uniform(0.95, 1.0, len(sel)) * m.loc[sel, "aptos"]).astype(int)
    add = (tgt - m.loc[sel, "comp"]).clip(lower=0)
    m.loc[sel, A] = m.loc[sel, A] + add
    m.loc[sel, "comp"] = m.loc[sel, "comp"] + add
    return refresh(m, cc), int(add.sum())


def scen_switch(m, A, B, cc, f, s=0.15):
    m = m.copy()
    ok = m.index[m[B] >= 20]
    sel = rng.choice(ok, size=int(f * len(m)), replace=False)
    mv = np.round(s * m.loc[sel, B]).astype(int)
    m.loc[sel, B] = m.loc[sel, B] - mv
    m.loc[sel, A] = m.loc[sel, A] + mv
    return refresh(m, cc), int(mv.sum())


def scen_fabricate(m, A, B, cc, f):
    """boletins fabricados com proporcao constante (municipal): locais inteiros."""
    m = m.copy()
    cols = cc + ["bran", "nul"]
    loc_ok = m.groupby("lid").size()
    loc_ok = loc_ok[loc_ok >= 3].index.values
    sel_l = rng.choice(loc_ok, size=int(f * len(loc_ok)), replace=False)
    sel = m.index[m.lid.isin(sel_l)]
    mun = m.groupby("mid")[cols].transform("sum")
    P = mun.loc[sel].values / mun.loc[sel].values.sum(axis=1, keepdims=True)
    comp = m.loc[sel, "comp"].values
    new = np.round(P * comp[:, None]).astype(np.int64)
    new[:, 0] += comp - new.sum(axis=1)
    old_margin = (m.loc[sel, A] - m.loc[sel, B]).sum()
    m.loc[sel, cols] = new
    m.loc[sel, "comp"] = new.sum(axis=1)
    return refresh(m, cc), int(len(sel))


def scen_round(m, A, B, cc, f):
    m = m.copy()
    sel = rng.choice(m.index, size=int(f * len(m)), replace=False)
    m.loc[sel, A] = (np.round(m.loc[sel, A] / 5) * 5).astype(int)
    m.loc[sel, B] = (np.round(m.loc[sel, B] / 5) * 5).astype(int)
    return refresh(m, cc), int(len(sel))


def scen_copy(m, A, B, cc, f):
    m = m.copy()
    cols = cc + ["bran", "nul"]
    sel = rng.choice(m.index[m.comp >= 100], size=int(f * len(m)), replace=False)
    donors = []
    byM = m.groupby("mid").indices
    mids = m.loc[sel, "mid"].values
    for i, mm in zip(sel, mids):
        pool = byM[mm]
        d = pool[rng.integers(len(pool))]
        donors.append(m.index[d])
    donors = np.array(donors)
    m.loc[sel, cols] = m.loc[donors, cols].values
    m.loc[sel, "comp"] = m.loc[donors, "comp"].values
    return refresh(m, cc), int(len(sel))


if __name__ == "__main__":
    t0 = time.time()
    m, A, B, cc, tot = prep(2022, 1)
    phi = median_ratio(m, A)
    base = metrics(m, A, B, cc, phi)
    print("base", base, time.time() - t0, flush=True)
    # limites historicos dos 14 turnos reais (mesmas metricas) para a regra de deteccao
    hist = {"corner": [], "t95": [], "low_rate": [], "out_rate": [], "V_last": [], "dup_t1": []}
    for ano in ANOS:
        for t in (1, 2):
            r = json.load(open(os.path.join(OUT, f"c_{ano}_{t}.json")))
            fp = r["fingerprint"]
            hist["corner"].append(fp["A_ge_90_t_ge_90"]); hist["t95"].append(fp["t_ge_95"])
            hist["low_rate"].append(r["disp_A"]["low_0.001"] / r["disp_A"]["locais"])
            oa = r["outliers_A"]
            hist["out_rate"].append((oa["z_gt"] + oa["z_lt"]) / oa["testadas"])
            hist["V_last"].append(r["digitos"]["A"]["last_cramerV"])
            if t == 1:
                hist["dup_t1"].append(r["duplicatas"]["secoes_em_duplicata_nacional"])
    lim = {k: max(v) for k, v in hist.items()}
    print("limites", lim, flush=True)
    SC = {"enchimento": (scen_stuff, [0.001, 0.003, 0.01, 0.03]),
          "troca": (scen_switch, [0.01, 0.03, 0.10, 0.30]),
          "fabricado": (scen_fabricate, [0.005, 0.02, 0.10, 0.30]),
          "arredondado": (scen_round, [0.02, 0.10, 0.30]),
          "copia": (scen_copy, [0.001, 0.003, 0.01])}
    rows = []
    for name, (fn, levels) in SC.items():
        for f in levels:
            mm, qtd = fn(m, A, B, cc, f)
            mt = metrics(mm, A, B, cc, phi)
            thr = {"corner": max(lim["corner"], 1.5 * base["corner"]), "t95": max(lim["t95"], 1.5 * base["t95"]),
                   "low_rate": max(lim["low_rate"], 1.5 * base["low_rate"]), "out_rate": max(lim["out_rate"], 1.5 * base["out_rate"]),
                   "V_last": max(lim["V_last"], 1.5 * base["V_last"]), "dup": 2 * max(lim["dup_t1"], 1)}
            det_ = {k: mt[k] > thr[k] for k in thr}
            shift = (mt["margin"] - base["margin"])
            rows.append({"cenario": name, "f": f, "unidades": qtd, "metricas": {k: round(v, 6) if isinstance(v, float) else v for k, v in mt.items()},
                         "detecta": {k: bool(v) for k, v in det_.items()}, "alguma": bool(any(det_.values())), "deslocamento_margem": int(shift)})
            print(name, f, qtd, {k: v for k, v in det_.items() if v}, "margem +%d" % shift, round(time.time() - t0), "s", flush=True)
    json.dump({"base": base, "limites": lim, "limiares": {k: float(v) for k, v in thr.items()}, "ref": "2022-1", "margem_real": base["margin"], "linhas": rows}, open(os.path.join(OUT, "power.json"), "w"))
