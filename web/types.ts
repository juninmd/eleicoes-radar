// Shapes of the JSON the browser reads (web/data/*.json), taken from what the build writes so the two cannot drift.
// Type-only imports: the transpiler erases them, so the image never needs src/radar.
import type { toPublic } from "../src/radar/build";
import type { FornecedorView } from "../src/radar/suppliers/view";

// `fornecedores` is not in the UF file any more: it comes from <UF>-forn.json. undefined = not loaded yet, null = none.
// Old data still carries it in the UF file, and the client uses that as is.
export type Candidatura = ReturnType<typeof toPublic> & { fornecedores?: FornecedorView[] | null };
