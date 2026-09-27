// Streaming-free but quote-aware CSV parser: TSE/Câmara files embed newlines
// and delimiters inside quoted fields, so a naive split("\n") corrupts rows.
export type Row = Record<string, string>;

export function* parseCsv(text: string, delimiter = ";"): Generator<Row> {
  let header: string[] | null = null;
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const emit = (): Row | null => {
    record.push(field);
    field = "";
    const cols = record;
    record = [];
    if (!header) {
      header = cols.map((h) => h.trim());
      return null;
    }
    if (cols.length === 1 && cols[0] === "") return null;
    const row: Row = {};
    for (let i = 0; i < header.length; i++) row[header[i]!] = cols[i] ?? "";
    return row;
  };

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      const row = emit();
      if (row) yield row;
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    const row = emit();
    if (row) yield row;
  }
}

export const decodeLatin1 = (buf: Uint8Array | ArrayBuffer) => new TextDecoder("latin1").decode(buf);

// "1.234,56" (pt-BR) and "1234.56" both appear across sources.
export function parseNumber(s: string | undefined): number {
  if (!s) return 0;
  const t = s.trim();
  if (t === "" || t === "#NULO" || t === "#NE") return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}
