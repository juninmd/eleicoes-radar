"""Bolsa Família (e Auxílio Brasil) por município no mês anterior a cada eleição, PIB e população do IBGE.

Fontes (sem chave):
  CGU/Portal da Transparência: https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/<pasta>/<AAAAMM>_<arquivo>.zip
    2018-09 bolsa-familia-pagamentos/201809_BolsaFamilia_Pagamentos.zip   (Bolsa Família)
    2022-09 auxilio-brasil-saques/202209_AuxilioBrasil.zip                (Auxílio Brasil, por saque no mês de competência)
    2026-09 novo-bolsa-familia/202609_NovoBolsaFamilia.zip                (Novo Bolsa Família)
  Os arquivos têm UMA LINHA POR PESSOA (CPF mascarado, NIS, nome): aqui só se conta, por município, quantos NIS distintos receberam
  no mês e o valor; nenhum dado individual sai deste script.
  IBGE SIDRA: tabela 5938 (PIB dos Municípios, variável 37, mil R$ correntes, último ano) e 4714 (população residente, Censo 2022).

  python3 renda_bf.py bf <ano>     # baixa o zip, agrega por (UF, código SIAFI) e apaga o zip -> work/bf_<ano>.pkl
  python3 renda_bf.py sidra        # PIB e população -> work/sidra.pkl
"""
import json
import os
import subprocess
import sys
import unicodedata
import urllib.request
import zipfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import BASE, WORK  # noqa: E402

B = "https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/"
ARQ = {
    2018: ("bolsa-familia-pagamentos/201809_BolsaFamilia_Pagamentos.zip", "Bolsa Família", "201809"),
    2022: ("auxilio-brasil-saques/202209_AuxilioBrasil.zip", "Auxílio Brasil", "202209"),
    2026: ("novo-bolsa-familia/202609_NovoBolsaFamilia.zip", "Novo Bolsa Família", "202609"),
}


