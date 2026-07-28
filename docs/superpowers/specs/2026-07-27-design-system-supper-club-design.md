# savor design overhaul — "Supper Club"

Date: 2026-07-27
Issue: #24 (Epic: design pass) — all three threads. Closes #9.
Status: proposed

## Problem

savor's current look ("Cellar") is not under-designed — it is *the* default look that
generated design converges on: warm cream ground (`#f6ede3`), high-contrast serif
display (Instrument Serif), terracotta accent (`#d2551c`). It is a competent execution
of a palette that appears regardless of subject, which is why it reads as templated
despite being carefully built.

Underneath the palette there is no system. `app/globals.css` defines colours, two font
families and exactly one radius token. There is no type scale, no spacing rhythm, no
elevation model, and a four-keyframe motion vocabulary. 3,766 lines of TSX across 7
routes and 16 components each make local decisions about size and spacing, so the app
reads as assembled rather than designed.

Three further gaps, all named in #24:

- **The scoring model is invisible.** Per-list weighted criteria are savor's entire
  thesis — the same place ranks differently in different lists — and nothing in the UI
  says so. Scores appear as bare numbers you take on faith.
- **There is no desktop design.** Above `sm` it is a phone layout in a wide window.
- **There is no UI test coverage at all.** 175 tests in 9 files, all in `lib/`. A total
  visual regression would leave the suite green.

## Decisions

### 1. Direction: "Supper Club"

Restaurant ephemera — matchbooks, place cards, awnings — rather than menus and
parchment. A saturated bottle-green ground with cream ink, butter-gold seals, coral for
alerts. Bodoni Moda carries display and place names; Hanken Grotesk stays for body;
Archivo handles utility caps.

Rejected alternatives, both mocked and reviewed:

- **Cupping Form** — savor as a scoring instrument (cool oyster paper, cobalt,
  mark-sense rating bubbles). Strong concept, read as too clinical.
- **Gazetteer** — geography as the organising idea (topographic plate colours, leader
  dots, coordinates). Its *information design* was adopted; its palette was not.

The chosen design is the hybrid: Supper Club's palette and type, Gazetteer's
information design.

### 2. No component library — pinned

Not Mantine, not shadcn/ui, not Base UI. A **pinned product decision** for `CLAUDE.md`,
which is what #24 asks for.

- What makes this direction distinctive is tokens, type and layout — precisely the
  surface a component library wants to own. Adopting one trades a distinctive look for
  a competent generic one.
- Mantine specifically carries documented Tailwind v4 integration cost
  (`postcss-preset-mantine` alongside `@tailwindcss/postcss`,
  `@mantine/core/styles.layer.css`, hand-managed `@layer` ordering), and its
  `Popover`-portaling `Combobox` fights the `h-dvh` bottom sheet with the iOS keyboard
  raised.

**Scoped to presentation, not behaviour.** If a future interaction needs a hard
accessibility state machine, adopting a *headless* primitive for that one interaction is
a separate decision on its own merits, and is not foreclosed here.

### 3. Radii: rounding is rare and deliberate

`--radius-card: 1rem` on list rows is what made them read as forced. Three values only:

| Token | Value | Used for |
| --- | --- | --- |
| `--radius-none` | `0` | list rows, sections, rules — the default |
| `--radius-sm` | `4px` | peek card, chips, inputs, sheets |
| `--radius-full` | `9999px` | score seals only |

List rows become **flat and ruled**, never floating cards.

### 4. Score is a foil seal

A butter-gold disc with dark-green ink — a stamped seal. Replaces `ScoreBadge`. Rank
sits left in muted Archivo, place name in Bodoni, address on its own line in Hanken.

### 5. Desktop ≥`md`: nav rail plus single column

The bottom nav becomes a fixed left rail; content stays one column at ~720px max-width.
Detail still navigates to its own screen, as on mobile. Sheets stay centred modals
(already the behaviour at ≥`sm`). Split-pane was considered and rejected as
disproportionate to a device-local personal app.

### 6. UI testing: Playwright end-to-end

