# Supper Club Phase 5 — Desktop (≥md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give savor a real desktop layout above the `md` breakpoint (768px): a fixed
left nav rail replaces the bottom tab bar, content is constrained to a readable
~720px column instead of stretching phone-width chrome across a wide window, and
every interactive control gets a `md:hover:` state and a verified keyboard path —
finishing Phase 5 of the Supper Club overhaul (issue #24, spec
`docs/superpowers/specs/2026-07-27-design-system-supper-club-design.md`, lines
345-352).

**Architecture:** Nav tab config (route, label, icon, active-match) moves out of
`BottomNav.tsx` into a shared, framework-thin module so `BottomNav` (mobile,
`md:hidden`) and a new `NavRail` (desktop, `hidden md:flex`) render the same four
tabs without drifting. `app/layout.tsx` mounts both and adjusts `<main>`'s
horizontal/vertical spacing per breakpoint. Two bottom-anchored overlays (`Toast`,
`MapSelectionCard`) that currently assume the bottom nav is reserving space get a
`md:` override since that space disappears at `md`. Hover states are added file-by-file
as `md:hover:` variants alongside each control's existing `active:` variant, so touch
devices are untouched and desktop mouse users get a visible affordance. No `lib/`
changes — this phase is presentation-only, same as Phase 1.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4 (`md` = 768px, the framework
default — this repo does not override `--breakpoint-*`), no new dependencies.

## Global Constraints

- `npm test`, `npm run build`, and `npm run lint` must all pass before every commit
  (CLAUDE.md "Green before every commit").
- Stage explicit paths, never `git add -A`; commit straight to `main` with
  conventional-commit messages (CLAUDE.md "Direct to `main`").
- No raw hex or off-palette Tailwind colors — `lib/theme-contract.test.ts` fails the
  build on violation. Every new class must use an existing `@theme` token
  (`ground`, `ground-deep`, `raised`, `rule`, `rule-strong`, `cream`, `sage`,
  `sage-deep`, `gold`, `gold-deep`, `coral`, `coral-deep`).
- Gold is yes, coral is careful (CLAUDE.md) — any new hover treatment on a
  primary/gold control stays in the gold family; destructive controls stay coral.
- `sage` is text-legal on `ground`/`ground-deep` only, never on `raised` (CLAUDE.md
  contrast rule) — the rail sits on `ground-deep`, so `sage` labels there are fine.
- `0` radius is the default; `rounded-sm` for chips/inputs/sheets/buttons;
  `rounded-full` only for seals and small circular indicators — never introduce a
  new radius value.
- Minimum 44px touch target on interactive controls (`min-h-11`/`h-11`/`w-11`)
  stays intact everywhere it exists today — hover-only edits must not shrink it.
- Sheets remain centered modals at ≥`sm` — this phase does not touch `Sheet.tsx`'s
  layout, only confirms it (Task 8).
- No component library (CLAUDE.md pinned decision) — the nav rail is hand-built
  from the same primitives as `BottomNav`.

---

## File Structure

- **Create** `app/components/nav/tabs.tsx` — the four-tab config array (`TABS`)
  and the four icon components (`DiningIcon`, `TrophyIcon`, `BookIcon`,
  `SlidersIcon`), extracted verbatim from `BottomNav.tsx`. Both nav surfaces
  import from here so they can never list a different set of tabs.
- **Create** `app/components/nav/NavRail.tsx` — the `hidden md:flex` fixed left
  rail: tab list (vertical) + a gold "Add a place" button, active tab derived
  from `usePathname()` exactly like `BottomNav`.
- **Modify** `app/components/BottomNav.tsx` — import `TABS`/icons from
  `nav/tabs.tsx` instead of defining them locally; add `md:hidden` so the bottom
  bar disappears once the rail takes over.
- **Modify** `app/layout.tsx` — mount `<NavRail />` alongside `<BottomNav />`;
  give `<main>` a `md:ml-[<rail width>]` offset, a `md:max-w-[45rem]` column
  width, and drop the phone-only bottom padding at `md` (no bottom bar to
  clear there).
- **Modify** `app/components/Toast.tsx` — bottom offset drops to clear only the
  safe-area inset at `md` (no `BottomNav` there), and shifts to sit clear of the
  rail's left edge rather than centering under phone-width chrome.
- **Modify** `app/components/places/MapSelectionCard.tsx` — same bottom-offset
  fix as `Toast.tsx`, and inset from the rail on the left at `md`.
- **Modify** `app/components/ui.tsx` — `md:hover:` on `Chip`, `AddPlaceButton`,
  `PasteLinkField`'s button, `ConfirmBox`'s two buttons, `RatingRow`'s bead
  buttons.
- **Modify** `app/components/places/PlaceCard.tsx`,
  `app/components/places/PlaceFilters.tsx`,
  `app/components/places/ViewToggle.tsx`,
  `app/components/places/RatingEditor.tsx`,
  `app/components/places/PinlessPlacesSheet.tsx`,
  `app/components/places/LookupCombobox.tsx`,
  `app/components/places/PlacesMap.tsx`,
  `app/components/places/PlaceForm.tsx` — `md:hover:` on each interactive
  element.
