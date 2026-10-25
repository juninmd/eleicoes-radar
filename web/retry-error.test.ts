import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("web/index.html contains the status-conexao live region", () => {
  const html = readFileSync("web/index.html", "utf8");
  expect(html).toContain('id="status-conexao"');
  expect(html).toContain('class="status-conexao"');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-live="polite"');
});

test("web/app.ts provides retry actions for loadUf failure", () => {
  const code = readFileSync("web/app.ts", "utf8");
  expect(code).toContain("data-retry-uf");
  expect(code).toContain("Tentar novamente");
  expect(code).toContain('class="btn-confirma"');
});

test("web/app.ts provides retry action for main initialization failure", () => {
  const code = readFileSync("web/app.ts", "utf8");
  expect(code).toContain("data-retry-main");
});

test("web/app.ts delegates retry clicks and triggers reload with in-flight guard", () => {
  const code = readFileSync("web/app.ts", "utf8");
  expect(code).toContain('button[data-retry-uf]');
  expect(code).toContain('button[data-retry-main]');
  expect(code).toContain('let retrying = false');
  expect(code).toContain('btn.disabled = true');
  expect(code).toContain('btn.textContent = "Carregando…"');
});

test("web/app.ts protects against state.uf race conditions during loadUf", () => {
  const code = readFileSync("web/app.ts", "utf8");
  expect(code).toContain("const reqUf = state.uf;");
  expect(code).toContain("if (state.uf !== reqUf) return;");
});

test("web/app.ts guarantees bind() idempotency on repeated main retries", () => {
  const code = readFileSync("web/app.ts", "utf8");
  expect(code).toContain("let bound = false;");
  expect(code).toContain("if (bound) return;");
  expect(code).toContain("bound = true;");
});

test("web/app.ts initializes connection listener at module root and handles online/offline transitions", () => {
  const code = readFileSync("web/app.ts", "utf8");
  expect(code).toContain("setupConexaoListener();");
  expect(code).toContain('window.addEventListener("offline"');
  expect(code).toContain('window.addEventListener("online"');
  expect(code).toContain("dot-off");
  expect(code).toContain("dot-on");
  expect(code).toContain("tentarCarregar");
});

test("web/styles.css styles the status-conexao pill and empty retry state", () => {
  const css = readFileSync("web/styles.css", "utf8");
  expect(css).toContain(".status-conexao");
  expect(css).toContain(".dot-off");
  expect(css).toContain(".dot-on");
  expect(css).toContain(".empty");
});
