"""Variáveis municipais (renda, Bolsa Família, Censo 2022, perfil do eleitorado, participação, voto anterior) e quanto cada uma anda junto
com a fatia do candidato 13 no 2º turno de 2018, 2022 e 2026. Alinhado a ds/eleitorado_mapa (mesma ordem de mapa_voto.py).
Saída: ds/correl.json. Descritivo: associação entre municípios, nunca causa e nunca voto de pessoa.

Antes: renda_bf.py sidra, sidra2 e bf <ano> (2018, 2022, 2026); perfil.py <ano> (2018, 2022); ingest.py (votos e detalhe)."""
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import BASE, WORK, det, nomes, vot  # noqa: E402
from mapa_voto import titulo  # noqa: E402
from renda_bf import norm  # noqa: E402

ANOS = [2018, 2022, 2026]
BRANCO_NULO = (95, 96, 97)
REF = 13
ANTERIOR = {2018: 2014, 2022: 2018, 2026: 2022}  # 2º turno anterior de Presidente
RG, CE, EL, VP = "Renda e economia", "Educação e população (Censo 2022)", "Eleitorado (perfil do TSE)", "Voto e participação"
# k, grupo, nome, unidade, formato, cortes dos mapas, escala log nas contas, fonte
VARS = [
    ("bf100", RG, "Pessoas no Bolsa Família", "por 100 habitantes", "n1", [2, 5, 8, 12, 16, 20, 25, 30], False, "CGU, setembro de cada ano (Bolsa Família, Auxílio Brasil, Novo Bolsa Família)"),
    ("pibpc", RG, "PIB per capita", "R$ por habitante", "rs", [15000, 20000, 26000, 34000, 45000, 65000, 100000, 200000], True, "IBGE, PIB dos Municípios 2023"),
    ("renda", RG, "Renda domiciliar per capita (mediana)", "R$ por mês", "rs", [400, 550, 700, 850, 1000, 1300, 1700, 2200], True, "IBGE, Censo 2022"),
    ("agro", RG, "Agropecuária no valor adicionado", "% do total", "pct", [2, 5, 10, 20, 30, 40, 50, 60], False, "IBGE, PIB dos Municípios 2021"),
    ("ind", RG, "Indústria no valor adicionado", "% do total", "pct", [5, 10, 15, 20, 25, 30, 40, 50], False, "IBGE, PIB dos Municípios 2021"),
    ("adm", RG, "Administração pública no valor adicionado", "% do total", "pct", [10, 20, 30, 40, 50, 60, 70, 80], False, "IBGE, PIB dos Municípios 2021"),
    ("alfab", CE, "Alfabetização (15 anos ou mais)", "%", "pct", [80, 84, 88, 91, 93, 95, 96, 98], False, "IBGE, Censo 2022"),
    ("pp", CE, "Pretos e pardos", "% da população", "pct", [10, 20, 30, 40, 50, 60, 70, 80], False, "IBGE, Censo 2022"),
    ("urb", CE, "População urbana", "% da população", "pct", [30, 50, 60, 70, 80, 90, 95, 99], False, "IBGE, Censo 2022"),
    ("pop", CE, "Tamanho da população", "habitantes", "n0", [2000, 5000, 10000, 20000, 50000, 100000, 500000, 1000000], True, "IBGE, Censo 2022"),
    ("e60", EL, "Eleitores com 60 anos ou mais", "% do eleitorado", "pct", [10, 14, 18, 22, 26, 30, 34, 38], False, "TSE, perfil do eleitorado por seção"),
    ("ejov", EL, "Eleitores de 16 a 24 anos", "% do eleitorado", "pct", [8, 10, 12, 14, 16, 18, 20, 24], False, "TSE, perfil do eleitorado por seção"),
    ("esup", EL, "Eleitores com ensino superior", "% do eleitorado", "pct", [2, 4, 6, 8, 10, 14, 18, 25], False, "TSE, perfil do eleitorado por seção"),
    ("ebaixa", EL, "Eleitores sem o fundamental completo", "% do eleitorado", "pct", [20, 30, 40, 50, 55, 60, 65, 70], False, "TSE, perfil do eleitorado por seção"),
    ("efem", EL, "Eleitoras (mulheres)", "% do eleitorado", "pct", [48, 50, 51, 52, 53, 54, 55, 56], False, "TSE, perfil do eleitorado por seção"),
    ("ebio", EL, "Eleitores com biometria cadastrada", "% do eleitorado", "pct", [60, 70, 80, 85, 90, 93, 95, 97], False, "TSE, perfil do eleitorado por seção"),
    ("comp", VP, "Comparecimento no 2º turno", "% dos eleitores aptos", "pct", [60, 65, 70, 75, 78, 80, 82, 85], False, "TSE, detalhe da votação por seção"),
    ("ant", VP, "Fatia do candidato 13 no 2º turno anterior", "% dos votos", "pct", [20, 30, 40, 50, 60, 70, 80, 90], False, "TSE, votação por seção (2014, 2018, 2022)"),
]
ANUAIS = {"bf100", "e60", "ejov", "esup", "ebaixa", "efem", "ebio", "comp", "ant"}


