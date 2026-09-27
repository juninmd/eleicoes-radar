// Quote-aware CSV parser: TSE/Câmara files embed newlines
// and delimiters inside quoted fields, so a naive split("\n") corrupts rows.
export type Row = Record<string, string>;

// Incremental parser: feed() may be called with arbitrary chunks (quotes and CRLF can
// straddle chunk boundaries), end() flushes the last record.
export function createCsvParser(delimiter = ";") {
  let header: string[] | null = null;
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let quotePending = false; // '"' inside quotes at a chunk end: escaped quote or closing?
  let crPending = false;
  let first = true;

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

  function* feed(text: string): Generator<Row> {
    let i = 0;
    if (first) {
      first = false;
      if (text.charCodeAt(0) === 0xfeff) i = 1;
    }
    for (; i < text.length; i++) {
      const c = text[i];
      if (crPending) {
        crPending = false;
        if (c === "\n") continue;
      }
      if (quotePending) {
        quotePending = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        inQuotes = false;
      }
      if (inQuotes) {
        if (c === '"') {
          if (i + 1 === text.length) quotePending = true;
          else if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === delimiter) {
        record.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r") {
          if (i + 1 === text.length) crPending = true;
          else if (text[i + 1] === "\n") i++;
        }
        const row = emit();
        if (row) yield row;
      } else field += c;
    }
  }

  function* end(): Generator<Row> {
    if (field !== "" || record.length > 0) {
      const row = emit();
      if (row) yield row;
    }
  }
  return { feed, end };
}

export function* parseCsv(text: string, delimiter = ";"): Generator<Row> {
  const p = createCsvParser(delimiter);
  yield* p.feed(text);
  yield* p.end();
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
