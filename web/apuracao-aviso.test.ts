import { describe, expect, test } from "bun:test";
import { criarAvisos, novosAvisos, textoPlano } from "./apuracao-aviso.js";
import type { NotificacaoApi } from "./apuracao-aviso.js";
import type { Item } from "./apuracao-novidades.js";

const item = (tipo: Item["tipo"], texto: string, hora = "20:00"): Item => ({ tipo, texto, hora });

describe("novosAvisos", () => {
  test("only what a new file put on top, without milestones", () => {
    const velho = item("tse", "velho");
    const antes = [velho];
    const depois = [item("radar", "novo"), item("marco", "50%"), item("tse", "outro"), velho];
    expect(novosAvisos(antes, depois).map((i) => i.texto)).toEqual(["novo", "outro"]);
  });
  test("nothing new, or only a milestone: nothing", () => {
    const a = item("tse", "x");
    expect(novosAvisos([a], [a])).toEqual([]);
    expect(novosAvisos([a], [item("marco", "m"), a])).toEqual([]);
  });
  test("from an empty list, every change counts", () => {
    expect(novosAvisos([], [item("tse", "a")])).toHaveLength(1);
  });
});

test("textoPlano drops the tags and the escapes of the page's HTML", () => {
  expect(textoPlano("<b>Ana &amp; Bia</b>: o TSE marcou &quot;Eleito&quot;.")).toBe('Ana & Bia: o TSE marcou "Eleito".');
});

function rig(permission: string, pedir = "granted") {
  const feitas: { titulo: string; body?: string }[] = [];
  const api = class { static permission = permission; static requestPermission = async () => { api.permission = pedir; return pedir; }; constructor(titulo: string, o?: { body?: string }) { feitas.push({ titulo, body: o?.body }); } };
  let salvo: string | null = null;
  let escondida = true;
  const a = criarAvisos({ api: api as unknown as NotificacaoApi, guardar: { get: () => salvo, set: (v) => { salvo = v; } }, escondida: () => escondida });
  return { a, feitas, esconder: (v: boolean) => { escondida = v; }, salvo: () => salvo };
}

describe("criarAvisos", () => {
  test("starts off, turns on after the permission and remembers it", async () => {
    const r = rig("default");
    expect(r.a.estado()).toBe("desligado");
    expect(await r.a.alternar()).toBe("ligado");
    expect(r.salvo()).toBe("on");
    expect(await r.a.alternar()).toBe("desligado");
    expect(r.salvo()).toBe("off");
  });
  test("a refused permission stays off and blocked", async () => {
    const r = rig("default", "denied");
    expect(await r.a.alternar()).toBe("bloqueado");
  });
  test("no Notification API: unavailable", async () => {
    const a = criarAvisos({ api: undefined, guardar: { get: () => null, set: () => {} } });
    expect(a.estado()).toBe("indisponivel");
    expect(await a.alternar()).toBe("indisponivel");
  });
  test("notifies only while on and with the tab hidden, three at most", async () => {
    const r = rig("granted");
    const itens = ["a", "b", "c", "d"].map((t) => item("tse", t));
    r.a.avisar("Presidente", itens);
    expect(r.feitas).toHaveLength(0); // off
    await r.a.alternar();
    r.esconder(false);
    r.a.avisar("Presidente", itens);
    expect(r.feitas).toHaveLength(0); // the page is in view
    r.esconder(true);
    r.a.avisar("Presidente", itens);
    expect(r.feitas.map((f) => f.body)).toEqual(["a", "b", "c", "E mais 1 atualizações. Abra a aba para ver."]);
  });
});
