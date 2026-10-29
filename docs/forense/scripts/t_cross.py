import os
"""Testes entre turnos, eleitorado x populacao, crescimento do eleitorado, modelo de urna, tempo de BU."""
import sys, json, re, unicodedata, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forense import *
from run_contest import NM_MAP, tag_of

res = {}

# ================================================================= entre turnos
def entre_turnos(ano):
    m2 = contest(ano, 2)
    m2 = m2[m2["_merge"] == "both"].copy()
    c2 = cand_cols(m2)
    for c in c2 + ["aptos", "comp"]:
        m2[c] = m2[c].fillna(0)
    tot = m2[c2].sum().sort_values(ascending=False)
    A, B = tot.index[0], tot.index[1]
    m1 = contest(ano, 1)
    m1 = m1[m1["_merge"] == "both"].copy()
    for c in cand_cols(m1) + ["aptos", "comp"]:
        m1[c] = m1[c].fillna(0)
    s = m1[KEY + ["local", "aptos", "comp", A, B]].merge(
        m2[KEY + ["aptos", "comp", A, B]], on=KEY, suffixes=("1", "2"))
    s = s[(s[A + "1"] + s[B + "1"] >= 30) & (s[A + "2"] + s[B + "2"] >= 30) & (s.aptos1 >= 50)].copy()
    a1, b1, a2, b2 = s[A + "1"] + .5, s[B + "1"] + .5, s[A + "2"] + .5, s[B + "2"] + .5
    s["d"] = np.log(a2 / b2) - np.log(a1 / b1)
    s["se2"] = 1 / a1 + 1 / b1 + 1 / a2 + 1 / b2
    s["w"] = 1 / s.se2
    s["lid"] = s.groupby(["uf", "mun", "zona", "local"], sort=False).ngroup()
    s["mid"] = s.groupby(["uf", "mun"], sort=False).ngroup()
    # media ponderada do local sem a propria secao
    s["wd"] = s.w * s.d
    g = s.groupby("lid")
    W, WD, K = g.w.transform("sum"), g.wd.transform("sum"), g.w.transform("size")
    ok = K >= 4
    dloo = (WD - s.wd) / (W - s.w)
    dev = s.d - dloo
    z0 = dev / np.sqrt(s.se2 + 1 / (W - s.w))
    z0 = z0.where(ok)
    phi = float(np.nanmedian(z0 ** 2) / 0.4549)
    z = z0 / np.sqrt(phi)
    out = {"ano": ano, "A": A, "B": B, "secoes": int(len(s)), "testadas": int(ok.sum()), "phi": round(phi, 3)}
    for thr in (4, 5, 6):
        out[f"|z|>{thr}"] = int((z.abs() > thr).sum())
        out[f"normal_{thr}"] = float(2 * stats.norm.sf(thr) * ok.sum())
    out["curtose_excesso"] = float(stats.kurtosis(z.dropna()))
    # comparecimento x deslocamento (dentro do municipio)
    s["dt"] = s.comp2 / s.aptos2.clip(lower=1) - s.comp1 / s.aptos1.clip(lower=1)
    s["dt"] = s["dt"].clip(-0.5, 0.5)
    gm = s.groupby("mid")
    dm = s.d - gm.d.transform("mean")
    tm = s.dt - gm.dt.transform("mean")
    wgt = s.w.clip(upper=s.w.quantile(0.99))
    beta = float((wgt * dm * tm).sum() / (wgt * tm * tm).sum())
    r = float(np.corrcoef(dm, tm)[0, 1])
    out["beta_dlogodds_por_10pp_comparecimento"] = round(beta * 0.10, 4)
    out["r_dentro_municipio"] = round(r, 4)
    out["dt_media"] = round(float(np.average(s.dt, weights=s.aptos1)), 4)
    # dist do deslocamento
    out["d_mediana"] = round(float(s.d.median()), 4)
    out["_top"] = []
    top = z.abs().sort_values(ascending=False).head(10).index
    for i in top:
        r_ = s.loc[i]
        out["_top"].append({"uf": r_.uf, "mun": NM_MAP.get((r_.uf, int(r_.mun)), str(int(r_.mun))), "zona": int(r_.zona), "secao": int(r_.secao),
                           "a1": int(r_[A + "1"]), "b1": int(r_[B + "1"]), "a2": int(r_[A + "2"]), "b2": int(r_[B + "2"]), "z": round(float(z[i]), 1)})
    return out


