import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildMap, UF_BY_IBGE } from "./uf-map";

const ring = (x: number, y: number, s = 1) => [[x, y], [x + s, y], [x + s, y - s], [x, y - s], [x, y]];
const feature = (codarea: string, coordinates: number[][][]) => ({ type: "Feature", properties: { codarea }, geometry: { type: "Polygon", coordinates } });

describe("buildMap", () => {
  const geo = { features: [feature("12", [ring(-70, -9)]), feature("53", [ring(-48, -15, 0.5)])] };
  const m = buildMap(geo);

  test("keys the shapes by UF initials, not by the IBGE code", () => {
    expect(Object.keys(m.ufs).sort()).toEqual(["AC", "DF"]);
  });

  test("every shape is a closed path and its label point lies inside the view box", () => {
    for (const { d, c } of Object.values(m.ufs)) {
      expect(d).toMatch(/^M[\d. ,L-]+Z$/);
      expect(c[0]).toBeGreaterThan(0);
      expect(c[0]).toBeLessThan(m.viewBox[2]);
      expect(c[1]).toBeGreaterThan(0);
      expect(c[1]).toBeLessThan(m.viewBox[3]);
    }
  });

  test("north is up and east is right", () => {
    const [ac, df] = [m.ufs.AC!, m.ufs.DF!];
    expect(df.c[0]).toBeGreaterThan(ac.c[0]); // DF is east of AC
    expect(df.c[1]).toBeGreaterThan(ac.c[1]); // DF is south of AC, so lower on screen
  });

  test("each shape carries its projected area, so the view can skip labels that do not fit", () => {
    expect(m.ufs.AC!.a).toBeCloseTo(0.9703 * 14 * 14, 0); // one degree square at 14°S
    expect(m.ufs.DF!.a).toBeLessThan(m.ufs.AC!.a / 3); // 0.5° square
  });

  test("an IBGE code we do not know is an error, never a silently missing state", () => {
    expect(() => buildMap({ features: [feature("99", [ring(-50, -10)])] })).toThrow("99");
  });

  test("a MultiPolygon keeps every island", () => {
    const multi = { features: [{ type: "Feature", properties: { codarea: "26" }, geometry: { type: "MultiPolygon", coordinates: [[ring(-40, -8)], [ring(-32, -3, 0.2)]] } }] };
    expect((buildMap(multi).ufs.PE!.d.match(/M/g) ?? []).length).toBe(2);
  });
});

describe("web/mapa-uf.json", () => {
  const asset = JSON.parse(readFileSync("web/mapa-uf.json", "utf8"));
  test("has the 27 federative units with a shape each", () => {
    expect(Object.keys(asset.ufs).sort()).toEqual(Object.values(UF_BY_IBGE).sort());
    for (const uf of Object.values(UF_BY_IBGE)) {
      expect(asset.ufs[uf].d.length).toBeGreaterThan(30);
      expect(asset.ufs[uf].a).toBeGreaterThan(0);
    }
  });
  test("says how lon/lat became SVG units, so the page can put the states on the world map", () => {
    const { proj } = asset;
    expect(proj.lon0).toBeLessThan(-70); // the western tip of Acre
    expect(proj.lat0).toBeGreaterThan(4); // the northern tip of Roraima
    expect(proj.grauY).toBe(14);
    expect(proj.grauX).toBeCloseTo(14 * Math.cos((14 * Math.PI) / 180), 6);
    expect(proj.pad).toBe(6);
  });
  test("carries the source credit the licence asks for", () => {
    expect(asset.fonte).toContain("IBGE");
  });
});
