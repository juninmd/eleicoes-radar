// "Histórico" tab: presidential results 1989-2022. One small JSON (web/data/historico/presidente.json), loaded when the tab first opens.
import { keepFocus } from "./focus.js";
import { lerJson, type Ler } from "./ler-json.js";
import { historicoView, semDados, type Estado } from "./historico-view.js";
import type { Historico } from "../src/radar/hist/presidencial.js";


export function mountHistorico(root: HTMLElement, ler: Ler = lerJson) {
  const st: Estado = { ano: 2022, turno: 2 };
  let dados: Historico | null = null, falhou = false, aberto = false, pedido = false;

  function desenhar() {
    keepFocus(root, () => { root.innerHTML = dados ? historicoView(dados.anos, st) : falhou ? semDados() : `<p class="empty" role="status">Carregando o histórico…</p>`; });
  }
  const carregar = () => {
    if (dados || pedido) return;
    pedido = true;
    ler<Historico>("data/historico/presidente.json").then((d) => { dados = d; falhou = false; }).catch(() => { falhou = true; }).then(() => { pedido = false; if (aberto) desenhar(); });
  };

  root.addEventListener("click", (e) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>("[data-his-ano],[data-his-turno]");
    if (!alvo) return;
    if (alvo.dataset.hisAno) { st.ano = Number(alvo.dataset.hisAno); st.turno = 2; } // 2 falls back to the last round the year had
    else if (alvo.dataset.hisTurno) st.turno = Number(alvo.dataset.hisTurno) as 1 | 2;
    desenhar();
  });

  return {
    show() { aberto = true; carregar(); desenhar(); },
    hide() { aberto = false; },
    get estado() { return st; },
  };
}
