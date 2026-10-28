"""Compila as saidas da analise em datasets planos (linhas JSON) para o painel."""
import json, os, math, sys
import numpy as np, pandas as pd
B = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
O = os.path.join(B, "out"); W = os.path.join(B, "work"); D = os.path.join(B, "ds")
os.makedirs(D, exist_ok=True)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ANOS = [2002, 2006, 2010, 2014, 2018, 2022, 2026]
NM = pd.read_pickle(os.path.join(W, "munnames.pkl"))
NM_MAP = {(r.uf, int(r.mun)): r.nome for r in NM.itertuples()}


def clean(o):
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
        return None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


def j(name, rows):
    json.dump(clean(rows), open(os.path.join(D, name + ".json"), "w"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(name, len(rows), os.path.getsize(os.path.join(D, name + ".json")) // 1024, "KB")


def r(x, n=5):
    return None if x is None else round(float(x), n)


def mean(v):
    return float(np.mean(v))


# ---------------------------------------------------------------- eleicoes (uma linha por turno)
arith = json.load(open(os.path.join(O, "arith.json")))
rows, imp, comp_h, dig, ufd, conf, subd = [], [], [], [], [], [], []
for ano in ANOS:
    for t in (1, 2):
        c = json.load(open(os.path.join(O, f"c_{ano}_{t}.json")))
        a = arith[f"{ano}-{t}"]
        id_ = f"{ano}-{t}"
        fp, dA, dg, oa, ob = c["fingerprint"], c["disp_A"], c["digitos"], c["outliers_A"], c["outliers_B"]
        dup = c["duplicatas"]
        sim_dup = mean(dup["secoes_em_duplicata_nacional_simulado"])
        row = {
            "id": id_, "ano": ano, "turno": t, "rotulo": f"{ano} · {t}º turno",
            "a_nome": c["A"]["nome"].title(), "b_nome": c["B"]["nome"].title(), "a_votos": c["A"]["votos"], "b_votos": c["B"]["votos"],
            "margem": c["margem"], "secoes": a["secoes"], "aptos": a["aptos"], "comp": a["comp"], "validos": c["valid"],
            # aritmetica
            "comp_gt_aptos": a["comp_gt_aptos"], "comp_excesso": a["comp_gt_aptos_excesso"], "detalhe_nao_fecha": a["detalhe_nao_fecha"],
            "abst_nao_fecha": a["abst_nao_fecha"], "votos_vs_nom": a["votos_vs_nom"], "branco_vs_det": a["branco_vs_detalhe"], "nulo_vs_det": a["nulo_vs_detalhe"],
            "so_votos": a["so_votos"], "so_detalhe": a["so_detalhe"], "comp_zero": a["comp_zero"],
            # comparecimento
            "t95": r(fp["t_ge_95"], 6), "t99": r(fp["t_ge_99"], 6), "corner90": r(fp["A_ge_90_t_ge_90"], 6), "corr_t_a": r(fp["corr_turnout_A"], 4), "turnout_medio": r(fp["turnout_mean"], 4),
            # dispersao
            "disp_locais": dA["locais"], "disp_ratio": r(dA["ratio_mediana"], 3), "disp_low001": dA["low_0.001"], "disp_low001_esp": r(dA["low_0.001_esperado"], 1),
            "disp_low01": dA["low_0.01"], "disp_low01_esp": r(dA["low_0.01_esperado"], 1), "disp_bh": dA["bh_low_5pct"], "disp_high001": dA["high_0.001"],
            # digitos
            "dig_mad": r(dg["A"]["last_mad"], 6), "dig_mad_sim": r(mean(dg["bench_A"]["sim_last_mad"]), 6), "dig_V": r(dg["A"]["last_cramerV"], 5), "dig_n": dg["A"]["n"],
            "dig2_mad": r(dg["A"]["sec_mad"], 5), "dig2_mad_sim": r(mean(dg["bench_A"]["sim_sec_mad"]), 5), "dig05": r(dg["A"]["last_05"], 5),
            "digcomp_mad": r(dg["comp"]["last_mad"], 6),
            # zeros
            "zero_obs": c["zero_inv"]["obs_zero"], "zero_esp": r(c["zero_inv"]["esperado_zero"], 1), "zero_n": c["zero_inv"]["n"],
            # duplicatas
            "dup_obs": dup["secoes_em_duplicata_nacional"], "dup_sim": r(sim_dup, 1), "dup_ge150": dup["secoes_comp_ge_150_duplicadas"],
            "dup_mun": dup["grupos_duplicados_mesmo_municipio"],
            # outliers
            "out_testadas": oa["testadas"], "out_alto": oa["z_gt"], "out_baixo": oa["z_lt"], "out_sim": r(mean(oa["sim_abs_gt"]), 1), "out_normal": r(oa["normal_esperado"], 2),
            "out_exc_pos": oa["z_exc_pos"], "out_exc_neg": oa["z_exc_neg"], "out_z8": oa["|z|>8"], "outB_alto": ob["z_gt"], "outB_baixo": ob["z_lt"],
            # monotonas
            "mono_obs": c["monotone"]["obs"], "mono_esp": r(c["monotone"]["esperado"], 1),
            # percentuais inteiros
            "int_obs": r(c["intpct"]["share_A"]["obs"], 6), "int_sim": r(mean(c["intpct"]["share_A"]["sim"]), 6),
            "intt_obs": r(c["intpct"]["turnout"]["obs"], 6), "intt_sim": r(mean(c["intpct"]["turnout"]["sim"]), 6),
        }
        row["s_arit"] = int(any(row[k] > 0 for k in ("comp_gt_aptos", "detalhe_nao_fecha", "abst_nao_fecha", "votos_vs_nom", "branco_vs_det", "nulo_vs_det")))
        row["s_comp"] = int(row["t95"] > 0.01)
        row["s_imp"] = int(row["corner90"] > 0.005)
        row["s_disp"] = int(row["disp_bh"] > 0 or row["disp_low001"] > 2 * row["disp_low001_esp"] + 5)
        row["s_dig"] = int(row["dig_mad"] > 1.5 * row["dig_mad_sim"] and row["dig_mad"] - row["dig_mad_sim"] > 0.0005)
        row["s_int"] = int(row["int_obs"] > 1.1 * row["int_sim"] or row["intt_obs"] > 1.1 * row["intt_sim"])
        row["s_zero"] = int(row["zero_obs"] > 2 * row["zero_esp"] and row["zero_obs"] - row["zero_esp"] > 10)
        row["s_dup"] = int(row["dup_obs"] > 1.15 * row["dup_sim"] + 20)
        row["s_out"] = 2
        row["s_mono"] = 2
        rows.append(row)
        # impressao digital (A)
        H = np.array(fp["hist2d_A"])
        for i in range(40):
            for jj in range(40):
                if H[i, jj] > 0:
                    imp.append({"id": id_, "x": i, "y": jj, "n": int(H[i, jj])})
        for k, n in enumerate(fp["turnout_hist"]):
            comp_h.append({"id": id_, "bin": k, "n": n})
        for ser in ("A", "B", "comp", "bran", "nul"):
            for d_, f in enumerate(dg[ser]["last_freq"]):
                dig.append({"id": id_, "serie": ser, "d": d_, "freq": f})
        for uf, v in c["disp_por_uf"].items():
            ufd.append({"id": id_, "uf": uf, "locais": v["locais"], "ratio": v["ratio_med"], "low001": v["low001"]})
        for k, o in enumerate(c["outliers_top"]):
            conf.append({"id": id_, "rank": k + 1, "uf": o["uf"], "mun": o["mun"].title(), "zona": o["zona"], "secao": o["secao"], "local": o["local"],
                         "nm_local": o.get("nm_local"), "tag": o.get("tag"), "aptos": o["aptos"], "valid": o["valid"], "z": o["z"], "shareA": o["shareA"]})
        for k, o in enumerate(c["disp_menores"][:5]):
            subd.append({"id": id_, "rank": k + 1, "uf": o["uf"], "mun": o["mun"].title(), "zona": o["zona"], "local": o["local"], "k": o["k"], "ratio": o["ratio"], "p": o["p"]})
j("eleicoes", rows); j("impressao", imp); j("comparecimento", comp_h); j("digitos", dig); j("uf_dispersao", ufd); j("para_conferir", conf); j("subdispersao", subd)

# secao 2002 com comparecimento > aptos (unico caso aritmetico)
NMm = NM_MAP
j("aritmetica_caso", [{"id": "2002-2", "uf": "PA", "mun": NMm.get(("PA", 4332), "mun 4332").title(), "zona": 13, "secao": 69, "aptos": 386, "comp": 536, "nominais": 524, "brancos": 2, "nulos": 10,
                       "a_votos": 237, "b_votos": 287, "comp_turno1": 292}])

# ---------------------------------------------------------------- entre turnos
et = json.load(open(os.path.join(O, "entre_turnos.json")))
rows = []
for ano, v in et.items():
    rows.append({"ano": int(ano), "secoes": v["secoes"], "testadas": v["testadas"], "z4": v["|z|>4"], "z4_normal": r(v["normal_4"], 1), "z5": v["|z|>5"], "z5_normal": r(v["normal_5"], 2),
                 "z6": v["|z|>6"], "curtose": r(v["curtose_excesso"], 3), "beta10": v["beta_dlogodds_por_10pp_comparecimento"], "r_mun": v["r_dentro_municipio"],
                 "dt_media": v["dt_media"], "phi": v["phi"]})
j("entre_turnos", rows)
# top secoes
rows = []
for ano, v in et.items():
    for k, t in enumerate(v["_top"][:5]):
        rows.append({"ano": int(ano), "rank": k + 1, "uf": t["uf"], "mun": t["mun"].title(), "zona": t["zona"], "secao": t["secao"], "a1": t["a1"], "b1": t["b1"], "a2": t["a2"], "b2": t["b2"], "z": t["z"]})
j("entre_turnos_top", rows)

# ---------------------------------------------------------------- eleitorado x populacao
el = json.load(open(os.path.join(O, "eleitorado.json")))
e2 = json.load(open(os.path.join(O, "elpop2.json")))
rows = []
for y, o in el["populacao"].items():
    rows.append({"ano": int(y), "municipios": o["casados"], "aptos": o["aptos_total"], "pop16": o["pop16_total"], "razao_nacional": o["razao_nacional"], "gt1": o["gt_1"], "gt105": o["gt_1.05"], "gt110": o["gt_1.10"],
                 "q01": o["q"]["0.01"], "q05": o["q"]["0.05"], "mediana": o["q"]["0.5"], "q95": o["q"]["0.95"], "q99": o["q"]["0.99"]})
j("eleitorado_resumo", rows)
rows = []
for y, o in el["populacao"].items():
    for k, t in enumerate(o["top"]):
        rows.append({"ano": int(y), "rank": k + 1, "uf": t["uf"], "mun": t["mun"].title(), "aptos": t["aptos"], "pop16": t["pop16"], "razao": t["razao"]})
j("eleitorado_top", rows)
rows = []
for y, o in el["populacao"].items():
    for uf, t in o["por_uf"].items():
        rows.append({"ano": int(y), "uf": uf, "razao": t["razao"], "gt1": t["gt1"], "n": t["n"]})
j("eleitorado_uf", rows)
j("eleitorado_porte", [{"porte": k, "n": v["n"], "mediana": v["mediana"], "p_gt1": v["p_gt1"]} for k, v in e2["por_porte"].items()])
j("eleitorado_persistencia", [{"n_comum": e2["n_comum"], "corr_log": e2["corr_log"], "gt1_2010": e2["gt1_2010"], "gt1_2022": e2["gt1_2022"], "gt1_ambos": e2["gt1_ambos"], "gt13_2022": e2["gt13_2022"], "gt13_ambos": e2["gt13_ambos"]}])
rows = []
for x in e2["razao_x_voto"]:
    for q in x["quintis"]:
        rows.append({"id": f'{x["ano"]}-{x["turno"]}', "ano": x["ano"], "turno": x["turno"], "q": q["q"], "razao_med": q["ratio_med"], "share_a": q["shareA"], "n": q["n"],
                     "corr_mun": x["corr_municipios"], "corr_uf": x["corr_dentro_uf"]})
j("eleitorado_voto", rows)
rows = []
for k, v in el["crescimento"].items():
    rows.append({"periodo": k, "municipios": v["municipios"], "crescimento": v["crescimento_total"], "z_alto": v["z_gt_6"], "z_baixo": v["z_lt_m6"]})
j("crescimento", rows)
rows = []
for k, v in el["crescimento"].items():
    for i, t in enumerate(v["top"][:4]):
        rows.append({"periodo": k, "rank": i + 1, "uf": t["uf"], "mun": t["mun"].title(), "de": t["de"], "para": t["para"], "cresc": t["cresc"], "z": t["z"]})
j("crescimento_top", rows)

# mapa de municipios
cen = json.load(open(os.path.join(W, "centroids.json")))
proj = json.load(open(os.path.join(REPO, "web", "mapa-uf.json")))
P = proj["proj"]; vb = proj["viewBox"]
e22 = pd.read_pickle(os.path.join(W, "elpop_2022.pkl")); e10 = pd.read_pickle(os.path.join(W, "elpop_2010.pkl"))
e22 = e22[e22.ibge.notna()].copy()
e10m = e10.set_index(["uf", "mun"]).ratio.to_dict()
rows = []
for t in e22.itertuples():
    cc = cen.get(str(t.ibge))
    if not cc:
        continue
    x = P["pad"] + (cc["lon"] - P["lon0"]) * P["grauX"]; y = P["pad"] + (P["lat0"] - cc["lat"]) * P["grauY"]
    rows.append({"uf": t.uf, "mun": t.nome.title(), "x": round(x, 1), "y": round(y, 1), "aptos": int(t.aptos), "pop16": int(t.pop16), "r22": round(float(t.ratio), 3),
                 "r10": r(e10m.get((t.uf, t.mun)), 3)})
j("eleitorado_mapa", rows)
j("mapa_uf", [{"uf": uf, "d": v["d"], "label": v.get("label"), "area": v.get("area")} for uf, v in proj["ufs"].items()] + [{"uf": "_vb", "d": json.dumps(vb), "label": None, "area": None}])

# ---------------------------------------------------------------- urna / tempo
ur = json.load(open(os.path.join(O, "urna.json")))
rows = []
for o in ur:
    for mdl, v in o["bruto"].items():
        fm, fz, fl = o["fe_municipio"].get(mdl), o["fe_zona"].get(mdl), o["fe_local"].get(mdl)
        rows.append({"id": f'{o["ano"]}-{o["turno"]}', "ano": o["ano"], "turno": o["turno"], "modelo": mdl, "ref": mdl == o["ref"], "secoes": v["secoes"], "share_a": v["shareA"],
                     "mun_pp": fm["pp"] if fm else None, "mun_lo": fm["ic95"][0] if fm else None, "mun_hi": fm["ic95"][1] if fm else None,
                     "zona_pp": fz["pp"] if fz else None, "zona_lo": fz["ic95"][0] if fz else None, "zona_hi": fz["ic95"][1] if fz else None,
                     "local_pp": fl["pp"] if fl else None, "local_lo": fl["ic95"][0] if fl else None, "local_hi": fl["ic95"][1] if fl else None,
                     "locais_2_modelos": o["locais_com_2_modelos"], "locais": o["locais"]})
j("urna", rows)
tp = json.load(open(os.path.join(O, "tempo.json")))
rows = []
for o in tp:
    rows.append({"id": f'{o["ano"]}-{o["turno"]}', "ano": o["ano"], "turno": o["turno"], "n": o["n"], "antes": o["antes_do_fechamento"], "mediana_min": o["lag_min"]["0.5"], "p99_min": o["lag_min"]["0.99"],
                 "mais_6h": o["mais_de_6h"], "mais_24h": o["mais_de_24h"], "madrugada": o["antes_das_8h"],
                 "red": sum(v for k, v in o["origem"].items() if "RED" in k)})
j("tempo_bu", rows)

# ---------------------------------------------------------------- poder
pw = json.load(open(os.path.join(O, "power.json")))
rows = []
for x in pw["linhas"]:
    row = {"cenario": x["cenario"], "f": x["f"], "unidades": x["unidades"], "desloc_margem": x["deslocamento_margem"], "margem_real": pw["margem_real"], "alguma": 1 if x["alguma"] else 0}
    for k, v in x["detecta"].items():
        row["d_" + k] = 1 if v else 0
    for k in ("corner", "t95", "low_rate", "out_rate", "V_last", "dup"):
        row["m_" + k] = x["metricas"][k]
    rows.append(row)
j("poder", rows)
j("poder_base", [{"k": k, "base": pw["base"].get(k), "limiar": pw["limiares"].get(k)} for k in ("corner", "t95", "low_rate", "out_rate", "V_last", "dup")])

# ---------------------------------------------------------------- ajuste pelo perfil
rows = []
for fn in ("ajuste_2014.json", "ajuste_2018.json", "ajuste_2022.json"):
    for o in json.load(open(os.path.join(O, fn))):
        uv = o["ultima_vs_primeira"]
        rows.append({"id": f'{o["ano"]}-{o["turno"]}', "ano": o["ano"], "turno": o["turno"], "cobertura": o["cobertura_perfil"], "testadas": o["testadas"], "r2": o["r2_dentro_local"],
                     "bruto_z5": o["bruto"]["z5"], "bruto_pos": o["bruto"]["z5_pos"], "bruto_neg": o["bruto"]["z5_neg"],
                     "adj_z5": o["ajustado_phi_bruto"]["z5"], "adj_pos": o["ajustado_phi_bruto"]["z5_pos"], "adj_neg": o["ajustado_phi_bruto"]["z5_neg"],
                     "idade1824_ultima": uv["idade_1824_ultima"], "idade1824_primeira": uv["idade_1824_primeira"], "edu_baixa_ultima": uv["edu_baixa_ultima"], "edu_baixa_primeira": uv["edu_baixa_primeira"],
                     "b_1824": o["beta"]["a1824"], "b_ebaixa": o["beta"]["e_baixa"], "b_ealta": o["beta"]["e_alta"], "b_fem": o["beta"]["fem"]})
j("ajuste_perfil", rows)

# ---------------------------------------------------------------- catalogo de testes e fontes (texto)
cat = [
 ("aritmetica", "Integridade", "Aritmética do boletim", "Comparecimento acima do número de aptos; total do boletim que não fecha; soma de votos por candidato diferente dos nominais; brancos e nulos divergentes entre os dois arquivos do TSE.",
  "Contagem direta em todas as seções (arquivos votacao_secao e detalhe_votacao_secao).", "Pega erro de digitação ou de cadastro. Fraude que preserva as somas passa.", "Qualquer valor diferente de zero vira 'para conferir'.", "Verificação direta"),
 ("comparecimento", "Comparecimento", "Comparecimento ≥ 95%", "Seções em que quase todos os aptos votaram, típico de enchimento de urna.",
  "Parcela de seções com 100+ aptos e comparecimento ≥ 95%.", "Seções pequenas, aldeias e presídios têm comparecimento alto sem irregularidade.", "'Para conferir' se passar de 1% das seções.", "Myagkov, Ordeshook e Shakin (2009)"),
 ("impressao", "Comparecimento", "Impressão digital eleitoral", "Cauda diagonal no gráfico comparecimento × fatia do primeiro colocado, com comparecimento e voto subindo juntos até 100%.",
  "Histograma 2D por seção (40×40). Resumo: parcela de seções no canto ≥ 90% / ≥ 90% e correlação.", "Voto estratégico e seções homogêneas também deformam a nuvem.", "'Para conferir' se o canto passar de 0,5% das seções.", "Klimek, Yegorov, Hanel e Thurner (2012), PNAS"),
 ("uniformidade", "Votos", "Uniformidade dentro do local", "Locais de votação em que as seções votam parecido demais, como ocorreria com boletins gerados a partir de uma proporção fixa.",
  "Para cada local com 3+ seções, estatística de dispersão qui-quadrado da fatia do candidato; cauda inferior. Controle de falsos positivos por Benjamini-Hochberg a 5%.", "Exige 3+ seções por local; seções com poucos votos têm pouco poder; unanimidade local (comunidades pequenas) gera falso positivo.", "'Para conferir' se houver descoberta pelo BH ou mais que o dobro do esperado em p < 0,001.", "Teste de dispersão (binomial); aplicação própria"),
 ("digitos", "Dígitos", "Último dígito dos votos", "Dígito final que se afasta da uniformidade, sinal de números inventados ou arredondados.",
  "Último dígito dos votos do primeiro colocado em seções com 50+ votos. Desvio médio absoluto comparado ao de uma simulação beta-binomial com a mesma heterogeneidade.", "Em contagens pequenas o último dígito não é perfeitamente uniforme; por isso comparamos com simulação.", "'Para conferir' se o desvio superar 1,5 vez o simulado e a diferença passar de 0,05 p.p.", "Beber e Scacco (2012), Political Analysis"),
 ("benford2", "Dígitos", "Segundo dígito (Benford)", "Desvio do padrão do segundo dígito de Benford.",
  "Distribuição do segundo dígito dos votos por seção, comparada à de Benford e à da simulação honesta.", "Contagens por seção não seguem Benford mesmo sem fraude; a simulação honesta tem o mesmo desvio. Incluído para mostrar por que é um teste fraco.", "Somente informativo.", "Mebane (2006); crítica em Deckert, Myagkov e Ordeshook (2011)"),
 ("inteiros", "Dígitos", "Percentuais inteiros", "Excesso de seções cujo percentual (do voto ou do comparecimento) é exatamente um número inteiro, marca de números fabricados a partir de percentuais.",
  "Parcela de seções com 100+ votos em que 100·x/n é inteiro, comparada à de uma simulação.", "Depende do tamanho das seções; a simulação cuida disso.", "'Para conferir' se o observado superar a simulação em 10%.", "Kobak, Shpilkin e Pshenichnikov (2016)"),
 ("zeros", "Votos", "Seções sem brancos nem nulos", "Seções grandes sem nenhum voto branco ou nulo, que quase nunca acontece quando milhares de pessoas votam.",
  "Contagem observada de seções com 100+ votantes e zero brancos+nulos, contra a esperada com a taxa dos demais seções do local.", "Locais com poucos votos inválidos e seções pequenas aumentam o esperado.", "'Para conferir' se observado passar de 2× o esperado e 10 seções a mais.", "Aplicação própria"),
 ("duplicatas", "Votos", "Boletins idênticos", "Seções com exatamente o mesmo vetor de votos (todos os candidatos, brancos e nulos), sinal de cópia.",
  "Contagem de seções com vetor repetido, comparada a uma simulação multinomial com as fatias do local.", "No 2º turno há poucos candidatos e seções pequenas repetem por acaso; vale a razão para a simulação.", "'Para conferir' se passar de 1,15× a simulação mais 20.", "Aplicação própria"),
 ("atipicas", "Votos", "Seções atípicas", "Seções cujo resultado destoa das irmãs do mesmo local.",
  "z robusto da fatia do candidato contra as demais seções do local (a própria seção fica de fora), escalado pela sobredispersão mediana.", "Eleitorado heterogêneo (universidade, bairros diferentes, comunidades) gera caudas; a contagem é descritiva.", "Somente informativo; lista as 12 maiores por turno.", "Aplicação própria"),
 ("monotonia", "Votos", "Irmãs em sequência", "Seções do mesmo local cujas fatias crescem ou diminuem de forma perfeitamente monótona pela numeração.",
  "Fração de locais com 4 a 8 seções em ordem monótona, contra a probabilidade 2/k! ao acaso.", "Seções são numeradas por ordem de cadastro, então há tendência por idade.", "Somente informativo.", "Aplicação própria"),
 ("entre_turnos", "Entre turnos", "Deslocamento do 1º para o 2º turno", "Seções cujo voto entre os finalistas muda mais do que as irmãs do local.",
  "Razão de chances do 2º contra o 1º turno por seção, desvio em relação ao local, z padronizado.", "Mudança de comparecimento por bairro explica parte das caudas.", "Somente informativo.", "Aplicação própria"),
 ("eleitorado_pop", "Cadastro", "Eleitorado × população", "Eleitores aptos por habitantes com 16+ anos do Censo, por município.",
  "Cruzamento por nome e UF entre o TSE e o SIDRA/IBGE (Censos 2010 e 2022).", "Domicílio eleitoral mantido por quem migrou, população subestimada e cidades pequenas elevam a razão sem irregularidade.", "Somente informativo; a razão é estável entre 2010 e 2022.", "Aplicação própria"),
 ("crescimento", "Cadastro", "Crescimento do eleitorado", "Município com cadastro crescendo muito acima do padrão da UF.",
  "Log do crescimento entre eleições, desvio da mediana da UF, escalado pela MAD.", "Polos de migração e emancipações crescem de verdade; recadastramentos derrubam o cadastro.", "Somente informativo.", "Aplicação própria"),
 ("urna", "Metadados", "Modelo de urna", "Diferença de resultado entre modelos de urna.",
  "Regressão ponderada com efeito fixo de município, zona e local de votação (erro-padrão agrupado por município).", "Só os locais com 2+ modelos informam a comparação 'mesmo local'.", "Somente informativo.", "Aplicação própria"),
 ("horario", "Metadados", "Horário de recebimento do boletim", "Boletim recebido antes do fechamento da seção ou com atraso extremo.",
  "Diferença entre o horário de recebimento e o fechamento local (17h).", "Fuso e relógio da urna divergem alguns minutos.", "Somente informativo.", "Aplicação própria"),
 ("ajuste_perfil", "Robustez", "Ajuste pelo perfil do eleitorado", "Quanto das seções atípicas some ao considerar idade, escolaridade e gênero dos eleitores da seção.",
  "Regressão dentro do local sobre as diferenças de perfil; contagem de |z| > 5 antes e depois, na mesma escala.", "Só 2014, 2018 e 2022 têm perfil por seção.", "Somente informativo.", "Aplicação própria"),
 ("poder", "Robustez", "Poder de detecção", "Se os testes acusariam manipulações plausíveis.",
  "Cinco tipos de manipulação sintética aplicados aos dados reais de 2022; um teste acusa quando supera o maior valor dos 14 turnos reais e 1,5× o original.", "Cenários são exemplos, não o universo de fraudes possíveis.", "–", "Aplicação própria"),
]
j("catalogo", [{"id": c[0], "grupo": c[1], "nome": c[2], "mede": c[3], "como": c[4], "limite": c[5], "regra": c[6], "ref": c[7]} for c in cat])
fontes = [
 ("Votação por seção (Presidente)", "TSE, votacao_secao_<ano>_BR.zip", "Votos por candidato e seção, 2002 a 2026.", "cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao"),
 ("Detalhe por seção", "TSE, detalhe_votacao_secao_<ano>.zip", "Aptos, comparecimento, brancos, nulos, horários e modelo de urna por seção.", "cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_secao"),
 ("Perfil do eleitorado por seção", "TSE, perfil_eleitor_secao_<ano>_<UF>.zip", "Idade, escolaridade e gênero por seção (2014, 2018, 2022).", "cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitor_secao"),
 ("Votação por seção (Governador)", "TSE, votacao_secao_<ano>_<UF>.zip", "Votos de Governador por seção em cada UF.", "cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao"),
 ("População", "IBGE/SIDRA, tabelas 1552 (Censo 2010) e 9514 (Censo 2022)", "Residentes por idade e município.", "apisidra.ibge.gov.br"),
 ("Malha municipal", "IBGE, BR_Municipios_2022", "Contornos municipais; os centroides posicionam os pontos do mapa.", "geoftp.ibge.gov.br"),
 ("Contornos das UFs", "Projeto Radar do Voto, web/mapa-uf.json", "Malha IBGE simplificada, mesma projeção do painel de apuração.", "repositório"),
 ("Bolsa Família", "Portal da Transparência (CGU) / MDS", "Não obtido: acesso negado a partir do ambiente da análise.", "dadosabertos-download.cgu.gov.br"),
]
j("fontes", [{"id": i + 1, "nome": f[0], "origem": f[1], "conteudo": f[2], "endereco": f[3]} for i, f in enumerate(fontes)])

# ---------------------------------------------------------------- ultima secao do local
ul = json.load(open(os.path.join(O, "ultima.json")))
rows = []
pos = {}
for id_, v in ul.items():
    rows.append({"id": id_, "n": v["n"], "ultima": v["ultima"], "esperado": round(v["esperado"], 1), "primeira": v["primeira"], "pct_ultima": round(v["ultima"] / v["n"], 4), "pct_esperado": round(v["esperado"] / v["n"], 4)})
    for t in v["top"]:
        pos[(id_, t["uf"], t["zona"], t["secao"])] = (t["k"], t["rank"])
j("ultima_secao", rows)
pc = json.load(open(os.path.join(D, "para_conferir.json")))
for r_ in pc:
    k = pos.get((r_["id"], r_["uf"], r_["zona"], r_["secao"]))
    r_["k"] = k[0] if k else None
    r_["pos"] = k[1] if k else None
    if r_["uf"] == "ZZ" or r_["mun"].lower().startswith("mun "):
        r_["mun"] = "Exterior (" + r_["mun"].split(" ")[-1] + ")"
j("para_conferir", pc)
