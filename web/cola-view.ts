// The "Minha cola" box: its list, and the copy / clear / print buttons.
import { colaRows } from "./cola.js";
import { h, titleName } from "./format.js";

export const colaText = (cola, ballots) =>
  ["Minha cola · Eleições 2026 · 4 de outubro", ...colaRows(cola, ballots).map(({ label, pick: p }) =>
    `${label}: ${p ? `${p.num} ${titleName(p.nome)} (${p.partido})` : "—"}`)].join("\n");

export function colaHtml(cola, ballots, avatar) {
  return colaRows(cola, ballots).map(({ b, label, pick }) => `
    <li>${pick ? avatar(pick, "xs") : `<span class="av xs ini" aria-hidden="true"></span>`}<span>${h(label)}</span><span class="num">${pick ? h(pick.num) : "_".repeat(b.digits)}</span><small>${pick ? h(`${titleName(pick.nome)} (${pick.partido})`) : "em branco na cola"}</small></li>`).join("");
}

// get() reads the current cola; clear() empties it and re-renders.
export function mountColaButtons({ get, ballots, clear }) {
  const $ = (s) => document.querySelector(s);
  $("#copiar").addEventListener("click", () => {
    const text = colaText(get(), ballots);
    const done = (msg) => { $("#copiar-status").textContent = msg; };
    const manual = () => { $("#cola-texto").value = text; $("#cola-texto").hidden = false; $("#cola-texto").select(); done("Selecione e copie o texto."); };
    // No clipboard API (plain http outside localhost, old browsers): without this branch the click did nothing at all.
    if (!navigator.clipboard) return manual();
    navigator.clipboard.writeText(text).then(() => done("Cola copiada."), manual);
  });
  $("#limpar").addEventListener("click", clear);
  $("#imprimir").addEventListener("click", () => window.print());
}