- **Modify** `app/components/visits/VisitCard.tsx`,
  `app/components/visits/VisitForm.tsx`,
  `app/components/categories/CategoryForm.tsx`,
  `app/components/categories/WeightsEditor.tsx`,
  `app/components/settings/CriteriaEditor.tsx`,
  `app/components/settings/BackupPanel.tsx`,
  `app/components/settings/MapCachePanel.tsx`,
  `app/categories/page.tsx`, `app/categories/[id]/page.tsx`,
  `app/journal/page.tsx`, `app/places/[id]/page.tsx`,
  `app/settings/page.tsx` — same `md:hover:` treatment.
- **Modify** `CLAUDE.md` — record the nav-rail architecture and the
  `md:hover:` convention as a Conventions bullet (Task 9).

No new test files: this codebase has no component-testing tool (`lib/` is the
only tested layer; UI correctness here is verified by `npm run build` +
`npm run lint` + `lib/theme-contract.test.ts` + a live browser pass, matching
how Phases 0–4 verified their presentation work).

---

### Task 1: Extract shared nav tab config

**Files:**
- Create: `app/components/nav/tabs.tsx`
- Modify: `app/components/BottomNav.tsx`

**Interfaces:**
- Produces: `Tab` type (`{ href: string; label: string; Icon: (p: { className?:
  string }) => React.ReactElement; match: (path: string) => boolean }`), `TABS:
  Tab[]` (4 entries: Places, Lists, Journal, Settings), and the four icon
  components (`DiningIcon`, `TrophyIcon`, `BookIcon`, `SlidersIcon`) — all
  named exports of `app/components/nav/tabs.tsx`. Task 2's `NavRail` and this
  task's updated `BottomNav` both consume these.

- [ ] **Step 1: Create `app/components/nav/tabs.tsx` with the config + icons moved out of `BottomNav.tsx`**

```tsx
// Shared nav-tab config: the four primary routes (Places · Lists · Journal ·
// Settings), used by both BottomNav (mobile, <md) and NavRail (desktop, ≥md) so
// the two surfaces can never list a different set of tabs.

export type Tab = {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  // A tab owns its own route subtree (e.g. Places also owns /places/[id]).
  match: (path: string) => boolean;
};

export const TABS: Tab[] = [
  {
    href: "/",
    label: "Places",
    Icon: DiningIcon,
    match: (p) => p === "/" || p.startsWith("/places"),
  },
  {
    href: "/categories",
    label: "Lists",
    Icon: TrophyIcon,
    match: (p) => p.startsWith("/categories"),
  },
  {
    href: "/journal",
    label: "Journal",
    Icon: BookIcon,
    match: (p) => p.startsWith("/journal"),
  },
  {
    href: "/settings",
    label: "Settings",
    Icon: SlidersIcon,
    match: (p) => p.startsWith("/settings"),
  },
];

/* ─── icons (1.75 stroke, rounded) ──────────────────────────────────────────
   Fork+knife (dining), trophy (rankings), book (journal), sliders (settings) —
   a small, food-forward set that reads at 24px. */

export function DiningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 3v7m-2.5-7v4a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 9.5 7V3M7 12.5V21M17 3c-1.7 0-3 2-3 4.5S15 12 17 12v9"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 4h10v4a5 5 0 0 1-10 0V4Zm0 2H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5M12 13v3m-3 5h6m-4.5 0 .5-3.2h4l.5 3.2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v14H6.5A1.5 1.5 0 0 0 5 19.5v-15Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path
        d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 8h6M9 11.5h4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 7h9m4 0h3M4 17h3m4 0h9M14 4.5v5M8 14.5v5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Rewrite `app/components/BottomNav.tsx` to import from `nav/tabs.tsx`, and hide it at `md`**

Replace the whole file with:

```tsx
"use client";

// Fixed bottom navigation: 4 tabs (Places · Lists · Journal · Settings) around an elevated
// ember "＋" FAB. Active tab is derived from the pathname. The FAB dispatches the
// `savor:add-place` window event (via emitAddPlace) — T8's add-place flow listens for it, so
// this stays presentational with no data or routing side effects beyond navigation.
// Mobile/tablet only (<md) — NavRail (app/components/nav/NavRail.tsx) takes over at md, and
// both import their tab list from nav/tabs.tsx so the two surfaces can't drift apart.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { emitAddPlace, PlusGlyph } from "./ui";
import { TABS, type Tab } from "./nav/tabs";

export default function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule/80 bg-ground-deep backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 items-center px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
        <NavItem tab={TABS[0]} active={TABS[0].match(pathname)} />
        <NavItem tab={TABS[1]} active={TABS[1].match(pathname)} />

        {/* Elevated primary action — "add a place". */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => emitAddPlace()}
            aria-label="Add a place"
            className="-mt-7 grid h-16 w-16 place-items-center rounded-full bg-gold text-ground shadow-lg shadow-gold/30 ring-4 ring-ground-deep transition active:scale-[0.97] active:bg-gold-deep"
          >
            <PlusGlyph className="h-7 w-7" />
          </button>
        </div>

        <NavItem tab={TABS[2]} active={TABS[2].match(pathname)} />
        <NavItem tab={TABS[3]} active={TABS[3].match(pathname)} />
      </div>
    </nav>
  );
}

