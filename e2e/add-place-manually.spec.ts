import { expect, gotoPlaces, test } from "./fixtures";

// Journey 2 — add a place manually, with no lookup involved. The lookup proxy is stubbed to an
// empty result set by the shared fixture, so this exercises the path a user takes when OSM has
// nothing for what they typed (or when they simply ignore the suggestions).

const PLACE_NAME = "Tacos El Bosque";

// Both nav surfaces expose an "Add a place" control — BottomNav's FAB below `md`, NavRail's
// button at `md` and up — and both stay in the DOM at every viewport, hidden by CSS. Matching
// on visibility is what keeps this working across the mobile and desktop projects without
// either one tripping strict mode on two candidates.
function addPlaceControl(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Add a place" }).locator("visible=true");
}

test("adding a place from the empty state puts it in the list", async ({ page }) => {
  await gotoPlaces(page);
  await page.getByRole("button", { name: "Add your first place" }).click();

  const sheet = page.getByRole("dialog", { name: "Add a place" });
  await expect(sheet).toBeVisible();

  await sheet.getByLabel("Name").fill(PLACE_NAME);

  // No suggestions: the combobox's listbox only renders when there are results to show, and
  // the fixture guarantees there are none.
  await expect(page.getByRole("listbox", { name: "Place suggestions" })).toBeHidden();

  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_NAME) })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing on the table yet" })).toBeHidden();

  // The other half of first-run.spec.ts's "hidden until a place exists" pair. Asserting these
  // appear here is what keeps that test honest: a `toBeHidden` on a name that never matches
  // anything would pass vacuously, so each gated control is pinned from both sides.
  await expect(page.getByRole("button", { name: "Map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Been" })).toBeVisible();
});

test("a saved place survives a reload", async ({ page }) => {
  await gotoPlaces(page);
  await page.getByRole("button", { name: "Add your first place" }).click();

  const sheet = page.getByRole("dialog", { name: "Add a place" });
  await sheet.getByLabel("Name").fill(PLACE_NAME);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_NAME) })).toBeVisible();

  // The write went to IndexedDB, not React state — this is the assertion that savor's
  // device-local persistence actually holds, which no lib/ test can make about the real app.
  await page.reload();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_NAME) })).toBeVisible();
});

test("the nav add-place control opens the sheet once a place exists", async ({ page }) => {
  await gotoPlaces(page);
  await page.getByRole("button", { name: "Add your first place" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a place" });
  await sheet.getByLabel("Name").fill(PLACE_NAME);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_NAME) })).toBeVisible();

  // With the empty state gone, the nav control is the only remaining way in. This is the
  // `savor:add-place` event contract end to end: emitter (nav) → AddPlaceHost → sheet.
  await addPlaceControl(page).click();
  await expect(sheet).toBeVisible();
});

test("cancelling the sheet saves nothing", async ({ page }) => {
  await gotoPlaces(page);
  await page.getByRole("button", { name: "Add your first place" }).click();

  const sheet = page.getByRole("dialog", { name: "Add a place" });
  await sheet.getByLabel("Name").fill(PLACE_NAME);
  await sheet.getByRole("button", { name: "Cancel" }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: "Nothing on the table yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_NAME) })).toBeHidden();
});

test("the sheet closes with the back button, leaving the history stack balanced", async ({
  page,
}) => {
  await gotoPlaces(page);
  await page.getByRole("button", { name: "Add your first place" }).click();

  const sheet = page.getByRole("dialog", { name: "Add a place" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\?sheet=add/);

  // The `?sheet=` mechanism's whole point: Back closes the sheet with no popstate listener of
  // savor's own. A regression here (a pushState missing Next's `__NA` marker) shows up as a
  // full page reload rather than a soft close, which is exactly what CLAUDE.md warns about.
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/\?sheet=add/);
  await expect(page.getByRole("heading", { name: "Nothing on the table yet" })).toBeVisible();
});
