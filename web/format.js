const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const ELEICAO = new Date("2026-10-04T00:00:00"); // 1st round

export const money = (v) => brl.format(v ?? 0);
export const moneyShort = (v) => `R$ ${compact.format(v ?? 0)}`;
export const pct = (v, d = 0) => `${((v ?? 0) * 100).toFixed(d).replace(".", ",")}%`;
export const int = (v) => (v ?? 0).toLocaleString("pt-BR");

const esc = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => esc[c]);

// TSE names come in upper case; title-case them for reading, keeping particles lower.
const LOWER = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
export const titleName = (s) =>
  String(s ?? "").split(" ").map((w, i) => (i > 0 && LOWER.has(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");

// Ballot name is how voters know the candidate; the civil name is the fallback.
export const displayName = (c) => titleName(c.urna || c.nome);
export const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").trim().replace(/\s+/g, "-");

// Incumbency labels; "nao-verificado" has none on purpose (unknown is not "new").
export const STATUS = {
  reeleicao: { curto: "reeleição", longo: "Tenta a reeleição" },
  "outro-cargo": { curto: "muda de cargo", longo: "Tem mandato e disputa outro cargo" },
  "ja-exerceu": { curto: "ex-suplente", longo: "Já exerceu mandato como suplente nesta legislatura" },
  novo: { curto: "estreante", longo: "Sem mandato federal: primeira vez no cargo" },
  "nao-verificado": { curto: "", longo: "Situação não verificável (sem base oficial de mandatos estaduais e executivos)" },
};
