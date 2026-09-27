// Minimal HTML table reader for MediaWiki output: expands rowspan/colspan into a
// rectangular grid of plain-text cells and remembers the section each table sits in.

export interface Table {
  section: string[]; // heading path, e.g. ["Segundo Turno", "Tarcísio e Haddad", "2026"]
  year: number | null; // from a collapsible "2025" block or a year heading; dates in cells omit it
  rows: Cell[][];
}
export interface Cell {
  text: string;
  header: boolean;
  bg: string | null; // background color hint (winner highlight), unused by parsers today
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", ndash: "–", mdash: "—", minus: "−" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function cellText(html: string): string {
  return decodeEntities(
    html
      .replace(/<sup[\s\S]*?<\/sup>/gi, "") // footnote markers
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ?? null;
const span = (tag: string, name: string) => Math.max(1, Math.min(200, Number(attr(tag, name)) || 1));

// Grid expansion: `pending[col]` carries a rowspan cell down into later rows.
function expand(tableHtml: string): Cell[][] {
  const grid: Cell[][] = [];
  const pending: { cell: Cell; left: number }[] = [];
  for (const tr of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)(?=<tr[\s>]|<\/tbody>|<\/table>|$)/gi)) {
    const row: Cell[] = [];
    let col = 0;
    const fill = () => {
      while (pending[col]?.left) {
        row[col] = pending[col].cell;
        pending[col].left--;
        col++;
      }
    };
    for (const m of tr[1].matchAll(/<(t[hd])(\s[^>]*)?>([\s\S]*?)(?=<t[hd][\s>]|<\/tr>|$)/gi)) {
      fill();
      const tag = m[2] ?? "";
      const cell: Cell = { text: cellText(m[3]), header: m[1].toLowerCase() === "th", bg: /background:\s*([^;"]+)/i.exec(tag)?.[1]?.trim() ?? null };
      const cs = span(tag, "colspan");
      const rs = span(tag, "rowspan");
      for (let i = 0; i < cs; i++) {
        row[col] = cell;
        if (rs > 1) pending[col] = { cell, left: rs - 1 };
        col++;
      }
    }
    fill();
    if (row.length) grid.push(Array.from(row, (c) => c ?? { text: "", header: false, bg: null }));
  }
  return grid;
}

export function parseTables(html: string): Table[] {
  const out: Table[] = [];
  const path: string[] = [];
  let block: number | null = null; // year of the enclosing collapsible block
  // Walk headings, collapsible year titles and tables in document order.
  const re =
    /<h([2-5])[^>]*>([\s\S]*?)<\/h\1>|<div class="hidden-title[^"]*"[^>]*>\s*((?:19|20)\d\d)\s*<\/div>|<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  for (const m of html.matchAll(re)) {
    if (m[1]) {
      const level = Number(m[1]) - 2;
      path.length = level;
      path[level] = cellText(m[2]).replace(/\[editar.*$/i, "").trim();
      if (level < 2) block = null; // a new race or turn section closes any year block
    } else if (m[3]) {
      block = Number(m[3]);
    } else {
      const sections = path.filter(Boolean);
      const headingYear = [...sections].reverse().find((s) => /^(?:19|20)\d\d$/.test(s));
      out.push({ section: sections, year: block ?? (headingYear ? Number(headingYear) : null), rows: expand(m[4]!) });
    }
  }
  return out;
}
