import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addPlace, addToList, createList, rate } from "./helpers";

// Journey 6 — create a list (Category) → set per-criterion weights in WeightsEditor → watch
// places re-rank in /categories/[id]. Pins the ranking semantics from CLAUDE.md's Product
// decisions: composite score = Σ(w·r)/Σ(w) derived at render; a criterion MISSING from a list's
// `weights` map defaults to weight 1 (lists don't re-enumerate weights when a new criterion
// appears) while an EXPLICIT 0 excludes it — "missing" ≠ "0"; ties are at display precision
// under standard competition ranking (1, 1, 3); and only "been" places are ranked at all.

const PLACE_HIGH_COST = "Tacos El Bosque"; // rated high on Cost, middling on Food quality
const PLACE_HIGH_FOOD = "Ramen Yama"; // rated low on Cost, high on Food quality
const PLACE_WISHLIST = "Sushi Someday"; // status "want_to_try" — must never be ranked

async function openList(page: Page, name: string) {
  await page.goto("/categories");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** The <li> ranked-tab row for a place — used to assert its rank marker and score together. */
function rankedRow(page: Page, placeName: string) {
  return page.getByRole("link", { name: new RegExp(placeName) });
}

test("a new list ranks been places by a plain average, since a missing weight defaults to 1", async ({
  page,
}) => {
  await addPlace(page, PLACE_HIGH_COST);
  await addPlace(page, PLACE_HIGH_FOOD);
  // Cost 5 + Food quality 3 -> (5+3)/2 = 4.0. Service/Ambiance are left unrated on purpose —
  // compositeScore only sums over criteria present in `ratings`, so leaving them out (rather
  // than rating them 0, which isn't a legal rating) is what keeps this a clean two-criterion
  // average.
  await rate(page, PLACE_HIGH_COST, { Cost: 5, "Food quality": 3 });
  // Cost 2 + Food quality 5 -> (2+5)/2 = 3.5.
  await rate(page, PLACE_HIGH_FOOD, { Cost: 2, "Food quality": 5 });

  // createCategory (lib/repo.ts) starts a new list's `weights` map empty — neither Cost nor
  // Food quality has an explicit entry yet, so this is the "missing" half of the missing-vs-0
  // distinction this journey pins.
  await createList(page, "Best value");
  await addToList(page, PLACE_HIGH_COST, "Best value");
  await addToList(page, PLACE_HIGH_FOOD, "Best value");
  await openList(page, "Best value");

  await expect(rankedRow(page, PLACE_HIGH_COST)).toContainText("#1");
  await expect(rankedRow(page, PLACE_HIGH_COST)).toContainText("4.0");
  await expect(rankedRow(page, PLACE_HIGH_FOOD)).toContainText("#2");
  await expect(rankedRow(page, PLACE_HIGH_FOOD)).toContainText("3.5");
});

test("changing weights in the Weights sheet re-ranks places live, and an explicit 0 excludes a criterion", async ({
  page,
}) => {
  await addPlace(page, PLACE_HIGH_COST);
  await addPlace(page, PLACE_HIGH_FOOD);
  await rate(page, PLACE_HIGH_COST, { Cost: 5, "Food quality": 3 });
  await rate(page, PLACE_HIGH_FOOD, { Cost: 2, "Food quality": 5 });
  await createList(page, "Best value");
  await addToList(page, PLACE_HIGH_COST, "Best value");
  await addToList(page, PLACE_HIGH_FOOD, "Best value");
  await openList(page, "Best value");

  // Confirm the pre-change order first (same as the previous test) so the re-rank below is
  // provably a *change*, not just the score this list would always have shown.
  await expect(rankedRow(page, PLACE_HIGH_COST)).toContainText("#1");

  await page.getByRole("button", { name: "Weights" }).click();
  const sheet = page.getByRole("dialog", { name: "Weights" });
  await expect(sheet).toBeVisible();

  // Every criterion starts at the implicit default of 1 (WeightsEditor's valueFor falls back to
  // category.weights[id] ?? 1), so one decrease is enough to reach the explicit-0 floor.
  await sheet.getByRole("button", { name: "Decrease Cost weight" }).click();
  await expect(sheet.getByText("Excluded from score")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await sheet.getByRole("button", { name: "Increase Food quality weight" }).click();
  }
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  // Cost is now weight 0 (excluded) so only Food quality (weight 5) contributes:
  //   PLACE_HIGH_COST: Food quality 3 -> 3.0
  //   PLACE_HIGH_FOOD: Food quality 5 -> 5.0
  // The order flips entirely, which is what proves the re-rank is live off WeightsEditor's
  // save, not a stale render.
  await expect(rankedRow(page, PLACE_HIGH_FOOD)).toContainText("#1");
  await expect(rankedRow(page, PLACE_HIGH_FOOD)).toContainText("5.0");
  await expect(rankedRow(page, PLACE_HIGH_COST)).toContainText("#2");
  await expect(rankedRow(page, PLACE_HIGH_COST)).toContainText("3.0");
});

test("only been places are ranked; a want-to-try place lists separately with no score", async ({
  page,
}) => {
  await addPlace(page, PLACE_HIGH_COST);
  await rate(page, PLACE_HIGH_COST, { Cost: 4 });
  await addPlace(page, PLACE_WISHLIST, "want_to_try");

  await createList(page, "Best value");
  // Both places must actually be in the list for either tab to show them.
  await addToList(page, PLACE_HIGH_COST, "Best value");
  await addToList(page, PLACE_WISHLIST, "Best value");

  await openList(page, "Best value");
  await expect(rankedRow(page, PLACE_HIGH_COST)).toBeVisible();
  // rankCategory (lib/ranking.ts) drops anything whose status isn't "been" before it ever
  // computes a score — this is that filter proven from the UI, not just unit-tested in
  // isolation.
  await expect(rankedRow(page, PLACE_WISHLIST)).toBeHidden();

  await page.getByRole("tab", { name: "Want to try" }).click();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_WISHLIST) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_HIGH_COST) })).toBeHidden();
});

