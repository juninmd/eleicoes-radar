import { describe, expect, test } from "bun:test";
import { epochDe, idadeTxt, intervaloDe, pausaDoTse } from "./apuracao-ritmo.js";

const arq = (data: string, hora: string) => ({ versao: { data, hora } });

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
    expect(r!.ultima.getTime()).toBe(Date.UTC(2026, 9, 4, 23, 31, 0));
    expect(r!.idadeMs).toBe(9 * 60_000);
    expect(r!.parado).toBe(false);
    expect(pausaDoTse([arq("04/10/2026", "20:10:00")], agora, 10 * 60_000)!.parado).toBe(true);
  });
  test("with no readable version there is nothing to say", () => {
    expect(pausaDoTse([arq("", "")], agora)).toBeNull();
    expect(pausaDoTse([], agora)).toBeNull();
  });
});

describe("intervaloDe", () => {
  const agora = new Date("2026-10-04T23:10:00Z"); // 20:10 in Brasília
  const arq = (fase: string, totalizadas: number, hora = "20:08:00") => ({ fase, secoes: { totalizadas, total: 100 }, versao: { data: "04/10/2026", hora } });
  test("the last stretch is asked faster, a finished or stalled count slower", () => {
    expect(intervaloDe(arq("parcial", 50), agora, 60_000)).toBe(60_000);
    expect(intervaloDe(arq("parcial", 92), agora, 60_000)).toBe(30_000);
    expect(intervaloDe(arq("concluida", 100), agora, 60_000)).toBe(120_000);
    expect(intervaloDe(arq("parcial", 95, "19:40:00"), agora, 60_000)).toBe(120_000);
  });
  test("unknown keeps the base", () => {
    expect(intervaloDe(null, agora, 60_000)).toBe(60_000);
    expect(intervaloDe({ fase: "aguardando" }, agora, 60_000)).toBe(60_000);
    expect(intervaloDe({ fase: "parcial" }, agora, 60_000)).toBe(60_000);
  });
});
