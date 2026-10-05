import { afterEach, describe, expect, test } from "bun:test";
import { HttpError, loadResultado } from "./apuracao-feed.js";

describe("loadResultado", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const silent = (signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const message = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error; } };

  test("a file that never answers fails with a clear message instead of hanging the polling", async () => {
    globalThis.fetch = ((_url: string, { signal }: { signal: AbortSignal }) => silent(signal)) as unknown as typeof fetch;
    const e = await message(loadResultado("u", undefined, 20));
    expect(e!.message).toBe("o TSE não respondeu a tempo");
  });

  test("a network failure says there is no connection, not the browser's English text", async () => {
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect((await message(loadResultado("u")))!.message).toBe("sem conexão com o TSE");
  });

  test("a body that is not JSON says the file is unreadable", async () => {
    globalThis.fetch = (async () => new Response("<html>manutenção</html>")) as unknown as typeof fetch;
    expect((await message(loadResultado("u")))!.message).toBe("arquivo do TSE ilegível");
  });

  test("an HTTP error keeps its status so the feed can tell 404 from the rest", async () => {
    globalThis.fetch = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const e = await message(loadResultado("u"));
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(503);
    expect(e!.message).toBe("o TSE respondeu HTTP 503");
  });

  test("a JSON that is not a results file is rejected", async () => {
    globalThis.fetch = (async () => new Response("{}")) as unknown as typeof fetch;
    expect((await message(loadResultado("u")))!.message).toBe("formato do arquivo do TSE não reconhecido");
  });

  test("a results file is parsed", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ carg: [{ agr: [] }] }))) as unknown as typeof fetch;
    expect((await loadResultado("u")).fase).toBe("aguardando");
  });

  test("the caller aborting (race switched) stays an AbortError, never reported as a timeout", async () => {
    globalThis.fetch = ((_url: string, { signal }: { signal: AbortSignal }) => silent(signal)) as unknown as typeof fetch;
    const ctl = new AbortController();
    const p = message(loadResultado("u", ctl.signal, 5_000));
    ctl.abort();
    expect((await p)!.name).toBe("AbortError");
  });
});