function NavItem({ tab, active }: { tab: Tab; active: boolean }) {
  const { href, label, Icon } = tab;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 flex-col items-center gap-0.5 py-1 transition ${
        active
          ? "text-gold shadow-[inset_0_2px_0_var(--color-gold)]"
          : "text-sage active:text-cream"
      }`}
    >
      <span
        className={`grid h-8 w-14 place-items-center rounded-full transition ${
          active ? "bg-raised" : "bg-transparent"
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="font-util text-[0.53rem] font-bold uppercase tracking-[0.16em]">
        {label}
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Verify build and lint are clean**

Run: `npm run build && npm run lint`
Expected: both succeed, no unused-import or type errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/nav/tabs.tsx app/components/BottomNav.tsx
git commit -m "refactor(nav): extract shared tab config for BottomNav/NavRail"
```

---

### Task 2: Build the desktop `NavRail`

**Files:**
- Create: `app/components/nav/NavRail.tsx`

**Interfaces:**
- Consumes: `TABS`, `Tab` from `app/components/nav/tabs.tsx` (Task 1);
  `emitAddPlace`, `PlusGlyph` from `app/components/ui.tsx`.
- Produces: default export `NavRail` (no props) — a fixed, `hidden md:flex`
  left rail, `md:w-60` (15rem / 240px) wide. Task 3 mounts it in
  `app/layout.tsx` and reads its width (`15rem`) to offset `<main>`.

- [ ] **Step 1: Create `app/components/nav/NavRail.tsx`**

```tsx
"use client";

// Desktop (≥md) left nav rail — replaces BottomNav once the viewport is wide enough for a
// vertical rail to make sense. Same four tabs, same TABS/icons as BottomNav (nav/tabs.tsx) so
// the two surfaces can't drift. The FAB becomes a plain gold button at the top of the rail,
// still dispatching the same `savor:add-place` window event BottomNav's FAB does.
//
// Width (15rem / w-60) is also hardcoded as the `md:ml-60` offset on <main> in app/layout.tsx —
// the two must move together if this ever changes.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { emitAddPlace, PlusGlyph } from "../ui";
import { TABS, type Tab } from "./tabs";

export default function NavRail() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-rule/80 bg-ground-deep px-3 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 md:flex"
    >
      <p className="px-2 font-display text-2xl italic font-semibold text-gold">savor</p>

      <button
        type="button"
        onClick={() => emitAddPlace()}
        className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-sm bg-gold px-4 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"
      >
        <PlusGlyph className="h-4 w-4" />
        Add a place
      </button>

      <div className="mt-6 flex flex-col gap-1">
        {TABS.map((tab) => (
          <RailItem key={tab.href} tab={tab} active={tab.match(pathname)} />
        ))}
      </div>
    </nav>
  );
}

