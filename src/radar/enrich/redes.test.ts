import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { canalDe, loadRedes, mergeCanais } from "./redes";

describe("canalDe", () => {
  test("keeps known social hosts over https and upgrades http", () => {
    expect(canalDe("http://www.instagram.com/fulano/")).toEqual({ r: "instagram", u: "https://instagram.com/fulano" });
    expect(canalDe("https://twitter.com/fulano")).toEqual({ r: "x", u: "https://x.com/fulano" });
  });
  test("accepts a link typed without scheme and in upper case host", () => {
    expect(canalDe("HTTPS://WWW.TIKTOK.COM/@FULANOOFICIAL")).toEqual({ r: "tiktok", u: "https://tiktok.com/@FULANOOFICIAL" });
    expect(canalDe("instagram.com/fulano")?.r).toBe("instagram");
  });
  test("drops tracking query but keeps the ids that identify the page", () => {
    expect(canalDe("https://www.instagram.com/fulano/?igshid=abc&utm_source=x")?.u).toBe("https://instagram.com/fulano");
    expect(canalDe("https://www.facebook.com/profile.php?id=123&ref=x")?.u).toBe("https://facebook.com/profile.php?id=123");
    expect(canalDe("https://www.youtube.com/watch?v=abc&t=3")?.u).toBe("https://youtube.com/watch?v=abc");
  });
  test("rejects WhatsApp, unknown sites, bare hosts, other protocols and junk", () => {
    for (const bad of ["https://wa.me/5511999999999", "https://chat.whatsapp.com/ABC", "TVFB22.NET", "https://evil.example/x", "https://instagram.com/", "javascript:alert(1)", "ftp://instagram.com/a", "dois links juntos", "", "https://instagram.com.evil.example/a", "https://constructor/x", "__proto__/x", "https://t.me/+5511999999999", "https://t.me/joinchat/AbCd", "https://t.me/54996736264", "https://www.instagram.com/5511999999999/"]) {
      expect(canalDe(bad)).toBeNull();
    }
  });
});

describe("mergeCanais / loadRedes", () => {
  test("keeps usernames that merely contain digits", () => {
    expect(canalDe("https://x.com/JORGE6050384252")?.u).toBe("https://x.com/JORGE6050384252");
  });
  test("the same profile typed with or without www, or on twitter.com, is one channel; YouTube ids stay case-sensitive", () => {
    expect(mergeCanais([canalDe("instagram.com/Fulano")!], [canalDe("https://www.instagram.com/fulano")!])).toHaveLength(1);
    expect(mergeCanais([canalDe("twitter.com/a")!], [canalDe("https://x.com/A")!])).toHaveLength(1);
    expect(mergeCanais([canalDe("youtube.com/channel/UCabc")!], [canalDe("youtube.com/channel/UCABC")!])).toHaveLength(2);
  });
  test("dedupes the same channel across sources, case-insensitively, and caps the list", () => {
    const a = { r: "instagram", u: "https://www.instagram.com/Fulano" } as const;
    expect(mergeCanais([a], [{ ...a, u: "https://www.instagram.com/fulano" }])).toHaveLength(1);
    const many = Array.from({ length: 30 }, (_, i) => ({ r: "x", u: `https://x.com/u${i}` }) as const);
    expect(mergeCanais(many)).toHaveLength(10);
  });
  test("reads the BRASIL file of the TSE zip, keyed by SQ_CANDIDATO", async () => {
    const csv = ['"SQ_CANDIDATO";"NR_ORDEM_REDE_SOCIAL";"DS_URL"', '"1";1;"https://instagram.com/a"', '"1";2;"https://wa.me/5511"', '"2";1;"TVFB22.NET"'].join("\n");
    const zip = join(mkdtempSync(join(tmpdir(), "redes-")), "r.zip");
    writeFileSync(zip, zipSync({ "rede_social_candidato_2026_BRASIL.csv": strToU8(csv) }));
    const got = await loadRedes(zip);
    expect(got.get("1")).toEqual([{ r: "instagram", u: "https://instagram.com/a" }]);
    expect(got.has("2")).toBe(false);
  });
});
