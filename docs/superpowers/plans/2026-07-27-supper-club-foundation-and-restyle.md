# Supper Club — Foundation and Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace savor's "Cellar" look with the "Supper Club" token system and restyle every route and component onto it, leaving the app buildable and green at every commit.

**Architecture:** The new tokens are added to `app/globals.css` *additively* — both palettes coexist during the migration, so every intermediate commit builds and runs. A new contract test (`lib/theme-contract.test.ts`) fails while any legacy token or raw hex remains in `app/`, turning a manual convention into an enforced one and giving this restyle a countdown to zero. The final task deletes the Cellar tokens once the contract test is green.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme` tokens), `next/font/google`, Vitest, Node `zlib` (icon generation). No new runtime dependencies.

## Global Constraints

- **Scope is Phases 0–1 of the spec.** Tabs, address/city, the peek, desktop rail, gestures and Playwright are later plans. This plan changes **presentation only** — no `lib/` logic, no `repo.ts`, no `db.ts`, no `SCHEMA_VERSION` movement, no behaviour changes.
- **Never `git add -A`.** Stage explicit paths (CLAUDE.md).
- **Green before every commit:** `npm test`, `npm run build`, `npm run lint` must all pass.
- **Baseline:** 175 tests in 9 files pass today. Task 1 adds a 10th file that starts red by design; from Task 15 all must be green.
- **Contrast floor:** `--color-sage` (`#8FAFA0`) is the minimum for *any* text. `--color-sage-deep` (`#6E8C7E`) is non-text only (rules, inactive glyph strokes).
- **Semantics:** gold = primary action / active state / score seals. Coral = destructive and error **only**.
- **Radii:** `0` is the default (rows, sections). `4px` for cards, chips, inputs, sheets. Fully round for score seals only. No other radii.
- **Touch targets ≥44px**; tap area may exceed visual size. Text inputs stay ≥16px (`text-base`) so iOS does not focus-zoom. Pinch-zoom stays enabled.
- **Overlays keep using `Sheet` + `useModalA11y`** and keep mounting/unmounting rather than toggling an `open` prop.
- **No component imports `dexie` or `@/lib/db`.** Reads through `lib/hooks.ts`, writes through `lib/repo.ts`.
- **Every write in the UI stays wrapped so a failure calls `toast(...)`.**

**Expect a visually mixed app between Tasks 4 and 15.** The ground flips to bottle green in Task 4 while most components still carry parchment surfaces. This is accepted and temporary; each commit still builds, passes, and is usable.

---

## File Structure

**Create:**
- `lib/theme-contract.test.ts` — enforces the token convention; the migration's progress meter

**Modify (token migration, in dependency order):**

| File | Legacy refs | Task |
| --- | --- | --- |
| `app/globals.css` | — | 2, 15 |
| `app/layout.tsx` | — | 3, 4 |
| `public/manifest.webmanifest` | — | 4 |
| `scripts/generate-icons.mjs` | — | 4 |
| `app/components/ui.tsx` | 35 | 5 |
| `app/components/Sheet.tsx` | 7 | 6 |
| `app/components/Toast.tsx` | 1 | 6 |
| `app/components/BottomNav.tsx` | 8 | 7 |
| `app/page.tsx` | 6 | 8 |
| `app/components/places/PlaceCard.tsx` | 11 | 8 |
| `app/components/places/PlaceFilters.tsx` | 0 | 8 |
| `app/components/places/PlaceForm.tsx` | 46 | 9 |
| `app/components/places/RatingEditor.tsx` | 3 | 9 |
| `app/categories/page.tsx` | 10 | 10 |
| `app/categories/[id]/page.tsx` | 19 | 10 |
| `app/components/categories/CategoryForm.tsx` | 18 | 10 |
| `app/components/categories/WeightsEditor.tsx` | 9 | 10 |
| `app/journal/page.tsx` | 3 | 11 |
| `app/components/visits/VisitForm.tsx` | 31 | 11 |
| `app/components/visits/VisitCard.tsx` | 7 | 11 |
| `app/places/[id]/page.tsx` | 69 | 12 |
| `app/settings/page.tsx` | 22 | 13 |
| `app/components/settings/CriteriaEditor.tsx` | 26 | 13 |
| `app/components/settings/BackupPanel.tsx` | 12 | 13 |
| `app/import/page.tsx` | 6 | 14 |
| `CLAUDE.md` | — | 15 |

Total: **349 legacy references across 20 files.**

