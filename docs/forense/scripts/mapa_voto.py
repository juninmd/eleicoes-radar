"""Candidato mais votado por município (Presidente, 2018, 2022 e 2026), alinhado linha a linha ao mapa de municípios
(ds/eleitorado_mapa, que build_ds.py monta de elpop_2022 + centroides). Saída: ds/mapa_voto.json.

Cada turno traz os candidatos (na ordem dos mais votados do país) e, por município do mapa, [índice do mais votado, fatia dele,
fatia do 2º, índice do 2º], com fatia = votos nominais do candidato / votos nominais do município (brancos e nulos fora), em décimos
de ponto percentual. Município sem votos no turno (arquivo ainda não publicado) vira null. Não classifica candidato nem partido."""
import json
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import BASE, WORK, nomes, vot  # noqa: E402

TURNOS = [(2018, 1), (2018, 2), (2022, 1), (2022, 2), (2026, 1), (2026, 2)]
BRANCO_NULO = (95, 96, 97)
TOP = 6  # candidatos com cor própria; o resto soma em "outros" no cliente


def ordem_do_mapa():
    cen = json.load(open(os.path.join(WORK, "centroids.json")))
    e22 = pd.read_pickle(os.path.join(WORK, "elpop_2022.pkl"))
    e22 = e22[e22.ibge.notna()]
    return [(t.uf, t.mun) for t in e22.itertuples() if cen.get(str(t.ibge))]


def titulo(s):
    peq = {"DA", "DE", "DO", "DAS", "DOS", "E"}
    return " ".join(p.lower() if p in peq else p.capitalize() for p in str(s).split())


def main():
    ordem = ordem_do_mapa()
    out = {"municipios": len(ordem), "turnos": []}
    for ano, turno in TURNOS:
        v = vot(ano)
        v = v[(v.turno == turno) & (v.cargo == 1) & ~v.votavel.isin(BRANCO_NULO) & (v.uf != "ZZ")]
        if v.empty:
            continue
        nac = v.groupby("votavel").votos.sum().sort_values(ascending=False)
        total = float(nac.sum())
        nm = nomes(ano)
        cands = [{"n": int(n), "nome": titulo(nm.get((turno, int(n))) or nm.get((1, int(n))) or str(n)), "pct": round(float(votos) / total * 100, 2), "votos": int(votos)} for n, votos in nac.head(TOP).items()]
        idx = {c["n"]: i for i, c in enumerate(cands)}
        mun = v.groupby(["uf", "mun", "votavel"]).votos.sum().reset_index()
        por = {k: g for k, g in mun.groupby(["uf", "mun"])}
        rows, ganhos = [], [0] * (TOP + 1)
        for k in ordem:
            g = por.get(k)
            tot = float(g.votos.sum()) if g is not None else 0.0
            if g is None or tot <= 0:
                rows.append(None)
                continue
            g = g.sort_values("votos", ascending=False)
            a, b = g.iloc[0], g.iloc[1] if len(g) > 1 else None
            ia = idx.get(int(a.votavel), TOP)
            ib = idx.get(int(b.votavel), TOP) if b is not None else TOP
            ganhos[ia] += 1
            rows.append([ia, round(float(a.votos) / tot * 1000), round(float(b.votos) / tot * 1000) if b is not None else 0, ib])
        out["turnos"].append({"id": f"{ano}-{turno}", "ano": ano, "turno": turno, "rotulo": f"{ano} · {turno}º turno", "cands": cands,
                              "outros_pct": round(max(0.0, 100 - sum(c["pct"] for c in cands)), 2), "ganhos": ganhos, "sem_dado": sum(r is None for r in rows), "rows": rows})
        print(ano, turno, "municípios sem dado:", out["turnos"][-1]["sem_dado"], "ganhos:", ganhos, [c["nome"] for c in cands[:3]])
    os.makedirs(os.path.join(BASE, "ds"), exist_ok=True)
    with open(os.path.join(BASE, "ds", "mapa_voto.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


if __name__ == "__main__":
    main()
