# Share-import UX: entry point, confirmation, source link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Read first:** `docs/superpowers/specs/2026-07-25-share-import-ux-design.md` (the approved
> design this plan implements). Continues the work from
> `docs/superpowers/plans/2026-07-23-share-link-import-plan.md` (T1–T8); tasks here are numbered
> T9–T12 to follow on from that plan.

**Goal:** Make the already-shipped share-link import feature (T1–T8) actually reachable and
legible: an in-app "Paste a link" entry point for platforms without Web Share Target (iOS
Safari never implements it), visible confirmation when a link resolves, and a way to get back
to the source video/post after saving.

**Architecture:** Reuse the existing framework-free `lib/social` primitives (`pickUrl`,
`resolveSharedLink`) directly inside `PlaceForm.tsx` — no new logic layer. The paste-box UI
itself (input + hint + submit) is extracted once into a shared `PasteLinkField` component
(`app/components/ui.tsx`) so `/import/page.tsx` and `PlaceForm.tsx` never duplicate that markup
— `/import/page.tsx` gets one scoped, behavior-preserving refactor to use it (T10); its resolve
logic, the `ADD_PLACE_EVENT`/`PlacePrefill` contract, and everything else about it are
untouched. The detail-page and list-card changes are pure read-only rendering of fields
(`Place.sourceUrl`, `Place.sourcePlatform`) that already persist correctly today.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind v4 (Cellar tokens),
no new npm dependencies.

## Global Constraints

- No `lib/` logic changes — `pickUrl` (`lib/social/pickUrl.ts`) and `resolveSharedLink`
  (`lib/social/index.ts`) are reused exactly as they exist today. No new Vitest coverage is
  required for this work (spec §3.5).
- `app/import/page.tsx` gets exactly one scoped change (T10: extracting its paste-box markup
  into the shared `PasteLinkField`) — a pure refactor with zero behavior change. This
  supersedes the design spec's "no changes to `/import/page.tsx`" line; confirmed with the user
  during plan pre-flight, who chose this over accepting duplicated markup. The
  `ADD_PLACE_EVENT`/`PlacePrefill` contract is untouched by any task in this plan.
- No changes to TikTok's existing oEmbed/name-guess path (spec §2).
- No auto-save-on-resolve — the sheet stays "review and finish, then Save" for both platforms
  (spec §2).
- The source indicator is a hand-drawn SVG glyph matching `PlusGlyph`/`StarGlyph`'s style in
  `app/components/ui.tsx` — never a platform brand logo (spec §3.3).
- Cellar tokens only — no raw hex or off-palette Tailwind colors (CLAUDE.md Conventions).
- ≥44px touch targets; text-entry inputs use `text-base` (≥16px) so iOS doesn't focus-zoom
  (CLAUDE.md Conventions).
- Components never import Dexie directly — reads through `lib/hooks.ts`, writes through
  `lib/repo.ts` (CLAUDE.md Conventions) — unaffected here since no new reads/writes are added.
- No new npm dependencies without asking first (CLAUDE.md Workflow rules).
- Green before every commit: `npm test`, `npm run build`, `npm run lint` must all pass
  (CLAUDE.md Workflow rules).
- Stage explicit paths — never `git add -A` (CLAUDE.md Workflow rules).
- Conventional-commit messages (`feat:`, `fix:`, etc.), logical chunks (CLAUDE.md Workflow
  rules).

---

### T9 — Visible source-confirmation line in the Add-place sheet

