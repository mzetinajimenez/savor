import { expect, gotoPlaces, test } from "./fixtures";

// Journey 1 — first run: empty state → seeded criteria → add a first place.
//
// This is the journey that most needs a real browser. `ensureSeeded` keys "first run" off the
// singleton `meta` row, and every lib/ test for it runs against fake-indexeddb inside Node. Here
// the database is a genuine, genuinely-empty IndexedDB in a fresh browser context, so the seed
// path runs exactly as it does on a user's first launch.

// The four criteria lib/db.ts seeds, in sortOrder. Duplicated from DEFAULT_CRITERIA_NAMES on
// purpose: importing the constant would let a change to it silently rewrite the expectation
// this test exists to pin.
const SEEDED_CRITERIA = ["Cost", "Food quality", "Service", "Ambiance"];

test("a fresh install shows the onboarding empty state", async ({ page }) => {
  await gotoPlaces(page);

  await expect(page.getByRole("heading", { name: "Nothing on the table yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add your first place" })).toBeVisible();
});

test("a fresh install hides the filters and view toggle until a place exists", async ({
  page,
}) => {
  await gotoPlaces(page);
  await expect(page.getByRole("heading", { name: "Nothing on the table yet" })).toBeVisible();

  // app/page.tsx gates both behind `hasAnyPlaces` — an empty install should offer nothing to
  // filter or toggle, so a first-time user sees one action, not a chrome-heavy shell.
  await expect(page.getByRole("button", { name: "Map" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Been" })).toBeHidden();
});

test("a fresh install seeds exactly the four default criteria, in order", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

  // Every criterion row renders a "Delete <name>" control, so these double as an enumeration
  // of what was seeded — and assert the count, which is what catches a double-seed.
  const deleteButtons = page.getByRole("button", { name: /^Delete / });
  await expect(deleteButtons).toHaveCount(SEEDED_CRITERIA.length);

  // Compared as an ordered list, so this pins sortOrder as well as membership — the criteria
  // render in the order lib/db.ts seeded them, and a reorder regression would show up here.
  await expect
    .poll(() =>
      deleteButtons.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))
    )
    .toEqual(SEEDED_CRITERIA.map((name) => `Delete ${name}`));
});

test("seeding is idempotent across reloads", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(
    SEEDED_CRITERIA.length
  );

  // ensureSeeded runs on every boot via AppInit. The `meta` row is what makes the second run a
  // no-op; if that guard ever regressed, this reload would leave eight criteria behind.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(
    SEEDED_CRITERIA.length
  );
});
