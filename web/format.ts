const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const ELEICAO = new Date("2026-10-04T00:00:00"); // 1st round

type Num = number | null | undefined;

export const money = (v: Num) => brl.format(v ?? 0);
export const moneyShort = (v: Num) => `R$ ${compact.format(v ?? 0)}`;
export const pct = (v: Num, d = 0) => `${((v ?? 0) * 100).toFixed(d).replace(".", ",")}%`;
export const int = (v: Num) => (v ?? 0).toLocaleString("pt-BR");

const esc: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const h = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => esc[c]);

// TSE names come in upper case; title-case them for reading, keeping particles lower.
const LOWER = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
export const titleName = (s: unknown) =>
  String(s ?? "").split(" ").map((w, i) => (i > 0 && LOWER.has(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");

// Ballot name is how voters know the candidate; the civil name is the fallback.
export const displayName = (c: { urna?: string | null; nome: string }) => titleName(c.urna || c.nome);
export const slug = (s: unknown) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").trim().replace(/\s+/g, "-");

// Incumbency labels; "nao-verificado" has none on purpose (unknown is not "new").
export const STATUS: Record<string, { curto: string; longo: string }> = {
  reeleicao: { curto: "reeleição", longo: "Tenta a reeleição" },
  "outro-cargo": { curto: "muda de cargo", longo: "Tem mandato e disputa outro cargo" },
  "ja-exerceu": { curto: "ex-suplente", longo: "Já exerceu mandato como suplente nesta legislatura" },
  novo: { curto: "estreante", longo: "Sem mandato federal: primeira vez no cargo" },
  "nao-verificado": { curto: "", longo: "Situação não verificável (sem base oficial de mandatos estaduais e executivos)" },
};