# ================================================================= eleitorado x populacao
def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def pop_table(year):
    d = json.load(open(os.path.join(WORK, "pop", f"pop{year}.json")))[1:]
    code = {"0": "tot", "100362": "tot", "93070": "g0", "93084": "g5", "93085": "g10", "6572": "a15"}
    rows = {}
    for r in d:
        c = r["D5C"] if year == 2022 else r["D6C"]
        if c not in code:
            continue
        v = r["V"]
        rows.setdefault(r["D1C"], {"nome": r["D1N"]})[code[c]] = float(v) if v not in ("-", "...", "X") else np.nan
    df = pd.DataFrame.from_dict(rows, orient="index")
    df.index.name = "ibge"
    df = df.reset_index()
    df["pop16"] = df.tot - df.g0 - df.g5 - df.g10 - df.a15
    df["uf"] = df.nome.str.extract(r"- ([A-Z]{2})$")
    df["nm"] = df.nome.str.replace(r" - [A-Z]{2}$", "", regex=True).map(norm)
    return df[["ibge", "uf", "nm", "tot", "pop16"]]


def elet_pop():
    names = pd.read_pickle(os.path.join(WORK, "munnames.pkl")).copy()
    names["nm"] = names.nome.map(norm)
    out = {}
    for ano, cens in ((2010, 2010), (2022, 2022)):
        p = pop_table(cens)
        d = det(ano)
        d = d[(d.turno == 1) & (d.cargo == 1)]
        el = d.groupby(["uf", "mun"], observed=True).agg(aptos=("aptos", "sum"), comp=("comp", "sum")).reset_index()
        el["uf"] = el.uf.astype(str)
        el = el.merge(names[["uf", "mun", "nm", "nome"]], on=["uf", "mun"], how="left")
        el = el.merge(p, on=["uf", "nm"], how="left")
        ok = el.pop16.notna() & (el.pop16 > 0)
        el["ratio"] = el.aptos / el.pop16
        e = el[ok]
        o = {"municipios": int(len(el)), "casados": int(ok.sum()), "aptos_total": int(e.aptos.sum()), "pop16_total": int(e.pop16.sum()),
             "razao_nacional": round(float(e.aptos.sum() / e.pop16.sum()), 4),
             "gt_1": int((e.ratio > 1).sum()), "gt_1.05": int((e.ratio > 1.05).sum()), "gt_1.10": int((e.ratio > 1.1).sum()),
             "q": {q: round(float(e.ratio.quantile(q)), 3) for q in (0.01, 0.05, 0.5, 0.95, 0.99)}}
        top = e.sort_values("ratio", ascending=False).head(12)
        o["top"] = [{"uf": r.uf, "mun": r.nome, "aptos": int(r.aptos), "pop16": int(r.pop16), "razao": round(float(r.ratio), 3)} for r in top.itertuples()]
        bot = e[e.aptos >= 3000].sort_values("ratio").head(5)
        o["bottom"] = [{"uf": r.uf, "mun": r.nome, "aptos": int(r.aptos), "pop16": int(r.pop16), "razao": round(float(r.ratio), 3)} for r in bot.itertuples()]
        # por UF
        byuf = e.groupby("uf").apply(lambda g: pd.Series({"razao": g.aptos.sum() / g.pop16.sum(), "gt1": int((g.ratio > 1).sum()), "n": len(g)}), include_groups=False)
        o["por_uf"] = {u: {"razao": round(float(r.razao), 3), "gt1": int(r.gt1), "n": int(r.n)} for u, r in byuf.iterrows()}
        # mapa de pontos: razao por municipio (apenas indices) para uso posterior
        el[["uf", "mun", "nome", "ibge", "aptos", "comp", "pop16", "ratio"]].to_pickle(os.path.join(WORK, f"elpop_{ano}.pkl"))
        out[str(ano)] = o
    return out


