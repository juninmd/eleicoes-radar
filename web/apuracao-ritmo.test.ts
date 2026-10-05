import { describe, expect, test } from "bun:test";
import { epochDe, idadeTxt, pausaDoTse } from "./apuracao-ritmo.js";

const arq = (data, hora) => ({ versao: { data, hora } });

describe("epochDe", () => {
  test("the date and time of a file are Brasília time (UTC-3), whatever the zone of the browser", () => {
    expect(epochDe(arq("04/10/2026", "20:17:43"))).toBe(Date.UTC(2026, 9, 4, 23, 17, 43));
  });
  test("a file that does not say when it is from has no age", () => {
    expect(epochDe(arq("", ""))).toBeNaN();
    expect(epochDe(arq("2026-10-04", "20:17:43"))).toBeNaN();
    expect(epochDe(null)).toBeNaN();
  });
});

describe("idadeTxt", () => {
  test("seconds, minutes, hours", () => {
    expect(idadeTxt(20_000)).toBe("há segundos");
    expect(idadeTxt(180_000)).toBe("há 3 min");
    expect(idadeTxt(3_900_000)).toBe("há 1 h 05 min");
  });
  test("a file from the future (clocks that disagree) is not shown as negative", () => {
    expect(idadeTxt(-5_000)).toBe("há segundos");
  });
});

describe("pausaDoTse", () => {
  const agora = new Date(Date.UTC(2026, 9, 4, 23, 40, 0)); // 20:40 in Brasília
  test("the newest file among those given sets the age, and it is a pause only past the limit", () => {
    const r = pausaDoTse([arq("04/10/2026", "20:10:00"), arq("04/10/2026", "20:31:00")], agora, 10 * 60_000);
    expect(r.ultima.getTime()).toBe(Date.UTC(2026, 9, 4, 23, 31, 0));
    expect(r.idadeMs).toBe(9 * 60_000);
    expect(r.parado).toBe(false);
    expect(pausaDoTse([arq("04/10/2026", "20:10:00")], agora, 10 * 60_000).parado).toBe(true);
  });
  test("with no readable version there is nothing to say", () => {
    expect(pausaDoTse([arq("", "")], agora)).toBeNull();
    expect(pausaDoTse([], agora)).toBeNull();
  });
});
