import type { Candidatura } from "./types.js";
import { h } from "./format.js";

export const REDE_NOME: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", x: "X", tiktok: "TikTok", youtube: "YouTube",
  kwai: "Kwai", threads: "Threads", linkedin: "LinkedIn", telegram: "Telegram", linktree: "Linktree",
};

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const mesAno = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;

const SEM_HANDLE = new Set(["profile.php", "watch", "playlist", "channel", "share", "home"]);
// "@handle" from the first path segment; ids and long paths fall back to the platform name alone.
function handle(u: string) {
  const parts = new URL(u).pathname.split("/").filter(Boolean);
  const seg = parts[0] === "c" || parts[0] === "user" ? parts[1] ?? "" : (parts.length > 1 ? "" : parts[0] ?? ""); // /channel/ID, /watch, /profile.php have no handle
  const s = seg.replace(/^@/, "");
  return /^[\w.]{2,30}$/.test(s) && !SEM_HANDLE.has(s.toLowerCase()) ? `@${s}` : "";
}

export function canaisBlock(c: Pick<Candidatura, "canais" | "bio">) {
  const canais = c.canais ?? [];
  const seg = c.bio?.seguidores ?? [];
  const site = c.bio?.site;
  const escolaridade = c.bio?.escolaridade;
  if (!canais.length && !seg.length && !site && !escolaridade) return "";
  const links = canais.map((k) => {
    const hd = handle(k.u);
    return `<li><a class="ext" href="${h(k.u)}" target="_blank" rel="noopener noreferrer">${h(REDE_NOME[k.r] ?? k.r)}${hd ? ` <small class="muted">${h(hd)}</small>` : ""}${k.c ? ` <small class="muted">(Câmara)</small>` : ""}<span aria-hidden="true"> ↗</span></a></li>`;
  });
  const siteValido = site && /^https?:\/\//i.test(site) ? site : null;
  if (siteValido) links.unshift(`<li><a class="ext" href="${h(siteValido)}" target="_blank" rel="noopener noreferrer">Site<span aria-hidden="true"> ↗</span></a></li>`);
  const followers = seg.length
    ? `<h4>Seguidores <small class="muted">Wikidata, contagem de cada data</small></h4>
       <ul class="seguidores">${seg.map((s) => `<li><span>${h(REDE_NOME[s.rede] ?? s.rede)}</span><span class="fonte">${compact.format(s.n)} em ${mesAno(s.em)}</span></li>`).join("")}</ul>
       <p class="muted small">Contagem editada por voluntários no Wikidata; pode estar defasada. Seguidores não entram na nota.</p>`
    : "";
  return `<section id="d-canais"><h3>Canais oficiais <small>declarados ao TSE</small></h3>
    ${links.length ? `<ul class="canais">${links.join("")}</ul>` : ""}
    ${followers}
    ${escolaridade ? `<p class="muted">Escolaridade (Câmara): ${h(escolaridade)}</p>` : ""}</section>`;
}
