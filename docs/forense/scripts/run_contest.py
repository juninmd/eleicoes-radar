import os
import sys, json, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from forense import *

NM = pd.read_pickle(os.path.join(WORK, "munnames.pkl"))
NM_MAP = {(r.uf, int(r.mun)): r.nome for r in NM.itertuples()}
TAGS = [("aldeia|indigen|funai|terra indigena|tuxaua", "aldeia/comunidade indígena"),
        ("presidio|penitenci|cadeia|ressociali|unidade prisional|centro de detencao|socioeducativ|casa de custodia|cdp|cpp ", "unidade prisional/socioeducativa"),
        ("quartel|batalhao|exercito|brigada|base aerea|marinha|forca aerea|policia militar|pm |regimento", "unidade militar"),
        ("assentamento|quilombo|comunidade|ribeirinh|vila |povoado|fazenda|sitio|distrito|zona rural|rural", "zona rural/comunidade"),
        ("hospital|asilo|casa de repouso|lar de idosos|clinica", "hospital/abrigo")]


def tag_of(nm):
    if not isinstance(nm, str):
        return None
    s = nm.lower()
    s = s.replace("é", "e").replace("ã", "a").replace("á", "a").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ç", "c").replace("â", "a").replace("ê", "e").replace("ô", "o")
    for rx, lab in TAGS:
        if re.search(rx, s):
            return lab
    return None


def sec_info(m, i, extra=None):
    r = m.loc[i]
    d = {"uf": r.uf, "mun": NM_MAP.get((r.uf, int(r.mun)), f"mun {int(r.mun)}"), "zona": int(r.zona), "secao": int(r.secao),
         "local": int(r.local), "aptos": int(r.aptos), "comp": int(r.comp), "valid": int(r.valid)}
    if "nm_local" in m.columns and isinstance(r.get("nm_local"), str) and r.nm_local != "#NULO#":
        d["nm_local"] = r.nm_local.title()[:60]
        d["tag"] = tag_of(r.nm_local)
    if extra:
        d.update(extra)
    return d


def run(ano, turno):
    t0 = time.time()
    m, A, B, cc, tot = prep(ano, turno)
    nm = nomes(ano)
    nameA = nm.get((1, int(A[1:])), A)
    nameB = nm.get((1, int(B[1:])), B)
    r = {"ano": ano, "turno": turno, "A": {"nr": int(A[1:]), "nome": nameA, "votos": int(tot[A])},
         "B": {"nr": int(B[1:]), "nome": nameB, "votos": int(tot[B])}, "secoes": int(len(m)),
         "valid": int(m.valid.sum()), "aptos": int(m.aptos.sum()), "comp": int(m.comp.sum()),
         "margem": int(tot[A] - tot[B])}
    r["fingerprint"] = turnout_fingerprint(m, A, B)
    # dispersao
    for lab, col in (("A", A), ("B", B)):
        ag = dispersion(m, col)
        r[f"disp_{lab}"] = dispersion_summary(ag)
        if lab == "A":
            ag["nome"] = [NM_MAP.get((u, int(mu)), "") for u, mu in zip(ag.uf, m.groupby("lid").mun.first().reindex(ag.index))]
            byuf = ag.groupby("uf").agg(locais=("ratio", "size"), ratio_med=("ratio", "median"),
                                           low001=("p_low", lambda v: int((v < 0.001).sum())))
            r["disp_por_uf"] = {u: {"locais": int(x.locais), "ratio_med": round(float(x.ratio_med), 3), "low001": int(x.low001)} for u, x in byuf.iterrows()}
            low = ag.sort_values("p_low").head(8)
            first = m.groupby("lid").first()
            r["disp_menores"] = [{"uf": x.uf, "mun": x.nome, "k": int(x.k), "ratio": round(float(x.ratio), 3), "p": float(x.p_low),
                                   "zona": int(first.loc[i, "zona"]), "local": int(first.loc[i, "local"])} for i, x in low.iterrows()]
            phiA = float(ag.ratio.median())
    # digitos
    dg = {}
    for lab, col in (("A", A), ("B", B), ("comp", "comp"), ("bran", "bran"), ("nul", "nul")):
        dd = digit_tests(m[col].values, 20 if lab in ("bran", "nul") else 50)
        dg[lab] = {k: v for k, v in dd.items() if k in ("n", "last_freq", "last_p", "last_mad", "last_05", "last_cramerV", "sec_mad", "sec_freq")}
    rho, pl = calibrate_rho(m, A, phiA)
    dg["bench_A"] = digit_bench(m, A, rho, pl)
    r["digitos"] = dg
    r["rho"] = rho
    r["intpct"] = integer_pct(m, A, rho, pl)
    r["zero_inv"] = zero_blank_null2(m)
    d = duplicates(m, cc)
    dupidx = d.pop("_dup_index")
    r["duplicatas"] = d
    # outliers
    oa, za = outliers(m, A, B, phiA, rho=rho, p_loc=pl)
    ob, zb = outliers(m, B, A, float(dispersion(m, B).ratio.median()))
    fa, fz = oa.pop("_flag_idx"), oa.pop("_flag_z")
    ob.pop("_flag_idx"); ob.pop("_flag_z")
    r["outliers_A"] = oa
    r["outliers_B"] = ob
    r["outliers_top"] = [sec_info(m, i, {"z": z, "shareA": round(float(m.loc[i, A] / m.loc[i, "valid"]), 3)}) for i, z in zip(fa[:12], fz[:12])]
    tags = {}
    for i in fa[:300]:
        t = tag_of(m.loc[i].get("nm_local")) if "nm_local" in m.columns else None
        tags[t or "sem marca"] = tags.get(t or "sem marca", 0) + 1
    r["outliers_tags"] = tags if "nm_local" in m.columns else None
    r["monotone"] = monotone_test(m, A)
    r["tempo_s"] = round(time.time() - t0, 1)
    json.dump(r, open(os.path.join(OUT, f"c_{ano}_{turno}.json"), "w"))
    print(ano, turno, r["tempo_s"], "s", flush=True)
    return r


if __name__ == "__main__":
    for a in sys.argv[1:]:
        ano, t = a.split("-")
        run(int(ano), int(t))