test("places whose scores round to the same display value tie under standard competition ranking", async ({
  page,
}) => {
  // Named so alphabetical tie-break order is unambiguous: within a tie group (no visits logged
  // for either), lib/ranking.ts's rankCategory orders by name ascending.
  const TIED_FIRST = "Bistro Alpha";
  const TIED_SECOND = "Cafe Beta";
  const LOWER = "Diner Gamma";

  await addPlace(page, TIED_FIRST);
  await addPlace(page, TIED_SECOND);
  await addPlace(page, LOWER);
  // Single-criterion ratings, so the composite score is exactly the rating (weight defaults to
  // 1, only one contributing criterion) — the simplest possible tie setup.
  await rate(page, TIED_FIRST, { Cost: 4 });
  await rate(page, TIED_SECOND, { Cost: 4 });
  await rate(page, LOWER, { Cost: 3 });

  await createList(page, "Value");
  await addToList(page, TIED_FIRST, "Value");
  await addToList(page, TIED_SECOND, "Value");
  await addToList(page, LOWER, "Value");
  await openList(page, "Value");

  await expect(rankedRow(page, TIED_FIRST)).toContainText("#1 =");
  await expect(rankedRow(page, TIED_FIRST)).toContainText("4.0");
  await expect(rankedRow(page, TIED_SECOND)).toContainText("#1 =");
  await expect(rankedRow(page, TIED_SECOND)).toContainText("4.0");
  // Standard competition ranking: the tie group has size 2, so the next rank skips to 3, not 2.
  await expect(rankedRow(page, LOWER)).toContainText("#3");
  await expect(rankedRow(page, LOWER)).not.toContainText("#3 =");
  await expect(rankedRow(page, LOWER)).toContainText("3.0");

  // Order on the page also encodes the tie-break: TIED_FIRST above TIED_SECOND (name asc
  // within the tie), both above LOWER. Scoped by matching only this test's own three place
  // names (rather than a section's utility classes, which the app's active restyling could
  // change for no reason relevant to this test) so a nav link elsewhere on the page can't join
  // the count.
  const rankedLinks = page.getByRole("link", {
    name: new RegExp(`${TIED_FIRST}|${TIED_SECOND}|${LOWER}`),
  });
  await expect(rankedLinks).toHaveCount(3);
  const order = await rankedLinks.evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  expect(order[0]).toContain(TIED_FIRST);
  expect(order[1]).toContain(TIED_SECOND);
  expect(order[2]).toContain(LOWER);
});
