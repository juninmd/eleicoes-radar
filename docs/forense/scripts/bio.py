"""Eleitores sem biometria (Presidente): QT_ELEITORES_BIOMETRIA_NH do Boletim de Urna, por seção.

Definição do TSE (leiame do BU): "quantitativo de eleitores com biometria, mas que não foram habilitados por meio dela".
Ou seja, é quem tinha biometria cadastrada e votou sem passar por ela (leitor falhou, digital não leu, etc.). Eleitor SEM
biometria cadastrada não entra aqui: o BU não separa esse grupo.

  python3 bio.py ingest 2022 1      # baixa os zips do BU (um por UF), grava work/bio/<ano>_<t>_<UF>.pkl e apaga o zip
  python3 bio.py agg                # junta tudo em out/bio.json

Cada UF vira um pickle pequeno; o passo é retomável (UF pronta é pulada). Só lê Presidente (as outras linhas são ignoradas).
"""
import json
import os
import subprocess
import sys
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import BASE, OUT, WORK  # noqa: E402

DIR = os.path.join(WORK, "bio")
RAW = os.path.join(BASE, "raw")
os.makedirs(DIR, exist_ok=True)
# a coluna mudou de nome em 2026 (mesma definição no leiame): QT_ELEITORES_BIOMETRIA_NH até 2022, QT_ELEI_BIOM_SEM_HABILITACAO em 2026
NH_COLS = ("QT_ELEITORES_BIOMETRIA_NH", "QT_ELEI_BIOM_SEM_HABILITACAO")
COLS = {"CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "DS_CARGO_PERGUNTA", "QT_APTOS", "QT_COMPARECIMENTO", "DS_TIPO_URNA", *NH_COLS}
UA = "Mozilla/5.0"


def catalogo(ano):
    out = subprocess.run(["curl", "--max-time", "60", "-s", "-A", UA, f"https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-{ano}-boletim-de-urna"], capture_output=True, check=True).stdout
    return json.loads(out)["result"]["resources"]


def ingest(ano, turno):
    txt = "Primeiro" if turno == 1 else "Segundo"
    rs = [r for r in catalogo(ano) if r["url"].endswith(".zip") and txt.lower() in r["name"].lower() and "boletim de urna" in r["name"].lower()]
    pasta = os.path.join(RAW, f"bu{ano}_{turno}")
    os.makedirs(pasta, exist_ok=True)
    for r in sorted(rs, key=lambda r: r["name"]):
        uf = "ZZ" if r["name"][:2] in ("Ex", "ZZ") else r["name"][:2]
        alvo = os.path.join(DIR, f"{ano}_{turno}_{uf}.pkl")
        if os.path.exists(alvo):
            continue
        zp = os.path.join(pasta, f"{uf}.zip")
        subprocess.run(["curl", "-L", "--fail", "-sS", "-A", UA, "-o", zp, r["url"]], check=True)
        with zipfile.ZipFile(zp) as z:
            nome = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
            parts = []
            with z.open(nome) as f:
                for ch in pd.read_csv(f, sep=";", encoding="latin1", dtype=str, usecols=lambda c: c in COLS, chunksize=400_000):
                    ch = ch[ch.DS_CARGO_PERGUNTA == "Presidente"]
                    if len(ch):
                        parts.append(ch.drop_duplicates(["CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "DS_TIPO_URNA"]))
        os.remove(zp)
        d = pd.concat(parts, ignore_index=True)
        d = d.drop_duplicates(["CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "DS_TIPO_URNA"])
        nh_col = next((c for c in NH_COLS if c in d), None)
        out = pd.DataFrame({
            "uf": uf, "mun": pd.to_numeric(d.CD_MUNICIPIO), "zona": pd.to_numeric(d.NR_ZONA), "secao": pd.to_numeric(d.NR_SECAO),
            "urna": d.DS_TIPO_URNA, "aptos": pd.to_numeric(d.QT_APTOS), "comp": pd.to_numeric(d.QT_COMPARECIMENTO),
            # o arquivo do exterior de 2018 não traz a coluna: fica sem dado (NaN), nunca 0
            "nh": pd.to_numeric(d[nh_col], errors="coerce") if nh_col else np.nan,
        })
        out.to_pickle(alvo)
        print(ano, turno, uf, len(out), int(out.nh.sum()), flush=True)


TODAS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO ZZ".split()  # 27 UFs + exterior: Presidente precisa das 28
BINS = 20  # fatia de eleitores sem biometria por seção: 0 exato + 20 faixas de 5 pontos
MIN_COMP = 20  # seções com menos votantes ficam fora do histograma (a fatia oscila demais)


def carregar(ano, turno):
    fs = sorted(f for f in os.listdir(DIR) if f.startswith(f"{ano}_{turno}_"))
    if not fs:
        return None, []
    d = pd.concat([pd.read_pickle(os.path.join(DIR, f)) for f in fs], ignore_index=True)
    # uma linha por seção: a urna apurada vale mais que uma não apurada
    d.loc[d.nh < 0, "nh"] = np.nan  # -1 é o "sem informação" do arquivo (visto no exterior de 2022), não uma quantidade
    d["ap"] = d.urna.str.upper().str.startswith("APURADA") & ~d.urna.str.upper().str.startswith("NAO")
    d = d.sort_values("ap", ascending=False).drop_duplicates(["uf", "mun", "zona", "secao"])
    return d, sorted(d.uf.unique())


def resumo(d, ano, turno, ufs_esperadas):
    comp, nh = int(d.comp.sum()), int(d.nh.fillna(0).sum())
    ok = d[d.comp >= MIN_COMP]
    pct = (ok.nh.fillna(0) / ok.comp)
    hist = [int((pct == 0).sum())] + [int(((pct > 5 * k / 100) & (pct <= 5 * (k + 1) / 100)).sum()) for k in range(BINS)]
    return {
        "id": f"{ano}-{turno}", "ano": ano, "turno": turno, "rotulo": f"{ano} · {turno}º turno",
        "ufs": len(set(d.uf)), "ufs_faltando": sorted(set(ufs_esperadas) - set(d.uf)),
        "secoes": int(len(d)), "aptos": int(d.aptos.sum()), "comp": comp, "nh": nh, "nh_pct": nh / comp if comp else 0.0,
        "secoes_com_nh": int((d.nh.fillna(0) > 0).sum()), "secoes_sem_dado": int(d.nh.isna().sum()), "nh_maior_que_comp": int((d.nh > d.comp).sum()),
        "mediana_pct": float(pct.median()), "p99_pct": float(pct.quantile(0.99)), "secoes_gt50": int((pct > 0.5).sum()), "hist": hist,
    }


def agregar():
    UFS = None
    turnos, ufs, modelos = [], [], []
    for ano in (2018, 2022, 2026):
        for turno in (1, 2):
            d, tem = carregar(ano, turno)
            if d is None:
                continue
            esperadas = set(TODAS)
            turnos.append(resumo(d, ano, turno, esperadas | set(tem)))
            for uf, g in d.groupby("uf"):
                c, n = int(g.comp.sum()), int(g.nh.fillna(0).sum())
                ufs.append({"id": f"{ano}-{turno}", "uf": uf, "secoes": int(len(g)), "comp": c, "nh": n, "pct": (n / c if c else 0.0) + 0.0})
            det = os.path.join(WORK, f"det_{ano}.pkl")
            if os.path.exists(det):
                dd = pd.read_pickle(det)
                dd = dd[(dd.turno == turno) & (dd.cargo == 1)][["uf", "mun", "zona", "secao", "ds_modelo"]].drop_duplicates(["uf", "mun", "zona", "secao"])
                j = d.merge(dd, on=["uf", "mun", "zona", "secao"], how="left")
                for m, g in j.groupby(j.ds_modelo.fillna("não informado").replace("#NULO#", "não informado")):
                    c, n = int(g.comp.sum()), int(g.nh.fillna(0).sum())
                    if len(g) >= 100:
                        modelos.append({"id": f"{ano}-{turno}", "modelo": m, "secoes": int(len(g)), "comp": c, "nh": n, "pct": (n / c if c else 0.0) + 0.0})
    out = {"turnos": turnos, "uf": ufs, "modelo": modelos}
    os.makedirs(os.path.join(BASE, "ds"), exist_ok=True)
    with open(os.path.join(BASE, "ds", "biometria.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, allow_nan=False)
    for t in turnos:
        print(t["id"], "UFs", t["ufs"], "faltam", t["ufs_faltando"], "secoes", t["secoes"], "NH", t["nh"], f"{t['nh_pct']*100:.2f}% do comparecimento")


if __name__ == "__main__":
    if sys.argv[1] == "ingest":
        ingest(int(sys.argv[2]), int(sys.argv[3]))
    elif sys.argv[1] == "agg":
        agregar()