def crescimento_eleitorado():
    names = {}
    base = None
    for ano in ANOS:
        d = det(ano)
        d = d[(d.turno == 1) & (d.cargo == 1)]
        el = d.groupby(["uf", "mun"], observed=True).aptos.sum().rename(str(ano))
        base = el.to_frame() if base is None else base.join(el, how="outer")
    base = base.reset_index()
    base["uf"] = base.uf.astype(str)
    out = {}
    for a0, a1 in zip(ANOS[:-1], ANOS[1:]):
        c = base.dropna(subset=[str(a0), str(a1)])
        c = c[(c[str(a0)] >= 2000)].copy()
        c["g"] = np.log(c[str(a1)] / c[str(a0)])
        med = c.groupby("uf").g.transform("median")
        mad = (c.g - med).abs().groupby(c.uf).transform("median") * 1.4826
        c["z"] = (c.g - med) / mad.clip(lower=0.02)
        gtot = float(np.log(c[str(a1)].sum() / c[str(a0)].sum()))
        top = c.sort_values("z", ascending=False).head(8)
        lst = []
        for _, r in top.iterrows():
            lst.append({"uf": r["uf"], "mun": NM_MAP.get((r["uf"], int(r["mun"])), str(int(r["mun"]))), "de": int(r[str(a0)]), "para": int(r[str(a1)]),
                        "cresc": round(float(np.exp(r["g"]) - 1), 3), "z": round(float(r["z"]), 1)})
        out[f"{a0}-{a1}"] = {"municipios": int(len(c)), "crescimento_total": round(gtot, 4),
                             "z_gt_6": int((c.z > 6).sum()), "z_lt_m6": int((c.z < -6).sum()), "top": lst}
    return out


# ================================================================= urna
def wls_fe(m, A, ycol, group, minshare_n=30):
    s = m[(m.valid >= minshare_n) & m.ds_modelo.notna() & (m.ds_modelo != "#NULO#")].copy()
    s["y"] = s[A] / s.valid
    w = s.valid.astype(float)
    models = s.ds_modelo.value_counts()
    ref = models.index[0]
    X = pd.get_dummies(s.ds_modelo).astype(float).drop(columns=[ref])
    gk = s[group]
    gw = w.groupby(gk).transform("sum")
    def dm(v):
        return v - (v * w).groupby(gk).transform("sum") / gw
    yt = dm(s.y)
    Xt = pd.DataFrame({c: dm(X[c]) for c in X.columns})
    Wm = w.values[:, None]
    XtW = Xt.values * Wm
    beta = np.linalg.solve(XtW.T @ Xt.values, XtW.T @ yt.values)
    e = yt.values - Xt.values @ beta
    scores = pd.DataFrame(XtW * e[:, None], index=s.index).groupby(s.mid.values).sum().values
    bread = np.linalg.inv(XtW.T @ Xt.values)
    V = bread @ (scores.T @ scores) @ bread
    se = np.sqrt(np.diag(V))
    return ref, {c: {"pp": round(float(b * 100), 3), "ic95": [round(float((b - 1.96 * s_) * 100), 3), round(float((b + 1.96 * s_) * 100), 3)],
                    "secoes": int(models[c])} for c, b, s_ in zip(X.columns, beta, se)}, int(models[ref])


def urna(ano, turno):
    m, A, B, cc, tot = prep(ano, turno)
    m = m.merge(det(ano)[(det(ano).turno == turno) & (det(ano).cargo == 1)][KEY + ["ds_modelo"]].assign(uf=lambda d: d.uf.astype(str)),
                on=KEY, how="left", suffixes=("", "_d")) if "ds_modelo" not in m.columns else m
    # secoes com modelo conhecido
    m = m[m.ds_modelo.notna() & (m.ds_modelo.str.replace("#", "") != "NULO")]
    o = {"ano": ano, "turno": turno, "A": A, "B": B}
    # bruto
    g = m.groupby("ds_modelo").agg(secoes=("valid", "size"), A=(A, "sum"), V=("valid", "sum"))
    g["shareA"] = g.A / g.V
    o["bruto"] = {k: {"secoes": int(r.secoes), "shareA": round(float(r.shareA) * 100, 2)} for k, r in g.iterrows()}
    ref, fe_mun, nref = wls_fe(m, A, "y", "mid")
    o["ref"] = ref
    o["ref_secoes"] = nref
    o["fe_municipio"] = fe_mun
    m["lid2"] = m["lid"]
    ref2, fe_loc, _ = wls_fe(m, A, "y", "lid2")
    o["fe_local"] = fe_loc
    # zona (menor unidade de contexto comum e mais ampla que local)
    m["zid"] = m.groupby(["uf", "mun", "zona"], sort=False).ngroup()
    ref3, fe_zona, _ = wls_fe(m, A, "y", "zid")
    o["fe_zona"] = fe_zona
    # fatia de locais com mais de um modelo
    mix = m.groupby("lid").ds_modelo.nunique()
    o["locais_com_2_modelos"] = int((mix > 1).sum())
    o["locais"] = int(len(mix))
    return o