**Deliberately not in this plan:** `app/components/AppInit.tsx` renders `null` and carries no styling — it is the 16th component in the spec's inventory and needs no restyle. This is an omission by design, not an oversight.

---

### Task 1: The theme contract test

Write the guard first. It fails loudly today and turns green only when the migration is complete — this is the plan's definition of done.

**Files:**
- Create: `lib/theme-contract.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: two tests — `"no component references a legacy Cellar token"` and `"no component hardcodes a raw hex colour"`. Every later task drives their violation lists down.

- [ ] **Step 1: Write the failing test**

```ts
// lib/theme-contract.test.ts
// Enforces CLAUDE.md's "tokens only" convention. Components must reference @theme tokens
// from app/globals.css — never a legacy Cellar token, never a raw hex value.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = resolve(process.cwd(), "app");

// Cellar-only token names. "gold" is deliberately absent: both palettes define
// --color-gold, so `text-gold` stays valid across the migration.
const LEGACY_TOKENS = [
  "shell",
  "surface-sunk",
  "surface",
  "line",
  "ink-soft",
  "ink",
  "plum-deep",
  "plum-tint",
  "plum",
  "ember-deep",
  "ember-tint",
  "ember",
  "gold-tint",
  "chili",
];

const UTILITY_PREFIX =
  "bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|divide|placeholder|accent|caret|decoration";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

function violations(pattern: RegExp): string[] {
  return tsxFiles(APP_DIR).flatMap((file) => {
    const found = readFileSync(file, "utf8").match(pattern) ?? [];
    return found.length === 0
      ? []
      : [`${relative(process.cwd(), file)} — ${found.length}: ${[...new Set(found)].join(", ")}`];
  });
}

