import json, os, glob
B = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
rows = []
for f in sorted(glob.glob(os.path.join(B, "out", "gov_*.json"))):
    for r in json.load(open(f)):
        fp = r.get("fp") or {}
        d = r.get("disp_A") or {}
        g = r.get("dig_A") or {}
        z = r.get("zero_inv") or {}
        n = fp.get("n") or 0
        esp = (fp.get("t90", 0) * fp.get("A90", 0) / n) if n else 0
        rows.append({
            "id": f'{r["ano"]}|{r["uf"]}|{r["turno"]}', "ano": r["ano"], "turno": r["turno"], "uf": r["uf"],
            "a_nome": r["A"]["nome"].title(), "b_nome": r["B"]["nome"].title(), "secoes": r["secoes"], "validos": r["valid"],
            "share_a": r["share_A"], "margem": r["margem"], "margem_pct": r["margem_pct"],
            "arit": r["comp_gt_aptos"] + r["nao_fecha"] + r["votos_vs_nom"],
            "t95": fp.get("t95"), "t95_exp": fp.get("t95_exp"), "corner": fp.get("corner"), "corner_esp": round(esp, 2), "corner_lift": round(fp.get("corner", 0) / esp, 2) if esp > 0 else None,
            "corr_t_a": fp.get("corr"), "corner_top": "; ".join(f"{t['mun'].title()} ({t['n']})" for t in fp.get("corner_top", [])) or None, "corner_indig": fp.get("corner_indig"), "corner_nl": fp.get("corner_nl"), "disp_locais": d.get("locais"), "disp_ratio": d.get("ratio"), "disp_low001": d.get("low001"), "disp_p": d.get("p_excesso"),
            "dig_p": g.get("p"), "dig_v": g.get("V"), "dig_vsim": g.get("V_sim"), "zero_obs": z.get("obs"), "zero_esp": z.get("esp"), "zero_p": z.get("p"),
        })
import math
def clean(o):
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)): return None
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list): return [clean(v) for v in o]
    return o
json.dump(clean(rows), open(os.path.join(B, "ds", "governadores.json"), "w"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
print(len(rows), os.path.getsize(os.path.join(B, "ds", "governadores.json")) // 1024, "KB")
