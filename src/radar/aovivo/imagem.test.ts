import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

// The image holds src/radar/serve.ts, src/radar/aovivo (no tests) and web (no tests). A server module that reaches anywhere else works in
// dev and crashes the pod at boot, so this follows every runtime import from the entry point and checks it lands inside what ships.
const NA_IMAGEM = (f: string) => {
  const r = relative(process.cwd(), f).replaceAll("\\", "/");
  return !/\.test\.ts$/.test(r) && (r === "src/radar/serve.ts" || /^src\/radar\/aovivo\/[^/]+\.ts$/.test(r) && !r.endsWith("keygen.ts") || /^web\/[^/]+\.(ts|js|json)$/.test(r));
};
const comoArquivo = (de: string, spec: string): string | null => {
  const base = resolve(dirname(de), spec);
  for (const c of [base, base.replace(/\.js$/, ".ts"), `${base}.ts`]) if (existsSync(c) && /\.(ts|js|json)$/.test(c)) return c;
  return null;
};

function alcance(entrada: string): { visto: Set<string>; fora: string[] } {
  const visto = new Set<string>();
  const fora: string[] = [];
  const fila = [resolve(entrada)];
  while (fila.length) {
    const f = fila.pop()!;
    if (visto.has(f) || !f.endsWith(".ts")) continue;
    visto.add(f);
    const src = readFileSync(f, "utf8");
    const specs = [...src.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"(\.[^"]+)"/gms), ...src.matchAll(/import\("(\.[^"]+)"\)/g)].map((m) => m[1]);
    for (const s of specs) {
      const alvo = comoArquivo(f, s);
      if (!alvo) { fora.push(`${relative(process.cwd(), f)} -> ${s} (não resolve)`); continue; }
      if (!NA_IMAGEM(alvo)) fora.push(`${relative(process.cwd(), f)} -> ${relative(process.cwd(), alvo)}`);
      fila.push(alvo);
    }
  }
  return { visto, fora };
}

describe("imagem Docker", () => {
  test("everything the server imports at runtime ships in the image", () => {
    const { visto, fora } = alcance("src/radar/serve.ts");
    expect(fora).toEqual([]);
    expect(visto.size).toBeGreaterThan(5);
  });
  test("the runtime started by serve.ts is reachable too", () => {
    const { visto, fora } = alcance("src/radar/aovivo/runtime.ts");
    expect(fora).toEqual([]);
    expect([...visto].some((f) => f.endsWith("apuracao-eleito.ts"))).toBe(true);
  });
  test("Dockerfile copies the modules and starts the entry point where it lives; .dockerignore lets them through", () => {
    const d = readFileSync("Dockerfile", "utf8");
    expect(d).toContain("COPY src/radar/aovivo ./src/radar/aovivo");
    expect(d).toContain('CMD ["bun", "src/radar/serve.ts"]');
    const ig = readFileSync(".dockerignore", "utf8");
    expect(ig).toContain("!src/radar/aovivo/");
    expect(ig).toContain("src/radar/aovivo/*.test.ts");
    expect(readdirSync("src/radar/aovivo").filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).length).toBeGreaterThan(5);
  });
});
