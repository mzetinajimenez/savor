// Turbopack (Next.js's bundler, for both `dev` and `build`) doesn't correctly resolve
// maplibre-gl v6's automatic Blob+import.meta.url worker detection — see
// https://github.com/maplibre/maplibre-gl-js/issues/8126 (open, no fix yet). The workaround is
// to serve the worker as a plain static file, untouched by any bundler, and point at it with
// maplibregl.setWorkerUrl() (see lib/mapStyle.ts's MAPLIBRE_WORKER_URL).
//
// The worker's own dist file imports a sibling, maplibre-gl-shared.mjs, via a plain relative
// import — both must sit in the same directory, copied verbatim, or the worker 404s on its own
// first import and every tile silently never loads (no console error — see the design doc's
// note on how misleadingly silent a broken tile path is).
//
// Runs via package.json's postinstall/predev/prebuild hooks, never committed (see .gitignore) —
// this keeps the copy from ever drifting out of sync with whatever maplibre-gl version actually
// installed, which is exactly the failure mode a stale committed copy hit in the upstream issue.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(repoRoot, "node_modules", "maplibre-gl", "dist");
const destDir = join(repoRoot, "public", "lib", "maplibre");

mkdirSync(destDir, { recursive: true });

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
