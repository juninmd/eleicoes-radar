import { afterEach, expect, test } from "bun:test";
import { lerJson } from "./ler-json";

const original = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = original;
});
const responder = (r: Response) => {
	globalThis.fetch = (async () => r) as unknown as typeof fetch;
};

test("returns the parsed body of a 2xx answer", async () => {
	responder(Response.json({ ok: 1 }));
	expect(await lerJson<{ ok: number }>("data/x.json")).toEqual({ ok: 1 });
});

test("a 404 rejects with the status and path instead of parsing the error page", async () => {
	responder(new Response("not found", { status: 404 }));
	await expect(lerJson("data/x.json")).rejects.toThrow("404 data/x.json");
});