**Files:**
- Modify: `app/components/places/PlaceForm.tsx:197-199` (top of `AddPlaceSheet`'s returned JSX)

**Interfaces:**
- Consumes: `form.sourceUrl: string | undefined`, `form.sourcePlatform: "instagram" | "tiktok" | undefined` — both already exist on `AddPlaceSheet`'s local `form` state (populated today via `initial?.sourceUrl`/`initial?.sourcePlatform` in `emptyForm`, unchanged by this task).
- Produces: nothing new — this task only adds rendering. T11 will rely on the fact that this block already renders whenever `form.sourceUrl` is set, regardless of how it got set.

This task is independently testable today because the `/import?url=...` prefill path (T7,
already shipped) already sets `form.sourceUrl`/`form.sourcePlatform` — no new state or handler
is needed to verify it.

- [ ] **Step 1: Add the confirmation line**

In `app/components/places/PlaceForm.tsx`, find this block (the start of `AddPlaceSheet`'s
returned JSX):

```tsx
      <div className="flex flex-col gap-5">
        {/* Name + OSM lookup */}
        <div>
```

Replace it with:

```tsx
      <div className="flex flex-col gap-5">
        {form.sourceUrl ? (
          <p className="text-sm font-semibold text-plum">
            {form.sourcePlatform === "instagram"
              ? "Imported from Instagram"
              : form.sourcePlatform === "tiktok"
              ? "Imported from TikTok"
              : "Source link attached"}
          </p>
        ) : null}

        {/* Name + OSM lookup */}
        <div>
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds, no TypeScript/JSX errors.

- [ ] **Step 3: Manual verification (no automated component-test harness exists in this repo — see spec §3.5)**

Run: `npm run dev`, then in a browser:

1. Visit `http://localhost:3000/import?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FTestReel123%2F`.
2. Confirm it resolves to `/` with the "Add a place" sheet open, showing **"Imported from
   Instagram"** directly above the Name field.
3. Visit `http://localhost:3000/` and tap the ember "+" FAB (blank add, no prefill).
4. Confirm the confirmation line does **not** appear (no `sourceUrl` set) — the sheet looks
   exactly as it did before this change.

- [ ] **Step 4: Full regression check**

Run: `npm test && npm run lint`
Expected: all existing tests pass, no lint errors (this task touches no `lib/` files, so no
test count change is expected).

- [ ] **Step 5: Commit**

```bash
git add app/components/places/PlaceForm.tsx
git commit -m "feat(import): show which platform a source link came from in the add-place sheet"
```

---

### T10 — Extract shared `PasteLinkField`; `/import/page.tsx` uses it

**Files:**
- Modify: `app/components/ui.tsx` (new `PasteLinkField`, after `AddPlaceButton`)
- Modify: `app/import/page.tsx` (imports; replace the local `PasteForm` function with the shared component; page-level chrome stays where it is)

**Interfaces:**
- Consumes: nothing new — this task relocates existing markup and behavior, it does not add any.
- Produces: `PasteLinkField({ value: string; onChange: (value: string) => void; onSubmit: (e: FormEvent) => void; showHint: boolean; submitting?: boolean; variant?: "primary" | "secondary" }): JSX.Element`, exported from `app/components/ui.tsx`. `variant` defaults to `"primary"` (the ember-filled, full-width button `/import` already uses — this task's own usage doesn't pass it, so `/import`'s look is byte-for-byte unchanged). T11 (the new inline paste affordance in `PlaceForm.tsx`) will pass `variant="secondary"` to get the outline-style button matching that sheet's existing "Look up" button, and `submitting` to show a busy label while `resolveSharedLink` is in flight.

This is a pure refactor, not a behavior change: `/import/page.tsx`'s paste screen must look and
behave identically before and after this task. It is a scoped exception to the design spec's
"no changes to `/import/page.tsx`" line (see Global Constraints above) — confirmed with the
user, who chose this extraction over letting T11 duplicate this markup.

- [ ] **Step 1: Add `PasteLinkField` to `app/components/ui.tsx`**

Update the top imports — replace:

```tsx
import type { ReactNode } from "react";
```

with:

```tsx
import { useId, type FormEvent, type ReactNode } from "react";
```

Then, immediately after the `AddPlaceButton` function's closing brace (before the `ScoreBadge`
comment block), add:

```tsx
/* ─── PasteLinkField ─────────────────────────────────────────────────────────
   Controlled paste-a-link form: label + text input + optional "doesn't look
   like a link" hint + submit button. Shared by /import's paste screen and
   PlaceForm's inline paste affordance so the two entry points into the same
   resolve flow never drift apart. `variant` controls only the button's visual
   weight — "primary" (default) is /import's full-page ember button; the
   "secondary" outline style is for use inside PlaceForm's sheet, where Save
   is the true primary action. */
export function PasteLinkField({
  value,
  onChange,
  onSubmit,
  showHint,
  submitting = false,
  variant = "primary",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  showHint: boolean;
  submitting?: boolean;
  variant?: "primary" | "secondary";
}) {
  const inputId = useId();
  const canSubmit = value.trim().length > 0 && !submitting;
  const buttonClass =
    variant === "primary"
      ? "min-h-11 w-full rounded-full bg-ember px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-ember-deep disabled:pointer-events-none disabled:opacity-40"
      : "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-surface-sunk px-4 text-sm font-semibold text-plum transition active:scale-95 active:bg-line disabled:opacity-60";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 text-left">
      <label htmlFor={inputId} className="sr-only">
        Instagram or TikTok link
      </label>
      <input
        id={inputId}
        // type="text" (not "url") on purpose: a shared paste often carries the link inside
        // caption text ("great tacos https://… go now"), which pickUrl extracts — but a
        // type="url" field marks that whole string :invalid and native validation blocks the
        // submit before pickUrl ever runs. inputMode="url" keeps the URL-optimized mobile
        // keyboard; validation is ours (pickUrl → the hint below).
        type="text"
        inputMode="url"
        autoComplete="off"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste an Instagram or TikTok link"
        className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
      />
      {showHint ? (
        <p className="text-sm text-chili">
          That doesn&rsquo;t look like a link — try pasting the full URL.
        </p>
      ) : null}
      <button type="submit" disabled={!canSubmit} className={buttonClass}>
        {submitting ? "Finding place…" : "Find place"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Refactor `app/import/page.tsx` to use it**

Update the import (currently line 33):

```tsx
import { emitAddPlace } from "@/app/components/ui";
```

to:

```tsx
import { emitAddPlace, PasteLinkField } from "@/app/components/ui";
```

Then replace `ImportInner`'s final return plus the now-redundant local `PasteForm` function —
currently:

```tsx
  if (importing) return <Importing />;

  return (
    <PasteForm
      value={pasteValue}
      onChange={(v) => {
        setPasteValue(v);
        setPasteHint(false);
      }}
      onSubmit={handlePasteSubmit}
      showHint={pasteHint}
    />
  );
}

