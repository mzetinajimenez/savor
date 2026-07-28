# Supper Club Phase 2 — List Information Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 2 of the Supper Club design overhaul (issue #24) — Address/City
input on the add-place flow, an address line on every place list row, and Ranked/Want-to-try
tabs plus a city filter on the category detail page.

**Architecture:** Presentation-and-one-query-function work on top of the already-merged
Supper Club restyle (Phases 0–1, PR #23/#25, on `main`). One new pure query function +
hook in `lib/hooks.ts` (framework-free, unit-tested); everything else is JSX changes to
already-restyled components, reusing existing tokens and the existing `Chip` primitive. No
schema change, no new dependency, no `lib/repo.ts` change.

**Tech Stack:** Next.js 16 App Router, React, Tailwind v4 (Supper Club `@theme` tokens),
Dexie (via `lib/hooks.ts`/`lib/repo.ts`), Vitest + fake-indexeddb.

## Global Constraints

- **Green before every commit.** `npm test`, `npm run build`, and `npm run lint` must all
  pass after every task's commit.
- **No schema change.** `Place.address?` / `Place.city?` already exist in `lib/types.ts`,
  and `placeFields` in `lib/repo.ts` already validates both (`z.string().optional()`).
  `SCHEMA_VERSION` does not move in this plan.
- **Supper Club tokens only.** No raw hex, no legacy Cellar token names
  (`lib/theme-contract.test.ts` enforces this over every `.tsx` file in `app/`).
- **Contrast floor (from CLAUDE.md):** `sage` is text-legal on `ground`/`ground-deep` only —
  on `raised` (the Sheet body surface) it's 3.85:1 and fails AA; use `cream` there instead.
  `cream/60` fails at 3.86:1; `cream/80` passes at 5.55:1.
- **Radius rule:** `0` (flat, hairline-separated rows) is the default; `rounded-sm` for
  inputs/chips/buttons/sheets; `rounded-full` only for the score seal and small circular
  indicators. Never introduce a new rounded card or pill.
- **Read through hooks, write through repo.** No component imports `dexie` directly. New
  query logic lives in `lib/hooks.ts` as a plain exported async function, unit-tested with
  `fake-indexeddb`, wrapped in a thin `useLiveQuery` hook.
- **Framework-free `lib/`.** `lib/hooks.ts`'s query functions must stay free of React/DOM.
- **`useSearchParams()` requires a `<Suspense>` boundary** around the component that calls
  it, or `next build` fails outright ("useSearchParams() should be wrapped in a suspense
  boundary"). `app/import/page.tsx` already does this split (default export renders only
  `<Suspense>`, an inner component calls the hook) — follow that exact pattern.
- **Tab/filter state changes use `router.replace`, never `router.push`** — switching a tab
  or a filter chip is not a "page" a user should be able to hit Back to un-visit; it must
  not grow the history stack. This mirrors the spec's own reasoning for the `?tab=` param.

---

## File Structure

- Modify `app/places/[id]/page.tsx` — fix a pre-existing contrast bug in `PlaceEditSheet`'s
  form labels (discovered while reviewing this exact field pattern for Task 2; unrelated to
  the rest of Phase 2 but cheap and in-neighborhood).
- Modify `app/components/places/PlaceForm.tsx` — add City + Address inputs to the add-place
  form; remove the now-redundant 📍 read-only line.
- Modify `app/components/places/PlaceCard.tsx` — add an address line under the place name.
- Modify `lib/hooks.ts` — add `queryCategoryCities` + `useCategoryCities`.
- Modify `lib/hooks.test.ts` — unit tests for `queryCategoryCities`.
- Modify `app/categories/[id]/page.tsx` — Suspense split; Ranked/Want-to-try underline tabs
  via `?tab=`; address line on both row types; city filter chip row via `?city=`.

---

### Task 1: Fix `PlaceEditSheet`'s pre-existing label contrast bug

`app/places/[id]/page.tsx`'s `PlaceEditSheet` (the "Edit place" sheet) renders its five form
labels (`Name`, `Cuisine`, `City`, `Address`, `Notes`) with `text-sage`. That sheet's body
renders on `bg-raised` (`components/Sheet.tsx:40`), and per CLAUDE.md's contrast table,
`sage` on `raised` is 3.85:1 — it fails WCAG AA (needs 4.5:1 for normal text). This is the
exact same class of defect the Phase 0-1 migration's final review already found and fixed
at 25 other sites (see `docs/superpowers/sdd/2026-07-27-supper-club-foundation-and-restyle/progress.md`,
finding "C1") — this file evidently used a different label pattern (`<span
className="text-sm font-semibold text-sage">` instead of the `LABEL_CLASS` const other
restyled forms use) and escaped that sweep. Fixing it now because Task 2 is about to add
two more fields to a sibling form using the *correct* (cream) pattern, and shipping a
correctly-styled Add form next to an incorrectly-styled Edit form in the same session would
leave a known, avoidable inconsistency.

**Files:**
- Modify: `app/places/[id]/page.tsx:370,381,393,405,417`

**Interfaces:** None — pure className fix, no props/signatures change.

- [ ] **Step 1: Read the current label markup to confirm line numbers still match**

Run: `grep -n 'text-sage">' app/places/\[id\]/page.tsx`

Expected: five hits inside `PlaceEditSheet`'s `<form>`, one per `<span className="text-sm
font-semibold text-sage">` (Name/Cuisine/City/Address/Notes labels).

- [ ] **Step 2: Replace `text-sage` with `text-cream` on all five label spans**

In `app/places/[id]/page.tsx`, change every occurrence of:

```tsx
<span className="text-sm font-semibold text-sage">
```

(and the two-line variants that open with `Cuisine `, `City `, `Address `, `Notes `
followed by `<span className="font-normal text-cream/80">(optional)</span>`) to:

```tsx
<span className="text-sm font-semibold text-cream">
```

Only the label's own class changes — the nested `(optional)` span already correctly uses
`text-cream/80` (leave it as-is) and the `<input>`/`<textarea>` classes below each label
are untouched.

- [ ] **Step 3: Confirm no `text-sage` remains inside `PlaceEditSheet`**

Run: `sed -n '299,430p' app/places/\[id\]/page.tsx | grep -n 'text-sage'`

Expected: no output (the five label spans are gone; any other `text-sage` in the file, e.g.
the read-only info block above `PlaceEditSheet`, is outside this function and out of scope
— confirm by checking the line numbers reported, if any, are below line 430 or belong to a
different function).

- [ ] **Step 4: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green — 227 tests passing, build succeeds, no lint errors/warnings.

- [ ] **Step 5: Commit**

```bash
git add app/places/\[id\]/page.tsx
git commit -m "fix(a11y): correct PlaceEditSheet label contrast (sage-on-raised fails AA)"
```

---

### Task 2: `PlaceForm` gains City + Address inputs

Today `AddPlaceSheet` (in `app/components/places/PlaceForm.tsx`) only ever populates
`form.city`/`form.address` via a lookup selection (`handleSelectResult`), and the only
visible trace is a read-only "📍 {address} · {city}" line shown when `form.lat`/`form.osmId`
is set. A manually-added place (no lookup) gets neither field, and a user who picked the
wrong lookup result has no way to correct what it filled in. This task adds two ordinary
labeled inputs — matching `PlaceEditSheet`'s existing City/Address fields exactly in
placeholder text and relative order (Cuisine, City, Address, Notes) — and removes the 📍
line, since its only job (surfacing address/city) is now handled by the two visible,
editable fields themselves.

**Files:**
- Modify: `app/components/places/PlaceForm.tsx`

**Interfaces:**
- Consumes: existing `form.city`/`form.address` state (already present in `emptyForm()`
  and already carried into `createPlace(...)` at the existing `handleSave` call — see
  `lib/repo.ts`'s `createPlace(input: PlaceInput)`, which already accepts both).
- Produces: no new exports; `AddPlaceSheet`'s internal JSX only.

- [ ] **Step 1: Locate the current 📍 line and the Cuisine field**

Run: `grep -n '📍\|place-cuisine\|place-notes' app/components/places/PlaceForm.tsx`

Expected: the 📍 paragraph directly after the `<LookupCombobox>` block, and the Cuisine
field's `<div>` before the Notes field's `<div>`.

- [ ] **Step 2: Remove the 📍 read-only line**

Replace:

```tsx
        <div>
          {/* Name + live OSM lookup. The combobox owns both; see LookupCombobox.tsx. */}
          <LookupCombobox
            value={form.name}
            onChange={handleNameChange}
            onSelect={handleSelectResult}
            autoLookup={Boolean(initial?.autoLookup && initial.name)}
            searchNonce={searchNonce}
          />
          {/* The only visible signal that a suggestion's lat/lng/osmId are attached —
              and why editing the name after selecting one is a legible action (the pin
              disappears) rather than a silent trap. See handleNameChange above. */}
          {form.lat !== undefined || form.osmId !== undefined ? (
            <p className="mt-1.5 text-xs text-cream/80">
              📍 {[form.address, form.city].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
```

with:

```tsx
        <div>
          {/* Name + live OSM lookup. The combobox owns both; see LookupCombobox.tsx. */}
          <LookupCombobox
            value={form.name}
            onChange={handleNameChange}
            onSelect={handleSelectResult}
            autoLookup={Boolean(initial?.autoLookup && initial.name)}
            searchNonce={searchNonce}
          />
        </div>
```

(A lookup selection still clears `city`/`address` on a later name edit via
`handleNameChange` — that logic is untouched. The City/Address inputs added below now make
that value, and any later edit to it, directly visible instead of needing the pin line.)

- [ ] **Step 3: Add City and Address inputs after Cuisine, before Notes**

Find the Cuisine field block:

```tsx
        {/* Cuisine (optional) */}
        <div>
          <label htmlFor="place-cuisine" className={LABEL_CLASS}>
            Cuisine <span className={OPTIONAL_CLASS}>(optional)</span>
          </label>
          <input
            id="place-cuisine"
            type="text"
            value={form.cuisine}
            onChange={(e) => setForm((f) => ({ ...f, cuisine: e.target.value }))}
            placeholder="Mexican, ramen, pizza…"
            className={INPUT_CLASS}
          />
        </div>
```

Insert immediately after it (before the Notes field's `{/* Notes (optional) */}` comment):

```tsx
        {/* City (optional) */}
        <div>
          <label htmlFor="place-city" className={LABEL_CLASS}>
            City <span className={OPTIONAL_CLASS}>(optional)</span>
          </label>
          <input
            id="place-city"
            type="text"
            value={form.city ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value || undefined }))}
            placeholder="Austin"
            className={INPUT_CLASS}
          />
        </div>

        {/* Address (optional) */}
        <div>
          <label htmlFor="place-address" className={LABEL_CLASS}>
            Address <span className={OPTIONAL_CLASS}>(optional)</span>
          </label>
          <input
            id="place-address"
            type="text"
            value={form.address ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || undefined }))}
            placeholder="123 Main St"
            className={INPUT_CLASS}
          />
        </div>
```

(`e.target.value || undefined` mirrors `PlaceEditSheet`'s own `city.trim() || undefined`
save-time normalization — here applied on every keystroke since `form.city`/`form.address`
are the single source of truth this form saves directly, with no separate trim-on-submit
step for these two fields. An empty string coerces to `undefined`, matching the "missing"
representation `Place.city?`/`address?` already use elsewhere.)

- [ ] **Step 4: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green.

- [ ] **Step 5: Manually verify in the browser**

Start the dev server (`npm run dev -- -p 3001` if 3000 is already in use by another
session), open the Add-place sheet, and confirm:
- City and Address inputs appear between Cuisine and Notes, styled identically to the
  other inputs (same border/background/focus ring).
- Selecting a lookup suggestion populates both new fields (previously only visible via the
  now-removed 📍 line).
- Typing in either field after a selection overrides it, and the value round-trips through
  Save (open the saved place's detail page and confirm City/Address show there).

- [ ] **Step 6: Commit**

```bash
git add app/components/places/PlaceForm.tsx
git commit -m "feat(places): add City and Address inputs to the add-place form"
```

---

### Task 3: `PlaceCard` gains an address line

`PlaceCard` (the Places-tab list row) already shows a "cuisine · city" subtitle under the
name, but never the street address — because until Task 2, no manually-added place had
one. Add a dedicated line for it, directly under the name, above the existing subtitle.

**Files:**
- Modify: `app/components/places/PlaceCard.tsx`

**Interfaces:**
- Consumes: `place.address` (already on `Place`, no change).
- Produces: no signature change — `PlaceCard`'s props (`place`, `liveCriterionIds`) are
  unchanged.

- [ ] **Step 1: Locate the name/chip row and the existing subtitle line**

Run: `grep -n 'subtitle\|<h3' app/components/places/PlaceCard.tsx`

- [ ] **Step 2: Insert the address line between the name/chip row and the subtitle**

Find:

```tsx
        {subtitle ? <p className="mt-0.5 truncate text-[0.6875rem] text-sage">{subtitle}</p> : null}
      </div>
```

Replace with:

```tsx
        {place.address ? (
          <p className="mt-0.5 truncate text-[0.6875rem] text-sage">{place.address}</p>
        ) : null}
        {subtitle ? <p className="mt-0.5 truncate text-[0.6875rem] text-sage">{subtitle}</p> : null}
      </div>
```

(Same `text-[0.6875rem] text-sage` treatment as the existing subtitle — this row sits on
whatever background the Places-tab list uses, which is `ground`, where `sage` passes AA at
5.23:1 per CLAUDE.md's contrast table. Two `<p>` lines stack cleanly; a place with neither
address nor cuisine/city shows neither line, same "render nothing, not a placeholder dash"
rule the existing subtitle already follows.)

- [ ] **Step 3: Update the stale comment above `subtitle`'s definition**

Find:

```tsx
  // Place.address/city exist but nothing populates address yet (only OSM lookup sets city, and
  // no form field exposes either) — cuisine/city is the only secondary content available today.
  // Render nothing (not an empty line / placeholder dash) when a place has neither.
  const subtitle = [place.cuisine, place.city].filter(Boolean).join(" · ");
```

Replace with:

```tsx
  // Address gets its own line (below); cuisine/city stays a joined subtitle beneath that.
  // Render nothing (not an empty line / placeholder dash) when a place has neither.
  const subtitle = [place.cuisine, place.city].filter(Boolean).join(" · ");
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green.

- [ ] **Step 5: Manually verify in the browser**

On the Places tab, confirm a place with an address shows it on its own line under the
name, above the cuisine/city line, truncating (not wrapping) on overflow like the existing
subtitle. Confirm a place with no address shows no blank line.

- [ ] **Step 6: Commit**

```bash
git add app/components/places/PlaceCard.tsx
git commit -m "feat(places): show the address on each Places-tab row"
```

---

### Task 4: `queryCategoryCities` + `useCategoryCities`

The city filter chip row (Task 6) needs the distinct, non-empty `city` values actually
present among a category's places. This is a pure query function, framework-free, unit
tested — same shape as every other function in `lib/hooks.ts`.

**Files:**
- Modify: `lib/hooks.ts`
- Modify: `lib/hooks.test.ts`

**Interfaces:**
- Consumes: `queryPlaces` (already exported from the same file; reused for its existing
  tombstone-filtering and `categoryId` narrowing rather than re-querying Dexie directly).
- Produces: `queryCategoryCities(categoryId: string): Promise<string[]>` and
  `useCategoryCities(id: string): string[] | undefined` — both consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `lib/hooks.test.ts`, after the existing `describe("queryRankedCategory", ...)` block
(and add `queryCategoryCities` to the `import { ... } from "./hooks"` list at the top):

```ts
// ---- queryCategoryCities ----

describe("queryCategoryCities", () => {
  it("returns distinct non-empty cities, sorted case-insensitively", async () => {
    const category = await createCategory({ name: "Tacos" });
    await createPlace({ name: "A", status: "been", city: "Austin", categoryIds: [category.id] });
    await createPlace({
      name: "B",
      status: "want_to_try",
      city: "bremen",
      categoryIds: [category.id],
    });
    await createPlace({ name: "C", status: "been", city: "Austin", categoryIds: [category.id] });
    await createPlace({ name: "D", status: "been", categoryIds: [category.id] }); // no city

    expect(await queryCategoryCities(category.id)).toEqual(["Austin", "bremen"]);
  });

  it("excludes places from other categories and tombstoned places", async () => {
    const category = await createCategory({ name: "Tacos" });
    const other = await createCategory({ name: "Ramen" });
    await createPlace({ name: "A", status: "been", city: "Austin", categoryIds: [category.id] });
    await createPlace({ name: "B", status: "been", city: "Denver", categoryIds: [other.id] });
    const gone = await createPlace({
      name: "C",
      status: "been",
      city: "Laredo",
      categoryIds: [category.id],
    });
    await deletePlace(gone.id);

    expect(await queryCategoryCities(category.id)).toEqual(["Austin"]);
  });

  it("returns an empty array for a category with no cities", async () => {
    const category = await createCategory({ name: "Tacos" });
    expect(await queryCategoryCities(category.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/hooks.test.ts`
Expected: FAIL — `queryCategoryCities` is not exported from `./hooks` (a `TypeError` or
import error), since it doesn't exist yet.

- [ ] **Step 3: Implement `queryCategoryCities` and `useCategoryCities`**

In `lib/hooks.ts`, add after `queryRankedCategory` (before the `// ---- hooks ----`
section):

```ts
/**
 * Distinct, non-empty `city` values among a category's non-tombstoned places (both
 * "been" and "want_to_try"), sorted case-insensitively. Empty when the category has no
 * places with a city — the caller (the city filter chip row) hides itself in that case
 * rather than rendering an empty filter bar.
 */
export async function queryCategoryCities(categoryId: string): Promise<string[]> {
  const places = await queryPlaces({ categoryId });
  const cities = new Set(places.map((p) => p.city).filter((c): c is string => Boolean(c)));
  return [...cities].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

And in the `// ---- hooks (thin useLiveQuery wrappers) ----` section, after
`useRankedCategory`:

```ts
export function useCategoryCities(id: string): string[] | undefined {
  return useLiveQuery(() => queryCategoryCities(id), [id]);
}
```

Add `queryCategoryCities` to the `import { ... } from "./hooks"` list at the top of
`lib/hooks.test.ts` (it's a new named export from the same module already being imported).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/hooks.test.ts`
Expected: PASS — all `queryCategoryCities` tests green, and every pre-existing test in the
file still green.

- [ ] **Step 5: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/hooks.ts lib/hooks.test.ts
git commit -m "feat(hooks): add queryCategoryCities for the category city filter"
```

---

### Task 5: Ranked/Want-to-try tabs on `/categories/[id]`, with an address line on both row types

Splits the category detail page's two always-visible sections ("Ranked", "Want to try")
into an underline-tab pair, state carried in `?tab=ranked|want` (default `ranked`) via
`router.replace` — so tabbing never grows the history stack. Because this task already
has to touch every line of both row types to rewire them under the tab switch, it also adds
the address line to both in the same pass (rather than a separate task rewriting the same
JSX twice).

**Files:**
- Modify: `app/categories/[id]/page.tsx`

**Interfaces:**
- Consumes: `useCategory`, `useRankedCategory` (unchanged), plus `useSearchParams`,
  `usePathname`, `useRouter` from `next/navigation`.
- Produces: no new exports — `CategoryDetailPage` remains the default export, now a thin
  `<Suspense>` wrapper; all existing behavior (Edit/Weights sheets, not-found state) is
  preserved, just relocated into a new inner component.

- [ ] **Step 1: Read the current file in full to confirm line numbers**

Run: `cat -n app/categories/\[id\]/page.tsx`

Confirm the structure matches: imports, `actionButtonClass`, `CategoryDetailPage` (default
export) with the not-found early return, then the Ranked `<section>`, then the Want to try
`<section>`, then the `editOpen`/`weightsOpen` sheets.

- [ ] **Step 2: Add the Suspense split and search-param-derived tab state**

Replace the import line:

```tsx
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
```

with:

```tsx
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
```

Replace:

```tsx
export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const category = useCategory(id);
  const rankedData = useRankedCategory(id);
  const [editOpen, setEditOpen] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
```

with:

```tsx
export default function CategoryDetailPage() {
  // useSearchParams() (below, in the tab switch) makes this route dynamic and requires a
  // Suspense boundary around its caller, or `next build` fails — same split as
  // app/import/page.tsx.
  return (
    <Suspense fallback={null}>
      <CategoryDetailInner />
    </Suspense>
  );
}

function CategoryDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = useCategory(id);
  const rankedData = useRankedCategory(id);
  const [editOpen, setEditOpen] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
```

Immediately after the `leaving` state declaration (`const [leaving, setLeaving] =
useState(false);`), add the tab-derived state and the shared param-update helper:

```tsx

  const tab: "ranked" | "want" = searchParams.get("tab") === "want" ? "want" : "ranked";

  // Shared by the tab switch here and the city filter in Task 6. Uses replace (not push)
  // so switching a tab or a filter chip never grows the history stack.
  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }
```

- [ ] **Step 3: Replace the two static section headings with a tab row, and both sections
      with one tab-switched section**

Replace the entire block from the Ranked `<section>` through the end of the Want to try
`<section>`:

```tsx
      <section className="px-4 pt-4">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">
          Ranked
        </h2>
        {ranked === undefined ? null : ranked.length === 0 ? (
          <EmptyState
            emoji="🍽️"
            title="Nothing ranked yet"
            hint="Rate a place you've been to see it climb the list."
          />
        ) : (
          <ul className="mt-3 flex flex-col">
            {ranked.map((entry) => (
              <li key={entry.place.id} className="border-t border-rule">
                <Link
                  href={`/places/${entry.place.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep"
                >
                  <span className="tabular w-10 shrink-0 font-util text-[0.6875rem] font-semibold text-sage">
                    #{entry.rank}
                    {entry.tied ? " =" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] text-cream">
                    {entry.place.name}
                  </span>
                  <ScoreBadge score={entry.score} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-4 py-6">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">
          Want to try
        </h2>
        {wantToTry === undefined ? null : wantToTry.length === 0 ? (
          <EmptyState
            emoji="📝"
            title="Nothing on the wishlist"
            hint="Places you want to try in this list will show up here."
          />
        ) : (
          <ul className="mt-3 flex flex-col">
            {wantToTry.map((place) => (
              <li key={place.id} className="border-t border-rule">
                <Link
                  href={`/places/${place.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep"
                >
                  <span className="flex w-10 shrink-0 items-center">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full border border-cream"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] text-cream">
                    {place.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
```

with:

```tsx
      <div role="tablist" aria-label="Category view" className="flex gap-5 border-b border-rule px-4">
        <TabButton active={tab === "ranked"} onClick={() => updateParam("tab", null)}>
          Ranked
        </TabButton>
        <TabButton active={tab === "want"} onClick={() => updateParam("tab", "want")}>
          Want to try
        </TabButton>
      </div>

      <section className="px-4 py-4">
        {tab === "ranked" ? (
          ranked === undefined ? null : ranked.length === 0 ? (
            <EmptyState
              emoji="🍽️"
              title="Nothing ranked yet"
              hint="Rate a place you've been to see it climb the list."
            />
          ) : (
            <ul className="flex flex-col">
              {ranked.map((entry) => (
                <li key={entry.place.id} className="border-t border-rule">
                  <Link
                    href={`/places/${entry.place.id}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep"
                  >
                    <span className="tabular w-10 shrink-0 font-util text-[0.6875rem] font-semibold text-sage">
                      #{entry.rank}
                      {entry.tied ? " =" : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.95rem] text-cream">{entry.place.name}</p>
                      {entry.place.address ? (
                        <p className="mt-0.5 truncate text-[0.6875rem] text-sage">
                          {entry.place.address}
                        </p>
                      ) : null}
                    </div>
                    <ScoreBadge score={entry.score} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : wantToTry === undefined ? null : wantToTry.length === 0 ? (
          <EmptyState
            emoji="📝"
            title="Nothing on the wishlist"
            hint="Places you want to try in this list will show up here."
          />
        ) : (
          <ul className="flex flex-col">
            {wantToTry.map((place) => (
              <li key={place.id} className="border-t border-rule">
                <Link
                  href={`/places/${place.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep"
                >
                  <span className="flex w-10 shrink-0 items-center">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-cream" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.95rem] text-cream">{place.name}</p>
                    {place.address ? (
                      <p className="mt-0.5 truncate text-[0.6875rem] text-sage">{place.address}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 4: Add the `TabButton` helper**

This file currently only uses named imports from `react` (no `React` namespace import), so
`TabButton`'s `children` prop needs `ReactNode` imported by name. Change the `react` import
line:

```tsx
import { Suspense, useState } from "react";
```

to:

```tsx
import { Suspense, useState, type ReactNode } from "react";
```

Then, at the bottom of the file, after `CategoryDetailInner`'s closing brace (i.e. after
the former `CategoryDetailPage` function body, before end of file), add:

```tsx

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-11 border-b-2 px-0.5 pb-2 font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition ${
        active ? "border-gold text-gold" : "border-transparent text-sage active:text-cream"
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green. (The build step specifically exercises the Suspense requirement —
this is the step that would fail with "useSearchParams() should be wrapped in a suspense
boundary" if the split were wrong.)

- [ ] **Step 6: Manually verify in the browser**

Open a category detail page with both ranked and want-to-try places. Confirm:
- Two tabs render under the header, "Ranked" active by default, gold underline on the
  active tab, `sage` text on the inactive one.
- Tapping "Want to try" swaps the visible list and updates the URL to `?tab=want`; tapping
  back to "Ranked" removes the param (URL has no `?tab=` when on the default tab).
- Reloading the page with `?tab=want` in the URL opens directly on that tab.
- Both list types show the address line under the name when the place has one (add an
  address to a test place via Task 2's new fields to confirm), and show nothing extra when
  it doesn't.
- Pressing the browser Back button after switching tabs leaves the category page in
  **exactly one press**, landing on whatever page preceded it (e.g. `/categories`) — not
  on an intermediate "category page, previous tab" entry. This is the correct consequence
  of `replace`: it overwrites the single history entry for the category page in place, so
  there's nothing left to step through. (A `push` bug would show up as an extra Back press
  needed per tab switch before the page is actually left — that's the failure mode this
  check is for.)

- [ ] **Step 7: Commit**

```bash
git add app/categories/\[id\]/page.tsx
git commit -m "feat(categories): split Ranked/Want-to-try into tabs, add address line to rows"
```

---

### Task 6: City filter chip row on `/categories/[id]`

Adds a horizontally-scrolling chip row (matching `PlaceFilters`' existing `ChipRow`
pattern) driven by Task 4's `useCategoryCities`, persisted in `?city=` via the same
`updateParam` helper Task 5 introduced. Filters both the ranked and want-to-try arrays
client-side by exact city match; **rank numbers are not recomputed** — a filtered-out place
just disappears from view, the remaining ones keep the rank they earned in the full list
(this preserves "you're #4 in this list" as a statement about the whole list, not a
narrowed view — a deliberate design decision, not an oversight).

**Files:**
- Modify: `app/categories/[id]/page.tsx`

**Interfaces:**
- Consumes: `useCategoryCities` (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Import `useCategoryCities` and `Chip`**

Change:

```tsx
import { useCategory, useRankedCategory } from "@/lib/hooks";
import { EmptyState, HeaderShell, ScoreBadge } from "@/app/components/ui";
```

to:

```tsx
import { useCategory, useCategoryCities, useRankedCategory } from "@/lib/hooks";
import { Chip, EmptyState, HeaderShell, ScoreBadge } from "@/app/components/ui";
```

- [ ] **Step 2: Read the city filter from the URL, fetch the city list, and filter both
      arrays**

After the line `const tab: "ranked" | "want" = ...` (added in Task 5), add:

```tsx
  const cityFilter = searchParams.get("city");
  const cities = useCategoryCities(id);
```

Replace:

```tsx
  const ranked = rankedData?.ranked;
  const wantToTry = rankedData?.wantToTry;
```

with:

```tsx
  const ranked = rankedData?.ranked.filter(
    (entry) => !cityFilter || entry.place.city === cityFilter
  );
  const wantToTry = rankedData?.wantToTry.filter(
    (place) => !cityFilter || place.city === cityFilter
  );
```

- [ ] **Step 3: Render the city filter chip row under the tabs**

Replace the tab row block added in Task 5:

```tsx
      <div role="tablist" aria-label="Category view" className="flex gap-5 border-b border-rule px-4">
        <TabButton active={tab === "ranked"} onClick={() => updateParam("tab", null)}>
          Ranked
        </TabButton>
        <TabButton active={tab === "want"} onClick={() => updateParam("tab", "want")}>
          Want to try
        </TabButton>
      </div>
```

with:

```tsx
      <div role="tablist" aria-label="Category view" className="flex gap-5 border-b border-rule px-4">
        <TabButton active={tab === "ranked"} onClick={() => updateParam("tab", null)}>
          Ranked
        </TabButton>
        <TabButton active={tab === "want"} onClick={() => updateParam("tab", "want")}>
          Want to try
        </TabButton>
      </div>

      {cities && cities.length > 0 ? (
        // No "-mx-4 / px-4 bleed" trick here (unlike PlaceFilters' ChipRow): this row is a
        // direct top-level child of the page fragment, not nested inside a padded parent
        // for a negative margin to cancel out. Plain px-4 matches the tab row and both
        // sections above/below it, which are laid out the same way.
        <div
          role="group"
          aria-label="Filter by city"
          className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Chip active={!cityFilter} onClick={() => updateParam("city", null)} className="whitespace-nowrap">
            All cities
          </Chip>
          {cities.map((city) => (
            <Chip
              key={city}
              active={cityFilter === city}
              onClick={() => updateParam("city", cityFilter === city ? null : city)}
              className="whitespace-nowrap"
            >
              {city}
            </Chip>
          ))}
        </div>
      ) : null}
```

(Hidden entirely when `cities` is empty or still loading — no blank filter bar, per the
spec's explicit degrade-quietly requirement for categories whose places have no city yet.)

- [ ] **Step 4: Distinguish "filtered to zero" from "genuinely empty" in both empty states**

Replace:

```tsx
            <EmptyState
              emoji="🍽️"
              title="Nothing ranked yet"
              hint="Rate a place you've been to see it climb the list."
            />
```

with:

```tsx
            <EmptyState
              emoji="🍽️"
              title={cityFilter ? "No matches" : "Nothing ranked yet"}
              hint={
                cityFilter
                  ? "No ranked places in this city yet."
                  : "Rate a place you've been to see it climb the list."
              }
            />
```

And replace:

```tsx
          <EmptyState
            emoji="📝"
            title="Nothing on the wishlist"
            hint="Places you want to try in this list will show up here."
          />
```

with:

```tsx
          <EmptyState
            emoji="📝"
            title={cityFilter ? "No matches" : "Nothing on the wishlist"}
            hint={
              cityFilter
                ? "No wishlist places in this city yet."
                : "Places you want to try in this list will show up here."
            }
          />
```

- [ ] **Step 5: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green.

- [ ] **Step 6: Manually verify in the browser**

On a category with places in more than one city (add a couple of test places with
different cities via Task 2's new City field, assigned to the same list):
- Confirm the chip row appears under the tabs, "All cities" active by default.
- Tapping a city chip narrows both tabs' lists to that city, and the URL gains `?city=…`.
- Switching tabs while a city filter is active keeps the filter applied.
- Tapping the active city chip again (or "All cities") clears the filter.
- On a category with no places carrying a city, confirm the chip row does not render at
  all (no empty bar).
- Confirm rank numbers on filtered rows match what they showed unfiltered (e.g. a place
  that was #4 in the full list still shows #4 when filtered to its city, not renumbered to
  #1).

- [ ] **Step 7: Commit**

```bash
git add app/categories/\[id\]/page.tsx
git commit -m "feat(categories): add a city filter chip row, persisted in ?city="
```

---

## Verification

1. `npm test`, `npm run build`, `npm run lint` green after every task.
2. Manual browser pass (Playwright or by hand) over: Add-place sheet (City/Address inputs,
   lookup autofill still works), Places tab (address line), and `/categories/[id]` (tabs,
   city filter, address lines on both row types, Back-button behavior, empty states with
   and without an active city filter).
3. Confirm `lib/theme-contract.test.ts` still passes with zero legacy-token/raw-hex
   violations — no task here introduces a new color/radius outside existing tokens.
4. Confirm no regression in `queryRankedCategory`'s existing tests (Task 6 filters its
   output in the page component, not inside `queryRankedCategory` itself, so that
   function's own contract and tests are untouched).

## Risks

- **Existing places have no city/address until re-added or hand-edited via `PlaceEditSheet`
  (already supported) or re-selected via lookup.** The city filter and address line must
  degrade quietly for them — verified explicitly in Tasks 3, 5, and 6's manual checks (no
  blank lines, no empty filter bar).
- **`router.replace` + `useSearchParams` timing.** Next's App Router applies a `replace`
  synchronously to the URL but the new `searchParams` value arrives on the next render —
  this is standard App Router behavior already exercised in this codebase
  (`app/import/page.tsx`), not a new risk, but worth re-confirming in Task 5's manual Back-
  button check specifically.

## Non-goals

| Deferred | Why |
| --- | --- |
| Score breakdown / long-press peek | Phase 3 |
| Sheet drag-to-dismiss, sheet-history back button | Phase 4 |
| Desktop ≥`md` layout | Phase 5 |
| Playwright + the nine journeys | Phase 6 — also gated on the "ask before adding a
  dependency" rule (`@playwright/test`) |
| Recomputing rank numbers within a filtered city view | Deliberate: filtering narrows what's
  shown, not what's ranked (see Task 6) |
