// What survives a restart: the cheering poll and the push subscriptions. Presence stays in memory only.
// A vote is stored as an HMAC of the browser's random code (with a salt kept in the same file), never the code itself, next to the pick;
// a push subscription is the browser's own push address (needed to send). No IP, name or place is ever written.
// A disk problem degrades to memory-only for that call (logged once): the live tab must keep working without its extras.
import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";

export interface Armazem {
  persistente: boolean;
  hash(id: string): string;
  votosDe(corrida: string): [string, string][];
  gravarVoto(corrida: string, hash: string, opcao: string): void;
  endpoints(): string[];
  gravarEndpoint(endpoint: string): void;
  apagarEndpoint(endpoint: string): void;
  fechar(): void;
}

const hasher = (sal: string) => (id: string) => new Bun.CryptoHasher("sha256", sal).update(id).digest("hex");

// Used in tests and when no database path is configured: everything lives and dies with the process, as before.
export function armazemMemoria(): Armazem {
  const hash = hasher(randomBytes(16).toString("hex"));
  const votos = new Map<string, Map<string, string>>();
  const pushes = new Set<string>();
  return {
    persistente: false,
    hash,
    votosDe: (c) => [...(votos.get(c) ?? [])],
    gravarVoto: (c, h, o) => { if (!votos.has(c)) votos.set(c, new Map()); votos.get(c)!.set(h, o); },
    endpoints: () => [...pushes],
    gravarEndpoint: (e) => { pushes.add(e); },
    apagarEndpoint: (e) => { pushes.delete(e); },
    fechar: () => {},
  };
}

export interface AbrirOpts { agora?: () => number; retencaoMs?: number }

export function abrirArmazem(caminho: string, { agora = Date.now, retencaoMs = 90 * 86_400_000 }: AbrirOpts = {}): Armazem {
  const db = new Database(caminho, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA busy_timeout = 3000"); // a rolling restart briefly has two pods on the same file
  db.run("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  db.run("CREATE TABLE IF NOT EXISTS votos (corrida TEXT NOT NULL, h TEXT NOT NULL, opcao TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (corrida, h))");
  db.run("CREATE TABLE IF NOT EXISTS push (endpoint TEXT PRIMARY KEY, t INTEGER NOT NULL)");
  db.run("INSERT OR IGNORE INTO meta (k, v) VALUES ('sal', ?)", [randomBytes(32).toString("hex")]);
  const sal = (db.query("SELECT v FROM meta WHERE k = 'sal'").get() as { v: string }).v;
  // Old rows go: a vote or a subscription nobody renewed in `retencaoMs` is not kept after the election.
  const corte = agora() - retencaoMs;
  db.run("DELETE FROM votos WHERE t < ?", [corte]);
  db.run("DELETE FROM push WHERE t < ?", [corte]);

  let avisou = false;
  let fechado = false;
  const seguro = <T,>(fallback: T, f: () => T): T => {
    try { return f(); } catch (e) { if (!avisou) { avisou = true; console.error(`armazém: ${e}`); } return fallback; }
  };
  const lerVotos = db.query("SELECT h, opcao FROM votos WHERE corrida = ?");
  const gravaVoto = db.query("INSERT INTO votos (corrida, h, opcao, t) VALUES (?, ?, ?, ?) ON CONFLICT (corrida, h) DO UPDATE SET opcao = excluded.opcao, t = excluded.t");
  const lerPush = db.query("SELECT endpoint FROM push");
  const gravaPush = db.query("INSERT INTO push (endpoint, t) VALUES (?, ?) ON CONFLICT (endpoint) DO UPDATE SET t = excluded.t");
  const apagaPush = db.query("DELETE FROM push WHERE endpoint = ?");

  return {
    persistente: true,
    hash: hasher(sal),
    votosDe: (c) => seguro([], () => (lerVotos.all(c) as { h: string; opcao: string }[]).map((r) => [r.h, r.opcao] as [string, string])),
    gravarVoto: (c, h, o) => seguro(undefined, () => { gravaVoto.run(c, h, o, agora()); }),
    endpoints: () => seguro([], () => (lerPush.all() as { endpoint: string }[]).map((r) => r.endpoint)),
    gravarEndpoint: (e) => seguro(undefined, () => { gravaPush.run(e, agora()); }),
    apagarEndpoint: (e) => seguro(undefined, () => { apagaPush.run(e); }),
    fechar: () => { if (fechado) return; fechado = true; seguro(undefined, () => { db.run("PRAGMA wal_checkpoint(TRUNCATE)"); db.close(); }); },
  };
}