function Importing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-plum"
      />
      <p className="text-[0.95rem] text-ink-soft">Importing…</p>
    </div>
  );
}

function PasteForm({
  value,
  onChange,
  onSubmit,
  showHint,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  showHint: boolean;
}) {
  const canSubmit = value.trim().length > 0;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm text-center">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          savor
        </p>
        <h1 className="mt-0.5 font-display text-3xl leading-none text-plum">Import a place</h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
          Paste an Instagram or TikTok link and we&rsquo;ll get it started.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 text-left">
          <label htmlFor="import-url" className="sr-only">
            Instagram or TikTok link
          </label>
          <input
            id="import-url"
            // type="text" (not "url") on purpose: a shared paste often carries the link inside
            // caption text ("great tacos https://… go now"), which pickUrl extracts — but a
            // type="url" field marks that whole string :invalid and native validation blocks the
            // submit before pickUrl ever runs. inputMode="url" keeps the URL-optimized mobile
            // keyboard; validation is ours (pickUrl → the hint below).
            type="text"
            inputMode="url"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste an Instagram or TikTok link"
            className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
          />
          {showHint ? (
            <p className="text-sm text-chili">That doesn&rsquo;t look like a link — try pasting the full URL.</p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-11 w-full rounded-full bg-ember px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-ember-deep disabled:pointer-events-none disabled:opacity-40"
          >
            Find place
          </button>
        </form>
      </div>
    </div>
  );
}
```

with:

```tsx
  if (importing) return <Importing />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm text-center">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          savor
        </p>
        <h1 className="mt-0.5 font-display text-3xl leading-none text-plum">Import a place</h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
          Paste an Instagram or TikTok link and we&rsquo;ll get it started.
        </p>

        <div className="mt-6">
          <PasteLinkField
            value={pasteValue}
            onChange={(v) => {
              setPasteValue(v);
              setPasteHint(false);
            }}
            onSubmit={handlePasteSubmit}
            showHint={pasteHint}
          />
        </div>
      </div>
    </div>
  );
}