One devDependency (`@playwright/test`). It is the only option that can verify what this
overhaul actually adds — long-press, drag-to-dismiss, back-button semantics, real
IndexedDB, viewport units, PWA behaviour. jsdom cannot meaningfully test any of them.

---

## The token system

Replaces the `@theme` block in `app/globals.css` wholesale.

### Colour

```
--color-ground:       #0F3B2E   /* app background */
--color-ground-deep:  #0A2A20   /* nav rail / bottom nav, recessed wells */
--color-raised:       #17513F   /* raised surfaces: sheets, inputs */
--color-rule:         #21503F   /* hairlines between rows */
--color-rule-strong:  #2A5A49   /* section dividers */

--color-cream:        #F2EAD8   /* primary text; inverted card surface */
--color-sage:         #8FAFA0   /* secondary text — the minimum for ANY text */
--color-sage-deep:    #6E8C7E   /* NON-TEXT only: rules, inactive glyph strokes */

--color-gold:         #EFC152   /* primary action, active state, score seals */
--color-gold-deep:    #C99B2E   /* pressed gold */
--color-coral:        #FF5C3C   /* destructive and error ONLY */
```

**Semantic rule — gold is yes, coral is careful.** Gold carries primary action and
active state; coral is reserved for destructive and error. The want-to-try marker,
coral in the mockup, becomes a hollow cream ring so coral keeps exactly one meaning.

**Contrast floor.** `--color-sage` (~5.2:1 on ground) is the minimum for any text,
including inactive tab and nav labels. `--color-sage-deep` (~3.4:1) fails AA for body
text and is restricted to non-text use. Every text/background pair must be *measured*
during implementation, not assumed.

### Type

`app/layout.tsx` changes: **drop `Instrument_Serif`, add `Bodoni_Moda` and `Archivo`.**
Hanken Grotesk stays. All via `next/font/google` as CSS variables, matching the existing
pattern.

```
--font-display:  Bodoni Moda        /* screen titles, place names, score numerals */
--font-body:     Hanken Grotesk     /* body, addresses, inputs */
--font-util:     Archivo            /* uppercase labels, tabs, eyebrows, rank */
```

| Token | Size / leading | Face | Use |
| --- | --- | --- | --- |
| `display-xl` | 33px / 0.98, italic 600 | Bodoni | screen titles |
| `display-lg` | 26px / 1.05, 600 | Bodoni | place-detail name |
| `display-md` | 20px / 1.1, 600 | Bodoni | peek / sheet titles |
| `name` | 16.5px / 1.25, 600 | Bodoni | list-row place names |
| `body` | 15px / 1.5, 400 | Hanken | body copy |
| `body-sm` | 13px / 1.45, 400 | Hanken | dense secondary copy |
| `meta` | 11px / 1.35, 400 | Hanken | addresses, dates |
| `label` | 11px / 1, 600, `0.12em`, uppercase | Archivo | tabs, buttons |
| `eyebrow` | 8.5px / 1, 700, `0.24em`, uppercase | Archivo | section eyebrows |

**Unchanged constraints:** text-entry inputs stay ≥16px so iOS does not focus-zoom;
pinch-zoom stays enabled (WCAG 1.4.4). Score numerals use `tabular-nums`.

### Spacing

4px base scale: `4 · 8 · 12 · 16 · 24 · 32 · 44`. Screen gutter `16px`, list-row
vertical padding `12px`, section gap `24px`, minimum touch target `44px` (tap area may
exceed visual size).

### Elevation

On a dark ground, shadow reads weakly. Elevation is **surface lightness plus a
hairline**; real shadow is reserved for overlays.

| Level | Treatment |
| --- | --- |
| 0 | `--color-ground` |
| 1 | `--color-raised` + 1px `--color-rule` |
| 2 (overlay) | cream surface + `0 20px 44px rgba(0,0,0,.5)` |

### Motion

Existing keyframes retuned, not replaced. The `prefers-reduced-motion` block stays
exactly as-is and must suppress every new animation added below.

- Sheet enter `0.26s cubic-bezier(.22, 1, .36, 1)`; fade / pop / toast unchanged
- Peek lift `0.18s`, scrim fade `0.15s`
- Press feedback `active:scale-[0.97]` applied **uniformly** — currently uneven

