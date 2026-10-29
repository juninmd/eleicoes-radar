"""Testes de aritmetica e integridade (B-1): impossiveis ou nao fecham."""
import sys, json
sys.path.insert(0, ".")
from lib import *

res = {}
for ano in ANOS:
    for t in (1, 2):
        m = contest(ano, t)
        cc = cand_cols(m)
        both = m[m["_merge"] == "both"].copy()
        for c in ["aptos", "comp", "abst", "nom", "bran", "nul", "leg", "anul"]:
            both[c] = both[c].fillna(0)
        cand = both[cc].sum(axis=1)
        r = {}
        r["secoes"] = int(len(both))
        r["so_detalhe"] = int((m["_merge"] == "left_only").sum())
        r["so_votos"] = int((m["_merge"] == "right_only").sum())
        r["aptos"] = int(both.aptos.sum())
        r["comp"] = int(both.comp.sum())
        r["comp_gt_aptos"] = int((both.comp > both.aptos).sum())
        r["comp_gt_aptos_excesso"] = int((both.comp - both.aptos).clip(lower=0).sum())
        # fechamento do detalhe
        dif = both.comp - (both.nom + both.bran + both.nul + both.leg + both.anul)
        r["detalhe_nao_fecha"] = int((dif != 0).sum())
        r["detalhe_nao_fecha_abs"] = int(dif.abs().sum())
        r["abst_nao_fecha"] = int((both.abst != both.aptos - both.comp).sum())
        # votos por votavel x detalhe
        r["votos_vs_nom"] = int((cand != both.nom).sum())
        r["votos_vs_nom_abs"] = int((cand - both.nom).abs().sum())
        b95 = both.get("x95", pd.Series(0, index=both.index)).fillna(0)
        b96 = both.get("x96", pd.Series(0, index=both.index)).fillna(0)
        r["branco_vs_detalhe"] = int((b95 != both.bran).sum())
        r["nulo_vs_detalhe"] = int((b96 != both.nul).sum())
        r["comp_zero"] = int(((both.comp == 0) & (both.aptos > 0)).sum())
        r["aptos_zero_com_voto"] = int(((both.aptos == 0) & (both.comp > 0)).sum())
        r["aptos_gt_500"] = int((both.aptos > 500).sum())
        r["aptos_max"] = int(both.aptos.max())
        r["aptos_p99"] = float(both.aptos.quantile(0.99))
        res[f"{ano}-{t}"] = r
        print(ano, t, {k: v for k, v in r.items() if k in ("secoes", "comp_gt_aptos", "detalhe_nao_fecha", "abst_nao_fecha", "votos_vs_nom", "branco_vs_detalhe", "nulo_vs_detalhe", "comp_zero", "so_detalhe", "so_votos", "aptos_gt_500")}, flush=True)
json.dump(res, open(os.path.join(OUT, "arith.json"), "w"), indent=1)