describe("theme contract", () => {
  it("no component references a legacy Cellar token", () => {
    const pattern = new RegExp(`\\b(?:${UTILITY_PREFIX})-(?:${LEGACY_TOKENS.join("|")})\\b`, "g");
    expect(violations(pattern)).toEqual([]);
  });

  it("no component hardcodes a raw hex colour", () => {
    expect(violations(/#[0-9a-fA-F]{3,8}\b/g)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails and to capture the baseline**

Run: `npx vitest run lib/theme-contract.test.ts`
Expected: **FAIL**, listing ~20 files for the legacy-token test. Record the file list — it is the migration checklist.

If the raw-hex test also fails, note which files. Any legitimate colour found there must become a token in Task 2, not survive as a literal.

- [ ] **Step 3: Commit the failing guard**

```bash
git add lib/theme-contract.test.ts
git commit -m "test: add theme contract guard for the Supper Club migration

Fails while any legacy Cellar token or raw hex remains in app/. Turns the
tokens-only convention from a CLAUDE.md rule into an enforced one, and gives
the restyle a countdown to zero."
```

> This is the one commit in this plan that lands red. Every task after this reduces the violation list; Task 15 takes it to zero.

---

### Task 2: Add the Supper Club tokens

**Files:**
- Modify: `app/globals.css:9-43` (the `@theme` block — **add**, do not remove Cellar yet)

**Interfaces:**
- Produces: the token names every later task consumes — `ground`, `ground-deep`, `raised`, `rule`, `rule-strong`, `cream`, `sage`, `sage-deep`, `gold`, `gold-deep`, `coral`; fonts `display` / `body` / `util`; `--radius-sm`.

- [ ] **Step 1: Add the new colour tokens inside the existing `@theme` block**

```css
  /* ─── Supper Club ─────────────────────────────────────────────────────────
     Restaurant ephemera — matchbooks, place cards, awnings. Bottle green ground,
     cream ink, butter-gold seals. Gold is yes (action, active, score); coral is
     careful (destructive and error) and means nothing else.
     Cellar tokens above are retained until the migration completes, then deleted.
     -------------------------------------------------------------------------- */
  --color-ground: #0f3b2e; /* app background */
  --color-ground-deep: #0a2a20; /* nav, recessed wells */
  --color-raised: #17513f; /* raised surfaces: sheets, inputs */
  --color-rule: #21503f; /* hairlines between rows */
  --color-rule-strong: #2a5a49; /* section dividers */

  --color-cream: #f2ead8; /* primary text; inverted card surface */
  --color-sage: #8fafa0; /* secondary text — the MINIMUM for any text (~5.2:1) */
  --color-sage-deep: #6e8c7e; /* NON-TEXT only (~3.4:1): rules, inactive strokes */

  --color-gold: #efc152; /* primary action, active state, score seals */
  --color-gold-deep: #c99b2e; /* pressed gold */
  --color-coral: #ff5c3c; /* destructive and error ONLY */
```

> `--color-gold` already exists in the Cellar block as `#9c6f18`. **Replace that line's value** rather than declaring the name twice — a duplicate wins by source order and is confusing. Cellar's gold seals will shift to butter gold immediately; that is intended.

- [ ] **Step 2: Replace the radius tokens**

Delete `--radius-card: 1rem;` and add:

```css
  --radius-sm: 4px; /* cards, chips, inputs, sheets — the ONLY non-zero radius */
```

Rounded corners otherwise come from `rounded-full` (score seals only) or nothing at all.

- [ ] **Step 3: Add the font tokens**

Keep `--font-body` pointing at Hanken. Add:

```css
  --font-display: var(--font-bodoni), ui-serif, Georgia, serif;
  --font-util: var(--font-archivo), ui-sans-serif, system-ui, sans-serif;
```

Delete the `--font-instrument` reference from `--font-display`; `--font-sans` stays as-is.

- [ ] **Step 4: Verify the build still passes**

Run: `npm run build && npm run lint`
Expected: PASS. Nothing consumes the new tokens yet, so there is no visual change beyond gold shifting hue.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(theme): add Supper Club tokens alongside Cellar

Additive so every commit during the migration still builds. Sets the contrast
floor in comments: sage is the minimum for any text, sage-deep is non-text only.
Replaces --radius-card with a single 4px radius; 0 is now the default."
```

---

### Task 3: Swap the display and utility fonts

**Files:**
- Modify: `app/layout.tsx:2` (imports), `:10-25` (font declarations), and the `<html>` className

**Interfaces:**
- Consumes: `--font-display` / `--font-util` from Task 2
- Produces: `--font-bodoni` and `--font-archivo` CSS variables on `<html>`

- [ ] **Step 1: Replace the font imports**

```tsx
import { Archivo, Bodoni_Moda, Hanken_Grotesk } from "next/font/google";
```

- [ ] **Step 2: Replace the `Instrument_Serif` declaration**

```tsx
// Type pairing for savor's "Supper Club" look: Bodoni Moda (a high-contrast didone) for
// display and place names, Hanken Grotesk for body, Archivo for uppercase utility labels.
// Weights are subset to exactly what the type scale uses.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo",
  display: "swap",
});
```

Leave the `hanken` declaration untouched.

- [ ] **Step 3: Update the `<html>` className**

Replace `instrument.variable` with `bodoni.variable` and add `archivo.variable`.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: PASS. Grep to confirm the old family is gone: `grep -rn "instrument\|Instrument" app/` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(theme): swap Instrument Serif for Bodoni Moda, add Archivo

Bodoni carries display and place names; Archivo handles uppercase utility labels.
Hanken Grotesk stays for body. Weights subset to those the type scale uses."
```

---

### Task 4: Flip the ground and the PWA chrome

All four parchment references move together, or cold-start flashes cream before painting green.

**Files:**
- Modify: `app/globals.css:45-61` (`:root`, `body`)
- Modify: `app/layout.tsx` (`viewport.themeColor`, `appleWebApp.statusBarStyle`)
- Modify: `public/manifest.webmanifest:7-8`
- Modify: `scripts/generate-icons.mjs:24-30`
- Regenerate: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`

- [ ] **Step 1: Flip the document ground**

In `app/globals.css`: `color-scheme: light` → `dark`; `background-color: var(--color-shell)` → `var(--color-ground)`; `color: var(--color-ink)` → `var(--color-cream)`.

Also update the focus ring — plum is invisible on green:

```css
:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Update `app/layout.tsx`**

`themeColor: "#f6ede3"` → `"#0f3b2e"`, and `appleWebApp.statusBarStyle: "default"` → `"black-translucent"` so iOS status-bar glyphs stay legible on a dark ground.

- [ ] **Step 3: Update the manifest**

`public/manifest.webmanifest`: both `background_color` and `theme_color` → `"#0f3b2e"`.

- [ ] **Step 4: Recolour the icon generator**

In `scripts/generate-icons.mjs:24-30`, replace the constants. Keep the variable names' *roles*, rename to match the new palette:

```js
const GROUND = [15, 59, 46]; // --color-ground      #0f3b2e
const GROUND_DEEP = [10, 42, 32]; // --color-ground-deep #0a2a20 (edge vignette)
const GOLD = [239, 193, 82]; // --color-gold        #efc152
const GOLD_HI = [245, 214, 130]; // lifted gold for the seal's top face
const CREAM = [242, 234, 216]; // --color-cream       #f2ead8 (the bead)
const CREAM_DEEP = [214, 203, 178]; // shaded cream
const CREAM_HI = [255, 250, 240]; // bead highlight
```

Update every usage site of the old names (`PLUM`, `PLUM_DEEP`, `EMBER`, `EMBER_DEEP`, `GOLD_TINT`) to the new ones. The bead becomes cream rather than coral — coral is reserved for destructive meaning.

- [ ] **Step 5: Regenerate the icons and verify**

```bash
node scripts/generate-icons.mjs
npm run build && npm run lint && npm test
```
Expected: build/lint pass; the theme-contract test still fails (expected until Task 15); all 175 other tests pass.

Open `public/icon-512.png` and confirm a gold seal with a cream bead on bottle green.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx public/manifest.webmanifest scripts/generate-icons.mjs public/icon-192.png public/icon-512.png public/icon-maskable-512.png public/apple-touch-icon.png
git commit -m "feat(theme): flip ground to bottle green and move all PWA chrome

Manifest colors, viewport themeColor, color-scheme, the iOS status bar style and
the generated icons all move together — split across commits, cold-start flashes
cream before painting green. Focus ring moves to gold; plum is invisible on green.

The app is visually mixed from here until the restyle completes."
```

---

### Task 5: Restyle the shared primitives (`ui.tsx`)

The vocabulary every screen consumes. Doing it first makes the later tasks mostly mechanical.

**Files:**
- Modify: `app/components/ui.tsx` (35 legacy refs)

**Interfaces:**
- Consumes: tokens from Task 2
- Produces: unchanged export surface — `ADD_PLACE_EVENT`, `emitAddPlace`, `HeaderShell`, `Chip`, `EmptyState`, `AddPlaceButton`, `PasteLinkField`, `ScoreBadge`, `RatingRow`, `PlusGlyph`, `LinkGlyph`. **No export is renamed or removed** — every call site keeps working.

- [ ] **Step 1: Rebuild `ScoreBadge` as the foil seal**

**The existing signature is `{ score: number; size?: "sm" | "md"; className?: string }` (`ui.tsx:213-221`) — keep all three props exactly.** `score` is non-nullable, so callers already guard the unranked case; do not add null handling. Changing this signature breaks every call site.

```tsx
/* ─── ScoreBadge ─────────────────────────────────────────────────────────────
   The score seal — a foil stamp in butter gold with dark-green ink. The one
   place a fully-round radius is used. Serif numeral, tabular, via formatScore. */
export function ScoreBadge({
  score,
  size = "md",
  className = "",
}: {
  score: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "h-8 w-8 text-[0.8rem]" : "h-10 w-10 text-[0.95rem]";
  return (
    <span
      className={`tabular inline-grid shrink-0 place-items-center rounded-full bg-gold font-display font-bold text-ground shadow-[inset_0_0_0_1.5px_var(--color-ground),0_2px_6px_rgba(0,0,0,0.32)] ${dims} ${className}`}
    >
      {formatScore(score)}
    </span>
  );
}
```

`formatScore` is already imported in this file. The seal carries no star, which leaves the module-private `StarGlyph` (`ui.tsx:352`) unused — **delete it**, or `npm run lint` will fail. Confirm nothing else references it first:

```bash
grep -rn "StarGlyph" app/
```

- [ ] **Step 2: Migrate the remaining primitives**

Apply this mapping throughout the file:

| Legacy | Supper Club |
| --- | --- |
| `bg-shell` | `bg-ground` |
| `bg-surface` | `bg-raised` |
| `bg-surface-sunk` | `bg-ground-deep` |
| `border-line` / `bg-line` | `border-rule` / `bg-rule` |
| `text-ink` | `text-cream` |
| `text-ink-soft` | `text-sage` |
| `text-plum` / `bg-plum` | `text-gold` / `bg-gold` |
| `bg-plum-deep` | `bg-gold-deep` |
| `bg-plum-tint` | `bg-raised` |
| `text-ember` / `bg-ember` | `text-gold` / `bg-gold` |
| `bg-ember-deep` | `bg-gold-deep` |
| `bg-ember-tint` | `bg-raised` |
| `text-chili` / `border-chili` | `text-coral` / `border-coral` |
| `rounded-xl` / `rounded-card` | `rounded-sm` |
| `rounded-full` (non-seal) | `rounded-sm` |
| `ring-plum` | `ring-gold` |

Then apply the type scale: `HeaderShell` titles use `font-display text-[2.0625rem] italic leading-[0.98] font-semibold`; `Chip` and other labels use `font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em]`.

**Watch for:** any text still landing on `text-sage-deep` — that fails the contrast floor. Inactive states use `text-sage`.

- [ ] **Step 3: Verify progress**

```bash
npx vitest run lib/theme-contract.test.ts
```
Expected: still FAIL overall, but `app/components/ui.tsx` **no longer appears** in the violation list.

```bash
npm run build && npm run lint
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/components/ui.tsx
git commit -m "feat(theme): restyle shared primitives onto Supper Club tokens

ScoreBadge becomes the foil seal — a gold disc with dark-green ink, the only
fully-round radius in the system. Export surface is unchanged so every call site
keeps working."
```

---

### Task 6: Restyle the overlay chrome (`Sheet`, `Toast`)

**Files:**
- Modify: `app/components/Sheet.tsx` (7 refs)
- Modify: `app/components/Toast.tsx` (1 ref)

- [ ] **Step 1: Migrate `Sheet.tsx`**

Apply the Task 5 mapping. The sheet surface becomes `bg-raised`, its hairline `border-rule`, radius `rounded-sm` (top corners only for the `<sm` bottom sheet). Backdrop stays a scrim — darken it to `bg-[rgba(6,26,19,0.72)]`.

**Do not change behaviour:** it keeps `h-dvh`, keeps calling `useModalA11y`, keeps mount/unmount semantics, keeps backdrop-close.

- [ ] **Step 2: Migrate `Toast.tsx`**

Toast surface `bg-raised` with `text-cream` and a `border-rule` hairline. An error toast uses `border-coral` and `text-coral` — coral's only sanctioned use here.

- [ ] **Step 3: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # Sheet.tsx and Toast.tsx gone from the list
npm run build && npm run lint               # PASS
```

- [ ] **Step 4: Commit**

```bash
git add app/components/Sheet.tsx app/components/Toast.tsx
git commit -m "feat(theme): restyle Sheet and Toast onto Supper Club tokens

Behaviour untouched — h-dvh, useModalA11y, mount/unmount and backdrop-close all
unchanged. Error toasts are the sanctioned use of coral."
```

---

### Task 7: Restyle `BottomNav`

**Files:**
- Modify: `app/components/BottomNav.tsx` (8 refs)

- [ ] **Step 1: Migrate the bar and tabs**

Bar becomes `bg-ground-deep`. Tab labels use `font-util text-[0.53rem] font-bold uppercase tracking-[0.16em]`. **Inactive labels use `text-sage`, not `text-sage-deep`** — they are text and must clear the contrast floor. The active tab is `text-gold` with a 2px gold top rule (`shadow-[inset_0_2px_0_var(--color-gold)]`).

- [ ] **Step 2: Migrate the FAB**

The elevated "+" becomes `bg-gold` with `text-ground`, pressed state `active:bg-gold-deep active:scale-[0.97]`. It keeps dispatching `savor:add-place` via `emitAddPlace` — **do not change the event contract.**

- [ ] **Step 3: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # BottomNav.tsx gone from the list
npm run build && npm run lint               # PASS
```

Confirm every tab and the FAB still present a ≥44px hit area.

- [ ] **Step 4: Commit**

```bash
git add app/components/BottomNav.tsx
git commit -m "feat(theme): restyle bottom nav — gold active state and FAB

Inactive tab labels sit on sage rather than sage-deep so they clear the contrast
floor. The savor:add-place event contract is unchanged."
```

---

### Task 8: Restyle the Places tab

**Files:**
- Modify: `app/page.tsx` (6 refs)
- Modify: `app/components/places/PlaceCard.tsx` (11 refs)
- Modify: `app/components/places/PlaceFilters.tsx` (0 refs — verify only)

- [ ] **Step 1: Rebuild `PlaceCard` as a flat ruled row**

This is where the "no forced cards" decision becomes visible. Remove the card treatment — no `rounded-*`, no per-row background, no shadow. The row is:

```
[rank?]  Place name (font-display, 16.5px/1.25, semibold)      [ScoreBadge seal]
         Address line (font-body, 11px, text-sage)
```

Separated by `border-t border-rule`. Row padding `py-3 px-4`. The whole row stays a `Link` with a ≥44px height.

`PlaceCard` has no address to show until the later plan adds the field — render the existing secondary line (cuisine/status) in the address slot for now, and leave the slot empty rather than printing a placeholder when there is nothing.

- [ ] **Step 2: Migrate `app/page.tsx`**

Search field: `bg-raised`, `border-rule`, `rounded-sm`, `text-base` (keep ≥16px), `placeholder:text-sage`. Screen title uses the `display-xl` treatment from Task 5.

- [ ] **Step 3: Verify `PlaceFilters.tsx`**

It shows zero legacy refs, so it is already styling through `Chip`. Confirm by reading it — if it uses `Chip`, no change is needed. If it has raw classes the grep missed, migrate them.

- [ ] **Step 4: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # app/page.tsx and PlaceCard.tsx gone
npm run build && npm run lint               # PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/components/places/PlaceCard.tsx app/components/places/PlaceFilters.tsx
git commit -m "feat(theme): restyle Places tab — flat ruled rows, no cards

PlaceCard drops its card treatment for a hairline-separated index row with the
score seal right-aligned. Rounded, floating rows read as forced; 0 is the
default radius now."
```

---

### Task 9: Restyle `PlaceForm` and `RatingEditor`

The largest component in this task group (46 refs) and the one with the most form controls.

**Files:**
- Modify: `app/components/places/PlaceForm.tsx` (46 refs)
- Modify: `app/components/places/RatingEditor.tsx` (3 refs)

- [ ] **Step 1: Establish one input treatment and apply it everywhere**

Every text input, textarea and select in this file gets exactly the same classes — inconsistency here is a large part of why the app reads as assembled:

```
w-full rounded-sm border border-rule bg-raised px-3.5 py-2.5 text-base text-cream
placeholder:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold
```

`text-base` is mandatory — it is what stops iOS focus-zoom.

- [ ] **Step 2: Migrate labels, buttons and the lookup results list**

Field labels use `font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-sage`. The primary submit button is `bg-gold text-ground active:bg-gold-deep active:scale-[0.97]`. The delete/destructive action is the file's only coral. Lookup result rows follow the Task 8 flat-row pattern — `border-t border-rule`, no cards.

- [ ] **Step 3: Migrate `RatingEditor`**

Rating beads fill with `bg-gold` and are unfilled as `border-rule`. Keep the existing ≥44px tap area that exceeds the visual bead size.

- [ ] **Step 4: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # both files gone from the list
npm run build && npm run lint               # PASS
```

Manually open the add-place sheet on a mobile viewport, focus a text field, and confirm iOS does not zoom (inputs are ≥16px) and the sheet still scroll-locks the body.

- [ ] **Step 5: Commit**

```bash
git add app/components/places/PlaceForm.tsx app/components/places/RatingEditor.tsx
git commit -m "feat(theme): restyle PlaceForm and RatingEditor

One shared input treatment across every field in the form — the inconsistency
between them was a large part of why the app read as assembled. Inputs stay at
text-base so iOS does not focus-zoom."
```

---

### Task 10: Restyle the Lists screens

**Files:**
- Modify: `app/categories/page.tsx` (10 refs)
- Modify: `app/categories/[id]/page.tsx` (19 refs)
- Modify: `app/components/categories/CategoryForm.tsx` (18 refs)
- Modify: `app/components/categories/WeightsEditor.tsx` (9 refs)

- [ ] **Step 1: Migrate the list index and the ranked detail**

Both become flat ruled rows per Task 8. On `[id]`, the Ranked and Want-to-try sections keep their current stacked structure — **tabs are a later plan.** Section headings use the eyebrow treatment: `font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold`.

Rank numbers use `font-util text-[0.6875rem] font-semibold text-sage`. Score seals come from `ScoreBadge`, already done in Task 5.

- [ ] **Step 2: Change the want-to-try marker from coral to a cream ring**

Wherever a want-to-try row carries a marker, it is a hollow cream ring (`border border-cream` on a 6px round span), **not** coral. Coral means destructive only.

- [ ] **Step 3: Migrate `CategoryForm` and `WeightsEditor`**

Reuse the Task 9 input treatment verbatim. `CategoryForm`'s inline delete-confirm keeps its current behaviour — the `role="alertdialog"` work is a later plan — but its destructive button becomes coral.

- [ ] **Step 4: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # all four files gone
npm run build && npm run lint               # PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/categories/page.tsx "app/categories/[id]/page.tsx" app/components/categories/CategoryForm.tsx app/components/categories/WeightsEditor.tsx
git commit -m "feat(theme): restyle Lists index, ranked detail, and editors

Want-to-try markers move from coral to a hollow cream ring so coral keeps exactly
one meaning: destructive and error. Ranked/want-to-try stay stacked sections —
tabs are a later plan."
```

---

### Task 11: Restyle the Journal

**Files:**
- Modify: `app/journal/page.tsx` (3 refs)
- Modify: `app/components/visits/VisitForm.tsx` (31 refs)
- Modify: `app/components/visits/VisitCard.tsx` (7 refs)

- [ ] **Step 1: Rebuild `VisitCard` as a flat ruled row**

Date in `font-util` uppercase tracking, dishes in `font-body text-cream`, notes in `text-sage`. Hairline separated, no card treatment.

- [ ] **Step 2: Migrate `VisitForm`**

Reuse the Task 9 input treatment verbatim, including the date input. Confirm the native date picker is still usable against a dark ground — if the browser control renders illegibly, set `color-scheme: dark` on the input so the platform picker themes itself.

- [ ] **Step 3: Migrate `app/journal/page.tsx`**

Title on `display-xl`, empty state via `EmptyState` from Task 5.

- [ ] **Step 4: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # all three files gone
npm run build && npm run lint               # PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/journal/page.tsx app/components/visits/VisitForm.tsx app/components/visits/VisitCard.tsx
git commit -m "feat(theme): restyle Journal feed and visit form

VisitCard becomes a flat ruled row. The date input gets color-scheme: dark so the
native picker themes itself against the bottle-green ground."
```

---

### Task 12: Restyle place detail

The single densest file at 69 legacy references — it gets its own task for that reason.

**Files:**
- Modify: `app/places/[id]/page.tsx` (69 refs)

- [ ] **Step 1: Migrate the header and score presentation**

Place name on `display-lg` (`font-display text-[1.625rem] leading-[1.05] font-semibold`). The composite score renders through `ScoreBadge` at the seal's larger size. Address and metadata on `text-sage`.

- [ ] **Step 2: Migrate the ratings, list membership and visits sections**

Section headings use the eyebrow treatment from Task 10. Rating rows come from `RatingRow`, already migrated in Task 5. List-membership chips come from `Chip`. Visit rows follow the `VisitCard` pattern from Task 11.

- [ ] **Step 3: Migrate the action row**

Edit / rate / log-visit buttons: secondary actions are `border border-rule bg-raised text-cream`; the primary action is `bg-gold text-ground`. Delete is the file's only coral. Every button gets `active:scale-[0.97]`.

- [ ] **Step 4: Leave the plain-text empty states alone**

This file has plain-text empty states that diverge from `EmptyState`. Converting them is #9 work, folded into a later plan's Phase 4 — **do not do it here.** This task is presentation-only.

- [ ] **Step 5: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # places/[id]/page.tsx gone
npm run build && npm run lint               # PASS
```

Walk the screen manually: ratings edit, list membership toggles, visit logging, and delete all still work.

- [ ] **Step 6: Commit**

```bash
git add "app/places/[id]/page.tsx"
git commit -m "feat(theme): restyle place detail

The densest surface in the app at 69 token references. Presentation only — the
plain-text empty states here are #9 work and are deliberately left for later."
```

---

### Task 13: Restyle Settings

**Files:**
- Modify: `app/settings/page.tsx` (22 refs)
- Modify: `app/components/settings/CriteriaEditor.tsx` (26 refs)
- Modify: `app/components/settings/BackupPanel.tsx` (12 refs)

- [ ] **Step 1: Migrate the settings shell and criteria editor**

Reuse the Task 9 input treatment for the criterion name fields. Reorder controls use `text-sage` glyphs with ≥44px targets. The remove action is coral.

- [ ] **Step 2: Migrate `BackupPanel`**

Export and import buttons follow the Task 12 primary/secondary pattern. The destructive "clear data" path is coral. **Leave its inline confirm behaviour exactly as-is** — `role="alertdialog"` is later work.

- [ ] **Step 3: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # all three files gone
npm run build && npm run lint && npm test   # only the contract test may fail
```

Manually export a backup and re-import it to confirm the panel still functions.

- [ ] **Step 4: Commit**

```bash
git add app/settings/page.tsx app/components/settings/CriteriaEditor.tsx app/components/settings/BackupPanel.tsx
git commit -m "feat(theme): restyle Settings, criteria editor and backup panel

Confirm-step behaviour is untouched — alertdialog semantics are #9 work."
```

---

### Task 14: Restyle the import screen

**Files:**
- Modify: `app/import/page.tsx` (6 refs)

- [ ] **Step 1: Migrate the share-target landing screen**

This is what a shared Instagram/TikTok link lands on. Title on `display-xl`, body on `text-cream`, secondary on `text-sage`, primary action `bg-gold text-ground`. Reuse `PasteLinkField` from `ui.tsx`, already migrated in Task 5.

- [ ] **Step 2: Verify**

```bash
npx vitest run lib/theme-contract.test.ts   # import/page.tsx gone — list should now be EMPTY
npm run build && npm run lint               # PASS
```

- [ ] **Step 3: Commit**

```bash
git add app/import/page.tsx
git commit -m "feat(theme): restyle the share-target import screen"
```

---

### Task 15: Delete Cellar, prove the migration, record the decisions

**Files:**
- Modify: `app/globals.css` (remove the Cellar `@theme` entries)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Confirm the contract test is green *before* deleting anything**

```bash
npx vitest run lib/theme-contract.test.ts
```
Expected: **PASS**, both tests. If any file still appears, migrate it now — do not proceed.

- [ ] **Step 2: Delete the Cellar tokens**

Remove `--color-shell`, `--color-surface`, `--color-surface-sunk`, `--color-line`, `--color-ink`, `--color-ink-soft`, `--color-plum`, `--color-plum-deep`, `--color-plum-tint`, `--color-ember`, `--color-ember-deep`, `--color-ember-tint`, `--color-gold-tint`, `--color-chili`, and `--font-sans` if unused. Update the block's header comment to describe Supper Club.

- [ ] **Step 3: Prove nothing references them**

```bash
grep -rnE "shell|surface|plum|ember|chili|ink-soft" app/ --include="*.tsx" --include="*.css"
```
Expected: no matches other than prose in comments. Tailwind silently drops unknown utilities rather than erroring, so this grep — not the build — is the real proof.

- [ ] **Step 4: Audit contrast and reduced motion**

Measure every text/background pair against the floor. Confirm no text sits on `--color-sage-deep`:

```bash
grep -rn "text-sage-deep" app/
```
Expected: no matches.

Then enable `prefers-reduced-motion` in devtools and confirm every animation is suppressed.

- [ ] **Step 5: Update `CLAUDE.md`**

Four edits:
1. **Conventions** — replace "Cellar tokens only" with the Supper Club palette, the contrast floor, and gold-is-yes / coral-is-careful.
2. **Product decisions** — add the pinned no-component-library decision (scoped to presentation, headless primitives not foreclosed) and the radius rule.
3. **Workflow rules** — note that `lib/theme-contract.test.ts` enforces the tokens-only convention.
4. **Correct the test count** — it says 125; it is now **177 in 10 files**.

- [ ] **Step 6: Full green**

```bash
npm test && npm run build && npm run lint
```
Expected: all pass, 177 tests in 10 files.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css CLAUDE.md
git commit -m "feat(theme): delete Cellar tokens, pin the Supper Club decisions

The theme contract test is green, so nothing references the old palette. Records
the no-component-library decision and the radius rule in CLAUDE.md Product
decisions, and corrects the stale test count."
```

---

## Verification

After Task 15:

1. `npm test` — 177 passing in 10 files
2. `npm run build` and `npm run lint` — clean
3. Every route walked manually at `<sm` and `≥sm`: `/`, `/categories`, `/categories/[id]`, `/journal`, `/places/[id]`, `/settings`, `/import`
4. Every sheet opened and closed: add place, edit place, category form, weights, visit form
5. Contrast measured for each text/background pair against the floor
6. `prefers-reduced-motion` on — all animation suppressed
7. Installed PWA cold-start — no cream flash

**Understand what this does not prove.** All 177 tests are in `lib/`; none render a component. A total visual regression would leave the suite green, and the contract test only proves no *legacy token* survives — not that anything looks right. Steps 3–7 are the real verification and they are manual. This is the argument for making Playwright the next plan.

## Next plans

| Plan | Spec phase |
| --- | --- |
| 2 | Phase 6 — Playwright and the journeys (recommended next: journey tests written against roles and labels survive restyling, and nothing above is CI-verifiable until they exist) |
| 3 | Phase 2 — address/city inputs, address line, tabs, city filter |
| 4 | Phase 3 — `explainScore`, `ScoreBreakdown`, long-press peek |
| 5 | Phase 4 — sheet history via `?sheet=`, drag-to-dismiss, tap feedback, #9 a11y |
| 6 | Phase 5 — desktop rail and 720px column |