# ================================================================= tempo de BU
FECHA_BRT = {"AC": 19, "AM": 18, "RR": 18, "RO": 18, "MT": 18, "MS": 18}  # 17h local em horario de Brasilia


def tempo(ano, turno):
    d = det(ano)
    d = d[(d.turno == turno) & (d.cargo == 1)].copy()
    d["bu"] = pd.to_datetime(d.dt_bu, format="%d/%m/%Y %H:%M:%S", errors="coerce")
    d = d[d.bu.notna() & (d.uf.astype(str) != "ZZ")]
    day = d.bu.dt.normalize().mode()[0]
    # 2018: horario de Brasilia; 2022 e 2026: horario local da secao (AC aparece com 17h15 de menor valor)
    fecha = d.uf.astype(str).map(lambda u: FECHA_BRT.get(u, 17) if ano == 2018 else 17).astype(float)
    close = day + pd.to_timedelta(fecha, unit="h")
    lag = (d.bu - close).dt.total_seconds() / 60
    o = {"ano": ano, "turno": turno, "n": int(len(d)), "dia": str(day.date()),
         "lag_min": {q: round(float(lag.quantile(q)), 1) for q in (0, 0.001, 0.01, 0.05, 0.5, 0.95, 0.99, 0.999, 1)},
         "antes_do_fechamento": int((lag < 0).sum()), "antes_do_fechamento_ate_-30": int((lag < -30).sum()),
         "mais_de_6h": int((lag > 360).sum()), "mais_de_24h": int((lag > 1440).sum())}
    o["_lag_hist"] = np.histogram(lag.clip(-60, 600), bins=33, range=[-60, 600])[0].astype(int).tolist()
    # por modelo de urna
    if d.ds_modelo.notna().any():
        g = pd.DataFrame({"lag": lag, "mod": d.ds_modelo}).groupby("mod").lag.median()
        o["lag_mediana_por_modelo"] = {k: round(float(v), 1) for k, v in g.items() if k != "#NULO#"}
    o["origem"] = d.origem.value_counts().to_dict()
    ante = d[lag < 0]
    o["antes_por_origem"] = ante.origem.value_counts().to_dict()
    o["antes_por_uf_top"] = ante.uf.astype(str).value_counts().head(5).to_dict()
    o["antes_hora_min"] = str(ante.bu.min()) if len(ante) else None
    h = d.bu.dt.hour + d.bu.dt.minute / 60
    o["antes_das_8h"] = int((h < 8).sum())
    o["antes_das_8h_exemplos"] = [{"uf": str(r.uf), "mun": NM_MAP.get((str(r.uf), int(r.mun)), str(int(r.mun))), "zona": int(r.zona), "secao": int(r.secao),
                                   "bu": str(r.bu), "origem": str(r.origem)} for r in d[h < 8].head(6).itertuples()]
    return o


if __name__ == "__main__":
    what = sys.argv[1]
    t0 = time.time()
    if what == "turnos":
        R = {}
        for ano in ANOS:
            R[str(ano)] = entre_turnos(ano)
            print("turnos", ano, round(time.time() - t0), "s", flush=True)
        json.dump(R, open(os.path.join(OUT, "entre_turnos.json"), "w"))
    elif what == "elpop":
        R = {"populacao": elet_pop(), "crescimento": crescimento_eleitorado()}
        json.dump(R, open(os.path.join(OUT, "eleitorado.json"), "w"))
    elif what == "urna":
        R = []
        for ano in (2022, 2026):
            for t in (1, 2):
                R.append(urna(ano, t))
                print("urna", ano, t, round(time.time() - t0), "s", flush=True)
        json.dump(R, open(os.path.join(OUT, "urna.json"), "w"))
    elif what == "tempo":
        R = []
        for ano in (2018, 2022, 2026):
            for t in (1, 2):
                R.append(tempo(ano, t))
                print("tempo", ano, t, flush=True)
        json.dump(R, open(os.path.join(OUT, "tempo.json"), "w"))
