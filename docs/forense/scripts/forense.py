"""Bateria de testes forenses por secao (Presidente). Cada funcao devolve dict serializavel."""
import sys, json
sys.path.insert(0, ".")
from lib import *
from scipy import stats

RNG = np.random.default_rng(20261028)


def prep(ano, turno):
    m = contest(ano, turno)
    m = m[m["_merge"] == "both"].drop(columns="_merge").copy()
    cc = cand_cols(m)
    for c in cc + ["aptos", "comp", "bran", "nul", "nom"]:
        m[c] = m[c].fillna(0)
    tot = m[cc].sum().sort_values(ascending=False)
    A, B = tot.index[0], tot.index[1]
    m["valid"] = m[cc].sum(axis=1)
    m["lid"] = m.groupby(["uf", "mun", "zona", "local"], sort=False).ngroup()
    m["mid"] = m.groupby(["uf", "mun"], sort=False).ngroup()
    return m.reset_index(drop=True), A, B, cc, tot


# ---------------------------------------------------------------- comparecimento / impressao digital
def turnout_fingerprint(m, A, B):
    s = m[(m.aptos >= 100) & (m.valid >= 50)]
    t = (s.comp / s.aptos).values
    a = (s[A] / s.valid).values
    b = (s[B] / s.valid).values
    out = {"n": int(len(s))}
    out["turnout_mean"] = float(np.average(t, weights=s.aptos.values))
    out["turnout_p1"] = float(np.quantile(t, 0.01))
    out["turnout_p99"] = float(np.quantile(t, 0.99))
    out["t_ge_95"] = float((t >= 0.95).mean())
    out["t_ge_99"] = float((t >= 0.99).mean())
    out["t_eq_1"] = float((t >= 1.0).mean())
    out["corr_turnout_A"] = float(np.corrcoef(t, a)[0, 1])
    out["corr_turnout_B"] = float(np.corrcoef(t, b)[0, 1])
    out["A_ge_90"] = float((a >= 0.90).mean())
    out["A_ge_90_t_ge_90"] = float(((a >= 0.90) & (t >= 0.90)).mean())
    out["A_ge_95_t_ge_95"] = float(((a >= 0.95) & (t >= 0.95)).mean())
    out["B_ge_90_t_ge_90"] = float(((b >= 0.90) & (t >= 0.90)).mean())
    # histograma 2D 40x40: x comparecimento 0..1, y fatia de A 0..1
    H, _, _ = np.histogram2d(t, a, bins=40, range=[[0, 1], [0, 1]])
    out["hist2d_A"] = H.astype(int).tolist()
    H, _, _ = np.histogram2d(t, b, bins=40, range=[[0, 1], [0, 1]])
    out["hist2d_B"] = H.astype(int).tolist()
    # histograma 1D de comparecimento (aptos>=50)
    s2 = m[m.aptos >= 50]
    th = (s2.comp / s2.aptos).values
    out["turnout_hist"] = np.histogram(th, bins=50, range=[0, 1])[0].astype(int).tolist()
    # pico em 100% e vizinhanca (testa heaping)
    out["share_turn_100"] = float((th >= 1.0).mean())
    out["share_turn_98_100_open"] = float(((th >= 0.98) & (th < 1.0)).mean())
    return out


# ---------------------------------------------------------------- dispersao dentro do local de votacao
def dispersion(m, col, minn=30):
    x = m[col].values.astype(float)
    n = m["valid"].values.astype(float)
    g = m["lid"].values
    ok = n >= minn
    d = pd.DataFrame({"g": g[ok], "x": x[ok], "n": n[ok], "uf": m["uf"].values[ok], "mid": m["mid"].values[ok]})
    ag = d.groupby("g").agg(X=("x", "sum"), N=("n", "sum"), k=("x", "size"), uf=("uf", "first"), mid=("mid", "first"))
    ag["p"] = ag.X / ag.N
    d = d.join(ag[["p"]], on="g")
    good = (d.p > 0.02) & (d.p < 0.98)
    d = d[good]
    d["t"] = (d.x - d.n * d.p) ** 2 / (d.n * d.p * (1 - d.p))
    D = d.groupby("g").t.sum().rename("D")
    ag = ag.join(D, how="inner")
    ag = ag[ag.k >= 3]
    ag["df"] = ag.k - 1
    ag["ratio"] = ag.D / ag["df"]
    ag["p_low"] = stats.chi2.cdf(ag.D, ag["df"])
    ag["p_high"] = stats.chi2.sf(ag.D, ag["df"])
    return ag


