// README screenshots from the real UI: `bun run radar:serve`, then `bun run screenshots` (BASE_URL to point elsewhere).
// Runs on Node (Playwright cannot launch Chromium under Bun on Windows). Photos stay off; Apuração reads the live TSE files.
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const OUT = process.env.OUT_DIR ?? ".github/assets/screenshots";
const PANEL_HEIGHT = 720;
const DOSSIE_HEIGHT = 660; // name, score and why the model got there; the drawer scrolls past that

type Shot = { name: string; modo: string; hash?: string; acao?: (page: Page) => Promise<void>; recorte?: "tela" | "painel" | "dossie" };

const SHOTS: Shot[] = [
  { name: "radar", modo: "radar", recorte: "tela" },
  { name: "dossie", modo: "radar", recorte: "dossie", acao: (p) => p.locator("#lista button.cand").first().click() },
  { name: "expectativa", modo: "expectativa" },
  { name: "rede", modo: "rede", acao: (p) => p.waitForSelector("#cedula-painel svg circle").then(() => undefined) },
  {
    name: "apuracao",
    modo: "apuracao",
    acao: async (p) => {
      await p.getByRole("button", { name: "Câmara", exact: true }).click();
      await p.waitForSelector("#cedula-painel svg circle");
    },
  },
  { name: "dinheiro", modo: "dinheiro" },
  { name: "redes", modo: "redes" },
  { name: "partidos", modo: "partidos" },
  { name: "aliancas", modo: "aliancas" },
  { name: "perfil", modo: "perfil" },
  { name: "como-funciona", modo: "radar", hash: "#sobre", recorte: "tela" },
];

async function capture(page: Page, s: Shot) {
  const path = `${OUT}/${s.name}.png`;
  if (s.recorte === "tela") return page.screenshot({ path });
  const alvo = s.recorte === "dossie" ? "#dossie" : "#cedula-painel";
  const b = await page.locator(alvo).boundingBox();
  if (!b) throw new Error(`${s.name}: ${alvo} not visible`);
  const altura = s.recorte === "dossie" ? DOSSIE_HEIGHT : PANEL_HEIGHT;
  return page.screenshot({ path, clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, altura) } });
}

const browser = await chromium.launch();
try {
  for (const s of SHOTS) {
    // A fresh context per shot: the app keeps the open tab and the reader's choices in localStorage.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await ctx.addInitScript((modo) => {
      localStorage.setItem("radar:modo", JSON.stringify(modo));
      localStorage.setItem("radar:uf", JSON.stringify("SP"));
      localStorage.setItem("radar:fotos", "false");
    }, s.modo);
    const page = await ctx.newPage();
    await page.goto(BASE + (s.hash ?? ""), { waitUntil: "networkidle" });
    await page.waitForSelector("body.ready");
    await s.acao?.(page);
    await page.waitForTimeout(800); // let transitions and late layout settle
    await capture(page, s);
    await ctx.close();
    console.log(`${OUT}/${s.name}.png`);
  }
} finally {
  await browser.close();
}
