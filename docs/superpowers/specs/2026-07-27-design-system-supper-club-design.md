# savor design pass — "Supper Club" token system and full restyle

Date: 2026-07-27
Issue: #24 (Epic: design pass), Thread 1 — with Thread 2/3 explicitly out of scope
Status: proposed

## Problem

savor's current look ("Cellar") is not under-designed — it is *the* default look that
generated design converges on: warm cream ground (`#f6ede3`), high-contrast serif
display (Instrument Serif), terracotta accent (`#d2551c`). It is a competent execution
of a palette that appears regardless of subject, which is why it reads as templated
despite being carefully built.

Underneath the palette there is no system. `app/globals.css` defines colors, two font
families and exactly one radius token. There is no type scale, no spacing rhythm, no
elevation model and a four-keyframe motion vocabulary. 3,766 lines of TSX across 7
routes and 16 components each make local decisions about size and spacing, so the app
reads as assembled rather than designed.

## Decisions

### 1. Direction: "Supper Club"

Restaurant ephemera — matchbooks, place cards, awnings — rather than menus and
parchment. A saturated bottle-green ground with cream ink, butter-gold seals and coral
for alerts. Bodoni Moda carries display and place names; Hanken Grotesk stays for body;
Archivo handles utility caps.

Rejected alternatives, both mocked and reviewed:

- **Cupping Form** — savor as a scoring instrument (cool oyster paper, cobalt,
  mark-sense rating bubbles). Strong concept, read as too clinical.
- **Gazetteer** — geography as the organising idea (topographic plate colours, leader
  dots, coordinates). Its *information design* was adopted; its palette was not.

The chosen design is the hybrid: Supper Club's palette and type, Gazetteer's
information design.

### 2. No component library — pinned

Not Mantine, not shadcn/ui, not Base UI. This is a **pinned product decision** and
belongs in `CLAUDE.md` alongside the other pinned semantics, which is what #24 asks for.

Reasoning:

- What makes this direction distinctive is tokens, type and layout — precisely the
  surface a component library wants to own. Adopting one trades a distinctive look for
  a competent generic one.
- Mantine specifically carries documented integration cost with Tailwind v4
  (`postcss-preset-mantine` alongside `@tailwindcss/postcss`, `@mantine/core/styles.layer.css`,
  hand-managed `@layer` ordering), and its `Popover`-portaling `Combobox` fights the
  `h-dvh` bottom sheet with the iOS keyboard raised.
- It trips CLAUDE.md's ask-before-adding-dependencies rule for no gain here.

**This decision is scoped to presentation, not behaviour.** If a specific interaction
later needs a hard accessibility state machine, adopting a *headless* primitive for
that one interaction is a separate decision, made on its own merits, and is not
foreclosed by this spec.

### 3. Radii: rounding is now rare and deliberate

The current `--radius-card: 1rem` applied to list rows made them read as forced. The
new system offers three values only:

| Token | Value | Used for |
| --- | --- | --- |
| `--radius-none` | `0` | list rows, sections, rules — the default |
| `--radius-sm` | `4px` | the peek card, chips, inputs, sheets |
| `--radius-full` | `9999px` | score seals only |

List rows become **flat and ruled**, not floating cards.

### 4. Score presentation: the foil seal

The composite score renders as a butter-gold disc with dark-green ink — a stamped seal.
It replaces the current `ScoreBadge`. Rank sits left in muted Archivo; place name in
Bodoni; address on its own line beneath in Hanken.

## The token system

Replaces the `@theme` block in `app/globals.css` wholesale.

### Colour