def dispersion_summary(ag):
    out = {"locais": int(len(ag)), "secoes": int(ag.k.sum())}
    out["ratio_mediana"] = float(ag.ratio.median())
    out["ratio_p05"] = float(ag.ratio.quantile(0.05))
    out["ratio_p95"] = float(ag.ratio.quantile(0.95))
    for a in (0.01, 0.001, 0.0001):
        out[f"low_{a}"] = int((ag.p_low < a).sum())
        out[f"low_{a}_esperado"] = float(len(ag) * a)
        out[f"high_{a}"] = int((ag.p_high < a).sum())
    # Benjamini-Hochberg na cauda inferior (subdispersao)
    p = np.sort(ag.p_low.values)
    m_ = len(p)
    thr = 0.05 * (np.arange(1, m_ + 1) / m_)
    sig = np.where(p <= thr)[0]
    out["bh_low_5pct"] = int(sig.max() + 1) if len(sig) else 0
    return out


# ---------------------------------------------------------------- digitos
def digit_tests(x, minv=50):
    """x: contagens (>=minv). Retorna ultimo digito e segundo digito."""
    x = np.asarray(x)
    x = x[x >= minv].astype(int)
    out = {"n": int(len(x))}
    if len(x) < 100:
        return {"n": int(len(x)), "last_freq": [], "last_p": None, "last_mad": None, "last_05": None, "last_cramerV": None, "sec_mad": None, "sec_freq": []}
    last = x % 10
    f = np.bincount(last, minlength=10) / len(x)
    chi, p = stats.chisquare(np.bincount(last, minlength=10))
    out["last_freq"] = f.round(5).tolist()
    out["last_chi2"] = float(chi)
    out["last_p"] = float(p)
    out["last_mad"] = float(np.abs(f - 0.1).mean())
    out["last_05"] = float(np.isin(last, [0, 5]).mean())
    out["last_cramerV"] = float(np.sqrt(chi / (len(x) * 9)))
    # segundo digito
    s = np.array([int(str(v)[1]) for v in x])
    f2 = np.bincount(s, minlength=10) / len(s)
    b2 = np.array([sum(np.log10(1 + 1 / (10 * d1 + d2)) for d1 in range(1, 10)) for d2 in range(10)])
    out["sec_freq"] = f2.round(5).tolist()
    out["sec_mad"] = float(np.abs(f2 - b2).mean())
    return out


def simulate_counts(n, p, rho=0.0):
    """binomial/beta-binomial por secao, vetorizado."""
    if rho > 0:
        a = p * (1 / rho - 1)
        b = (1 - p) * (1 / rho - 1)
        pp = RNG.beta(np.maximum(a, 1e-6), np.maximum(b, 1e-6))
    else:
        pp = p
    return RNG.binomial(n.astype(int), pp)


# ---------------------------------------------------------------- vetores duplicados
def multinomial_rows(n, P):
    """n (N,), P (N,K) -> contagens (N,K) por binomiais condicionais."""
    N, K = P.shape
    out = np.zeros((N, K), dtype=np.int64)
    rem = n.astype(np.int64).copy()
    prem = np.ones(N)
    for k in range(K - 1):
        q = np.clip(P[:, k] / np.maximum(prem, 1e-12), 0, 1)
        xk = RNG.binomial(rem, q)
        out[:, k] = xk
        rem = rem - xk
        prem = prem - P[:, k]
    out[:, K - 1] = rem
    return out


