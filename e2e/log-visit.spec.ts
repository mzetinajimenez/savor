import { expect, test } from "./fixtures";
import { addPlace } from "./helpers";

// Journey 5 — log a visit on a place, then review it in the Journal tab. VisitForm has two
// entry points that share one component (app/components/visits/VisitForm.tsx): "fixed" mode
// from a place's own detail page (the place is already known, no picker) and "standalone" mode
// from the Journal tab (the user picks a place from a searchable list). Both are exercised here
// since they're genuinely different code paths, not just different buttons into the same form.

const PLACE_A = "Tacos El Bosque";
const PLACE_B = "Ramen Yama";

// Local-timezone YYYY-MM-DD, matching VisitForm's own todayStr() (see its comment: deliberately
// not toISOString(), which is UTC and can read as the wrong calendar day). Computed at test run
// time against whatever machine actually runs the suite, not hardcoded — a hardcoded date would
// silently stop exercising the "Today" grouping the day the suite is run on a different one.
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function shiftDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const shifted = new Date(y, (m ?? 1) - 1, (d ?? 1) + delta);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(
    shifted.getDate()
  ).padStart(2, "0")}`;
}

test("a fresh journal shows the empty state, and its header keeps a Log a visit control even then", async ({
  page,
}) => {
  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your journal is empty" })).toBeVisible();

  // JournalPage renders LogVisitButton twice while empty — once in HeaderShell's action slot
  // (always present) and once inside EmptyState (only while empty) — both fire the same
  // form.openSheet, so .first() is enough to prove the control is real without caring which
  // copy Playwright happens to hit.
  await expect(page.getByRole("button", { name: "Log a visit" }).first()).toBeVisible();
});

test("logging a visit from a place's own detail page appends it to the journal, grouped under Today", async ({
  page,
}) => {
  await addPlace(page, PLACE_A);

  await page.getByRole("link", { name: new RegExp(PLACE_A) }).click();
  await expect(page.getByRole("heading", { name: PLACE_A, level: 1 })).toBeVisible();

  // Fixed mode: the place is pre-selected (VisitForm's `placeId` prop), so there is no picker —
  // this is the code path that never renders VisitForm's radiogroup at all.
  await page.getByRole("button", { name: "Log visit" }).click();
  const sheet = page.getByRole("dialog", { name: "Log a visit" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("radiogroup", { name: "Select a place" })).toBeHidden();
  await expect(sheet.getByText(PLACE_A)).toBeVisible();

  await sheet.getByLabel("Dishes").fill("Al pastor tacos");
  await sheet.getByLabel("Notes").fill("Went back for seconds");
  await sheet.getByRole("button", { name: "Save visit" }).click();
  await expect(sheet).toBeHidden();

  // Also lands in the place's own "Visits" section — a second, independent read of the same
  // write, not just the Journal's.
  await expect(page.getByText("Al pastor tacos")).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Your journal is empty" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  const row = page.getByRole("link", { name: new RegExp(PLACE_A) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Al pastor tacos");
  await expect(row).toContainText("Went back for seconds");
});

test("logging a visit from the Journal's picker resolves the place by name, and Save stays disabled until one is chosen", async ({
  page,
}) => {
  await addPlace(page, PLACE_A);
  await addPlace(page, PLACE_B);

  await page.goto("/journal");
  await page.getByRole("button", { name: "Log a visit" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Log a visit" });
  await expect(sheet).toBeVisible();

  // Standalone mode: nothing is pre-selected, so canSave is false until a radio is picked —
  // this is the half of VisitForm's `canSave` gate fixed mode never exercises.
  const saveButton = sheet.getByRole("button", { name: "Save visit" });
  await expect(saveButton).toBeDisabled();

  const picker = sheet.getByRole("radiogroup", { name: "Select a place" });
  // Unfiltered, both places list — proves the PLACE_A radio locator is real before the next
  // line asserts it's gone, so that "gone" isn't just a typo'd name matching nothing.
  await expect(picker.getByRole("radio", { name: PLACE_A })).toBeVisible();

  await sheet.getByLabel("Search places").fill("Ramen");
  await expect(picker.getByRole("radio", { name: PLACE_A })).toBeHidden();
  await picker.getByRole("radio", { name: PLACE_B }).click();
  await expect(saveButton).toBeEnabled();

  await sheet.getByLabel("Dishes").fill("Tonkotsu ramen");
  await saveButton.click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("link", { name: new RegExp(PLACE_B) })).toContainText(
    "Tonkotsu ramen"
  );
  // The other place never got a visit — the picker's filter genuinely narrowed the write, not
  // just the display.
  await expect(page.getByRole("link", { name: new RegExp(PLACE_A) })).toBeHidden();
});

test("visits on different dates group under separate headings, newest first", async ({
  page,
}) => {
  await addPlace(page, PLACE_A);
  await addPlace(page, PLACE_B);

  const today = todayStr();
  const yesterday = shiftDays(today, -1);

  await page.goto("/journal");

  // Yesterday's visit, logged first, against PLACE_A.
  await page.getByRole("button", { name: "Log a visit" }).first().click();
  let sheet = page.getByRole("dialog", { name: "Log a visit" });
  await sheet.getByRole("radiogroup", { name: "Select a place" }).getByRole("radio", { name: PLACE_A }).click();
  await sheet.getByLabel("Date").fill(yesterday);
  await sheet.getByRole("button", { name: "Save visit" }).click();
  await expect(sheet).toBeHidden();

  // Today's visit, logged second, against PLACE_B — date defaults to today.
  await page.getByRole("button", { name: "Log a visit" }).first().click();
  sheet = page.getByRole("dialog", { name: "Log a visit" });
  await sheet.getByRole("radiogroup", { name: "Select a place" }).getByRole("radio", { name: PLACE_B }).click();
  await sheet.getByRole("button", { name: "Save visit" }).click();
  await expect(sheet).toBeHidden();

  // Visits arrive newest-date-first (lib/hooks.ts's queryVisits), so "Today" must render above
  // "Yesterday" regardless of the order the two were logged in.
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings).toHaveCount(2);
  await expect.poll(() => headings.allTextContents()).toEqual(["Today", "Yesterday"]);
});

test("a logged visit survives a reload", async ({ page }) => {
  await addPlace(page, PLACE_A);
  await page.getByRole("link", { name: new RegExp(PLACE_A) }).click();
  await page.getByRole("button", { name: "Log visit" }).click();
  const sheet = page.getByRole("dialog", { name: "Log a visit" });
  await sheet.getByLabel("Dishes").fill("Al pastor tacos");
  await sheet.getByRole("button", { name: "Save visit" }).click();
  await expect(sheet).toBeHidden();

  await page.goto("/journal");
  await expect(page.getByRole("link", { name: new RegExp(PLACE_A) })).toContainText(
    "Al pastor tacos"
  );

  // The write went to IndexedDB, not React state — mirrors add-place-manually.spec.ts's
  // identical reload assertion for places.
  await page.reload();
  await expect(page.getByRole("link", { name: new RegExp(PLACE_A) })).toContainText(
    "Al pastor tacos"
  );
});