```
--color-ground:       #0F3B2E   /* app background */
--color-ground-deep:  #0A2A20   /* bottom nav, recessed wells */
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
which was coral in the mockup, becomes a hollow cream ring so coral keeps one meaning.

**Contrast floor.** `--color-sage` (~5.2:1 on ground) is the minimum for any text,
including inactive tab and nav labels. `--color-sage-deep` (~3.4:1) fails AA for body
text and is restricted to non-text use. Every text/background pair must be measured
during implementation, not assumed.

### Type

Fonts change in `app/layout.tsx`: **drop `Instrument_Serif`, add `Bodoni_Moda` and
`Archivo`.** Hanken Grotesk stays. All three via `next/font/google` as CSS variables,
matching the existing pattern.

```
--font-display:  Bodoni Moda        /* screen titles, place names, score numerals */
--font-body:     Hanken Grotesk     /* body, addresses, inputs */
--font-util:     Archivo            /* uppercase labels, tabs, eyebrows, rank */
```

Scale (mobile-first; each is a named token, not an ad-hoc size):

| Token | Size / leading | Face | Use |
| --- | --- | --- | --- |
| `display-xl` | 33px / 0.98, italic 600 | Bodoni | screen titles |
| `display-lg` | 26px / 1.05, 600 | Bodoni | place-detail name |
| `display-md` | 20px / 1.1, 600 | Bodoni | peek/sheet titles |
| `name` | 16.5px / 1.25, 600 | Bodoni | list-row place names |
| `body` | 15px / 1.5, 400 | Hanken | body copy |
| `body-sm` | 13px / 1.45, 400 | Hanken | dense secondary copy |
| `meta` | 11px / 1.35, 400 | Hanken | addresses, dates |
| `label` | 11px / 1, 600, `0.12em`, uppercase | Archivo | tabs, buttons |
| `eyebrow` | 8.5px / 1, 700, `0.24em`, uppercase | Archivo | section eyebrows |

**Unchanged constraint:** text-entry inputs stay ≥16px so iOS does not focus-zoom, and
pinch-zoom stays enabled (WCAG 1.4.4). Score numerals use `font-variant-numeric:
tabular-nums`.

### Spacing

4px base scale: `4 · 8 · 12 · 16 · 24 · 32 · 44`.

- Screen gutter: `16px`
- List-row vertical padding: `12px`
- Section gap: `24px`
- Minimum touch target: `44px` (unchanged — tap area may exceed visual size)

### Elevation

On a dark ground, shadow reads weakly. Elevation is carried by **surface lightness plus
a hairline**, with real shadow reserved for overlays.

| Level | Treatment |
| --- | --- |
| 0 | `--color-ground` |
| 1 | `--color-raised` + 1px `--color-rule` |
| 2 (overlay) | cream surface + `0 20px 44px rgba(0,0,0,.5)` |

### Motion

Existing keyframes are retuned, not replaced. The `prefers-reduced-motion` block stays
exactly as-is.

- Sheet enter: `0.26s cubic-bezier(.22, 1, .36, 1)` (unchanged)
- Fade / pop / toast: unchanged durations
- Press feedback: `active:scale-[0.97]` applied **uniformly** — it is currently uneven

## Scope: what gets restyled

Every route and component below is rebuilt against the new tokens. No behaviour
changes, no new features.

**Routes (7):** `/` places · `/categories` · `/categories/[id]` · `/journal` ·
`/places/[id]` · `/settings` · `/import`

**Components (16):** `AppInit` · `BottomNav` · `Sheet` · `Toast` · `ui.tsx`
(`HeaderShell`, `Chip`, `EmptyState`, `ScoreBadge` → seal, `RatingRow`, glyphs) ·
`PlaceForm` · `PlaceCard` · `PlaceFilters` · `RatingEditor` · `CategoryForm` ·
`WeightsEditor` · `VisitForm` · `VisitCard` · `CriteriaEditor` · `BackupPanel`

### PWA chrome must move in the same commit

Parchment is baked into four places. If they drift, cold-start flashes cream before
painting green:

1. `public/manifest.webmanifest` — `background_color` and `theme_color` (`#f6ede3` → `#0F3B2E`)
2. `app/layout.tsx` — `viewport.themeColor`
3. `app/globals.css` — `:root { color-scheme: light }` → `dark`
4. `scripts/generate-icons.mjs` — icons are drawn on parchment; regenerate all four
   (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`)

Also revisit `appleWebApp.statusBarStyle` in `app/layout.tsx` — `"default"` gives dark
status-bar glyphs, which will be wrong against a dark ground.

## Non-goals

Deliberately excluded; each becomes a child issue of #24.

| Deferred | Why |
| --- | --- |
| Ranked / Want-to-try **tabs** | Structural navigation change, not restyling |
| **Address** display and **city filter** | `Place.address` and `Place.city` already exist, so no migration is needed — but it is a feature, not a restyle |
| **Long-press peek** with score breakdown | New interaction; see note below |
| Desktop ≥`md` layout | #24 Thread 2, web half |
| Sheet gestures, back-button semantics, drag-to-dismiss | #24 Thread 2, mobile half |
| User journeys and UI test infrastructure | #24 Thread 3 |
| A11y bundle (`role="alertdialog"`, `useId` for sheet titles) | #9 |

### Note on the deferred peek

Long-press peek is designed and mocked. It shows the per-criterion breakdown with
weights and a plain-language line — *"food quality counts triple here… in Cheap eats
the same ratings score 3.6"* — which is currently the only place savor's per-list
weighting is legible anywhere in the UI.

Two constraints already established, to carry into that spec:

- **`navigator.vibrate()` is Android-only.** Safari has never implemented it and there
  is no web API for the Taptic Engine. iOS gets the visual lift and scrim; there is no
  haptic tick, and the spec must not promise one.
- **It must stay an accelerator, never the only path.** Long-press is not discoverable,
  not keyboard-reachable and not exposed to screen readers. The same breakdown must
  exist on place detail; hover-after-delay is the desktop equivalent.

## Verification

`npm test`, `npm run build` and `npm run lint` must all pass before every commit, per
CLAUDE.md.

**Green tests prove nothing about this change.** All 175 tests (9 files) live in `lib/`
and cover the data layer, ranking, backup and lookup. Zero cover a rendered component. A
complete visual regression would leave the suite green. Verification is therefore:

> Both existing counts are stale: CLAUDE.md says 125, #24 says 225. Measured on
> 2026-07-27 it is **175 passing in 9 files**. Correct CLAUDE.md as part of this work.

1. Test/build/lint green — confirms nothing in `lib/` was disturbed.
2. A manual screen-by-screen pass over all 7 routes and every sheet, on a real mobile
   viewport, at both `<sm` and `≥sm` breakpoints.
3. Measured contrast for every text/background pair against the floor above.
4. Cold-start check from the installed PWA — confirm no cream flash.
5. `prefers-reduced-motion` on — confirm animation is suppressed.

That this verification is entirely manual is exactly the gap #24 Thread 3 names, and is
an argument for sequencing the journeys-and-tests work soon after.

## Risks

- **Blast radius.** Every route and component changes at once. Mitigated by the change
  being presentation-only — no repo, hook, or schema edits — so `lib/` stays untouched
  and the storage seam is unaffected.
- **Dark ground is a commitment.** It propagates to manifest, icons, status bar and
  splash. Enumerated above so they move together.
- **Bodoni Moda at small sizes.** A high-contrast didone can thin out below ~16px.
  Place names sit at 16.5px deliberately; anything smaller stays Hanken.
- **Two new font families** increase the webfont payload. Both load via `next/font`
  with `display: swap`; weights are subset to those the scale actually uses.