def duplicates(m, cc, minc=50):
    s = m[m.comp >= minc]
    cols = cc + ["bran", "nul"]
    s = s[s[cols].sum(axis=1) > 0]
    M = s[cols].values.astype(np.int64)
    # hash
    h = pd.util.hash_array(np.ascontiguousarray(M).view([("", M.dtype)] * M.shape[1]).ravel()) if False else None
    key = pd.Series([hash(r.tobytes()) for r in M], index=s.index)
    cnt = key.map(key.value_counts())
    nat = int((cnt > 1).sum())
    grp = int(key.value_counts().gt(1).sum())
    # dentro do mesmo municipio
    kk = pd.Series(list(zip(s.mid.values, key.values)))
    vc = kk.value_counts()
    mun_dup = int(vc.gt(1).sum())
    out = {"secoes_comp_ge_50": int(len(s)), "secoes_em_duplicata_nacional": nat, "grupos_duplicados_nacional": grp,
           "grupos_duplicados_mesmo_municipio": mun_dup}
    # nulo: simula vetor multinomial a partir das fatias do local (leave-one-out nao necessario aqui)
    locs = s.groupby("lid")[cols].transform("sum").values.astype(float)
    P = locs / locs.sum(axis=1, keepdims=True)
    rhos = []
    nulls = []
    for _ in range(3):
        sim = multinomial_rows(s.comp.values, P)
        ks = pd.Series([hash(r.tobytes()) for r in sim], index=s.index)
        nulls.append(int((ks.map(ks.value_counts()) > 1).sum()))
        kk2 = pd.Series(list(zip(s.mid.values, ks.values)))
        rhos.append(int(kk2.value_counts().gt(1).sum()))
    out["secoes_em_duplicata_nacional_simulado"] = nulls
    out["grupos_duplicados_mesmo_municipio_simulado"] = rhos
    # exemplos de grupos grandes (comp >= 150) idem
    big = s[s.comp >= 150]
    kb = pd.Series([hash(r.tobytes()) for r in big[cols].values.astype(np.int64)], index=big.index)
    out["secoes_comp_ge_150_duplicadas"] = int((kb.map(kb.value_counts()) > 1).sum())
    out["_dup_index"] = [int(i) for i in s.index[(cnt > 1).values][:2000]]
    return out


# ---------------------------------------------------------------- brancos+nulos zero
def zero_blank_null(m):
    s = m[m.comp >= 100].copy()
    inv = s.bran + s.nul
    g = s.groupby("lid")
    tot_inv = g.apply(lambda d: (d.bran + d.nul).sum(), include_groups=False) if False else None
    s["inv"] = inv
    loc_inv = s.groupby("lid").inv.transform("sum")
    loc_comp = s.groupby("lid").comp.transform("sum")
    # leave-one-out
    q = (loc_inv - s.inv) / np.maximum(loc_comp - s.comp, 1)
    q = q.clip(1e-4, 0.9)
    exp0 = float(((1 - q) ** s.comp).sum())
    obs0 = int((inv == 0).sum())
    return {"n": int(len(s)), "obs_zero": obs0, "esperado_zero": exp0,
            "inv_mean": float(inv.sum() / s.comp.sum())}


# ================================================================= extensoes
def zero_blank_null2(m):
    """Secoes com comp>=100 sem nenhum branco/nulo, contra o esperado pelo local (irmas, leave-one-out)."""
    s = m[m.comp >= 100].copy()
    s["inv"] = s.bran + s.nul
    g = s.groupby("lid")
    li, lc, lk = g.inv.transform("sum"), g.comp.transform("sum"), g.inv.transform("size")
    sib_comp = lc - s.comp
    ok = (lk >= 3) & (sib_comp >= 300)
    q = ((li - s.inv) / sib_comp.clip(lower=1)).clip(0.002, 0.6)
    s = s[ok]
    q = q[ok]
    exp0 = float(((1 - q) ** s.comp).sum())
    obs0 = int((s.inv == 0).sum())
    return {"n": int(len(s)), "obs_zero": obs0, "esperado_zero": round(exp0, 2)}


def median_ratio(m, col):
    return float(dispersion(m, col).ratio.median())


def calibrate_rho(m, col, target):
    """acha rho do beta-binomial que reproduz a mediana D/df observada."""
    best = (None, 9)
    sim = m.copy()
    n = m.valid.values
    g = m.groupby("lid")
    p_loc = (g[col].transform("sum") / g.valid.transform("sum").clip(lower=1)).clip(0.001, 0.999).values
    for rho in (0.0, 0.0002, 0.0005, 0.001, 0.002, 0.004, 0.008, 0.016):
        sim[col] = simulate_counts(n, p_loc, rho)
        mr = float(dispersion(sim, col).ratio.median())
        if abs(mr - target) < best[1]:
            best = (rho, abs(mr - target))
    return best[0], p_loc


