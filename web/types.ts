// Shapes of the JSON the browser reads (web/data/*.json), taken from what the build writes so the two cannot drift.
// Type-only imports: the transpiler erases them, so the image never needs src/radar.
import type { toPublic } from "../src/radar/build";

export type Candidatura = ReturnType<typeof toPublic>;
