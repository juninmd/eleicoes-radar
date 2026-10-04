// Deterministic random numbers: a rebuild with the same inputs must give the same published probabilities, and a
// failing backtest must be reproducible. mulberry32 for uniforms, Box-Muller for normals.
export interface Rng {
  uniform(): number; // [0, 1)
  normal(): number; // N(0, 1)
}

export function makeRng(seed: string): Rng {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const r = Math.sqrt(-2 * Math.log(uniform() || 1e-12));
    const th = 2 * Math.PI * uniform();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
  return { uniform, normal };
}