def outliers(m, col, other, phi, thr=5.0, simulate=True, rho=None, p_loc=None):
    s = m[m.valid >= 30].copy()
    g = s.groupby("lid")
    X, N, K = g[col].transform("sum"), g.valid.transform("sum"), g[col].transform("size")
    sibN = N - s.valid
    ok = (K >= 4) & (sibN >= 150)
    p = ((X - s[col]) / sibN.clip(lower=1)).clip(0.01, 0.99)
    z = (s[col] - s.valid * p) / np.sqrt(phi * s.valid * p * (1 - p))
    z = z.where(ok)
    exc = s[col] - s.valid * p
    out = {"testadas": int(ok.sum())}
    out["z_gt"] = int((z > thr).sum())
    out["z_lt"] = int((z < -thr).sum())
    out["z_exc_pos"] = int(exc[z > thr].sum())
    out["z_exc_neg"] = int(exc[z < -thr].sum())
    out["normal_esperado"] = float(2 * stats.norm.sf(thr) * ok.sum())
    out["|z|>8"] = int((z.abs() > 8).sum())
    if simulate and rho is not None:
        sims = []
        for _ in range(2):
            t = s.copy()
            idx = t.index
            t[col] = simulate_counts(t.valid.values, p_loc[m.index.get_indexer(idx)], rho)
            g2 = t.groupby("lid")
            X2, N2 = g2[col].transform("sum"), g2.valid.transform("sum")
            sib2 = N2 - t.valid
            p2 = ((X2 - t[col]) / sib2.clip(lower=1)).clip(0.01, 0.99)
            z2 = ((t[col] - t.valid * p2) / np.sqrt(phi * t.valid * p2 * (1 - p2))).where(ok)
            sims.append(int((z2.abs() > thr).sum()))
        out["sim_abs_gt"] = sims
    out["_flag_idx"] = [int(i) for i in z[z.abs() > thr].sort_values(key=lambda v: -v.abs()).index[:300]]
    out["_flag_z"] = [round(float(z[i]), 2) for i in out["_flag_idx"]]
    return out, z


def monotone_test(m, col):
    """Secoes irmas do mesmo local, em ordem de numero: sequencias perfeitamente monotonas vs 2/k!."""
    s = m[m.valid >= 30][["lid", "secao", col, "valid"]].copy()
    s["sh"] = s[col] / s.valid
    s = s.sort_values(["lid", "secao"])
    obs = {}
    exp = {}
    from math import factorial
    arr = s.groupby("lid").sh.apply(lambda v: v.values)
    for v in arr.values:
        k = len(v)
        if k < 4 or k > 8:
            continue
        d = np.diff(v)
        mono = bool(np.all(d > 0) or np.all(d < 0))
        o = obs.setdefault(k, [0, 0])
        o[0] += 1
        o[1] += int(mono)
    res = {}
    to = te = 0
    for k, (n, mo) in sorted(obs.items()):
        e = n * 2 / factorial(k)
        res[str(k)] = {"locais": n, "monotonas": mo, "esperado": round(e, 1)}
        to += mo
        te += e
    return {"por_k": res, "obs": to, "esperado": round(te, 1)}


def digit_bench(m, col, rho, p_loc):
    x = m[col].values
    sim_last, sim_sec = [], []
    for _ in range(3):
        sx = simulate_counts(m.valid.values, p_loc, rho)
        r = digit_tests(sx)
        sim_last.append(r["last_mad"])
        sim_sec.append(r["sec_mad"])
    return {"sim_last_mad": [round(v, 5) for v in sim_last], "sim_sec_mad": [round(v, 5) for v in sim_sec]}


# ================================================================= percentuais inteiros (Kobak et al.)
def int_pct_rate(x, n, minn=100):
    x = np.asarray(x, dtype=np.int64)
    n = np.asarray(n, dtype=np.int64)
    ok = (n >= minn) & (x > 0) & (x < n)
    x, n = x[ok], n[ok]
    return float(((100 * x) % n == 0).mean()), int(ok.sum())


def integer_pct(m, A, rho, p_loc):
    out = {}
    r, k = int_pct_rate(m[A].values, m.valid.values)
    sims = []
    for _ in range(3):
        sx = simulate_counts(m.valid.values, p_loc, rho)
        sims.append(int_pct_rate(sx, m.valid.values)[0])
    out["share_A"] = {"obs": r, "sim": sims, "n": k}
    # comparecimento
    g = m.groupby("lid")
    pt = (g.comp.transform("sum") / g.aptos.transform("sum").clip(lower=1)).clip(0.01, 0.99).values
    r, k = int_pct_rate(m.comp.values, m.aptos.values)
    sims = []
    for _ in range(3):
        sx = simulate_counts(m.aptos.values, pt, rho)
        sims.append(int_pct_rate(sx, m.aptos.values)[0])
    out["turnout"] = {"obs": r, "sim": sims, "n": k}
    return out