function Importing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-plum"
      />
      <p className="text-[0.95rem] text-ink-soft">Importing…</p>
    </div>
  );
}
```

(The local `PasteForm` function is gone entirely — `Importing` is now the last thing in the
file. `type FormEvent` stays imported at the top of `app/import/page.tsx`: `handlePasteSubmit`
still uses it.)

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds, no TypeScript/JSX errors.

- [ ] **Step 4: Manual verification — confirm zero behavior change**

Run: `npm run dev`, then in a browser, re-run `/import`'s existing scenarios to confirm nothing
moved:

1. Visit `http://localhost:3000/import` (no params) — confirm the paste screen looks identical
   to before (same heading/copy, same input, focused, same full-width ember "Find place"
   button, disabled while empty).
2. Type `not a link`, tap "Find place" — confirm the same hint text appears.
3. Type `https://www.instagram.com/reel/TestReel321/`, tap "Find place" — confirm it resolves
   to `/` with the Add-place sheet open (T9's "Imported from Instagram" line, from the earlier
   task, should show here too).

- [ ] **Step 5: Full regression check**

Run: `npm test && npm run lint`
Expected: all existing tests pass, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add app/components/ui.tsx app/import/page.tsx
git commit -m "refactor(import): extract PasteLinkField shared by /import and the add-place sheet"
```

---

### T11 — Inline "Paste a link" affordance in the blank Add-place sheet

**Files:**
- Modify: `app/components/places/PlaceForm.tsx` (imports; `AddPlaceSheet`'s lookup handler; new state/handler; new JSX section using `PasteLinkField`)

**Interfaces:**
- Consumes: `pickUrl(url: string | null, text: string | null): string | null` from
  `@/lib/social/pickUrl`; `resolveSharedLink(url: string): Promise<SharedLink | null>` from
  `@/lib/social`, where `SharedLink` has `{ platform: "instagram" | "tiktok"; url: string;
  nameGuess?: string }` (`lib/social/types.ts`); `PasteLinkField` from `../ui` (T10's new
  export, signature above).
- Produces: `form.sourceUrl` / `form.sourcePlatform` / `form.name` get set on a successful
  resolve, which T9's confirmation line (already in place) renders immediately, and which the
  existing `handleSave` (unchanged) writes through `createPlace` on Save.

This task depends on T9 (the confirmation line must already exist so this task's own manual
verification has something to observe) and T10 (`PasteLinkField` must already exist).

- [ ] **Step 1: Add imports**

In `app/components/places/PlaceForm.tsx`, replace:

```tsx
import { useEffect, useState } from "react";
import { useCategories, useCriteria } from "@/lib/hooks";
import { searchPlaces, type LookupResult } from "@/lib/lookup";
import { createPlace } from "@/lib/repo";
import type { PlaceStatus } from "@/lib/types";
import Sheet from "../Sheet";
import { toast } from "../Toast";
import { ADD_PLACE_EVENT, Chip, RatingRow, type PlacePrefill } from "../ui";
```

with:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useCategories, useCriteria } from "@/lib/hooks";
import { searchPlaces, type LookupResult } from "@/lib/lookup";
import { createPlace } from "@/lib/repo";
import { resolveSharedLink } from "@/lib/social";
import { pickUrl } from "@/lib/social/pickUrl";
import type { PlaceStatus } from "@/lib/types";
import Sheet from "../Sheet";
import { toast } from "../Toast";
import { ADD_PLACE_EVENT, Chip, PasteLinkField, RatingRow, type PlacePrefill } from "../ui";
```