function RailItem({ tab, active }: { tab: Tab; active: boolean }) {
  const { href, label, Icon } = tab;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-sm px-2.5 py-2 font-util text-[0.8rem] font-semibold uppercase tracking-[0.1em] transition ${
        active
          ? "bg-raised text-gold"
          : "text-sage md:hover:bg-raised md:hover:text-cream"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Verify build and lint are clean**

Run: `npm run build && npm run lint`
Expected: both succeed. `NavRail` is unused until Task 3 wires it in, so this
step only proves the file itself compiles — `npm run build` will still succeed
with an unused component since it isn't imported anywhere yet (Next.js doesn't
fail the build on an unimported file).

- [ ] **Step 3: Commit**

```bash
git add app/components/nav/NavRail.tsx
git commit -m "feat(nav): add desktop left nav rail component"
```

---

### Task 3: Wire `NavRail` into the root layout

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `NavRail` default export (Task 2), rail width `15rem` (`w-60`,
  matches `NavRail`'s own `md:flex w-60`).

- [ ] **Step 1: Import and mount `NavRail`, offset `<main>` at `md`**

In `app/layout.tsx`, add the import next to the other component imports:

```tsx
import NavRail from "./components/nav/NavRail";
```

Replace the `<body>` contents:

```tsx
      <body className="min-h-dvh antialiased">
        {/* Single-mount data touchpoint: seeds the DB + requests persistent storage. */}
        <AppInit />
        <NavRail />
        {/* Mobile (<md): content clears the fixed bottom nav (nav + FAB overhang + safe area).
            6rem cleared the bar alone and let the FAB sit on top of trailing content, hence
            8rem. Desktop (≥md): NavRail replaces the bottom bar, so that bottom clearance is
            dropped and a left offset (md:ml-60) plus a ~720px reading column (md:max-w-[45rem])
            takes its place — see NavRail's own w-60 for why 60 (15rem) is the shared width. */}
        <main className="mx-auto w-full max-w-xl pb-[calc(8rem+env(safe-area-inset-bottom))] md:ml-60 md:max-w-[45rem] md:pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
        <BottomNav />
        <Toaster />
        {/* T8's add-place sheet: listens for the FAB's savor:add-place event, renders on demand. */}
        {/* Its own boundary: AddPlaceHost calls useSearchParams(), and an unbounded call in
            the root layout would push every page's static shell to client rendering. Scoped
            here, only this (null-rendering) host defers. */}
        <Suspense fallback={null}>
          <AddPlaceHost />
        </Suspense>
      </body>
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all three pass. `lib/theme-contract.test.ts` is part of `npm test` and
will fail if any new class used a non-token color — it won't here since every
class above reuses existing tokens.

- [ ] **Step 3: Manual check — confirm the rail appears and content re-centers**

Start the dev server (`npm run dev`, port 3001 per this repo's convention — see
`package.json`'s `dev` script) and resize the browser window past 768px wide on
the `/` route. Confirm: `BottomNav` disappears, `NavRail` appears fixed on the
left with the "savor" wordmark, gold "Add a place" button, and four tabs; page
content shifts right and centers in a column noticeably narrower than the full
remaining width (not edge-to-edge).

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(layout): mount NavRail and give desktop its own content width"
```

---

### Task 4: Fix bottom-anchored overlays for the rail layout

**Files:**
- Modify: `app/components/Toast.tsx`
- Modify: `app/components/places/MapSelectionCard.tsx`

**Interfaces:**
- No new interfaces — pure className changes to existing components.

**Context:** Both `Toast` and `MapSelectionCard` currently hardcode a bottom
offset (`bottom-[calc(5.75rem+env(safe-area-inset-bottom))]` and
`bottom-[calc(4.5rem+env(safe-area-inset-bottom))]` respectively) sized to clear
`BottomNav`. At `md`, `BottomNav` is `md:hidden` (Task 1) and `NavRail` is a
*left* rail, not a bottom one, so that reserved bottom space no longer exists —
without a fix, both overlays float with an unnecessary ~5-6rem gap above the
bottom edge on desktop.

- [ ] **Step 1: Read the current `Toast.tsx` overlay className**

Confirm the target line (`app/components/Toast.tsx:48` as of this plan):

```tsx
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4"
```

- [ ] **Step 2: Add the `md:` override**

```tsx
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 md:inset-x-60 md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
```

`md:inset-x-60` keeps the toast centered in the content column to the right of
the rail (matching `NavRail`'s `w-60`) rather than centered under the rail
itself; `md:bottom-[calc(1.5rem+...)]` drops the offset to a plain comfortable
margin now that there's no bottom bar to clear.

- [ ] **Step 3: Apply the same fix to `MapSelectionCard.tsx`**

Current (`app/components/places/MapSelectionCard.tsx:40`):

```tsx
      className="anim-toast fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-sm border border-rule bg-raised px-4 py-3 shadow-lg"
```

New:

```tsx
      className="anim-toast fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-sm border border-rule bg-raised px-4 py-3 shadow-lg md:inset-x-[calc(15rem+1rem)] md:bottom-[calc(1.25rem+env(safe-area-inset-bottom))]"
```

`md:inset-x-[calc(15rem+1rem)]` insets past the rail's 15rem width plus the
same 1rem (`inset-x-4`) margin the mobile layout already uses on both sides.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

Manually confirm on `/?view=map` at ≥`md`: tap a pin, `MapSelectionCard` appears
inset from the rail's right edge, not overlapping it, sitting close to the
bottom of the viewport rather than floating with a large gap.

- [ ] **Step 5: Commit**

```bash
git add app/components/Toast.tsx app/components/places/MapSelectionCard.tsx
git commit -m "fix(overlays): reposition Toast/MapSelectionCard for the desktop rail layout"
```

---

### Task 5: Hover states — `ui.tsx` shared primitives

**Files:**
- Modify: `app/components/ui.tsx`

**Interfaces:**
- No new interfaces — pure className additions on existing exports (`Chip`,
  `AddPlaceButton`, `PasteLinkField`, `RatingRow`, `ConfirmBox`).

**Convention for this and every remaining hover task:** add hover as
`md:hover:<utility>`, gated to `md` so touch devices (which don't support real
hover) never see a class meant for a mouse, and reusing the *same* token the
element's existing `active:` variant already uses (no new colors introduced,
satisfying the no-raw-hex/token-only constraint automatically).

- [ ] **Step 1: `Chip`'s interactive branch** (`app/components/ui.tsx:100-102`)

Before:

```tsx
      className={`${base} ${look} min-h-11 active:scale-[0.97] ${
        active ? "active:opacity-90" : "active:opacity-80"
      } ${className}`}
```

After:

```tsx
      className={`${base} ${look} min-h-11 active:scale-[0.97] md:hover:scale-[0.99] ${
        active ? "active:opacity-90 md:hover:opacity-90" : "active:opacity-80 md:hover:opacity-80"
      } ${className}`}
```

- [ ] **Step 2: `AddPlaceButton`** (`app/components/ui.tsx:145`)

Before:

```tsx
      className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"
```

After:

```tsx
      className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"
```

- [ ] **Step 3: `PasteLinkField`'s `buttonClass`** (`app/components/ui.tsx:178-181`)

Before:

```tsx
  const buttonClass =
    variant === "primary"
      ? "min-h-11 w-full rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:pointer-events-none disabled:opacity-40"
      : "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 text-sm font-semibold text-gold transition active:scale-[0.97] active:bg-rule disabled:opacity-60";
```

After:

```tsx
  const buttonClass =
    variant === "primary"
      ? "min-h-11 w-full rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:pointer-events-none disabled:opacity-40"
      : "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 text-sm font-semibold text-gold transition active:scale-[0.97] active:bg-rule md:hover:bg-rule disabled:opacity-60";
```

- [ ] **Step 4: `RatingRow`'s bead button** (`app/components/ui.tsx:305`)

Before:

```tsx
            className="grid h-11 w-11 place-items-center rounded-sm transition active:scale-[0.97]"
```

After:

```tsx
            className="grid h-11 w-11 place-items-center rounded-sm transition active:scale-[0.97] md:hover:bg-ground-deep"
```

- [ ] **Step 5: `ConfirmBox`'s cancel/confirm buttons** (`app/components/ui.tsx:431` and `:439`)

Before:

```tsx
          className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-50"
```

After:

```tsx
          className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-ground-deep disabled:opacity-50"
```

Before:

```tsx
          className="min-h-11 flex-1 rounded-sm bg-coral-deep px-4 text-sm font-semibold text-ground transition active:scale-[0.97] disabled:opacity-50"
```

After:

```tsx
          className="min-h-11 flex-1 rounded-sm bg-coral-deep px-4 text-sm font-semibold text-ground transition active:scale-[0.97] md:hover:opacity-90 disabled:opacity-50"
```

(`opacity-90` rather than a token swap — `coral-deep` has no existing "deeper"
token to hover into, and CLAUDE.md's coral rule permits opacity dimming since it
doesn't introduce a new color.)

- [ ] **Step 6: Verify**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/components/ui.tsx
git commit -m "feat(a11y): add desktop hover states to ui.tsx primitives"
```

---

### Task 6: Hover states — places components

**Files:**
- Modify: `app/components/places/PlaceCard.tsx`
- Modify: `app/components/places/ViewToggle.tsx`
- Modify: `app/components/places/RatingEditor.tsx`
- Modify: `app/components/places/PinlessPlacesSheet.tsx`
- Modify: `app/components/places/LookupCombobox.tsx`
- Modify: `app/components/places/PlacesMap.tsx`
- Modify: `app/components/places/PlaceForm.tsx`

**Interfaces:** No new interfaces — className-only changes.

- [ ] **Step 1: `PlaceCard.tsx:40`** — list row

Before: `className="flex min-h-11 items-center gap-3 border-t border-rule px-4 py-3 transition-colors active:bg-ground-deep"`

After: `className="flex min-h-11 items-center gap-3 border-t border-rule px-4 py-3 transition-colors active:bg-ground-deep md:hover:bg-ground-deep"`

- [ ] **Step 2: `ViewToggle.tsx:9`** — segmented control base class

Before: `"flex min-h-11 flex-1 items-center justify-center rounded-sm px-4 text-sm font-semibold transition active:scale-[0.97]"`

After: `"flex min-h-11 flex-1 items-center justify-center rounded-sm px-4 text-sm font-semibold transition active:scale-[0.97] md:hover:bg-raised"`

(Applies to both segments regardless of active state — the active segment is
already `bg-gold-deep`, and `bg-raised` reads as a visible-but-subtle lift on
top of gold too since it's a translucent-adjacent surface token, not an opacity
trick that would fight the active fill. If in practice this looks wrong on the
active segment during the manual pass in Task 8, scope the hover class to the
inactive branch only instead — this is a call the live browser pass is
positioned to make, not a fabricated certainty at plan time.)

- [ ] **Step 3: `RatingEditor.tsx:43`** — submit-style button, same pattern as `AddPlaceButton`

Before: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"`

After: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"`

- [ ] **Step 4: `PinlessPlacesSheet.tsx` — three interactive elements**

Line 146, before: `className="min-h-11 shrink-0 rounded-sm bg-gold px-3.5 text-sm font-semibold text-ground transition active:scale-[0.97] disabled:opacity-60"`
After: `className="min-h-11 shrink-0 rounded-sm bg-gold px-3.5 text-sm font-semibold text-ground transition active:scale-[0.97] md:hover:bg-gold-deep disabled:opacity-60"`

Line 162, before: `className="min-h-11 shrink-0 rounded-sm border border-rule px-3 text-sm font-semibold text-cream transition active:scale-[0.97]"`
After: `className="min-h-11 shrink-0 rounded-sm border border-rule px-3 text-sm font-semibold text-cream transition active:scale-[0.97] md:hover:bg-ground-deep"`

Line 181, before: `className="min-h-11 w-full border-t border-rule py-2.5 text-left transition-colors active:bg-ground-deep disabled:opacity-60"`
After: `className="min-h-11 w-full border-t border-rule py-2.5 text-left transition-colors active:bg-ground-deep md:hover:bg-ground-deep disabled:opacity-60"`

- [ ] **Step 5: `LookupCombobox.tsx:214`** — listbox option row

Before:

```tsx
                  i === activeIndex ? "bg-ground-deep" : "active:bg-ground-deep"
```

After:

```tsx
                  i === activeIndex ? "bg-ground-deep" : "active:bg-ground-deep md:hover:bg-ground-deep"
```

- [ ] **Step 6: `PlacesMap.tsx` — two interactive elements**

Line 402, before: `className="absolute right-3 top-3 z-10 grid min-h-11 min-w-11 place-items-center rounded-sm border border-rule bg-raised text-cream transition active:scale-[0.97] disabled:opacity-60"`
After: `className="absolute right-3 top-3 z-10 grid min-h-11 min-w-11 place-items-center rounded-sm border border-rule bg-raised text-cream transition active:scale-[0.97] md:hover:bg-ground-deep disabled:opacity-60"`

Line 442, before: `className="absolute inset-x-0 bottom-0 z-10 min-h-11 w-full bg-ground-deep/90 px-4 py-2.5 text-left text-sm text-cream transition active:bg-ground-deep"`
After: `className="absolute inset-x-0 bottom-0 z-10 min-h-11 w-full bg-ground-deep/90 px-4 py-2.5 text-left text-sm text-cream transition active:bg-ground-deep md:hover:bg-ground-deep"`

- [ ] **Step 7: `PlaceForm.tsx` — four interactive elements**

Line 277, before: `className="min-h-11 flex-1 rounded-sm border border-rule px-5 py-3 text-[0.95rem] font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep"`
After: `className="min-h-11 flex-1 rounded-sm border border-rule px-5 py-3 text-[0.95rem] font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-ground-deep"`

Line 285, before: `className="min-h-11 flex-1 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:pointer-events-none disabled:opacity-40"`
After: `className="min-h-11 flex-1 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:pointer-events-none disabled:opacity-40"`

Line 307, before: `className="min-h-11 shrink-0 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:scale-[0.97] active:opacity-70"`
After: `className="min-h-11 shrink-0 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:scale-[0.97] active:opacity-70 md:hover:opacity-70"`

Line 332, before: `className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 text-sm font-semibold text-gold transition active:scale-[0.97] active:bg-rule"`
After: `className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 text-sm font-semibold text-gold transition active:scale-[0.97] active:bg-rule md:hover:bg-rule"`

- [ ] **Step 8: Verify**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add app/components/places/PlaceCard.tsx app/components/places/ViewToggle.tsx app/components/places/RatingEditor.tsx app/components/places/PinlessPlacesSheet.tsx app/components/places/LookupCombobox.tsx app/components/places/PlacesMap.tsx app/components/places/PlaceForm.tsx
git commit -m "feat(a11y): add desktop hover states to places components"
```

---

### Task 7: Hover states — categories, settings, visits, and page-level controls

**Files:**
- Modify: `app/components/visits/VisitCard.tsx`
- Modify: `app/components/visits/VisitForm.tsx`
- Modify: `app/components/categories/CategoryForm.tsx`
- Modify: `app/components/categories/WeightsEditor.tsx`
- Modify: `app/components/settings/CriteriaEditor.tsx`
- Modify: `app/components/settings/BackupPanel.tsx`
- Modify: `app/components/settings/MapCachePanel.tsx`
- Modify: `app/categories/page.tsx`
- Modify: `app/categories/[id]/page.tsx`
- Modify: `app/journal/page.tsx`
- Modify: `app/places/[id]/page.tsx`
- Modify: `app/settings/page.tsx`

**Interfaces:** No new interfaces — className-only changes.

- [ ] **Step 1: `VisitCard.tsx:23`**

Before: `className="flex min-h-11 flex-col justify-center gap-0.5 border-t border-rule px-4 py-3 transition-colors active:bg-ground-deep"`
After: `className="flex min-h-11 flex-col justify-center gap-0.5 border-t border-rule px-4 py-3 transition-colors active:bg-ground-deep md:hover:bg-ground-deep"`

- [ ] **Step 2: `VisitForm.tsx` — two elements**

Line 101, before: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-40"`
After: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:opacity-40"`

Line 151-154, before:
```tsx
                        className={`min-h-11 rounded-sm px-3 py-2 text-left text-[0.95rem] transition active:scale-[0.97] ${
                          ...
                            : "text-cream active:bg-ground-deep"
```
After (only the non-selected branch gains hover):
```tsx
                        className={`min-h-11 rounded-sm px-3 py-2 text-left text-[0.95rem] transition active:scale-[0.97] ${
                          ...
                            : "text-cream active:bg-ground-deep md:hover:bg-ground-deep"
```
(Keep the selected branch's existing string as-is — only replace the
non-selected `"text-cream active:bg-ground-deep"` literal.)

- [ ] **Step 3: `CategoryForm.tsx` — two elements**

Line 112, before: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"`
After: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:opacity-50"`

Line 155, before: `className="min-h-11 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:scale-[0.97] active:opacity-70"`
After: `className="min-h-11 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:scale-[0.97] active:opacity-70 md:hover:opacity-70"`

- [ ] **Step 4: `WeightsEditor.tsx` — three elements**

Line 69, before: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"`
After: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:opacity-50"`

Lines 99 and 111 (identical string, both stepper buttons), before: `className="grid h-11 w-11 place-items-center rounded-sm text-lg font-semibold text-gold transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-30"`
After: `className="grid h-11 w-11 place-items-center rounded-sm text-lg font-semibold text-gold transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-ground-deep disabled:opacity-30"`

- [ ] **Step 5: `CriteriaEditor.tsx` — four elements**

Lines 162 and 171 (identical string, reorder buttons), before: `className="grid h-11 w-11 place-items-center rounded-sm text-sage transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-25"`
After: `className="grid h-11 w-11 place-items-center rounded-sm text-sage transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-ground-deep disabled:opacity-25"`

Line 192, before: `className="min-h-11 w-full truncate rounded-sm px-3 py-2 text-left text-base text-cream transition active:bg-ground-deep"`
After: `className="min-h-11 w-full truncate rounded-sm px-3 py-2 text-left text-base text-cream transition active:bg-ground-deep md:hover:bg-ground-deep"`

Line 204, before: `className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-sage transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-40"`
After: `className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-sage transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-ground-deep disabled:opacity-40"`

Line 274, before: `className="min-h-11 shrink-0 rounded-sm bg-gold px-4 text-sm font-semibold text-ground transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"`
After: `className="min-h-11 shrink-0 rounded-sm bg-gold px-4 text-sm font-semibold text-ground transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:opacity-50"`

- [ ] **Step 6: `BackupPanel.tsx` — two elements**

Line 111, before: `className="min-h-11 flex-1 rounded-sm bg-gold px-4 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"`
After: `className="min-h-11 flex-1 rounded-sm bg-gold px-4 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:opacity-50"`

Line 119, before: `className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-50"`
After: `className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-ground-deep disabled:opacity-50"`

- [ ] **Step 7: `MapCachePanel.tsx:101`**

Before: `className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-sm border border-rule bg-ground-deep px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition active:scale-[0.97] disabled:opacity-50"`
After: `className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-sm border border-rule bg-ground-deep px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition active:scale-[0.97] md:hover:bg-ground-deep disabled:opacity-50"`

Note this button starts on `bg-ground-deep` — its hover target should be one
step lighter for contrast; use `md:hover:bg-raised` instead:
`className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-sm border border-rule bg-ground-deep px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition active:scale-[0.97] md:hover:bg-raised disabled:opacity-50"`

- [ ] **Step 8: `app/categories/page.tsx` — three elements**

Line 49, before: `className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-gold px-4 py-2 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"`
After: `className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-gold px-4 py-2 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"`

Line 66, before: `className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"`
After: `className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"`

Line 110, before: `className="flex min-h-11 w-full items-center gap-3 py-3 text-left transition active:bg-ground-deep"`
After: `className="flex min-h-11 w-full items-center gap-3 py-3 text-left transition active:bg-ground-deep md:hover:bg-ground-deep"`

- [ ] **Step 9: `app/categories/[id]/page.tsx` — three elements**

Line 25 (shared class constant), before: `"inline-flex min-h-11 items-center gap-1 rounded-sm border border-rule bg-ground-deep px-3.5 py-2 text-sm font-semibold text-gold transition active:scale-[0.97] active:bg-rule"`
After: `"inline-flex min-h-11 items-center gap-1 rounded-sm border border-rule bg-ground-deep px-3.5 py-2 text-sm font-semibold text-gold transition active:scale-[0.97] active:bg-rule md:hover:bg-rule"`

Line 98, before: `className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"`
After: `className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"`

Line 207, before: `className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep"`
After: `className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep md:hover:bg-ground-deep"`

Line 286, before: `className="flex min-h-11 select-none items-center gap-3 px-4 py-3.5 transition [-webkit-touch-callout:none] active:bg-ground-deep"`
After: `className="flex min-h-11 select-none items-center gap-3 px-4 py-3.5 transition [-webkit-touch-callout:none] active:bg-ground-deep md:hover:bg-ground-deep"`

Line 261 (the tab underline, non-active branch), before:
```tsx
        active ? "border-gold text-gold" : "border-transparent text-sage active:text-cream"
```
After:
```tsx
        active ? "border-gold text-gold" : "border-transparent text-sage active:text-cream md:hover:text-cream"
```

- [ ] **Step 10: `app/journal/page.tsx:67`**

Before: `className={`inline-flex items-center gap-1.5 rounded-sm bg-gold font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep ${className}`}`
After: `className={`inline-flex items-center gap-1.5 rounded-sm bg-gold font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep ${className}`}`

- [ ] **Step 11: `app/places/[id]/page.tsx` — six elements**

Line 36 (shared class constant), before: `"inline-flex min-h-11 items-center gap-1 rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2 text-sm font-semibold text-sage transition active:scale-[0.97] active:bg-ground-deep"`
After: `"inline-flex min-h-11 items-center gap-1 rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2 text-sm font-semibold text-sage transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-raised"`

Line 39 (shared class constant), before: `"inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-gold px-4 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"`
After: `"inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-gold px-4 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"`

Line 106, before: `className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"`
After: `className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"`

Line 170, before: `className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-cream transition active:scale-[0.97] active:bg-raised disabled:opacity-60"`
After: `className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-cream transition active:scale-[0.97] active:bg-raised md:hover:bg-raised disabled:opacity-60"`

Line 184, before: `className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gold active:opacity-70"`
After: `className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gold active:opacity-70 md:hover:opacity-70"`

Line 412, before: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"`
After: `className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:opacity-50"`

Line 497, before: `className="min-h-11 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:scale-[0.97] active:opacity-70"`
After: `className="min-h-11 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:scale-[0.97] active:opacity-70 md:hover:opacity-70"`

- [ ] **Step 12: `app/settings/page.tsx:140`**

Before: `className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"`
After: `className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep disabled:opacity-50"`

- [ ] **Step 13: Verify**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 14: Commit**

```bash
git add app/components/visits app/components/categories app/components/settings app/categories app/journal/page.tsx "app/places/[id]/page.tsx" app/settings/page.tsx
git commit -m "feat(a11y): add desktop hover states to categories/settings/visits/journal/place-detail"
```

---

### Task 8: Live browser verification — keyboard traversal and the Phase 4 lesson

**Files:** none (verification-only task; may produce follow-up fix commits in
the files touched by Tasks 1–7 if this pass finds a defect).

**Context:** CLAUDE.md and this repo's own memory record that Phase 4 shipped
four defects invisible to static review and only found in a real browser —
"budget a live browser pass at the end of any phase that touches navigation,
history, or focus." This phase touches navigation (the nav rail is a second,
parallel navigation surface to `BottomNav`) and focus (new hover/keyboard
affordances), so the same discipline applies here.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (port 3001 per this repo's convention).

- [ ] **Step 2: Resize to ≥768px and walk all 7 routes**

Using the Playwright browser tool (`mcp__plugin_playwright_playwright__browser_navigate` /
`browser_resize` to ≥768px wide / `browser_snapshot`), visit `/`, `/categories`,
`/categories/[id]` (any seeded list), `/journal`, `/places/[id]` (any seeded
place), `/settings`, `/import`. For each: confirm the rail renders, the bottom
bar does not, content sits in the centered ~720px column, and nothing overlaps
the rail (headers, sticky filter rows, sheets).

- [ ] **Step 3: Keyboard-only traversal of each route**

Using `browser_press_key` with `Tab`/`Shift+Tab`/`Enter`/`Escape` (no mouse),
confirm: every rail tab, the rail's "Add a place" button, and every on-page
interactive control (search input, filter chips, list rows, form fields,
buttons) is reachable in a sensible order, shows the existing gold
`:focus-visible` ring (`app/globals.css:80-83`), and `Enter`/`Space` activates
it. Confirm opening a sheet (e.g. "Add a place") traps focus and `Escape`
closes it — this is existing `useModalA11y` behavior this phase must not
regress, not new behavior to build.

- [ ] **Step 4: Confirm `prefers-reduced-motion` still suppresses the sheet's slide/pop animation at `md`**

No animation changes were made in this phase, but Task 3 touches the same
`<main>`/layout wrapper `Sheet` renders inside — confirm via
`browser_evaluate` (checking the computed `transition` on the sheet panel with
`(prefers-reduced-motion: reduce)` emulated) that nothing regressed.

- [ ] **Step 5: Fix any defect found, then re-run the full verification suite**

If Step 2–4 surface an issue (e.g. the `ViewToggle` hover treatment from Task 6
Step 2 reading wrong on the active segment, a focus-order surprise from the
new rail being before or after main content in the DOM), fix it in the
relevant file from Tasks 1–7, then run:

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit any fixes** (skip this step if Steps 2–4 found nothing)

```bash
git add <fixed files>
git commit -m "fix(desktop): address live-browser findings from the Phase 5 pass"
```

---

### Task 9: Record the Phase 5 decisions in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add a Conventions bullet documenting the rail + hover convention**

In `CLAUDE.md`'s `## Conventions` section, add (placing it near the other
layout/overlay bullets, e.g. after the MapLibre-importer bullet):

```markdown
- **Desktop (≥`md`) gets a left nav rail, not a wider phone layout.** `BottomNav`
  (`md:hidden`) and `NavRail` (`hidden md:flex`, `app/components/nav/NavRail.tsx`)
  share one tab list (`app/components/nav/tabs.tsx`) so the two surfaces can't
  list a different set of tabs. Content is offset past the rail
  (`md:ml-60`) and constrained to a ~720px reading column (`md:max-w-[45rem]`)
  rather than stretching phone-width chrome across a wide window — set once on
  `<main>` in `app/layout.tsx`, not per-route. Sheets stay centered modals at
  ≥`sm`, unchanged by the rail.
- **Hover states are `md:hover:`, never bare `hover:`.** Gated to `md` so a
  touch tap (which fires `:hover` on many mobile browsers with no way to un-hover)
  never gets stuck showing a hover treatment meant for a mouse. Each control's
  hover class reuses the same token its existing `active:` press state already
  uses — a new hover treatment must never introduce a color absent from the
  `active:` variant beside it.
```

- [ ] **Step 2: Update the test count if it has drifted**

Run: `npm test` and read the reported "Tests" total. If it differs from the
count currently written in `CLAUDE.md`'s workflow-rules bullet ("308 tests in
17 files today"), update that line to match.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record Phase 5 desktop nav-rail and hover conventions"
```

---

## Verification

Matches the spec's own Phase 5 checklist (design spec, "Verification" section,
scoped to this phase):

1. `npm test`, `npm run build`, `npm run lint` green after every task.
2. Manual pass over all 7 routes at both `<sm` (confirm nothing regressed —
   `BottomNav` still renders, rail is absent) and `≥md` (Task 8).
3. Keyboard-only traversal of each route at `≥md` (Task 8, Step 3).
4. No raw-hex/off-token color introduced — `lib/theme-contract.test.ts` (part
   of `npm test`) is the automated gate for this.
