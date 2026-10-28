import os
import numpy as np
import pandas as pd

BASE = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
WORK = os.path.join(BASE, "work")
OUT = os.path.join(BASE, "out")
os.makedirs(OUT, exist_ok=True)

ANOS = [2002, 2006, 2010, 2014, 2018, 2022, 2026]
_cache = {}


def det(ano):
    k = ("det", ano)
    if k not in _cache:
        _cache[k] = pd.read_pickle(os.path.join(WORK, f"det_{ano}.pkl"))
    return _cache[k]


def vot(ano):
    k = ("vot", ano)
    if k not in _cache:
        _cache[k] = pd.read_pickle(os.path.join(WORK, f"vot_{ano}.pkl"))
    return _cache[k]


def nomes(ano):
    return pd.read_pickle(os.path.join(WORK, f"nomes_{ano}.pkl"))


KEY = ["uf", "mun", "zona", "secao"]


def contest(ano, turno, cargo=1):
    """Tabela larga por secao: detalhe + votos por candidato (colunas c<nr>) + 95/96 (b95/b96)."""
    d = det(ano)
    d = d[(d.turno == turno) & (d.cargo == cargo)].copy()
    v = vot(ano)
    v = v[(v.turno == turno) & (v.cargo == cargo)]
    w = v.pivot_table(index=KEY, columns="votavel", values="votos", aggfunc="sum", fill_value=0)
    w.columns = [f"c{int(c)}" if c < 90 else f"x{int(c)}" for c in w.columns]
    w = w.reset_index()
    d["uf"] = d["uf"].astype(str)
    w["uf"] = w["uf"].astype(str)
    m = d.merge(w, on=KEY, how="outer", indicator=True)
    return m


def cand_cols(m):
    return [c for c in m.columns if c.startswith("c") and c[1:].isdigit()]