- [ ] **Step 2: Factor the lookup body so it can take an explicit name**

`handleLookup` currently reads `trimmedName` from render scope. The new paste-resolve handler
needs to run a lookup using a name it just received from `resolveSharedLink` — but `setForm`
is async, so `form.name`/`trimmedName` won't have updated yet in the same function body. Factor
the existing body into a parameterized `runLookup`, with `handleLookup` as a thin wrapper that
preserves its exact current zero-arg behavior (used unchanged by the "Look up" button's
`onClick={handleLookup}` and the existing mount-effect autolookup).

Replace:

```tsx
  async function handleLookup() {
    if (!trimmedName || lookupLoading) return;
    setLookupLoading(true);
    setSearched(false);
    // searchPlaces degrades to [] on any failure (bad shape, non-200, network throw) — a failed
    // lookup and a lookup with no matches look identical here, both land on the "nothing found"
    // hint below, and the form stays fully usable manually either way.
    const results = await searchPlaces(trimmedName);
    setLookupResults(results);
    setSearched(true);
    setLookupLoading(false);
  }
```

with:

```tsx
  async function runLookup(name: string) {
    if (!name || lookupLoading) return;
    setLookupLoading(true);
    setSearched(false);
    // searchPlaces degrades to [] on any failure (bad shape, non-200, network throw) — a failed
    // lookup and a lookup with no matches look identical here, both land on the "nothing found"
    // hint below, and the form stays fully usable manually either way.
    const results = await searchPlaces(name);
    setLookupResults(results);
    setSearched(true);
    setLookupLoading(false);
  }

  async function handleLookup() {
    await runLookup(trimmedName);
  }
```

- [ ] **Step 3: Add paste-affordance state and the resolve handler**

Immediately after the existing state declarations in `AddPlaceSheet`:

```tsx
  const [form, setForm] = useState(() => emptyForm(initial));
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
```

add:

```tsx
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteHint, setPasteHint] = useState(false);
  const [resolving, setResolving] = useState(false);
```

Then, after `runLookup`/`handleLookup` (added in Step 2), add the resolve handler:

```tsx
  async function handlePasteResolve(e: FormEvent) {
    e.preventDefault();
    const candidate = pickUrl(pasteValue, pasteValue);
    if (!candidate) {
      setPasteHint(true);
      return;
    }
    setPasteHint(false);
    setResolving(true);
    // resolveSharedLink never throws — an unrecognized platform returns null, and each
    // adapter's hydrate() degrades to a URL-only result on any fetch/parse failure (see
    // lib/social/tiktok.ts and lib/social/instagram.ts).
    const link = await resolveSharedLink(candidate);
    setForm((f) => ({
      ...f,
      name: link?.nameGuess ?? f.name,
      sourceUrl: link?.url ?? candidate,
      sourcePlatform: link?.platform,
    }));
    setResolving(false);
    setPasteOpen(false);
    setPasteValue("");
    if (link?.nameGuess) void runLookup(link.nameGuess);
  }
```

- [ ] **Step 4: Add the JSX**

In the block T9 added, insert the paste toggle/field between the confirmation line and the
Name block:

