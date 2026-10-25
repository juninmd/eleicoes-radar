import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dossierNav, renderDossier } from "./dossier.js";
import type { ExpPrev } from "./prev.js";
import type { score } from "./score.js";
import type { Candidatura } from "./types.js";

const fx = (o: object) => o as Candidatura;

const baseCand = fx({
	id: "cand-1",
	num: "1234",
	nome: "FULANO DA SILVA",
	urna: "FULANO",
	partido: "PARTIDO",
	cargo: "Deputado Federal",
	uf: "SP",
	ind: {},
	fin: {
		total: 100000,
		publico: 80000,
		partido: 0,
		pf: 20000,
		proprio: 0,
		candidatos: 0,
		doadoresPF: 10,
		maiorDoador: 0.15,
		gastos: 90000,
		impuls: 5000,
		maiorFornecedor: 0.2,
	},
});

test("dossierNav builds accessible jump links for present sections only", () => {
	const simpleNav = dossierNav(baseCand, null, null);
	expect(simpleNav).toContain('class="djump"');
	expect(simpleNav).toContain('href="#d-inds"');
	expect(simpleNav).toContain('href="#d-contas"');
	expect(simpleNav).not.toContain('href="#d-prop"');
	expect(simpleNav).not.toContain('href="#d-bens"');
	expect(simpleNav).not.toContain('href="#d-prev"');

	const richCand = fx({
		...baseCand,
		prev: { p: 0.75, media: 0.12, lo: 0.1, hi: 0.14, fonte: "modelo" },
		proposta: { kb: 2048 },
		patrimonio: { total: 500000, total2022: null, n: 3, tipos: [] },
		fornecedores: [
			{
				cnpj: "12345678000199",
				nome: "GRAFICA LTDA",
				valor: 50000,
				flags: [],
				nova: false,
				via: ["campanha"],
			},
		],
		canais: [{ r: "instagram", u: "https://instagram.com/fulano" }],
	});
	const expMock = {
		metodo: { simulacoes: 10000 },
	} as unknown as ExpPrev;
	const richNav = dossierNav(richCand, expMock, null);
	expect(richNav).toContain('href="#d-prev"');
	expect(richNav).toContain('href="#d-prop"');
	expect(richNav).toContain('href="#d-bens"');
	expect(richNav).toContain('href="#d-forn"');
	expect(richNav).toContain('href="#d-canais"');
});

test("renderDossier inserts dossierNav and assigns matching ids on sections", () => {
	const mockScore = {
		nota: 85,
		cobertura: 0.9,
	} as unknown as ReturnType<typeof score>;
	const html = renderDossier(
		baseCand,
		mockScore,
		false,
		null,
		'<img class="av lg" src="test.jpg" alt="" />',
		null,
	);
	expect(html).toContain('class="djump"');
	expect(html).toContain('id="d-inds"');
	expect(html).toContain('id="d-contas"');
});

test("web/styles.css styles .djump and sets aspect-ratio on .av", () => {
	const css = readFileSync("web/styles.css", "utf8");
	expect(css).toContain(".djump");
	expect(css).toContain(".djump a:focus-visible");
	expect(css).toContain("aspect-ratio: 4 / 5;");
});

test("web/expectativa.css supports separate @media print for Cola and Candidate Dossier", () => {
	const css = readFileSync("web/expectativa.css", "utf8");
	expect(css).toContain("@media print");
	expect(css).toContain("body:not(.has-dossie)");
	expect(css).toContain("body.has-dossie");
	expect(css).toContain("body.has-dossie #dossie");
	expect(css).toContain("page-break-inside: avoid");
});

test("web/app.ts sets decoding='async' on rendered avatars", () => {
	const code = readFileSync("web/app.ts", "utf8");
	expect(code).toContain('decoding="async"');
});