---

## Phases

Each phase is independently shippable and must leave `npm test`, `npm run build`,
`npm run lint` (and from Phase 6, `npm run test:e2e`) green.

### Phase 0 — Foundation

Token system into `app/globals.css`; fonts swapped in `app/layout.tsx`.

**PWA chrome moves in the same commit.** Parchment is baked into four places; if they
drift, cold-start flashes cream before painting green:

1. `public/manifest.webmanifest` — `background_color` and `theme_color` (`#f6ede3` → `#0F3B2E`)
2. `app/layout.tsx` — `viewport.themeColor`
3. `app/globals.css` — `:root { color-scheme: light }` → `dark`
4. `scripts/generate-icons.mjs` — icons are drawn on parchment; regenerate all four
   (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`)

Also change `appleWebApp.statusBarStyle` from `"default"` — dark glyphs will be wrong
against a dark ground.

### Phase 1 — Restyle every surface

Presentation only. No behaviour changes, no `lib/` edits.

**Routes (7):** `/` · `/categories` · `/categories/[id]` · `/journal` · `/places/[id]` ·
`/settings` · `/import`

**Components (16):** `AppInit` · `BottomNav` · `Sheet` · `Toast` · `ui.tsx`
(`HeaderShell`, `Chip`, `EmptyState`, `ScoreBadge` → seal, `RatingRow`, glyphs) ·
`PlaceForm` · `PlaceCard` · `PlaceFilters` · `RatingEditor` · `CategoryForm` ·
`WeightsEditor` · `VisitForm` · `VisitCard` · `CriteriaEditor` · `BackupPanel`

### Phase 2 — List information design

**`PlaceForm` gains Address and City inputs.** Today it exposes Name, Cuisine and Notes
only; `address` and `city` are populated *solely* by OSM lookup autofill, so every
manually-added place has neither. Without these fields the address line renders blank
and the city filter cannot see most places. Both are optional; lookup keeps autofilling
them, and the user can correct what it returns.

No schema change is required — `Place.address?` and `Place.city?` already exist
(`lib/types.ts`), and `placeFields` in `lib/repo.ts` already validates both. **`SCHEMA_VERSION`
does not move, so the #2 backup-migration fast-follow is not triggered by this work.**

- **Tabs.** `/categories/[id]` splits Ranked and Want to try into underline tabs, state
  in a `?tab=ranked|want` search param via `router.replace` (so tabbing does not fill
  the history stack). Ranked is the default.
- **Address line** under each place name across list rows.
- **City filter** as a chip row, persisted in `?city=`. Options are derived from the
  distinct non-empty `city` values actually present among that list's places, plus "All
  cities". A new query function in `lib/hooks.ts`, unit-tested.

### Phase 3 — Make the score legible

The work that answers "why is this 4.6?".

**New pure functions in `lib/ranking.ts`**, unit-tested, preserving the pinned
semantics exactly (missing weight = 1, explicit `0` excludes, `null` when nothing
contributes, 1-decimal display):

```ts
export type CriterionContribution = {
  criterionId: string;
  name: string;
  weight: number;          // effective weight — missing resolves to 1
  rating: number | null;
  included: boolean;       // weight > 0 && rating != null && criterion live
};

export type ScoreExplanation = { score: number | null; contributions: CriterionContribution[] };

export function explainScore(place, category, criteria): ScoreExplanation;
export function scoreAcrossCategories(place, categories, criteria): Array<{
  categoryId: string; name: string; score: number | null;
}>;
```

**One `ScoreBreakdown` component, two mounts:**

1. **Place detail** — the canonical, always-available location.
2. **Long-press peek** — an accelerator over the list.

The breakdown shows each criterion with its effective weight (`×3`), the rating as a
bar, and a plain-language line naming what dominates and how the same ratings score in
another list. That line is the only place savor's per-list weighting is stated in words.

**Long-press peek mechanics:**

- `pointerdown` starts a ~450ms timer; cancelled by `pointermove` beyond ~10px,
  `pointerup`, `pointercancel`, or scroll.
- `-webkit-touch-callout: none` and `user-select: none` on rows; `contextmenu`
  suppressed, or iOS throws its own callout over the peek.
- `navigator.vibrate(10)`, feature-guarded.
- Desktop equivalent: hover-intent ~600ms under `(pointer: fine)`.
- Dismiss on `pointerup`, Escape, or scroll.

**Two constraints that are not negotiable:**

- **`navigator.vibrate()` is Android-only.** Safari has never implemented it and there is
  no web API for the Taptic Engine. iOS gets the visual lift and scrim; there is no
  haptic tick, and no copy or comment may imply otherwise.
- **The peek is an accelerator, never the only path.** Long-press is not discoverable,
  not keyboard-reachable, and not exposed to screen readers. Rows stay ordinary links;
  the peek is `aria-hidden`. The canonical breakdown lives on place detail.

### Phase 4 — Native feel

- **Sheet drag-to-dismiss** (`<sm` bottom-sheet form only, not the centred modal).
  Pointer-tracked `translateY`, floor at 0; dismiss past ~25% of sheet height or
  velocity > ~0.5px/ms, otherwise spring back. Suppressed under `prefers-reduced-motion`.
- **Back-button closes sheets — via a search param, with no popstate listener of our
  own.** Sheets are not routes and will not become routes. Sheet state lives in
  `?sheet=<name>`, and the sheet mounts when the param is present.

  Next 16 patches `window.history.pushState` (`node_modules/next/dist/client/components/app-router.js:252`).
  Calling the patched global copies Next's internal markers onto the new entry and
  dispatches `ACTION_RESTORE`, so `useSearchParams()` reflects the change with no RSC
  fetch and no navigation. Next's own `popstate` handler then covers back/forward.

  **This is load-bearing.** That handler (`:284`) reads:

  ```js
  if (!event.state) return;                         // silently does nothing
  if (!event.state.__NA) window.location.reload();   // full page reload
  ```

  An entry without Next's `__NA` marker causes a **full page reload** on back. The
  marker is stamped by the patch, so the rules are: always call the patched global
  `window.history.pushState`, never a captured reference to the original, and never
  before mount.

  - **Open:** `window.history.pushState(null, "", "?sheet=edit")`
  - **Back:** handled entirely by Next — param disappears, sheet unmounts
  - **Close** (button, backdrop, Escape): `window.history.back()`, consuming the entry so
    the stack stays balanced and entries never accumulate
  - **Ephemeral:** strip any `?sheet=` on cold load with `replaceState`, so it never
    survives a reload

  **Never put an entity id in the query.** The owning route already carries it in the
  path — `/places/[id]?sheet=edit`, `/categories/[id]?sheet=weights`. The global
  add-place FAB is `?sheet=add` and carries no id at all.

  **Accessibility is unchanged by construction.** `lib/useModalA11y.ts` already restores
  focus on unmount (`previouslyFocused?.focus()`) and its docblock states it is built for
  overlays that mount/unmount rather than toggle an `open` prop — which is exactly the
  shape URL-derived state produces. Both close paths unmount identically, so the focus
  trap, scroll-lock release and focus restoration behave the same whether the user
  presses Escape or the Android back gesture. No change to that hook.

  **Known build constraint:** `useSearchParams()` requires the consuming component to sit
  inside a `<Suspense>` boundary or `next build` fails.
- **Uniform tap feedback** — `active:scale-[0.97]` on every interactive control.
- **Overscroll**: `overscroll-behavior: contain` on scrollers; suppress pull-to-refresh
  inside overlays.
- **#9 folded in, since sheets are already open here:** `role="alertdialog"` plus focus
  move on the three inline confirm steps (`BackupPanel`, `CategoryForm`,
  `CriteriaEditor`); `useId` for sheet title ids so stacked sheets cannot collide; the
  plain-text empty states on place detail replaced with `EmptyState`.

### Phase 5 — Desktop ≥`md`

- `BottomNav` becomes a fixed left rail at ≥`md`; the bottom bar is hidden. The add-place
  FAB becomes a gold primary button in the rail, still dispatching `savor:add-place`.
- Content constrained to ~720px, centred in the remaining space.
- Hover states and `focus-visible` rings on every interactive control; full keyboard
  traversal of each route.
- Sheets remain centred modals at ≥`sm` — unchanged.

### Phase 6 — Playwright and the journeys

- Add `@playwright/test` as a devDependency; `playwright.config.ts` with a `webServer`
  running a production build on a dedicated port for determinism.
- Specs in `e2e/`. `vitest.config.ts` already includes only `lib/**/*.test.ts`, so the
  two suites cannot collide. New script `npm run test:e2e`.
- IndexedDB is real in-browser, so no `fake-indexeddb`. Playwright's per-test context
  isolation gives a clean database, which exercises first-run seeding naturally.

Journeys from #24, each with a stated success criterion:

1. First run — empty state → seeded criteria → add a first place
2. Add a place manually (no lookup)
3. Add via autocomplete → rate → assign to lists
4. Add via shared TikTok/Instagram link (share target and paste)
5. Log a visit → review it in the journal
6. Create a list → set weights → see places re-rank
7. Edit criteria (rename / add / remove / reorder) → scores update
8. Export a backup → clear data → import it back

**Journey 9 (install as PWA → launch → use offline) is blocked on #5** (service worker),
which does not exist yet. It is written down but not automated; note it explicitly rather
than pretending coverage.

### Phase 7 — Record the decisions

`CLAUDE.md` updates:

- Pinned Product decisions: no component library (scoped to presentation); the radius
  rule; gold-is-yes / coral-is-careful.
- Workflow rules: green-before-commit now includes `npm run test:e2e`.
- Correct the stale test count. CLAUDE.md says 125, #24 says 225; measured on
  2026-07-27 it is **175 passing in 9 files**.

---

## Verification

1. `npm test`, `npm run build`, `npm run lint`, `npm run test:e2e` green.
2. Measured contrast for every text/background pair against the floor above.
3. Manual pass over all 7 routes and every sheet at `<sm` and `≥md`.
4. Cold-start from the installed PWA — confirm no cream flash.
5. `prefers-reduced-motion` on — confirm every animation, including drag-to-dismiss and
   the peek, is suppressed.
6. Keyboard-only traversal of each route.

Until Phase 6 lands, **green tests prove nothing about Phases 0–5** — all 175 existing
tests are in `lib/` and a complete visual regression would leave them passing. This is
the argument for not deferring Phase 6.

## Risks

- **Blast radius.** Every route and component changes. Phases 0–1 are presentation-only
  and touch no `lib/` file, so the storage seam is unaffected; Phases 2–3 add pure
  functions and query functions with tests alongside, per the existing convention.
- **Phase 4's drag-to-dismiss is the riskiest thing here**, because pointer tracking
  interacts with scrolling and the iOS keyboard. Ship it after Playwright exists if
  sequencing has to give. The back-button work is *less* risky than first assessed, now
  that sheet state is URL-derived and Next owns the popstate path — but the `__NA` reload
  trap above means it still needs an explicit e2e test for back, forward, and
  navigating away with a sheet open.
- **Dark ground is a commitment** that propagates to manifest, icons, status bar and
  splash. Enumerated in Phase 0 so they move together.
- **Bodoni Moda at small sizes.** A high-contrast didone thins out below ~16px. Place
  names sit at 16.5px deliberately; anything smaller stays Hanken.
- **Two new font families** increase webfont payload. Both load via `next/font` with
  `display: swap`, subset to the weights the scale actually uses.
- **Existing places have no address or city** until re-looked-up or hand-edited. The
  address line and city filter must degrade quietly — no blank rows, no empty filter bar.

## Non-goals

| Deferred | Why |
| --- | --- |
| Offline cold-start / service worker | #5 — Phase 6 journey 9 depends on it |
| Visit edit and delete | #3 — a real gap, but a feature not a design pass |
| Photos on visits | #4 |
| Share / recommend cards | #6 |
| Manual tie-break ordering | #10 |
| Type↔zod drift guard | #8 |
| Backup forward-migration | #2 — not triggered; `SCHEMA_VERSION` does not move here |
| Autocomplete abort / request-token | #7 |