```tsx
      <div className="flex flex-col gap-5">
        {form.sourceUrl ? (
          <p className="text-sm font-semibold text-plum">
            {form.sourcePlatform === "instagram"
              ? "Imported from Instagram"
              : form.sourcePlatform === "tiktok"
              ? "Imported from TikTok"
              : "Source link attached"}
          </p>
        ) : null}

        {!form.sourceUrl ? (
          <div>
            {pasteOpen ? (
              <PasteLinkField
                value={pasteValue}
                onChange={(v) => {
                  setPasteValue(v);
                  setPasteHint(false);
                }}
                onSubmit={handlePasteResolve}
                showHint={pasteHint}
                submitting={resolving}
                variant="secondary"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPasteOpen(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface-sunk px-4 text-sm font-semibold text-plum transition active:scale-95 active:bg-line"
              >
                Paste a link
              </button>
            )}
          </div>
        ) : null}

        {/* Name + OSM lookup */}
        <div>
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds, no TypeScript/JSX errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, then in a browser:

1. Visit `http://localhost:3000/`, tap the ember "+" FAB.
2. Confirm a **"Paste a link"** button (outline style) appears above the Name field (no
   confirmation line yet).
3. Tap it — confirm the shared paste field + outline-style "Find place" button appear, input
   focused.
4. Type `not a link` and tap "Find place" — confirm the hint "That doesn't look like a link —
   try pasting the full URL." appears and the field stays open.
5. Replace the text with `https://www.instagram.com/reel/TestReel456/` and tap "Find place" —
   confirm: the paste field collapses, **"Imported from Instagram"** appears (T9's line), the
   Name field is still empty (Instagram never provides a name guess — expected), and the sheet
   is otherwise fully usable (type a name, tap Save, confirm it saves normally).
6. Repeat from a fresh blank sheet with a TikTok-shaped URL (e.g.
   `https://www.tiktok.com/@someaccount/video/1234567890123456789`) — confirm the line reads
   **"Imported from TikTok"**. A name guess may or may not appear depending on whether the real
   TikTok oEmbed endpoint is reachable and has a caption for that id — either outcome is
   correct; only the confirmation line and successful resolve are being checked here.
7. Confirm the existing "Look up" button (unrelated to this change) still works normally when
   typing a name manually with no pasted link.
8. Re-visit `http://localhost:3000/import` directly and confirm its paste screen still looks
   and behaves exactly as verified in T10 (same full-width ember button there, not the outline
   style — confirming `variant` correctly differs by call site).

- [ ] **Step 7: Full regression check**

Run: `npm test && npm run lint`
Expected: all existing tests pass, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add app/components/places/PlaceForm.tsx
git commit -m "feat(import): add inline paste-a-link entry point to the add-place sheet"
```

---

### T12 — Surface `sourceUrl` on the place detail page and list card

**Files:**
- Modify: `app/components/ui.tsx` (new `LinkGlyph`, alongside `PlusGlyph`/`StarGlyph`)
- Modify: `app/places/[id]/page.tsx:22, ~155` (import; new "View on X" link)
- Modify: `app/components/places/PlaceCard.tsx:8-11, 37-48` (import; new source-indicator glyph)

**Interfaces:**
- Consumes: `Place.sourceUrl: string | undefined`, `Place.sourcePlatform: "instagram" |
  "tiktok" | undefined` (`lib/types.ts:24-25`) — already persisted by `createPlace`/
  `updatePlace`, unchanged by this task. Pure read/render; no new writes.
- Produces: `LinkGlyph` (exported from `app/components/ui.tsx`) — a decorative glyph, consumed
  by both files below.

This task is independent of T9/T10/T11's internal logic, but its manual verification is
easiest once T11 exists (to create a test place with a real `sourceUrl` via the in-app UI).

- [ ] **Step 1: Add the shared glyph**

In `app/components/ui.tsx`, after `PlusGlyph` (and before `StarGlyph`), add:

```tsx
export function LinkGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M10 14l4-4m-5.5 6.5-1 1a3.54 3.54 0 0 1-5-5l3-3a3.54 3.54 0 0 1 5-.5m2-2 1-1a3.54 3.54 0 0 1 5 5l-3 3a3.54 3.54 0 0 1-5 .5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Detail page — "View on X" link**

In `app/places/[id]/page.tsx`, update the import (currently line 22):

```tsx
import { Chip, EmptyState, HeaderShell, PlusGlyph, RatingRow, ScoreBadge } from "@/app/components/ui";
```

to:

```tsx
import { Chip, EmptyState, HeaderShell, LinkGlyph, PlusGlyph, RatingRow, ScoreBadge } from "@/app/components/ui";
```

Then find this line (currently line 155):

```tsx
        {place.notes ? <p className="mt-3 text-[0.95rem] leading-relaxed text-ink">{place.notes}</p> : null}
```

and insert immediately after it:

```tsx
        {place.notes ? <p className="mt-3 text-[0.95rem] leading-relaxed text-ink">{place.notes}</p> : null}

        {place.sourceUrl ? (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum active:opacity-70"
          >
            <LinkGlyph className="h-4 w-4" />
            {place.sourcePlatform === "instagram"
              ? "View on Instagram"
              : place.sourcePlatform === "tiktok"
              ? "View on TikTok"
              : "View source"}
          </a>
        ) : null}
```

- [ ] **Step 3: Place card — source indicator glyph**

In `app/components/places/PlaceCard.tsx`, update the import (currently line 11):

```tsx
import { ScoreBadge } from "../ui";
```

to:

```tsx
import { LinkGlyph, ScoreBadge } from "../ui";
```

Then find this block (currently lines 37-48):

```tsx
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate font-display text-lg leading-tight text-ink">{place.name}</h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
              place.status === "been"
                ? "bg-plum-tint text-plum"
                : "bg-ember-tint text-ember-deep"
            }`}
          >
            {STATUS_LABEL[place.status]}
          </span>
        </div>
