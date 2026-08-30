// Shared setup helpers used across multiple spec files (log-visit, list-weights,
// edit-criteria). Genuinely spec-specific helpers — todayStr/shiftDays in log-visit.spec.ts,
// rankedRow/scoreChip/openList local to their own files — stay local since they have only one
// caller; see CLAUDE.md's convention of keeping shared code in one place once it's actually
// shared. Imports `expect`/`gotoPlaces` from ./fixtures like every spec does, so the network
// stub (stubLookup) is still wired up for any caller of these helpers.

import type { Page } from "@playwright/test";
import { expect, gotoPlaces } from "./fixtures";

// Both nav surfaces expose an "Add a place" control — BottomNav's FAB below `md`, NavRail's
// button at `md` and up — and both stay in the DOM at every viewport, hidden by CSS. Matching
// on visibility is what keeps this working across the mobile and desktop projects without
// either one tripping strict mode on two candidates. See add-place-manually.spec.ts's identical
// helper/comment.
export function addPlaceControl(page: Page) {
  return page.getByRole("button", { name: "Add a place" }).locator("visible=true");
}

/**
 * Adds a place from the Places tab's empty/nav entry point. `status` defaults to "been" — that
 * matches PlaceForm's own default when opened with no prefill (see emptyForm in
 * app/components/places/PlaceForm.tsx), so most callers never need to pass it.
 */
export async function addPlace(
  page: Page,
  name: string,
  status: "been" | "want_to_try" = "been"
): Promise<void> {
  await gotoPlaces(page);
  await addPlaceControl(page).click();
  const sheet = page.getByRole("dialog", { name: "Add a place" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Name").fill(name);
  if (status === "want_to_try") {
    await sheet.getByRole("button", { name: "Want to try" }).click();
  }
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
}

/**
 * Rates a "been" place on a subset of the four seeded criteria via the place-detail "Edit
 * ratings" sheet — the only rating surface that actually persists (place detail's own Ratings
 * section is a read-only RatingRow with no onChange). A criterion left out of `ratings` never
 * appears in `place.ratings` at all, which is what lets a caller control which criteria
 * contribute without needing to touch every one of the four seeded defaults.
 */
export async function rate(
  page: Page,
  placeName: string,
  ratings: Record<string, number>
): Promise<void> {
  await gotoPlaces(page);
  await page.getByRole("link", { name: new RegExp(placeName) }).click();
  await expect(page.getByRole("heading", { name: placeName, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Edit ratings" }).click();
  const sheet = page.getByRole("dialog", { name: "Ratings" });
  await expect(sheet).toBeVisible();
  for (const [criterion, value] of Object.entries(ratings)) {
    await sheet
      .getByRole("radiogroup", { name: criterion })
      .getByRole("radio", { name: `${value} of 5` })
      .click();
  }
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
}

export async function createList(page: Page, name: string): Promise<void> {
  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "Lists", level: 1 })).toBeVisible();
  // HeaderShell's action button and (while the tab is empty) EmptyState's own button share the
  // name "New list" and are both mounted at once — .first() picks either; they fire the same
  // form.openSheet.
  await page.getByRole("button", { name: "New list" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New list" });
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
}

/**
 * Adds `placeName` to `listName` from place detail's "Lists" Chip row. Scoped to the `<section>`
 * containing the "Lists" heading — once a place actually belongs to a scored category, its name
 * shows up in TWO Chips (this toggle, and the read-only composite-score Chip near the top of
 * the page), and a bare name regex would match both and trip strict mode.
 *
 * A single click is enough: lib/repo.ts's toggleCategoryOnPlace re-reads the place inside a
 * Dexie `rw` transaction (rather than the old app-side read-modify-write on a closed-over
 * `categoryIds` array), so the lost-update race that used to make this toggle occasionally
 * silently no-op is fixed at the source — no test-side retry needed.
 */
export async function addToList(page: Page, placeName: string, listName: string): Promise<void> {
  await gotoPlaces(page);
  await page.getByRole("link", { name: new RegExp(placeName) }).click();
  await expect(page.getByRole("heading", { name: placeName, level: 1 })).toBeVisible();
  const listsSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lists", level: 2 }) });
  const chip = listsSection.getByRole("button", { name: new RegExp(listName) });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
}
