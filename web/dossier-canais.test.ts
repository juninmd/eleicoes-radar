import { expect, test } from "bun:test";
import { canaisBlock } from "./dossier-canais.js";

const base = { canais: null, bio: null } as Parameters<typeof canaisBlock>[0];

test("empty when there is nothing to show", () => {
  expect(canaisBlock(base)).toBe("");
});

test("lists declared channels as external links with the handle", () => {
  const html = canaisBlock({ ...base, canais: [{ r: "instagram", u: "https://www.instagram.com/fulano" }, { r: "youtube", u: "https://www.youtube.com/channel/UCabc123" }] });
  expect(html).toContain('href="https://www.instagram.com/fulano"');
  expect(html).toContain("@fulano");
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("declarados ao TSE");
  expect(html).not.toContain("@channel"); // an id path is not a handle
});

test("escapes hostile text and dates the follower count, never scoring it", () => {
  const html = canaisBlock({
    canais: [{ r: "x", u: 'https://x.com/a"><script>1</script>' }],
    bio: { seguidores: [{ rede: "x", n: 9440106, em: "2025-02-26" }] },
  } as Parameters<typeof canaisBlock>[0]);
  expect(html).not.toContain("<script>");
  expect(html).toContain("02/2025");
  expect(html).toContain("defasada");
  expect(html).toContain("não entram na nota");
});

test("page-like paths do not become handles", () => {
  const html = canaisBlock({ ...base, canais: [{ r: "facebook", u: "https://www.facebook.com/profile.php?id=123" }, { r: "youtube", u: "https://www.youtube.com/watch?v=abc" }] });
  expect(html).not.toContain("@profile.php");
  expect(html).not.toContain("@watch");
});
