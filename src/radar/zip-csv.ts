// Streams one latin1 CSV out of a (possibly multi-GB) TSE zip without materialising it.
import { Unzip, UnzipInflate } from "fflate";
import { createCsvParser, type Row } from "./csv";

export async function forEachZipRow(zipPath: string, fileName: string, onRow: (r: Row) => void): Promise<number> {
  const parser = createCsvParser(";");
  const decoder = new TextDecoder("latin1");
  let found = false;
  let failure: Error | null = null;
  let rows = 0;
  const drain = (it: Iterable<Row>) => {
    for (const r of it) {
      rows++;
      onRow(r);
    }
  };
  const unzip = new Unzip((file) => {
    if (file.name !== fileName) return;
    found = true;
    file.ondata = (err, chunk, final) => {
      if (err) failure = err;
      else {
        drain(parser.feed(decoder.decode(chunk, { stream: !final })));
        if (final) drain(parser.end());
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for await (const chunk of Bun.file(zipPath).stream()) {
    unzip.push(chunk);
    if (failure) throw failure;
  }
  unzip.push(new Uint8Array(0), true);
  if (failure) throw failure;
  if (!found) throw new Error(`${fileName} não está em ${zipPath}`);
  return rows;
}
