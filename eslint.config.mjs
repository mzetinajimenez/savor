import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // scripts/copy-maplibre-worker.mjs's output — a third-party file copied verbatim, not
    // source we own. Never committed (see .gitignore) but present locally after install/build.
    "public/lib/maplibre/**",
  ]),
]);

export default eslintConfig;
