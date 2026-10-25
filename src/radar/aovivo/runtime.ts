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
    onEventos: (eventos) => { console.log(`eventos ${eventos.map((e) => e.id).join(", ")}`); void push.notificar().then((x) => console.log(`push: ${x.enviados} enviados, ${x.removidos} removidos, ${x.falhas} falhas`)); },
  });
  if (env.RADAR_MONITOR !== "off") monitor.iniciar(Number(env.RADAR_MONITOR_MS) || 40_000);
  console.log(`ao vivo: monitor ${env.RADAR_MONITOR === "off" ? "desligado" : "ligado"} (turno ${turno}), push ${vapid ? "ligado" : "desligado (sem chaves VAPID)"}`);
  // `kubectl exec deploy/eleicoes-radar -- kill -USR2 1`: sends a clearly labelled test notice to every subscriber. No HTTP route does this.
  process.on("SIGUSR2", () => {
    const e = monitor.testar();
    console.log(`teste de push ${e.id}`);
    void push.notificar().then((x) => console.log(`push de teste: ${x.enviados} enviados, ${x.removidos} removidos, ${x.falhas} falhas (de ${push.total() + x.removidos} inscritos)`));
  });
  return { api: criarApi({ presenca, push, monitor }), parar: () => monitor.parar() };
}
