import { describe, expect, test } from "bun:test";
import { criarSom } from "./apuracao-som.js";

// A just-enough AudioContext: it counts what the effects create, so the tests can tell a sound was scheduled.
function falso(estado: "running" | "suspended" = "running") {
  const feito = { osc: 0, ruido: 0, resumido: 0 };
  const no = (extra: object = {}) => ({ connect: (x: unknown) => x ?? no(), ...extra });
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    state: estado, currentTime: 0, sampleRate: 8000, destination: no(),
    resume() { feito.resumido++; (ctx as { state: string }).state = "running"; return Promise.resolve(); },
    createDynamicsCompressor: () => no(),
    createGain: () => no({ gain: param() }),
    createOscillator: () => { feito.osc++; return no({ type: "sine", frequency: param(), start() {}, stop() {} }); },
    createBiquadFilter: () => no({ type: "lowpass", frequency: { value: 0 } }),
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    createBufferSource: () => { feito.ruido++; return no({ buffer: null, start() {} }); },
  };
  return { ctx: ctx as unknown as AudioContext, feito };
}

describe("som do embate", () => {
  test("mudo até o primeiro clique: sem contexto de áudio nada toca nem quebra", () => {
    const { ctx, feito } = falso("suspended");
    const som = criarSom(() => true, () => ctx);
    som.ko();
    som.intro();
    expect(feito.osc + feito.ruido).toBe(0);
    som.desbloquear();
    expect(feito.resumido).toBe(1);
    som.ko();
    expect(feito.osc).toBeGreaterThan(5); // impacto, queda, estrondo e fanfarra
    expect(feito.ruido).toBeGreaterThanOrEqual(2);
  });

  test("com o botão Som desligado não toca", () => {
    const { ctx, feito } = falso();
    let ligado = false;
    const som = criarSom(() => ligado, () => ctx);
    som.desbloquear();
    som.ko();
    expect(feito.osc).toBe(0);
    ligado = true;
    som.intro();
    expect(feito.osc).toBeGreaterThan(0);
  });

  test("navegador sem Web Audio: nenhuma chamada lança", () => {
    const som = criarSom(() => true, () => null);
    expect(() => { som.desbloquear(); som.intro(); som.ko(); }).not.toThrow();
  });

  test("erro dentro do áudio não chega à tela", () => {
    const { ctx } = falso();
    (ctx as unknown as { createOscillator: () => never }).createOscillator = () => { throw new Error("sem som"); };
    const som = criarSom(() => true, () => ctx);
    som.desbloquear();
    expect(() => som.ko()).not.toThrow();
  });
});
