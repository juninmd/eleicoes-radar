import { expect, test } from "bun:test";

const app = await Bun.file(new URL("./app.ts", import.meta.url)).text();
const between = (from: string, to: string) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));

// Ao vivo is the landing tab: what only other tabs show must not ride along with the first load (6,8 MB on the wire before, 0,8 MB after).
test("boot downloads only what Ao vivo reads; the aggregates wait for their tabs", () => {
  const boot = between("async function main()", "main().catch");
  for (const f of ["data/panorama.json", "data/rede.json", "data/fotos/"]) expect(boot).not.toContain(f);
  expect(boot).toContain("data/expectativa.json"); // the poll averages are in the Ao vivo cards
  expect(app).toContain('agregado("pan", "data/panorama.json")');
  expect(app).toContain('agregado("rede", "data/rede.json")');
});

test("ballot photos and supplier sidecars are not fetched while Ao vivo is open, and a file is fetched once", () => {
  expect(between("async function loadFotos()", "function visible()")).toMatch(/state\.modo === "aovivo"/);
  expect(between("function pedirDoRadar()", "$(\"#lista\").addEventListener")).toMatch(/state\.modo === "aovivo"/);
  expect(app).toContain("fotosPedidas.has(file)"); // the redraw at the end of loadFotos asks again through renderModo
  expect(between("function renderModo()", "function mostrarAoVivo()")).toContain("pedirDoRadar()");
});

test("a aba Auditoria só baixa o módulo e os dados ao abrir; o boot não os pede", () => {
  const boot = between("async function main()", "main().catch");
  expect(boot).not.toContain("data/auditoria");
  expect(boot).not.toContain("auditoria.js");
  expect(app).toContain('import("./auditoria.js")');
  expect(app).not.toMatch(/^import .*auditoria/m);
});

test("a aba Câmara só baixa o módulo e os dados ao abrir; o boot não os pede", () => {
  const boot = between("async function main()", "main().catch");
  expect(boot).not.toContain("data/camara");
  expect(boot).not.toContain("camara.js");
  expect(app).toContain('import("./camara.js")');
  expect(app).not.toMatch(/^import .*\.\/camara/m);
});
