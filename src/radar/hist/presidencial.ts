// Presidential results 1989-2022 by round and state, from the TSE open data. Builds web/data/historico/presidente.json.
// 1989 comes from votacao_candidato_uf_1989.zip (no header, latin1, both rounds in one file); 1994-2022 from the munzona zips'
// President file, summed per state. The winner is the leader of the last round held, not the TSE's own outcome text (unreliable in 2010/2018).
// Usage: bun run radar:presidencial  (needs data/tse/votacao_candidato_munzona_<ano>.zip and votacao_candidato_uf_1989.zip)
import { mkdirSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { readPresidente, type MunRace } from "../municipal/sources";

export interface HCand { n: string; nome: string; partido: string; v: number; uf: Record<string, number> }
export interface HTurno { t: 1 | 2; cands: HCand[]; total: number }
export interface HAno { ano: number; turnos: HTurno[]; eleito: string }
export interface Historico { anos: HAno[] }

export const ANOS = [1989, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022] as const;

const somar = (c: HCand, uf: string, v: number) => { if (v > 0) { c.v += v; c.uf[uf] = (c.uf[uf] ?? 0) + v; } };
const fechar = (t: 1 | 2, cands: HCand[]): HTurno => {
  const lista = cands.filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
  return { t, cands: lista, total: lista.reduce((s, c) => s + c.v, 0) };
};

// Winner = leader of the last round with votes.
export const eleitoDe = (turnos: HTurno[]): string => turnos[turnos.length - 1]?.cands[0]?.n ?? "";

export function deMunicipal(race: MunRace): HAno {
  const um = race.cands.map((c): HCand => ({ n: c.n, nome: c.nome, partido: c.partido, v: 0, uf: {} }));
  const dois = race.cands.map((c): HCand => ({ n: c.n, nome: c.nome, partido: c.partido, v: 0, uf: {} }));
  for (const m of Object.values(race.mun)) {
    const uf = m.uf || "ZZ";
    m.v1.forEach((v, i) => somar(um[i], uf, v));
    m.v2?.forEach((v, i) => somar(dois[i], uf, v));
  }
  const turnos = [fechar(1, um)];
  if (dois.some((c) => c.v > 0)) turnos.push(fechar(2, dois));
  return { ano: 0, turnos, eleito: eleitoDe(turnos) };
}

// "a";"b";... with no header; fields (0-based): 3 round, 5 state, 8 number, 11 ballot name, 12 office, 20 party, last = nominal votes.
export function de1989(txt: string): HAno {
  const por: [Map<string, HCand>, Map<string, HCand>] = [new Map(), new Map()];
  for (const linha of txt.split(/\r?\n/)) {
    const f = [...linha.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    if (f.length < 24 || f[12] !== "PRESIDENTE" || (f[3] !== "1" && f[3] !== "2")) continue;
    const mapa = por[Number(f[3]) - 1];
    const c = mapa.get(f[8]) ?? { n: f[8], nome: f[11], partido: f[20], v: 0, uf: {} };
    mapa.set(f[8], c);
    somar(c, f[5], Number(f[f.length - 1]));
  }
  const turnos = [fechar(1, [...por[0].values()])];
  if (por[1].size) turnos.push(fechar(2, [...por[1].values()]));
  return { ano: 1989, turnos, eleito: eleitoDe(turnos) };
}

export function ler1989(dir = "data/tse"): HAno {
  const f = unzipSync(new Uint8Array(readFileSync(`${dir}/votacao_candidato_uf_1989.zip`)));
  const nome = Object.keys(f).find((k) => k.endsWith("VOTACAO_CANDIDATO_UF_1989.txt"));
  if (!nome) throw new Error("VOTACAO_CANDIDATO_UF_1989.txt não está no zip de 1989");
  return de1989(new TextDecoder("latin1").decode(f[nome]));
}

if (import.meta.main) {
  const anos: HAno[] = [ler1989()];
  for (const y of ANOS.slice(1)) {
    const t0 = Date.now();
    const race = await readPresidente(y);
    if (!race) throw new Error(`sem Presidente em ${y}`);
    anos.push({ ...deMunicipal(race), ano: y });
    console.log(`[presidencial ${y}] ${race.cands.length} candidatos em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  mkdirSync("web/data/historico", { recursive: true });
  writeFileSync("web/data/historico/presidente.json", JSON.stringify({ anos } satisfies Historico));
}
