import { test as base, expect, type Page } from "@playwright/test";

// Every spec imports `test` from here rather than from @playwright/test directly, so the
// network guard below can never be forgotten on a new spec.
//
// savor talks to exactly one external service: Photon (OSM geocoding), reached through the
// app's own /api/lookup proxy (app/api/lookup/route.ts owns the User-Agent). Letting a test
// hit it for real would make the suite depend on a third party's uptime, rate limits and
// result ranking — so /api/lookup is stubbed to an empty result set by default.
//
// Empty, not aborted, on purpose: lib/lookup.ts keeps three outcomes distinct (failure /
// empty / results), and an aborted request is the *failure* path. A test that means "this
// place has no suggestions" must not accidentally assert against "the lookup broke". A spec
// that wants either of the other two outcomes overrides the route itself.
export const test = base.extend<{ stubLookup: void }>({
  stubLookup: [
    async ({ page }, use) => {
      await page.route("**/api/lookup**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        })
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Waits for the app to finish its first-run boot: AppInit runs ensureSeeded() and the Places
 * tab renders nothing definitive until Dexie's live queries resolve. Keying off the header
 * (always present) plus the absence of the loading gap avoids racing the empty state.
 */
export async function gotoPlaces(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Places", level: 1 })).toBeVisible();
}