def baixar_agregar(ano):
    url, programa, mes = ARQ[ano]
    pasta = os.path.join(BASE, "raw", f"bf{ano}")
    os.makedirs(pasta, exist_ok=True)
    zp = os.path.join(pasta, "bf.zip")
    if not os.path.exists(zp):
        subprocess.run(["curl", "-L", "--fail", "-sS", "-A", "Mozilla/5.0", "-o", zp, B + url], check=True)
    parts = []
    with zipfile.ZipFile(zp) as z:
        nome = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
        with z.open(nome) as f:
            for ch in pd.read_csv(f, sep=";", encoding="latin1", dtype=str, usecols=["UF", "CÓDIGO MUNICÍPIO SIAFI", "NOME MUNICÍPIO", "NIS FAVORECIDO", "VALOR PARCELA"], chunksize=2_000_000):
                ch.columns = ["uf", "siafi", "nome", "nis", "valor"]
                ch["nis"] = pd.to_numeric(ch.nis, errors="coerce")
                ch["valor"] = pd.to_numeric(ch.valor.str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce")
                parts.append(ch.dropna(subset=["nis"]))
    d = pd.concat(parts, ignore_index=True)
    os.remove(zp)
    linhas = len(d)
    g = d.groupby(["uf", "siafi", "nome"]).agg(pessoas=("nis", "nunique"), valor=("valor", "sum"), linhas=("nis", "size")).reset_index()
    g["programa"], g["mes"] = programa, mes
    g.to_pickle(os.path.join(WORK, f"bf_{ano}.pkl"))
    print(ano, programa, mes, "linhas", linhas, "municípios", len(g), "pessoas (soma)", int(g.pessoas.sum()), "R$", int(g.valor.sum()), flush=True)


BPC = {2022: "bpc/202209_BPC.zip", 2026: "bpc/202609_BPC.zip"}  # 2018 (201809_BPC.zip) dá 403


def bpc(ano):
    """Benefício de Prestação Continuada: benefícios distintos por município no mês. O arquivo traz também CPF e nome do beneficiário e do representante
    legal; só se conta. Parte das linhas (titulares menores de 16 anos) vem sem município: a cobertura é impressa e vale como limite."""
    pasta = os.path.join(BASE, "raw", f"bpc{ano}")
    os.makedirs(pasta, exist_ok=True)
    zp = os.path.join(pasta, "bpc.zip")
    if not os.path.exists(zp):
        subprocess.run(["curl", "-L", "--fail", "-sS", "-A", "Mozilla/5.0", "-o", zp, B + BPC[ano]], check=True)
    parts = []
    with zipfile.ZipFile(zp) as z:
        nome = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
        with z.open(nome) as f:
            for ch in pd.read_csv(f, sep=";", encoding="latin1", dtype=str, usecols=["UF", "CÓDIGO MUNICÍPIO SIAFI", "NOME MUNICÍPIO", "NÚMERO BENEFÍCIO"], chunksize=2_000_000):
                ch.columns = ["uf", "siafi", "nome", "benef"]
                parts.append(ch)
    d = pd.concat(parts, ignore_index=True)
    os.remove(zp)
    total = d.benef.nunique()
    d = d[d.uf.notna() & d.nome.notna()]
    g = d.groupby(["uf", "siafi", "nome"]).agg(pessoas=("benef", "nunique")).reset_index()
    g["programa"], g["mes"] = "BPC", str(ano) + "09"
    g.to_pickle(os.path.join(WORK, f"bpc_{ano}.pkl"))
    print(ano, "BPC benefícios", total, "com município", int(g.pessoas.sum()), f"({g.pessoas.sum() / total:.1%})", "municípios", len(g), flush=True)


def sidra():
    def get(path):
        r = urllib.request.Request("https://apisidra.ibge.gov.br/values" + path, headers={"User-Agent": "Mozilla/5.0"})
        return json.load(urllib.request.urlopen(r, timeout=180))
    pib = get("/t/5938/n6/all/v/37/p/last%201")
    pop = get("/t/4714/n6/all/v/93/p/2022")
    out = {}
    for r in pib[1:]:
        out.setdefault(r["D1C"], {})["pib_mil"] = float(r["V"]) if r["V"] not in ("-", "...", "X", "..") else np.nan
        out[r["D1C"]]["pib_ano"] = r["D3C"]
    for r in pop[1:]:
        out.setdefault(r["D1C"], {})["pop"] = float(r["V"]) if r["V"] not in ("-", "...", "X", "..") else np.nan
    df = pd.DataFrame.from_dict(out, orient="index").rename_axis("ibge").reset_index()
    df.to_pickle(os.path.join(WORK, "sidra.pkl"))
    print("sidra", len(df), "PIB ano", df.pib_ano.dropna().unique()[:3], "com PIB", int(df.pib_mil.notna().sum()), "com pop", int(df["pop"].notna().sum()))


def sidra2():
    """Mais variáveis municipais (sem chave): composição do PIB (5938) e Censo 2022 (renda, alfabetização, cor ou raça, situação urbana)."""
    def get(path):
        r = urllib.request.Request("https://apisidra.ibge.gov.br/values" + path, headers={"User-Agent": "Mozilla/5.0"})
        return json.load(urllib.request.urlopen(r, timeout=300))[1:]
    def num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return np.nan
    out = {}
    def put(rows, nome, chave=lambda r: r["D1C"], val=lambda r: num(r["V"])):
        for r in rows:
            out.setdefault(r["D1C"], {})[nome] = val(r)
    vab = {r: get(f"/t/5938/n6/all/v/{r}/p/2021") for r in (498, 513, 517, 6575, 525)}
    for v, nome in ((498, "vab"), (513, "vab_agro"), (517, "vab_ind"), (6575, "vab_serv"), (525, "vab_adm")):
        put(vab[v], nome)
    put(get("/t/10295/n6/all/p/last/c2/6794/v/13534"), "renda_med")
    put(get("/t/9543/n6/all/p/last/h/n"), "alfab")
    cor = get("/t/9605/n6/all/p/last/c86/all")
    for r in cor:
        out.setdefault(r["D1C"], {}).setdefault("cor_" + r["D3C"], num(r["V"]))
    for r in get("/t/6805/n6/all/p/last/c11558/46292,46290"):
        out.setdefault(r["D1C"], {})["esg_" + r["D3C"]] = num(r["V"])
    for r in get("/t/6892/n6/all/p/last/c67/10972,2520"):
        out.setdefault(r["D1C"], {})["lixo_" + r["D3C"]] = num(r["V"])
    urb = get("/t/9923/n6/all/p/last/c1/all")
    for r in urb:
        out.setdefault(r["D1C"], {}).setdefault("urb_" + r["D3C"], num(r["V"]))
    df = pd.DataFrame.from_dict(out, orient="index").rename_axis("ibge").reset_index()
    df.to_pickle(os.path.join(WORK, "sidra2.pkl"))
    print("sidra2", len(df), df.columns.tolist())


def sidra3():
    """Mais variáveis: emprego e remuneração formais (CEMPRE, tabela 1685, 2021), migração recente (10158) e anos de estudo (10062), Censo 2022."""
    def get(path):
        r = urllib.request.Request("https://apisidra.ibge.gov.br/values" + path, headers={"User-Agent": "Mozilla/5.0"})
        return json.load(urllib.request.urlopen(r, timeout=300))[1:]
    def num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return np.nan
    out = {}
    for v, nome in ((707, "po_total"), (708, "po_assal"), (662, "remun")):
        for r in get(f"/t/1685/n6/all/v/{v}/p/2021"):
            out.setdefault(r["D1C"], {})[nome] = num(r["V"])
    for r in get("/t/10158/n6/all/p/last/h/n"):
        out.setdefault(r["D1C"], {})["migr"] = num(r["V"])
    for r in get("/t/10062/n6/all/p/last/h/n"):
        out.setdefault(r["D1C"], {})["estudo"] = num(r["V"])
    df = pd.DataFrame.from_dict(out, orient="index").rename_axis("ibge").reset_index()
    df.to_pickle(os.path.join(WORK, "sidra3.pkl"))
    print("sidra3", len(df), df.columns.tolist(), df.drop(columns="ibge").notna().sum().to_dict())


SIM = "https://diaad.s3.sa-east-1.amazonaws.com/sim/Mortalidade_Geral_{ano}.csv"


def sim(ano):
    """Homicídios (CID-10 X85 a Y09, agressões) por município de residência no SIM. O arquivo é por óbito, com sexo, idade e cor; aqui só se
    conta por município (CODMUNRES, 6 dígitos) e a causa básica; nada individual sai. O bucket só abre 2015 a 2020 (2021 em diante dá 403)."""
    pasta = os.path.join(BASE, "raw", f"sim{ano}")
    os.makedirs(pasta, exist_ok=True)
    arq = os.path.join(pasta, "sim.csv")
    if not os.path.exists(arq):
        subprocess.run(["curl", "-L", "--fail", "-sS", "-A", "Mozilla/5.0", "-o", arq, SIM.format(ano=ano)], check=True)
    cont, total = {}, 0
    for ch in pd.read_csv(arq, sep=";", encoding="latin1", dtype=str, usecols=["CODMUNRES", "CAUSABAS"], chunksize=1_000_000):
        total += len(ch)
        cb = ch.CAUSABAS.fillna("")
        h = ch[cb.str.match(r"^(X8[5-9]|X9\d|Y0\d)")]
        for k, v in h.CODMUNRES.value_counts().items():
            cont[k] = cont.get(k, 0) + int(v)
    os.remove(arq)
    pd.Series(cont, name="homicidios").rename_axis("cod6").reset_index().to_pickle(os.path.join(WORK, f"sim_{ano}.pkl"))
    print(ano, "óbitos", total, "homicídios", sum(cont.values()), "municípios", len(cont), flush=True)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper()
    return " ".join(s.replace("'", " ").replace("-", " ").split())


if __name__ == "__main__":
    if sys.argv[1] == "bf":
        baixar_agregar(int(sys.argv[2]))
    elif sys.argv[1] == "sidra":
        sidra()
    elif sys.argv[1] == "bpc":
        bpc(int(sys.argv[2]))
    elif sys.argv[1] == "sidra3":
        sidra3()
    elif sys.argv[1] == "sim":
        sim(int(sys.argv[2]))
    elif sys.argv[1] == "sidra2":
        sidra2()