```

and replace it with:

```tsx
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate font-display text-lg leading-tight text-ink">{place.name}</h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
              place.status === "been"
                ? "bg-plum-tint text-plum"
                : "bg-ember-tint text-ember-deep"
            }`}
          >
            {STATUS_LABEL[place.status]}
          </span>
          {place.sourceUrl ? (
            <span
              role="img"
              aria-label={
                place.sourcePlatform === "instagram"
                  ? "Imported from Instagram"
                  : place.sourcePlatform === "tiktok"
                  ? "Imported from TikTok"
                  : "Has a source link"
              }
              className="shrink-0"
            >
              <LinkGlyph className="h-3.5 w-3.5 text-ink-soft" />
            </span>
          ) : null}
        </div>
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: build succeeds, no TypeScript/JSX errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, then in a browser:

1. Using the T11 paste flow (or `/import?url=...`), create a place from
   `https://www.instagram.com/reel/TestReel789/`, name it "Source Link Test", and Save.
2. On the Places list, confirm "Source Link Test" shows the small link glyph next to its status
   pill, and confirm the three seeded places (Katz's Deli, Ramen House, Taco Bravo — no
   `sourceUrl`) do **not** show it.
3. Open "Source Link Test"'s detail page — confirm a **"View on Instagram"** link appears below
   the notes area (or in place of it, if notes are empty), and tapping it opens
   `https://www.instagram.com/reel/TestReel789/` in a new tab.
4. Open one of the seeded places' detail pages — confirm no "View on…" link appears (no
   `sourceUrl`).
5. Delete the "Source Link Test" place (Edit → Delete place → confirm) to leave the seed data
   clean.

- [ ] **Step 6: Full regression check**

Run: `npm test && npm run lint`
Expected: all existing tests pass, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add app/components/ui.tsx app/places/[id]/page.tsx app/components/places/PlaceCard.tsx
git commit -m "feat(places): surface source link on the place detail page and list card"
```

---

## Out of scope (from spec §2 — do not implement)

- Instagram caption/geotag name-guessing (Meta's oEmbed requires an authenticated token since
  2020; scraping is unreliable and against their ToS).
- Any change to TikTok's existing name-guess path.
- Any change to `/import/page.tsx` beyond T10's scoped `PasteLinkField` extraction (its resolve
  logic and the `ADD_PLACE_EVENT`/`PlacePrefill` contract are untouched).
- Auto-save-on-resolve for either platform.
