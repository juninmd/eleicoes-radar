import shapefile, json, os, math
B = os.environ.get("FORENSE_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "forense")
sf = shapefile.Reader(os.path.join(B, "raw", "malha", "x", "BR_Municipios_2022"), encoding="utf8")
fields = [f[0] for f in sf.fields[1:]]
print(fields)
out = {}
for sr in sf.iterShapeRecords():
    rec = dict(zip(fields, sr.record))
    pts = sr.shape.points
    parts = list(sr.shape.parts) + [len(pts)]
    best = None
    for a, b in zip(parts[:-1], parts[1:]):
        ring = pts[a:b]
        A = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(ring[:-1], ring[1:]):
            c = x0 * y1 - x1 * y0
            A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
        if A == 0:
            continue
        A /= 2
        cx /= 6 * A; cy /= 6 * A
        if best is None or abs(A) > best[0]:
            best = (abs(A), cx, cy)
    if best:
        out[rec["CD_MUN"]] = {"nm": rec["NM_MUN"], "uf": rec["SIGLA_UF"], "lon": round(best[1], 4), "lat": round(best[2], 4), "area": rec.get("AREA_KM2")}
json.dump(out, open(os.path.join(B, "work", "centroids.json"), "w"))
print(len(out), list(out.items())[:2])
