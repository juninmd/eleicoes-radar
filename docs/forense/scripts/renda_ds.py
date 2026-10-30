"""Junta PIB, população, Bolsa Família e voto no 2º turno por município, alinhado a ds/eleitorado_mapa (mesma ordem de mapa_voto.py).
Saída: ds/renda.json. Descritivo: associação entre municípios, nunca causa e nunca voto de pessoa."""
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import BASE, WORK, nomes, vot  # noqa: E402
from mapa_voto import titulo  # noqa: E402
from renda_bf import ARQ, norm  # noqa: E402

ANOS = [2018, 2022, 2026]
BRANCO_NULO = (95, 96, 97)
REF = 13  # candidato do 2º turno cuja fatia se mostra (o mesmo número nos três anos); o outro é o complemento


def main():
    cen = json.load(open(os.path.join(WORK, "centroids.json")))
    e22 = pd.read_pickle(os.path.join(WORK, "elpop_2022.pkl"))
    e22 = e22[e22.ibge.notna()]
    linhas = [t for t in e22.itertuples() if cen.get(str(t.ibge))]
    uf = [t.uf for t in linhas]
    ibge = [str(t.ibge) for t in linhas]
    tse = [(t.uf, t.mun) for t in linhas]

    sid = pd.read_pickle(os.path.join(WORK, "sidra.pkl")).set_index("ibge")
    pop = np.array([sid["pop"].get(i, np.nan) for i in ibge], dtype=float)
    pib = np.array([sid["pib_mil"].get(i, np.nan) for i in ibge], dtype=float) * 1000
    pibpc = pib / pop

    por_nome = {(c["uf"], norm(c["nm"])): i for i, c in cen.items()}
    ix = {i: k for k, i in enumerate(ibge)}
    bf100, bf_meta = {}, {}
    for ano in ANOS:
        d = pd.read_pickle(os.path.join(WORK, f"bf_{ano}.pkl"))
        pessoas = np.full(len(ibge), np.nan)
        casou = 0
        for r in d.itertuples():
            i = por_nome.get((r.uf, norm(r.nome)))
            if i is not None and i in ix:
                pessoas[ix[i]] = (0 if np.isnan(pessoas[ix[i]]) else pessoas[ix[i]]) + r.pessoas
                casou += int(r.pessoas)
        bf100[ano] = pessoas / pop * 100
        bf_meta[ano] = {"programa": d.programa.iloc[0], "mes": d.mes.iloc[0], "pessoas": int(d.pessoas.sum()), "casadas": casou, "municipios_sem_dado": int(np.isnan(pessoas).sum())}
        print(ano, bf_meta[ano])

    # voto no 2º turno: fatia do candidato 13 entre os votos nominais
    pt, analise = {}, []
    for ano in ANOS:
        v = vot(ano)
        v = v[(v.turno == 2) & (v.cargo == 1) & ~v.votavel.isin(BRANCO_NULO) & (v.uf != "ZZ")]
        tot = v.groupby(["uf", "mun"]).votos.sum()
        a = v[v.votavel == REF].groupby(["uf", "mun"]).votos.sum()
        nm = nomes(ano)
        shares, votos = np.full(len(tse), np.nan), np.zeros(len(tse))
        for k, key in enumerate(tse):
            if key in tot.index and tot[key] > 0:
                shares[k] = a.get(key, 0) / tot[key]
                votos[k] = tot[key]
        pt[f"{ano}-2"] = shares
        analise.append(estima(ano, shares, votos, bf100[ano], pibpc, uf, nm.get((2, REF)) or nm.get((1, REF)) or str(REF)))

    def arr(x, k=1):
        return [None if not np.isfinite(y) else round(float(y), k) for y in x]
    out = {
        "municipios": len(tse), "pib_ano": int(sid.pib_ano.dropna().iloc[0]), "pop_ano": 2022, "bf": {str(a): bf_meta[a] for a in ANOS},
        "pop": [None if not np.isfinite(y) else int(y) for y in pop], "pibpc": arr(pibpc, 0),
        "bf100": {str(a): arr(bf100[a], 1) for a in ANOS}, "pt": {k: arr(v * 1000, 0) for k, v in pt.items()}, "analise": analise,
    }
    os.makedirs(os.path.join(BASE, "ds"), exist_ok=True)
    with open(os.path.join(BASE, "ds", "renda.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def wcorr(x, y, w):
    mx, my = np.average(x, weights=w), np.average(y, weights=w)
    return float(np.sum(w * (x - mx) * (y - my)) / np.sqrt(np.sum(w * (x - mx) ** 2) * np.sum(w * (y - my) ** 2)))


def fe_ols(y, X, g, w):
    """MQO ponderado com efeito fixo de grupo (UF) por centralização; erro-padrão robusto com agrupamento por UF"""
    df = pd.DataFrame(X, columns=[f"x{i}" for i in range(X.shape[1])]); df["y"] = y; df["g"] = g; df["w"] = w
    for c in df.columns[:-2]:
        if c != "g":
            df[c] = df[c] - (df[c] * df.w).groupby(df.g).transform("sum") / df.w.groupby(df.g).transform("sum")
    xs = df[[f"x{i}" for i in range(X.shape[1])]].values; yy = df.y.values; ww = df.w.values
    XtWX = xs.T @ (xs * ww[:, None]); b = np.linalg.solve(XtWX, xs.T @ (ww * yy))
    res = yy - xs @ b; meat = np.zeros_like(XtWX)
    for _, idx in df.groupby("g").indices.items():
        s = xs[idx].T @ (ww[idx] * res[idx]); meat += np.outer(s, s)
    inv = np.linalg.inv(XtWX); se = np.sqrt(np.diag(inv @ meat @ inv))
    return b, se


def quintis(x, share, votos):
    q = pd.qcut(pd.Series(x), 5, labels=False, duplicates="drop")
    out = []
    for k in sorted(q.dropna().unique()):
        m = (q == k).values
        out.append({"med": round(float(np.median(x[m])), 1), "n": int(m.sum()), "pt": round(float(np.sum(share[m] * votos[m]) / np.sum(votos[m])), 4)})
    return out


def estima(ano, share, votos, bf, pibpc, uf, nome):
    ok = np.isfinite(share) & np.isfinite(bf) & np.isfinite(pibpc) & (pibpc > 0) & (votos > 0)
    s, w, b, p, g = share[ok], votos[ok], bf[ok], np.log2(pibpc[ok]), np.array(uf)[ok]
    r = {"id": f"{ano}-2", "ano": ano, "candidato": titulo(nome), "n": int(ok.sum()),
         "corr_bf": round(wcorr(b, s, w), 3), "corr_pib": round(wcorr(p, s, w), 3), "corr_bf_pib": round(wcorr(b, p, w), 3),
         "q_bf": quintis(b, s, w), "q_pib": quintis(pibpc[ok], s, w)}
    be, se = fe_ols(s, b[:, None], g, w)
    r["fe_bf"], r["fe_bf_ep"] = round(float(be[0]) * 10 * 100, 2), round(float(se[0]) * 10 * 100, 2)  # p.p. de fatia por +10 pessoas/100 hab
    be, se = fe_ols(s, p[:, None], g, w)
    r["fe_pib"], r["fe_pib_ep"] = round(float(be[0]) * 100, 2), round(float(se[0]) * 100, 2)  # p.p. por dobro do PIB per capita
    be, se = fe_ols(s, np.column_stack([b, p]), g, w)
    r["fe_conj_bf"], r["fe_conj_bf_ep"] = round(float(be[0]) * 10 * 100, 2), round(float(se[0]) * 10 * 100, 2)
    r["fe_conj_pib"], r["fe_conj_pib_ep"] = round(float(be[1]) * 100, 2), round(float(se[1]) * 100, 2)
    print(r["id"], {k: v for k, v in r.items() if k not in ("q_bf", "q_pib")})
    print("  q_bf", [(q["med"], q["pt"]) for q in r["q_bf"]], "q_pib", [(q["med"], q["pt"]) for q in r["q_pib"]])
    return r


if __name__ == "__main__":
    main()
