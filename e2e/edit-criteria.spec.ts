import type { Page } from "@playwright/test";
import { expect, gotoPlaces, test } from "./fixtures";
import { addPlace, addToList, createList, rate } from "./helpers";

// Journey 7 — edit criteria in /settings (rename / add / remove / reorder) → composite scores
// update accordingly. Exercises lib/ranking.ts's live-criterion contract end to end: a rename
// is purely cosmetic (same id, same math), a new criterion counts once — and only once — it's
// actually rated (a missing key never enters `place.ratings`), and deleting a criterion
// (deleteCriterion only tombstones the row; it never touches `place.ratings`) makes its
// already-entered scores stop counting, per CriteriaEditor's own delete-confirm copy.

const PLACE = "Tacos El Bosque";
const LIST = "Best value";

/**
 * The place's composite-score Chip for one list, on its own detail page. Scoped by excluding
 * the plain "Lists" section toggle Chip — its accessible name is exactly the list name with no
 * score appended, while the scored chip's name always has the score text after it — rather than
 * a section's utility classes, which the app's active restyling could change for no reason
 * relevant to this test. Once a place belongs to a list, both chips carry the list's name, so a
 * bare name regex would match both and trip strict mode.
 */
function scoreChip(page: Page, listName: string) {
  return page
    .getByRole("button", { name: new RegExp(listName) })
    .filter({ hasNotText: new RegExp(`^${listName}$`) });
}

test("renaming a criterion updates its label everywhere without changing the composite score", async ({
  page,
}) => {
  await addPlace(page, PLACE);
  // Cost 4, Food quality 2 -> (4+2)/2 = 3.0 (list's weights map starts empty, so both default
  // to weight 1 — same "missing" semantics list-weights.spec.ts pins).
  await rate(page, PLACE, { Cost: 4, "Food quality": 2 });
  await createList(page, LIST);
  await addToList(page, PLACE, LIST);
  await expect(scoreChip(page, LIST)).toContainText("3.0");
  await expect(page.getByText("Cost", { exact: true })).toBeVisible();

  await page.goto("/settings");
  // CriterionRow's name button starts inline rename; commit happens on blur (Enter blurs it).
  // exact: true throughout — a bare substring "Cost" also matches that row's own "Move Cost
  // up/down" and "Delete Cost" controls, which all carry "Cost" in their aria-label.
  await page.getByRole("button", { name: "Cost", exact: true }).click();
  const input = page.getByLabel("Rename Cost");
  await input.fill("Price");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Price", exact: true })).toBeVisible();

  await gotoPlaces(page);
  await page.getByRole("link", { name: new RegExp(PLACE) }).click();
  // Same rename must show up on the read-only Ratings section (also driven by useCriteria) —
  // "Cost" must be gone, not just "Price" present, or a stale second row would pass this too.
  await expect(page.getByText("Cost", { exact: true })).toBeHidden();
  await expect(page.getByText("Price", { exact: true })).toBeVisible();
  // The rename is cosmetic only — same criterion id, same rating, same math.
  await expect(scoreChip(page, LIST)).toContainText("3.0");
});

test("a new criterion doesn't affect existing scores until it's actually rated", async ({
  page,
}) => {
  await addPlace(page, PLACE);
  await rate(page, PLACE, { Cost: 4, "Food quality": 2 });
  await createList(page, LIST);
  await addToList(page, PLACE, LIST);
  await expect(scoreChip(page, LIST)).toContainText("3.0");

  await page.goto("/settings");
  await page.getByLabel("New criterion name").fill("Vibe");
  // exact: true — a substring match on "Add" would also hit the nav's "Add a place" control,
  // which stays mounted (CSS-hidden, not removed) on every route at every viewport.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Vibe" })).toBeVisible();

  // Not yet rated for this place: "Vibe" has no key in place.ratings, so compositeScore never
  // even looks at its (default) weight — the score must be untouched.
  await gotoPlaces(page);
  await page.getByRole("link", { name: new RegExp(PLACE) }).click();
  await expect(scoreChip(page, LIST)).toContainText("3.0");

  // Rated now: it joins the average at the implicit weight-1 default, same as any criterion
  // missing from a list's weights map. (4 + 2 + 5) / 3 = 3.666… -> formatScore rounds to 3.7.
  await rate(page, PLACE, { Vibe: 5 });
  await expect(scoreChip(page, LIST)).toContainText("3.7");
});

test("deleting a criterion stops its existing ratings from counting, per the tombstone rule", async ({
  page,
}) => {
  await addPlace(page, PLACE);
  await rate(page, PLACE, { Cost: 4, "Food quality": 2 });
  await createList(page, LIST);
  await addToList(page, PLACE, LIST);
  await expect(scoreChip(page, LIST)).toContainText("3.0");
  // Visible now, asserted hidden after the delete below — so that "hidden" is proven against a
  // real, previously-visible locator rather than a typo'd name matching nothing.
  await expect(page.getByText("Food quality", { exact: true })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete Food quality" }).click();
  // ConfirmBox — not a bare coral div — is what CLAUDE.md requires for a destructive action.
  await expect(
    page.getByText("Existing scores for this criterion will stop counting toward rankings.")
  ).toBeVisible();
  // exact: true — a substring match on "Delete" would also hit "Delete Food quality" (the
  // trigger button still in the DOM behind the confirm box) and every other criterion row's
  // own "Delete <name>" control, tripping strict mode.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Food quality" })).toBeHidden();

  // deleteCriterion tombstones the row; it never touches place.ratings, so the stale "Food
  // quality": 2 entry is still sitting in place.ratings — the score changing is proof that
  // lib/ranking's live-criterion filter (not a data wipe) is what did this. Only Cost=4 now
  // contributes.
  await gotoPlaces(page);
  await page.getByRole("link", { name: new RegExp(PLACE) }).click();
  await expect(scoreChip(page, LIST)).toContainText("4.0");
  // The place-detail Ratings section reads the same live criteria list, so the deleted
  // criterion's row must be gone there too.
  await expect(page.getByText("Food quality", { exact: true })).toBeHidden();
});

test("reordering criteria in Settings changes their order everywhere criteria are listed", async ({
  page,
}) => {
  await addPlace(page, PLACE);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  const deleteButtons = page.getByRole("button", { name: /^Delete / });
  await expect
    .poll(() => deleteButtons.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))))
    .toEqual(["Delete Cost", "Delete Food quality", "Delete Service", "Delete Ambiance"]);

  // Swaps Cost and Food quality's sortOrder (CriteriaEditor.moveCriterion) — proven visible
  // both before (above) and after (below), so this isn't a vacuous reorder.
  await page.getByRole("button", { name: "Move Cost down" }).click();
  await expect
    .poll(() => deleteButtons.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))))
    .toEqual(["Delete Food quality", "Delete Cost", "Delete Service", "Delete Ambiance"]);

  // The same sortOrder drives useCriteria() everywhere, including the place-detail "Edit
  // ratings" sheet — reordering in Settings must reorder that sheet's rows too, with no
  // separate step to keep them in sync.
  await gotoPlaces(page);
  await page.getByRole("link", { name: new RegExp(PLACE) }).click();
  await page.getByRole("button", { name: "Edit ratings" }).click();
  const sheet = page.getByRole("dialog", { name: "Ratings" });
  const radiogroups = sheet.getByRole("radiogroup");
  await expect
    .poll(() => radiogroups.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))))
    .toEqual(["Food quality", "Cost", "Service", "Ambiance"]);
});
