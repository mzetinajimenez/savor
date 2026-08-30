import { defineConfig, devices } from "@playwright/test";

// Playwright drives a PRODUCTION build, not `next dev`. savor's riskiest UI behaviour is
// bundler- and boundary-sensitive — the `?sheet=` history entries depend on Next's `__NA`
// marker, and the maplibre worker only resolves through the static file the prebuild step
// copies — so a dev-server pass would exercise a different app than the one that ships.
//
// Port 3100 is dedicated to this suite: `next dev` runs on 3001 in this repo, and 3000 is
// left free for a parallel agent. A fixed port keeps `reuseExistingServer` usable locally
// without ever colliding with a dev server someone left running.
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",

  // Each test gets its own browser context, and therefore its own empty IndexedDB. That is
  // what makes first-run seeding testable at all: there is no `fake-indexeddb` here and no
  // reset hook to call — every test genuinely starts as a fresh install.
  fullyParallel: true,

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // savor is mobile-first, but Phase 5 gave ≥md its own navigation surface: BottomNav is
  // `md:hidden` and NavRail is `hidden md:flex`. They are genuinely different controls, so a
  // single viewport would leave one of them entirely uncovered. Both projects run every spec.
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],

  webServer: {
    // `npm run build` runs the prebuild maplibre-worker copy via npm's prebuild hook.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
