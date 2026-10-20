// Sound effects of the Ao vivo head-to-head, synthesised with the Web Audio API: no audio files, no network, nothing for the CSP to allow.
// Browsers keep an AudioContext silent until the reader has interacted with the page, so `desbloquear` is called from a click and until then
// every effect is skipped without a word (a sound that cannot play must never break the screen).
export interface Som {
  desbloquear(): void;
  intro(): void;
  ko(): void;
  passou(): void; // an overtake in the Corrida view
  vira(): void; // a state (or the whole country) changes side in the Noite no mapa view
}

type Ligado = () => boolean;
type Fabrica = () => AudioContext | null;

const padrao: Fabrica = () => {
  const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  try { return C ? new C() : null; } catch { return null; }
};

export function criarSom(ligado: Ligado, fabrica: Fabrica = padrao): Som {
  let ctx: AudioContext | null = null;
  let saida: AudioNode | null = null;

  const garantir = () => {
    if (ctx) return ctx;
    ctx = fabrica();
    if (!ctx) return null;
    // A compressor in front of the speakers: the K.O. stacks a boom, a crash and a fanfare and must not clip.
    const comp = ctx.createDynamicsCompressor();
    const mestre = ctx.createGain();
    mestre.gain.value = 0.8;
    comp.connect(mestre).connect(ctx.destination);
    saida = comp;
    return ctx;
  };

  const tom = (c: AudioContext, tipo: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(saida!);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const ruido = (c: AudioContext, tipo: BiquadFilterType, freq: number, t: number, dur: number, vol: number) => {
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    s.buffer = buf;
    f.type = tipo;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(saida!);
    s.start(t);
  };

  const tocar = (fn: (c: AudioContext, t: number) => void) => {
    try {
      if (!ligado() || !ctx || ctx.state !== "running") return;
      fn(ctx, ctx.currentTime + 0.02);
    } catch { /* an audio failure never reaches the page */ }
  };

  return {
    desbloquear() {
      try { garantir()?.resume?.(); } catch { /* no audio in this browser */ }
    },
    // A rising charge and a slam on the "VS".
    intro() {
      tocar((c, t) => {
        tom(c, "sawtooth", 180, 1400, t, 0.5, 0.07);
        ruido(c, "bandpass", 2400, t + 0.1, 0.4, 0.05);
        tom(c, "sine", 110, 38, t + 0.55, 0.5, 0.55);
        ruido(c, "lowpass", 900, t + 0.55, 0.3, 0.35);
      });
    },
    // A short rising sweep: someone moved up a place.
    passou() {
      tocar((c, t) => {
        tom(c, "triangle", 330, 740, t, 0.26, 0.09);
        tom(c, "sine", 660, 990, t + 0.1, 0.18, 0.04);
      });
    },
    // Two notes and a soft thud: the map changed side somewhere.
    vira() {
      tocar((c, t) => {
        tom(c, "triangle", 392, 392, t, 0.12, 0.08);
        tom(c, "triangle", 587, 587, t + 0.1, 0.2, 0.08);
        tom(c, "sine", 90, 50, t, 0.3, 0.12);
      });
    },
    // Impact, crash, the fall of the loser, a rumble, then a short fanfare for the one the TSE marked.
    ko() {
      tocar((c, t) => {
        tom(c, "sine", 170, 32, t, 1.3, 0.95);
        ruido(c, "lowpass", 1100, t, 0.7, 0.6);
        ruido(c, "highpass", 3200, t + 0.03, 1.7, 0.28);
        tom(c, "sawtooth", 560, 120, t + 0.3, 1.0, 0.22);
        tom(c, "square", 280, 60, t + 0.3, 1.0, 0.1);
        tom(c, "sine", 52, 40, t + 0.2, 2.2, 0.35);
        [261.63, 329.63, 392, 523.25].forEach((f, i) => {
          tom(c, "square", f, f, t + 1.15 + i * 0.13, 0.42, 0.11);
          tom(c, "triangle", f / 2, f / 2, t + 1.15 + i * 0.13, 0.42, 0.14);
        });
      });
    },
  };
}