def ordem_do_mapa():
    cen = json.load(open(os.path.join(WORK, "centroids.json")))
    e22 = pd.read_pickle(os.path.join(WORK, "elpop_2022.pkl"))
    e22 = e22[e22.ibge.notna()]
    return cen, [t for t in e22.itertuples() if cen.get(str(t.ibge))]


def por_municipio(df, chave=("uf", "mun")):
    return df.groupby(list(chave)).sum(numeric_only=True)


def main():
    cen, linhas = ordem_do_mapa()
    uf = [t.uf for t in linhas]
    ibge = [str(t.ibge) for t in linhas]
    tse = [(t.uf, t.mun) for t in linhas]
    sid = pd.read_pickle(os.path.join(WORK, "sidra.pkl")).set_index("ibge")
    s2 = pd.read_pickle(os.path.join(WORK, "sidra2.pkl")).set_index("ibge")
    g = lambda df, c: np.array([df[c].get(i, np.nan) for i in ibge], dtype=float)  # noqa: E731
    pop = g(sid, "pop")
    est = {"pop": pop, "pibpc": g(sid, "pib_mil") * 1000 / pop, "renda": g(s2, "renda_med"), "alfab": g(s2, "alfab"),
           "pp": (g(s2, "cor_2777") + g(s2, "cor_2779")) / g(s2, "cor_95251") * 100, "urb": g(s2, "urb_1") / g(s2, "urb_6795") * 100}
    vab = g(s2, "vab")
    for k, c in (("agro", "vab_agro"), ("ind", "vab_ind"), ("adm", "vab_adm")):
        est[k] = g(s2, c) / vab * 100

    # Bolsa Família (por ano) casando o código SIAFI com o IBGE por UF + nome
    por_nome = {(c["uf"], norm(c["nm"])): i for i, c in cen.items()}
    ix = {i: k for k, i in enumerate(ibge)}
    anual, bf_meta = {k: {} for k in ANUAIS}, {}
    for ano in ANOS:
        d = pd.read_pickle(os.path.join(WORK, f"bf_{ano}.pkl"))
        pessoas = np.full(len(ibge), np.nan)
        for r in d.itertuples():
            i = por_nome.get((r.uf, norm(r.nome)))
            if i in ix:
                pessoas[ix[i]] = (0 if np.isnan(pessoas[ix[i]]) else pessoas[ix[i]]) + r.pessoas
        anual["bf100"][ano] = pessoas / pop * 100
        bf_meta[str(ano)] = {"programa": d.programa.iloc[0], "mes": d.mes.iloc[0], "pessoas": int(d.pessoas.sum()), "sem_dado": int(np.isnan(pessoas).sum())}

    # perfil do eleitorado (2018 e 2022; 2026 usa o de 2022 porque o TSE ainda não publicou o de 2026)
    for ano in (2018, 2022):
        p = por_municipio(pd.read_pickle(os.path.join(WORK, f"perfil_{ano}.pkl")).drop(columns=["zona", "secao"]))
        t = p["tot"]
        sér = {"e60": p["60+"] / t, "ejov": (p["16-17"] + p["18-24"]) / t, "esup": p["edu_alta"] / t, "ebaixa": p["edu_baixa"] / t, "efem": p["fem"] / t, "ebio": p["bio"] / t}
        for k, s in sér.items():
            anual[k][ano] = np.array([s.get(key, np.nan) * 100 for key in tse], dtype=float)
    for k in ("e60", "ejov", "esup", "ebaixa", "efem", "ebio"):
        anual[k][2026] = anual[k][2022]

    # participação e voto anterior; fatia do 13 no turno
    def fatia(ano):
        v = vot(ano)
        v = v[(v.turno == 2) & (v.cargo == 1) & ~v.votavel.isin(BRANCO_NULO) & (v.uf != "ZZ")]
        tot = v.groupby(["uf", "mun"]).votos.sum()
        a = v[v.votavel == REF].groupby(["uf", "mun"]).votos.sum()
        sh, vt = np.full(len(tse), np.nan), np.zeros(len(tse))
        for k, key in enumerate(tse):
            if key in tot.index and tot[key] > 0:
                sh[k], vt[k] = a.get(key, 0) / tot[key], tot[key]
        return sh, vt
    turnos, partes = [], {}
    for ano in ANOS:
        d = det(ano)
        d = d[(d.turno == 2) & (d.cargo == 1) & (d.uf != "ZZ")].groupby(["uf", "mun"])[["aptos", "comp"]].sum()
        anual["comp"][ano] = np.array([d.comp.get(key, np.nan) / d.aptos.get(key, np.nan) * 100 for key in tse], dtype=float)
        anual["ant"][ano] = fatia(ANTERIOR[ano])[0] * 100

    for ano in ANOS:
        sh, vt = fatia(ano)
        series = {k: (est[k] if k in est else anual[k][ano]) for k, *_ in VARS}
        turnos.append(estima(ano, sh, vt, series, uf, titulo(nomes(ano).get((2, REF)) or nomes(ano).get((1, REF)) or str(REF))))
        partes[f"{ano}-2"] = sh

    # mudança entre eleições: onde o programa cresceu mais, a fatia mudou mais? (compara cada município com ele mesmo, mesmo estado)
    mud = []
    for ano, ant in ((2022, 2018), (2026, 2022)):
        s1, s0 = partes[f"{ano}-2"], partes[f"{ant}-2"]
        v1 = fatia(ano)[1]
        dbf = anual["bf100"][ano] - anual["bf100"][ant]
        ok = np.isfinite(s1) & np.isfinite(s0) & np.isfinite(dbf) & (v1 > 0)
        dsh = (s1 - s0)[ok] * 100
        x, w, g = dbf[ok], v1[ok], np.array(uf)[ok]
        be, se = fe_ols(dsh, x[:, None], g, w)
        q = pd.qcut(pd.Series(x), 5, labels=False, duplicates="drop")
        qs = [{"med": round(float(np.median(x[(q == k).values])), 1), "n": int((q == k).sum()), "d": round(float(np.average(dsh[(q == k).values], weights=w[(q == k).values])), 2)} for k in sorted(q.dropna().unique())]
        mud.append({"id": f"{ano}-2", "de": f"{ant}-2", "n": int(ok.sum()), "corr": round(wcorr(x, dsh, w), 3), "fe": round(float(be[0]) * 10, 2), "fe_ep": round(float(se[0]) * 10, 2),
                    "dbf_med": round(float(np.median(x)), 1), "dsh_med": round(float(np.median(dsh)), 2), "q": qs})
        print("mudança", mud[-1]["id"], {k: v for k, v in mud[-1].items() if k != "q"}, [(a["med"], a["d"]) for a in qs])

    def arr(x, k=1):
        return [None if not np.isfinite(y) else (int(round(y)) if k == 0 else round(float(y), k)) for y in x]
    vars_out, valores = [], {}
    for k, grupo, nome, unid, fmt, cortes, log, fonte in VARS:
        vars_out.append({"k": k, "grupo": grupo, "nome": nome, "unid": unid, "fmt": fmt, "cortes": cortes, "log": log, "fonte": fonte, "anual": k in ANUAIS})
        casas = 0 if fmt in ("rs", "n0") else 1
        valores[k] = {str(a): arr(v, casas) for a, v in anual[k].items() if not (k != "bf100" and k in ANUAIS and a == 2026 and k in ("e60", "ejov", "esup", "ebaixa", "efem", "ebio"))} if k in ANUAIS else arr(est[k], casas)
    out = {"municipios": len(tse), "pib_ano": int(sid.pib_ano.dropna().iloc[0]), "bf": bf_meta, "perfil_2026_usa": 2022, "vars": vars_out, "valores": valores,
           "pt": {k: arr(v * 1000, 0) for k, v in partes.items()}, "turnos": turnos, "mudanca": mud}
    os.makedirs(os.path.join(BASE, "ds"), exist_ok=True)
    with open(os.path.join(BASE, "ds", "correl.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def wcorr(x, y, w):
    mx, my = np.average(x, weights=w), np.average(y, weights=w)
    return float(np.sum(w * (x - mx) * (y - my)) / np.sqrt(np.sum(w * (x - mx) ** 2) * np.sum(w * (y - my) ** 2)))


def fe_ols(y, X, g, w):
    """MQO ponderado com efeito fixo de grupo (UF) por centralização; erro-padrão robusto com agrupamento por UF"""
    df = pd.DataFrame(X, columns=[f"x{i}" for i in range(X.shape[1])]); df["y"] = y; df["g"] = g; df["w"] = w
    for c in [f"x{i}" for i in range(X.shape[1])] + ["y"]:
        df[c] = df[c] - (df[c] * df.w).groupby(df.g).transform("sum") / df.w.groupby(df.g).transform("sum")
    xs = df[[f"x{i}" for i in range(X.shape[1])]].values; yy = df.y.values; ww = df.w.values
    XtWX = xs.T @ (xs * ww[:, None]); b = np.linalg.solve(XtWX, xs.T @ (ww * yy))
    res = yy - xs @ b; meat = np.zeros_like(XtWX)
    for _, idx in df.groupby("g").indices.items():
        s = xs[idx].T @ (ww[idx] * res[idx]); meat += np.outer(s, s)
    inv = np.linalg.inv(XtWX); se = np.sqrt(np.diag(inv @ meat @ inv))
    return b, se


def padroniza(x, w, log):
    z = np.log2(x) if log else x
    m = np.average(z, weights=w)
    sd = np.sqrt(np.average((z - m) ** 2, weights=w))
    return (z - m) / sd


def quintis(x, share, votos):
    q = pd.qcut(pd.Series(x), 5, labels=False, duplicates="drop")
    return [{"med": round(float(np.median(x[(q == k).values])), 1), "n": int((q == k).sum()), "pt": round(float(np.sum(share[(q == k).values] * votos[(q == k).values]) / np.sum(votos[(q == k).values])), 4)} for k in sorted(q.dropna().unique())]


def estima(ano, share, votos, series, uf, nome):
    base = np.isfinite(share) & (votos > 0)
    ef, validas = {}, []
    for k, _g, _n, _u, _f, _c, log, _s in VARS:
        x = series[k]
        ok = base & np.isfinite(x) & ((x > 0) if log else True)
        if ok.sum() < 1000:
            continue
        z = padroniza(x[ok], votos[ok], log)
        c = wcorr(z, share[ok], votos[ok])
        be, se = fe_ols(share[ok], z[:, None], np.array(uf)[ok], votos[ok])
        ef[k] = {"corr": round(c, 3), "fe": round(float(be[0]) * 100, 2), "fe_ep": round(float(se[0]) * 100, 2), "n": int(ok.sum()), "q": quintis(x[ok], share[ok], votos[ok])}
        validas.append(k)
    ok = base.copy()
    for k in validas:
        x = series[k]; ok &= np.isfinite(x) & (x > 0)
    Z = np.column_stack([padroniza(series[k][ok], votos[ok], next(v[6] for v in VARS if v[0] == k)) for k in validas])
    be, se = fe_ols(share[ok], Z, np.array(uf)[ok], votos[ok])
    for i, k in enumerate(validas):
        ef[k]["conj"], ef[k]["conj_ep"] = round(float(be[i]) * 100, 2), round(float(se[i]) * 100, 2)
    r = {"id": f"{ano}-2", "ano": ano, "candidato": nome, "n": int(base.sum()), "n_conj": int(ok.sum()), "efeitos": ef}
    top = sorted(validas, key=lambda k: -abs(ef[k]["corr"]))
    print(r["id"], nome, "n", r["n"], "conj", r["n_conj"])
    for k in top:
        print(f"   {k:7s} corr {ef[k]['corr']:+.2f}  fe {ef[k]['fe']:+6.2f}±{1.96*ef[k]['fe_ep']:.1f}  conj {ef[k]['conj']:+6.2f}±{1.96*ef[k]['conj_ep']:.1f}")
    return r


if __name__ == "__main__":
    main()
