// Wires the live tab's server side: presence, the TSE monitor and push. Started by serve.ts in production only.
import { criarApi, type Api } from "./api.js";
import { criarMonitor } from "./monitor.js";
import { criarPresenca } from "./presenca.js";
import { criarPush, criarVapid } from "./push.js";

export async function criarRuntime(env: Record<string, string | undefined> = process.env): Promise<{ api: Api; parar: () => void }> {
  const presenca = criarPresenca();
  const vapid = await criarVapid(env).catch((e) => { console.error(`push: chaves VAPID inválidas (${e})`); return null; });
  const push = criarPush({ vapid });
  const turno = env.RADAR_TURNO === "1" ? 1 : 2;
  const monitor = criarMonitor({
    turno,
    base: env.RADAR_TSE_BASE || undefined, // only for rehearsals against a fake TSE
    onOpcoes: (corrida, opcoes) => presenca.definirOpcoes(corrida, opcoes),
    onEvento: (e) => { console.log(`evento ${e.id}`); void push.notificar().then((r) => console.log(`push ${e.id}: ${r.enviados} enviados, ${r.removidos} removidos, ${r.falhas} falhas`)); },
  });
  if (env.RADAR_MONITOR !== "off") monitor.iniciar(Number(env.RADAR_MONITOR_MS) || 40_000);
  console.log(`ao vivo: monitor ${env.RADAR_MONITOR === "off" ? "desligado" : "ligado"} (turno ${turno}), push ${vapid ? "ligado" : "desligado (sem chaves VAPID)"}`);
  return { api: criarApi({ presenca, push, monitor }), parar: () => monitor.parar() };
}
