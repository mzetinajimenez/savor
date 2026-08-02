# Supper Club Phase 4 — Native Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make savor's overlays feel native on a phone — bottom sheets drag to dismiss, the hardware/gesture Back button closes a sheet instead of leaving the page, tap feedback is uniform, overscroll is contained — and fold in the issue #9 accessibility bundle while the sheet code is already open.

**Architecture:** Two new framework-free modules carry the logic and the tests (`lib/sheetDrag.ts` — pure drag math; `lib/sheetParam.ts` — pure query-string helpers), each with a thin React wrapper (`Sheet.tsx`'s pointer handlers; `lib/useSheetParam.ts`). Sheet open/closed state moves from `useState` in each page to the `?sheet=<name>` search param, so Next's own popstate handling closes sheets on Back with no listener of our own. A new shared `ConfirmBox` in `app/components/ui.tsx` replaces four hand-rolled inline confirm blocks and gives them `role="alertdialog"` + focus move in one place.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind v4 with the Supper Club `@theme` tokens, Vitest (+ fake-indexeddb) for `lib/`. No new dependencies.

## Global Constraints

Copied from `CLAUDE.md` and `docs/superpowers/specs/2026-07-27-design-system-supper-club-design.md`. Every task's requirements implicitly include this section.

- **No new npm dependencies.** Ask the user before adding one. Phase 4 needs none.
- **Green before every commit:** `npm test`, `npm run build`, `npm run lint` all pass.
- **Direct to the working branch** (`phase-4-native-feel`), conventional-commit messages, staging explicit paths — never `git add -A`.
- **Supper Club tokens only** — no raw hex, no off-palette Tailwind colours in `app/`. `lib/theme-contract.test.ts` fails the build otherwise.
- **Gold is yes, coral is careful.** Coral is destructive/error and nothing else.
- **Rounding:** `0` default; `rounded-sm` for inputs/chips/sheets/buttons; `rounded-full` only for the score seal and small circular indicators.
- **Contrast is a property of the pair:** on `bg-raised` (the Sheet body) secondary text must be `cream` or `cream/80`, never `sage` and never `cream/60`.
- **≥44px touch targets**, `text-base` on text inputs (stops iOS focus-zoom), safe-area insets on fixed chrome.
- **Read through hooks, write through repo.** No component imports Dexie or `@/lib/db`.
- **Overlays use `Sheet` + `useModalA11y`; sheets mount/unmount rather than toggling an `open` prop.** This plan preserves that invariant — URL-derived state produces exactly that shape.
- **`lib/` stays framework-free where it holds logic.** New pure logic (`sheetDrag`, `sheetParam`) gets a Vitest suite alongside it; React hooks in `lib/` (`useSheetParam`) hold no logic worth testing beyond the pure helpers they call.
- **Sheets are not routes and will not become routes.** No entity id ever goes in the query string — the owning route already carries it in the path.
- **Never call a captured reference to `window.history.pushState`.** Always call the patched global, and never before mount. See Task 3's background note — an entry without Next's `__NA` marker triggers a full page reload on Back.
- **`navigator.vibrate()` is Android-only** and every call stays feature-guarded. Nothing in Phase 4 adds a new call.

## File Structure

**Created:**
- `lib/sheetDrag.ts` — pure drag-to-dismiss math: offset clamping, velocity, dismiss-vs-spring-back decision. No DOM, no React.
- `lib/sheetDrag.test.ts` — Vitest suite for the above.
- `lib/sheetParam.ts` — pure query-string helpers: add/remove the `sheet` key, preserving every other param and its order.
- `lib/sheetParam.test.ts` — Vitest suite for the above.
- `lib/useSheetParam.ts` — React hook: reads `?sheet=` via `useSearchParams`, opens with the patched global `pushState`, closes with `history.back()`; plus `useStripSheetParamOnLoad()` for the cold-load strip.

**Modified:**
- `app/components/Sheet.tsx` — pointer-tracked drag on the header region (`<sm` only), `useId` for the title id, `overscroll-contain` on the scroll body.
- `app/components/ui.tsx` — new exported `ConfirmBox`.
- `app/components/settings/BackupPanel.tsx`, `app/components/categories/CategoryForm.tsx`, `app/components/settings/CriteriaEditor.tsx`, `app/places/[id]/page.tsx` — four inline confirm blocks replaced by `ConfirmBox`.
- `app/places/[id]/page.tsx`, `app/categories/page.tsx`, `app/categories/[id]/page.tsx`, `app/journal/page.tsx`, `app/components/places/PlaceForm.tsx`, `app/layout.tsx` — sheet state moves to `?sheet=`.
- `app/globals.css` — `overscroll-behavior` on the document.
- `CLAUDE.md` — record the `?sheet=` convention and the new modules.

**Sheet names (the complete `?sheet=` vocabulary — no ids, ever):**

| Route | Param | Sheet |
| --- | --- | --- |
| `/places/[id]` | `?sheet=edit` | edit place |
| `/places/[id]` | `?sheet=ratings` | RatingEditor |
| `/places/[id]` | `?sheet=visit` | VisitForm (fixed place) |
| `/places/[id]` | `?sheet=score` | ScoreBreakdown (which category is local state — see Task 5) |
| `/categories` | `?sheet=add` | CategoryForm, create mode |
| `/categories/[id]` | `?sheet=edit` | CategoryForm, edit mode |
| `/categories/[id]` | `?sheet=weights` | WeightsEditor |
| `/journal` | `?sheet=visit` | VisitForm (standalone) |
| any route | `?sheet=add` | AddPlaceHost (the global FAB) — Task 7 |

`?sheet=add` is deliberately reused: `/categories` owns it for the list form and every other route leaves it to the global add-place host. Task 7 covers why that cannot collide.

---

### Task 1: Pure drag-to-dismiss math

`lib/sheetDrag.ts` holds every number the gesture depends on, so the thresholds are testable without a browser and the React code in Task 2 is pure plumbing.

**Files:**
- Create: `lib/sheetDrag.ts`
- Test: `lib/sheetDrag.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DISMISS_FRACTION = 0.25`, `DISMISS_VELOCITY = 0.5`
  - `dragOffset(startY: number, currentY: number): number`
  - `dragVelocity(deltaY: number, deltaMs: number): number`
  - `shouldDismiss(input: { offset: number; height: number; velocity: number }): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/sheetDrag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DISMISS_FRACTION,
  DISMISS_VELOCITY,
  dragOffset,
  dragVelocity,
  shouldDismiss,
} from "./sheetDrag";

describe("dragOffset", () => {
  it("tracks downward movement one-for-one", () => {
    expect(dragOffset(100, 180)).toBe(80);
  });

  it("floors at 0 — a sheet never drags up past its resting edge", () => {
    expect(dragOffset(100, 40)).toBe(0);
    expect(dragOffset(100, 100)).toBe(0);
  });
});

describe("dragVelocity", () => {
  it("is pixels per millisecond", () => {
    expect(dragVelocity(60, 100)).toBeCloseTo(0.6);
  });

  it("is 0 when no time has passed, rather than Infinity", () => {
    expect(dragVelocity(60, 0)).toBe(0);
    expect(dragVelocity(60, -5)).toBe(0);
  });
});

describe("shouldDismiss", () => {
  it("dismisses past the distance threshold", () => {
    expect(shouldDismiss({ offset: 201, height: 800, velocity: 0 })).toBe(true);
  });

  it("springs back just under the distance threshold", () => {
    expect(shouldDismiss({ offset: 199, height: 800, velocity: 0 })).toBe(false);
  });

  it("dismisses on a fast flick even when barely moved", () => {
    expect(shouldDismiss({ offset: 20, height: 800, velocity: 0.9 })).toBe(true);
  });

  it("springs back on a slow short drag", () => {
    expect(shouldDismiss({ offset: 20, height: 800, velocity: 0.1 })).toBe(false);
  });

  it("never dismisses on a zero-height measurement", () => {
    expect(shouldDismiss({ offset: 0, height: 0, velocity: 0 })).toBe(false);
  });

  it("exposes the thresholds the spec pins", () => {
    expect(DISMISS_FRACTION).toBe(0.25);
    expect(DISMISS_VELOCITY).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/sheetDrag.test.ts`
Expected: FAIL — "Failed to resolve import ./sheetDrag".

- [ ] **Step 3: Write the implementation**

Create `lib/sheetDrag.ts`:

```ts
// Pure drag-to-dismiss math for the bottom sheet (app/components/Sheet.tsx).
//
// Framework-free on purpose: the thresholds are the whole design decision here, and they
// should be verifiable without a browser or a pointer. Sheet.tsx owns the pointer events
// and the transform; this file owns every number.

/** Dismiss once the sheet has been dragged past this fraction of its own height. */
export const DISMISS_FRACTION = 0.25;

/** …or flicked faster than this, in px/ms, however short the drag. */
export const DISMISS_VELOCITY = 0.5;

/**
 * How far the sheet should be translated for a pointer that started at `startY` and is
 * now at `currentY`. Floors at 0 — dragging up past the resting edge does nothing, so the
 * sheet never lifts off the bottom of the screen.
 */
export function dragOffset(startY: number, currentY: number): number {
  return Math.max(0, currentY - startY);
}

/** Pixels per millisecond. Returns 0 rather than Infinity when no time has elapsed. */
export function dragVelocity(deltaY: number, deltaMs: number): number {
  if (deltaMs <= 0) return 0;
  return deltaY / deltaMs;
}

/** Distance OR velocity is enough — a short fast flick dismisses, a long slow drag dismisses. */
export function shouldDismiss({
  offset,
  height,
  velocity,
}: {
  offset: number;
  height: number;
  velocity: number;
}): boolean {
  if (height <= 0) return false;
  return offset > height * DISMISS_FRACTION || velocity > DISMISS_VELOCITY;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/sheetDrag.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/sheetDrag.ts lib/sheetDrag.test.ts
git commit -m "feat(sheet): pure drag-to-dismiss math (offset, velocity, thresholds)"
```

---

### Task 2: Wire drag-to-dismiss into Sheet

The gesture is scoped to the **header region only** (grab handle + title row), not the scrollable body. This is deliberate: the spec flags pointer-tracking-vs-scrolling as the riskiest part of Phase 4, and a header-only grab makes the conflict impossible rather than arbitrated. The grab handle is already the affordance that says "drag me", and it is already hidden at `sm` and up — exactly where drag-to-dismiss must not apply.

**Files:**
- Modify: `app/components/Sheet.tsx`

**Interfaces:**
- Consumes: `dragOffset`, `dragVelocity`, `shouldDismiss` from `lib/sheetDrag.ts` (Task 1).
- Produces: no API change — `Sheet`'s props stay `{ title, onClose, children, footer }`.

- [ ] **Step 1: Add the drag state and handlers**

In `app/components/Sheet.tsx`, replace the import line and the component body's opening (currently `import { useRef, type ReactNode } from "react";` and `const panelRef = useRef<HTMLDivElement>(null);`) with:

```tsx
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { dragOffset, dragVelocity, shouldDismiss } from "@/lib/sheetDrag";
import { useModalA11y } from "@/lib/useModalA11y";
```

and inside the component, above `useModalA11y(panelRef, onClose)`:

```tsx
  const panelRef = useRef<HTMLDivElement>(null);

  // Drag-to-dismiss — bottom-sheet form only. Below `sm` the panel is edge-anchored with a
  // grab handle; from `sm` up it is a centred modal, where dragging down means nothing. The
  // gesture is scoped to the header (handle + title row) so it can never fight the body's
  // own scrolling. Suppressed under prefers-reduced-motion, which is a motion preference and
  // an inner-ear one — a sheet that tracks the finger is exactly the motion it asks us to drop.
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const dragEnabled = useCallback(() => {
    if (typeof window === "undefined") return false;
    // 40rem is Tailwind's `sm`, where Sheet flips to the centred modal form.
    if (window.matchMedia("(min-width: 40rem)").matches) return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" || !dragEnabled()) return;
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    state.velocity = dragVelocity(e.clientY - state.lastY, e.timeStamp - state.lastT);
    state.lastY = e.clientY;
    state.lastT = e.timeStamp;
    setOffset(dragOffset(state.startY, e.clientY));
  }

  function handlePointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setDragging(false);
    const height = panelRef.current?.offsetHeight ?? 0;
    const finalOffset = dragOffset(state.startY, e.clientY);
    if (shouldDismiss({ offset: finalOffset, height, velocity: state.velocity })) {
      onClose();
      return;
    }
    setOffset(0); // spring back — the transition below animates it
  }
```

- [ ] **Step 2: Apply the transform and attach the handlers**

Change the panel `<div>` (the one with `ref={panelRef}`) so its `style` carries the transform and the header block carries the handlers. The panel element becomes:

```tsx
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          // No transition while the finger is down — the sheet must track it exactly.
          transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="anim-sheet flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-sm bg-raised shadow-2xl ring-1 ring-rule/60 outline-none sm:anim-pop sm:rounded-sm"
      >
        <div
          className="relative shrink-0 touch-none px-5 pt-3"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
```

(`aria-labelledby={titleId}` lands in Task 9; until then leave it as `"sheet-title"`. If Task 9 has already run, keep `titleId`.)

`touch-none` on the header stops the browser from claiming the vertical gesture as a scroll before our handlers see it. It is applied to the header only, so the body still scrolls normally.

- [ ] **Step 3: Add `overscroll-contain` to the scroll body**

Change the body div in the same file from:

```tsx
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
```

to:

```tsx
        {/* overscroll-contain: a flick past the end of the sheet's content must not chain to
            the page behind it, and on Android must not trigger pull-to-refresh. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
```

- [ ] **Step 4: Verify the build and lint pass**

Run: `npm run lint && npm run build`
Expected: both succeed, no new warnings.

- [ ] **Step 5: Verify the gesture in a browser**

Run `npm run dev -- -p 3001`, open `http://localhost:3001`, tap the FAB to open the add-place sheet with a mobile viewport (≤640px wide, touch emulation on), and confirm all four:

1. Dragging the grab handle down moves the sheet with the finger; releasing after a short drag springs it back.
2. Dragging past roughly a quarter of the sheet's height closes it.
3. A short fast flick down closes it.
4. Scrolling inside the sheet body still scrolls the body and never moves the sheet.

Then widen the viewport past 640px and confirm the centred modal does **not** drag.

- [ ] **Step 6: Commit**

```bash
git add app/components/Sheet.tsx
git commit -m "feat(sheet): drag-to-dismiss on the bottom-sheet form"
```

---

### Task 3: Pure `?sheet=` query-string helpers

**Files:**
- Create: `lib/sheetParam.ts`
- Test: `lib/sheetParam.test.ts`

**Background — why the helpers are pure and the hook is thin.** Next 16 patches `window.history.pushState` (`node_modules/next/dist/client/components/app-router.js:252`). Calling the patched global copies Next's internal markers onto the new entry and dispatches `ACTION_RESTORE`, so `useSearchParams()` reflects the change with no RSC fetch and no navigation; Next's own popstate handler (`:284`) then covers Back and Forward. That handler reads:

```js
if (!event.state) return;                         // silently does nothing
if (!event.state.__NA) window.location.reload();   // full page reload
```

So an entry without Next's `__NA` marker causes a **full page reload** on Back. The marker is stamped by the patch. Hence the rules: always call the patched global `window.history.pushState`, never a captured reference to the original, and never before mount. The string manipulation is the only part worth unit-testing; Task 4's hook does nothing but call the global.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SHEET_PARAM = "sheet"`
  - `withSheet(search: string, name: string): string` — returns a leading-`?` search string, or `""` when empty
  - `withoutSheet(search: string): string` — same return contract

- [ ] **Step 1: Write the failing test**

Create `lib/sheetParam.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHEET_PARAM, withSheet, withoutSheet } from "./sheetParam";

describe("withSheet", () => {
  it("adds the param to an empty search", () => {
    expect(withSheet("", "edit")).toBe("?sheet=edit");
  });

  it("tolerates a bare ? as empty", () => {
    expect(withSheet("?", "edit")).toBe("?sheet=edit");
  });

  it("preserves the params already there", () => {
    expect(withSheet("?tab=want&city=Austin", "weights")).toBe(
      "?tab=want&city=Austin&sheet=weights"
    );
  });

  it("replaces an existing sheet rather than appending a second one", () => {
    expect(withSheet("?sheet=edit", "weights")).toBe("?sheet=weights");
  });

  it("round-trips a value that needs encoding", () => {
    const search = withSheet("?city=San%20Jos%C3%A9", "edit");
    expect(new URLSearchParams(search).get("city")).toBe("San José");
    expect(new URLSearchParams(search).get(SHEET_PARAM)).toBe("edit");
  });
});

describe("withoutSheet", () => {
  it("removes the param and keeps the rest", () => {
    expect(withoutSheet("?tab=want&sheet=edit")).toBe("?tab=want");
  });

  it("returns an empty string when nothing is left", () => {
    expect(withoutSheet("?sheet=edit")).toBe("");
  });

  it("is a no-op when there is no sheet param", () => {
    expect(withoutSheet("?tab=want")).toBe("?tab=want");
    expect(withoutSheet("")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/sheetParam.test.ts`
Expected: FAIL — "Failed to resolve import ./sheetParam".

- [ ] **Step 3: Write the implementation**

Create `lib/sheetParam.ts`:

```ts
// Query-string plumbing for URL-derived sheet state (`?sheet=<name>`).
//
// Sheets are NOT routes and will not become routes — this param exists so the Android back
// gesture and the browser Back button close the top sheet instead of leaving the page. No
// entity id ever goes in here: the owning route already carries it in the path
// (/places/[id]?sheet=edit). Framework-free so the string handling is unit-testable;
// lib/useSheetParam.ts is the React side.

export const SHEET_PARAM = "sheet";

/** Normalises URLSearchParams back to a leading-`?` string, or "" when it holds nothing. */
function serialize(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** `search` with `sheet=<name>` set, every other param preserved in order. */
export function withSheet(search: string, name: string): string {
  const params = new URLSearchParams(search);
  params.set(SHEET_PARAM, name);
  return serialize(params);
}

/** `search` with any `sheet` param removed. */
export function withoutSheet(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(SHEET_PARAM);
  return serialize(params);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/sheetParam.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/sheetParam.ts lib/sheetParam.test.ts
git commit -m "feat(sheet): pure ?sheet= query-string helpers"
```

---

### Task 4: The `useSheetParam` hook and the cold-load strip

**Files:**
- Create: `lib/useSheetParam.ts`
- Modify: `app/components/AppInit.tsx`

**Interfaces:**
- Consumes: `SHEET_PARAM`, `withSheet`, `withoutSheet` from `lib/sheetParam.ts` (Task 3).
- Produces:
  - `useSheetParam(name: string): { open: boolean; openSheet: () => void; closeSheet: () => void }`
  - `useStripSheetParamOnLoad(): void`

- [ ] **Step 1: Write the hook**

Create `lib/useSheetParam.ts`:

```ts
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SHEET_PARAM, withSheet, withoutSheet } from "./sheetParam";

/**
 * URL-derived sheet state. `open` is true iff `?sheet=<name>` is on the current URL, so the
 * Android back gesture / browser Back closes the sheet by removing the param — with no
 * popstate listener of our own. Next patches window.history.pushState and owns the popstate
 * path; see lib/sheetParam.ts's header for why the patched GLOBAL must be what we call.
 *
 * Closing goes through history.back() rather than another pushState, so the entry we pushed
 * is consumed and the history stack stays balanced however many times a sheet is opened.
 *
 * NOTE: the calling component must sit inside a <Suspense> boundary — useSearchParams()
 * makes the route dynamic and `next build` fails outright without one.
 */
export function useSheetParam(name: string) {
  const searchParams = useSearchParams();
  const open = searchParams.get(SHEET_PARAM) === name;

  function openSheet() {
    if (open) return;
    window.history.pushState(null, "", withSheet(window.location.search, name));
  }

  function closeSheet() {
    if (!open) return;
    window.history.back();
  }

  return { open, openSheet, closeSheet };
}

/**
 * `?sheet=` is ephemeral: it describes a gesture in progress, not a destination. A reload or
 * a shared link must never restore a half-filled form, so the param is stripped once on cold
 * load with replaceState (which leaves no entry to go back to).
 */
export function useStripSheetParamOnLoad() {
  useEffect(() => {
    const search = window.location.search;
    if (!new URLSearchParams(search).has(SHEET_PARAM)) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${withoutSheet(search)}${window.location.hash}`
    );
  }, []);
}
```

Note the `replaceState` call passes `window.history.state` through rather than `null`: Next's popstate handler reloads the page for any entry missing its `__NA` marker, and this is the entry the user is standing on.

- [ ] **Step 2: Call the strip once, at app init**

Read `app/components/AppInit.tsx` first. It renders `null` and runs `useDbInit()` exactly once — the right home for a second run-once effect. Add the import and the call:

```tsx
import { useStripSheetParamOnLoad } from "@/lib/useSheetParam";
```

and inside the component body, after the existing `useDbInit()` call:

```tsx
  // ?sheet= is ephemeral — never let a reload or a shared link restore an open sheet.
  useStripSheetParamOnLoad();
```

`useStripSheetParamOnLoad` touches only `window.history`, not `useSearchParams`, so `AppInit` needs no Suspense boundary.

- [ ] **Step 3: Verify build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed. No route should newly appear as dynamic in the build output yet — nothing calls `useSheetParam` until Task 5.

- [ ] **Step 4: Commit**

```bash
git add lib/useSheetParam.ts app/components/AppInit.tsx
git commit -m "feat(sheet): useSheetParam hook + ephemeral cold-load strip"
```

---

### Task 5: Place detail sheets move to `?sheet=`

Four sheets on one route, and the one interesting case: the score breakdown needs to know *which* category, and a category id must not go in the query. Resolution — the param carries presence (`?sheet=score`), local state carries which. Both are set together on tap; Back clears the param and the sheet unmounts, leaving a stale-but-unreachable id behind, which the render guard already ignores.

**Files:**
- Modify: `app/places/[id]/page.tsx`

**Interfaces:**
- Consumes: `useSheetParam` from `lib/useSheetParam.ts` (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Wrap the page in Suspense**

`useSearchParams()` requires a `<Suspense>` boundary or `next build` fails. Follow the split already used by `app/categories/[id]/page.tsx:26-35`. Rename the current default export to `PlaceDetailInner` (change `export default function PlaceDetailPage()` to `function PlaceDetailInner()`) and add above it:

```tsx
export default function PlaceDetailPage() {
  // useSheetParam() calls useSearchParams(), which makes this route dynamic and requires a
  // Suspense boundary around its caller or `next build` fails — same split as
  // app/categories/[id]/page.tsx and app/import/page.tsx.
  return (
    <Suspense fallback={null}>
      <PlaceDetailInner />
    </Suspense>
  );
}
```

Add `Suspense` to the React import on line 15:

```tsx
import { Suspense, useMemo, useState, type FormEvent } from "react";
```

- [ ] **Step 2: Replace the four `useState` flags with `useSheetParam`**

Replace lines 59-63 (`const [editOpen, ...]` through `const [breakdownCategoryId, ...]`) with:

```tsx
  const edit = useSheetParam("edit");
  const ratings = useSheetParam("ratings");
  const visit = useSheetParam("visit");
  const score = useSheetParam("score");
  const [statusPending, setStatusPending] = useState(false);
  // Which category the breakdown is for. Deliberately NOT in the query — the route already
  // owns an id (the place), and a second entity id in the URL is exactly what the sheet-param
  // convention rules out. `score.open` is the source of truth for whether it shows; this is
  // only the argument. When Back clears the param the sheet unmounts and this goes unread.
  const [breakdownCategoryId, setBreakdownCategoryId] = useState<string | null>(null);
```

and add the import next to the other `@/lib` imports:

```tsx
import { useSheetParam } from "@/lib/useSheetParam";
```

- [ ] **Step 3: Update every call site in the page**

Six call sites change:

| Line (before) | From | To |
| --- | --- | --- |
| 135 | `onClick={() => setEditOpen(true)}` | `onClick={edit.openSheet}` |
| 182 | `onClick={() => setBreakdownCategoryId(categoryId)}` | see below |
| 200 | `onClick={() => setRatingEditorOpen(true)}` | `onClick={ratings.openSheet}` |
| 250 | `onClick={() => setVisitFormOpen(true)}` | `onClick={visit.openSheet}` |
| 111 | `if (next === "been") setRatingEditorOpen(true);` | `if (next === "been") ratings.openSheet();` |

Line 182's chip sets both halves:

```tsx
                <Chip
                  key={categoryId}
                  onClick={() => {
                    setBreakdownCategoryId(categoryId);
                    score.openSheet();
                  }}
                >
```

- [ ] **Step 4: Update the four mounts**

Replace lines 284-306 with:

```tsx
      {edit.open ? (
        <PlaceEditSheet
          place={place}
          onClose={edit.closeSheet}
          onDeleted={() => router.push("/")}
        />
      ) : null}

      {ratings.open ? <RatingEditor place={place} onClose={ratings.closeSheet} /> : null}

      <VisitForm open={visit.open} onClose={visit.closeSheet} placeId={place.id} />

      {score.open && breakdownCategoryId && categories !== undefined && criteria !== undefined ? (
        <ScoreBreakdownSheet
          place={currentPlace}
          categoryId={breakdownCategoryId}
          categories={categories}
          criteria={criteria}
          onClose={score.closeSheet}
        />
      ) : null}
```

One subtlety worth keeping in mind while reading `PlaceEditSheet.handleDelete` (line 352): it calls `onDeleted()` (a `router.push("/")`) and then `onClose()`, which is now `history.back()`. Reorder those two so the history entry is consumed *before* the navigation:

```tsx
      await deletePlace(place.id);
      toast("Place deleted");
      onClose();
      onDeleted();
```

- [ ] **Step 5: Verify build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed. `/places/[id]` may now be reported as dynamic — that is expected and correct.

- [ ] **Step 6: Verify Back in a browser**

With `npm run dev -- -p 3001`, open a place's detail page and check each:

1. Tap **Edit** — URL becomes `…?sheet=edit`, sheet opens. Press Back — sheet closes, URL returns to the bare path, **and the page does not reload** (watch the Network tab: a document request means the `__NA` marker was lost; see Task 3's background note).
2. Tap **Edit**, then the sheet's ✕ — sheet closes and the URL is clean. Press Back once more — you leave the place detail page, not "close a phantom sheet". This is the balanced-stack check.
3. Tap a score chip — `?sheet=score`, breakdown opens for that category. Back closes it.
4. Open a sheet, then reload the page — the sheet does **not** come back and the URL is clean (the cold-load strip).
5. Open a sheet and press Escape — closes exactly as Back does, with focus restored to the control that opened it.

- [ ] **Step 7: Commit**

```bash
git add "app/places/[id]/page.tsx"
git commit -m "feat(places): place detail sheets close on Back via ?sheet="
```

---

### Task 6: Category sheets and the journal move to `?sheet=`

**Files:**
- Modify: `app/categories/[id]/page.tsx`
- Modify: `app/categories/page.tsx`
- Modify: `app/journal/page.tsx`

**Interfaces:**
- Consumes: `useSheetParam` from `lib/useSheetParam.ts` (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: `/categories/[id]` — swap the two flags**

This route is already split for Suspense (`app/categories/[id]/page.tsx:26-35`), so no wrapper work. Replace lines 46-47:

```tsx
  const edit = useSheetParam("edit");
  const weights = useSheetParam("weights");
```

Add the import alongside the other `@/lib` imports. Then update the four call sites:

- line 120: `onClick={() => setWeightsOpen(true)}` → `onClick={weights.openSheet}`
- line 123: `onClick={() => setEditOpen(true)}` → `onClick={edit.openSheet}`
- line 224: `{editOpen ? (` → `{edit.open ? (`
- line 228: `onClose={() => setEditOpen(false)}` → `onClose={edit.closeSheet}`
- line 236: `{weightsOpen ? <WeightsEditor category={category} onClose={() => setWeightsOpen(false)} /> : null}` → `{weights.open ? <WeightsEditor category={category} onClose={weights.closeSheet} /> : null}`

Check the delete path in this file the same way Task 5 did for places: if the category form's delete handler calls a `router.push("/categories")` and a close in sequence, the close (now `history.back()`) must come first.

- [ ] **Step 2: `/categories` — wrap in Suspense and swap the flag**

`app/categories/page.tsx` has no Suspense boundary today. Rename its default export to `CategoriesInner` and add:

```tsx
export default function CategoriesPage() {
  // useSheetParam() calls useSearchParams() — needs a Suspense boundary or `next build`
  // fails. Same split as app/categories/[id]/page.tsx.
  return (
    <Suspense fallback={null}>
      <CategoriesInner />
    </Suspense>
  );
}
```

Add `Suspense` to the React import. Then replace line 18's `const [formOpen, setFormOpen] = useState(false);` with `const form = useSheetParam("add");`, and update lines 37, 54 (`onClick={() => setFormOpen(true)}` → `onClick={form.openSheet}`), 74 (`{formOpen ? (` → `{form.open ? (`) and 78 (`onClose={() => setFormOpen(false)}` → `onClose={form.closeSheet}`).

`?sheet=add` on `/categories` means the list form. Task 7 makes the global add-place host ignore `/categories` for exactly this reason.

- [ ] **Step 3: `/journal` — wrap in Suspense and swap the flag**

Same shape. `app/journal/page.tsx:77`'s `const [formOpen, setFormOpen] = useState(false);` becomes `const form = useSheetParam("visit");`; lines 94 and 104's `onClick={() => setFormOpen(true)}` become `onClick={form.openSheet}`; line 131 becomes:

```tsx
      <VisitForm open={form.open} onClose={form.closeSheet} />
```

Wrap the page's default export in `<Suspense fallback={null}>` exactly as in Step 2 — check first whether the file already has a boundary, and if it does, reuse it rather than nesting a second one.

- [ ] **Step 4: Verify build and lint**

Run: `npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 5: Verify in a browser**

With `npm run dev -- -p 3001`, on each of `/categories`, `/categories/<id>` and `/journal`: open the sheet, confirm the URL gains `?sheet=…`, press Back, confirm the sheet closes with no page reload. On `/categories/<id>`, open the Weights sheet with `?tab=want&city=…` already in the URL and confirm Back restores the tab and city filter untouched.

- [ ] **Step 6: Commit**

```bash
git add app/categories/page.tsx "app/categories/[id]/page.tsx" app/journal/page.tsx
git commit -m "feat(sheets): categories + journal sheets close on Back via ?sheet="
```

---

### Task 7: The global add-place sheet moves to `?sheet=add`

The FAB's sheet is the one that is not owned by a route — `AddPlaceHost` is mounted once in `app/layout.tsx`. Two things need care: `useSearchParams()` in a root-layout client component must sit in its own Suspense boundary or it degrades every page's static shell, and `?sheet=add` is already spoken for on `/categories`.

**Files:**
- Modify: `app/components/places/PlaceForm.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `useSheetParam` from `lib/useSheetParam.ts` (Task 4); the existing `ADD_PLACE_EVENT` contract from `app/components/ui.tsx`, unchanged.
- Produces: `AddPlaceHost` keeps its current export shape and zero props.

- [ ] **Step 1: Make `AddPlaceHost` URL-driven**

The event contract stays exactly as documented in `PlaceForm.tsx:10-16` — many emitters, one listener — but the listener now pushes the param instead of setting a boolean. The prefill stays in local state: it is a payload, not a destination, and putting a shared URL in the query is precisely what the no-ids rule forbids.

Replace `AddPlaceHost` (lines 75-92) with:

```tsx
export function AddPlaceHost() {
  const pathname = usePathname();
  const { open, openSheet, closeSheet } = useSheetParam("add");
  const [prefill, setPrefill] = useState<PlacePrefill | undefined>(undefined);

  // /categories owns ?sheet=add for its own "new list" form. Both sheets are opened by an
  // explicit user action on the surface that owns them, so they can never be asked for at
  // once — but this host is mounted app-wide, so it has to decline the param there.
  const owned = pathname !== "/categories";

  useEffect(() => {
    function handleOpen(e: Event) {
      setPrefill((e as CustomEvent<PlacePrefill | undefined>).detail);
      openSheet();
    }
    window.addEventListener(ADD_PLACE_EVENT, handleOpen);
    return () => window.removeEventListener(ADD_PLACE_EVENT, handleOpen);
  });

  // Mounted only while open, so every fresh open gets a fresh AddPlaceSheet instance (and thus
  // fresh state) — no explicit "reset the form" step required on close.
  if (!open || !owned) return null;
  return <AddPlaceSheet onClose={closeSheet} initial={prefill} />;
}
```

Note the deliberately dependency-less `useEffect`: `openSheet` closes over the current search params, so a listener registered once at mount would go stale. Re-registering each render keeps it correct, and add/remove of one listener per render is not a cost worth optimising here. Add the imports:

```tsx
import { usePathname } from "next/navigation";
import { useSheetParam } from "@/lib/useSheetParam";
```

- [ ] **Step 2: Give the host its own Suspense boundary in the layout**

In `app/layout.tsx`, wrap the `<AddPlaceHost />` mount:

```tsx
        {/* Its own boundary: AddPlaceHost calls useSearchParams(), and an unbounded call in
            the root layout would push every page's static shell to client rendering. Scoped
            here, only this (null-rendering) host defers. */}
        <Suspense fallback={null}>
          <AddPlaceHost />
        </Suspense>
```

Add `Suspense` to the React import in that file.

- [ ] **Step 3: Verify the static shells survived**

Run: `npm run build`
Expected: succeeds. Read the route table it prints and confirm `/`, `/settings` and `/journal` are still whatever they were before this task (`○`/static or `ƒ`/dynamic per their own `useSearchParams` usage) — the point of the boundary is that Step 2 changes nothing outside it.

**If the build output shows the whole app flipped to dynamic**, stop and reconsider rather than pushing through: the fallback is to leave `AddPlaceHost` on its existing event-driven `useState` and accept that the global FAB's sheet alone does not close on Back. Every route-owned sheet — the eight in Tasks 5 and 6, which is where the gesture actually matters — keeps working. Note the decision in the commit message and raise it with the user.

- [ ] **Step 4: Verify in a browser**

With `npm run dev -- -p 3001`: tap the FAB from `/`, `/journal` and `/places/<id>` — the add-place sheet opens with `?sheet=add`, Back closes it with no reload. On `/categories`, tap the FAB and confirm the **add-place** sheet does not appear while the list form does (the page's own `?sheet=add`); then confirm `/categories`'s "New list" button still works.

- [ ] **Step 5: Verify lint**

Run: `npm run lint`
Expected: succeeds. The dependency-less `useEffect` in Step 1 may draw an `react-hooks/exhaustive-deps` complaint — if it does, keep the code and add a narrowly-scoped `// eslint-disable-next-line react-hooks/exhaustive-deps` with a one-line reason, matching how `lib/useModalA11y.ts:64` handles the same situation.

- [ ] **Step 6: Commit**

```bash
git add app/components/places/PlaceForm.tsx app/layout.tsx
git commit -m "feat(places): add-place sheet closes on Back via ?sheet=add"
```

---

### Task 8: Uniform tap feedback and overscroll containment

The codebase currently mixes `active:scale-95`, `active:scale-90` and `active:scale-[0.98]`. The spec pins one value everywhere.

**Files:**
- Modify: every `.tsx` under `app/` carrying an `active:scale-*` utility
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Find every offender**

Run: `grep -rn "active:scale-" app --include="*.tsx"`
Expected: roughly 60 matches across the components and pages.

- [ ] **Step 2: Normalise them**

Replace `active:scale-95`, `active:scale-90` and `active:scale-[0.98]` with `active:scale-[0.97]` throughout `app/`. Leave `active:scale-100` alone where it appears as a disabled-state reset (e.g. `disabled:active:scale-100` in `VisitForm.tsx:101`) — that is a different thing saying "do not press".

Run: `grep -rn "active:scale-" app --include="*.tsx" | grep -v "active:scale-\[0.97\]" | grep -v "disabled:active:scale-100"`
Expected: no output.

- [ ] **Step 3: Contain overscroll at the document level**

In `app/globals.css`, inside the existing `html, body { … }` block (around line 60), add:

```css
  /* Overscroll never chains past the app: no rubber-band reveal of the page background on
     iOS, no Android pull-to-refresh mid-scroll. Sheet.tsx contains its own body separately. */
  overscroll-behavior-y: contain;
```

- [ ] **Step 4: Contain the horizontal chip scrollers**

The city filter row (`app/categories/[id]/page.tsx:147`) and `PlaceFilters`' ChipRow both scroll horizontally inside a vertically-scrolling page. Add `overscroll-x-contain` to each element that carries `overflow-x-auto`:

Run: `grep -rn "overflow-x-auto" app --include="*.tsx"`

and add `overscroll-x-contain` to each match's class list.

- [ ] **Step 5: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass, including `lib/theme-contract.test.ts` (these are geometry utilities, not colours, so it should be unaffected — but it reads `app/`, so run it).

- [ ] **Step 6: Verify in a browser**

With `npm run dev -- -p 3001` on a touch-emulated mobile viewport: press and hold any button and confirm the press-down scale is a subtle, consistent dip on every control (nav tabs, chips, gold buttons, sheet close ✕). Scroll a list to its end and keep pulling — the page should not rubber-band the background in or trigger a refresh.

- [ ] **Step 7: Commit**

```bash
git add app app/globals.css
git commit -m "feat(ui): uniform active:scale-[0.97] press feedback + contained overscroll"
```

(Stage the specific files `git status` lists — do not use `git add -A`.)

---

### Task 9: Issue #9 accessibility bundle

Three items, folded in here because the sheet code is already open: `role="alertdialog"` plus a focus move on the inline confirm steps, `useId` for sheet title ids so stacked sheets cannot collide, and `EmptyState` in place of place detail's two plain-text empty states.

The spec names three confirm sites (`BackupPanel`, `CategoryForm`, `CriteriaEditor`). There is a **fourth**, identical in shape: `PlaceEditSheet` in `app/places/[id]/page.tsx:442-465`. Fix all four — one shared component, four call sites.

**Files:**
- Modify: `app/components/ui.tsx` (new `ConfirmBox`)
- Modify: `app/components/settings/BackupPanel.tsx`, `app/components/categories/CategoryForm.tsx`, `app/components/settings/CriteriaEditor.tsx`, `app/places/[id]/page.tsx`
- Modify: `app/components/Sheet.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ConfirmBox`, exported from `app/components/ui.tsx`:
  ```tsx
  ConfirmBox(props: {
    message: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;   // default "Cancel"
    busy?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    className?: string;
  }): JSX.Element
  ```

- [ ] **Step 1: Add `ConfirmBox` to `ui.tsx`**

Append to `app/components/ui.tsx` (and add `useEffect`, `useId`, `useRef` to its React import):

```tsx
/* ─── ConfirmBox ────────────────────────────────────────────────────────────
   The inline destructive-confirm step, shared by four call sites that each had their own
   copy. `role="alertdialog"` (not just a coral div) is what tells a screen reader something
   now needs a decision, and the focus move is what puts the reader inside it — without it
   the box appears visually and silently, and the user's focus is still on a "Delete" button
   that has just changed meaning. It is inline rather than an overlay on purpose: it is a
   confirm STEP inside an open sheet, not a second sheet stacked on the first. */
export function ConfirmBox({
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  onCancel,
  onConfirm,
  className = "",
}: {
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const messageId = useId();

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  return (
    <div
      ref={boxRef}
      role="alertdialog"
      aria-labelledby={messageId}
      tabIndex={-1}
      className={`flex flex-col gap-3 rounded-sm bg-coral/10 p-3.5 outline-none ${className}`}
    >
      <p id={messageId} className="text-sm text-cream">
        {message}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-11 flex-1 rounded-sm bg-coral-deep px-4 text-sm font-semibold text-ground transition active:scale-[0.97] disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Swap the four call sites onto it**

Each site currently renders a hand-rolled `<div className="…bg-coral/10…">` with a message `<p>` and two buttons. Replace each with a `ConfirmBox`, importing it from `../ui` / `@/app/components/ui` as the file's other UI imports do.

`app/places/[id]/page.tsx:443-465` becomes:

```tsx
            <ConfirmBox
              message={
                <>
                  Delete &ldquo;{place.name}&rdquo;? This hides the place and its history from
                  savor.
                </>
              }
              confirmLabel={deleting ? "Deleting…" : "Delete"}
              busy={deleting}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={handleDelete}
            />
```

`app/components/categories/CategoryForm.tsx:137-158` becomes:

```tsx
              <ConfirmBox
                message={<>Delete &ldquo;{category.name}&rdquo;? This can&rsquo;t be undone.</>}
                confirmLabel={deleting ? "Deleting…" : "Delete"}
                busy={deleting}
                onCancel={() => setConfirmingDelete(false)}
                onConfirm={handleDelete}
              />
```

`app/components/settings/CriteriaEditor.tsx:209-234` becomes (note the retained `mt-2.5`):

```tsx
        <ConfirmBox
          className="mt-2.5"
          message={
            <>
              Delete &ldquo;{criterion.name}&rdquo;? Existing scores for this criterion will
              stop counting toward rankings.
            </>
          }
          confirmLabel={busy ? "Deleting…" : "Delete"}
          busy={busy}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleDelete}
        />
```

`app/components/settings/BackupPanel.tsx:132-156` becomes:

```tsx
        <ConfirmBox
          message={`Replace everything in savor with this backup? Current data will be lost. Backup contains: ${summarizeBackup(pending)}`}
          confirmLabel={status === "importing" ? "Restoring…" : "Replace data"}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirmImport}
        />
```

- [ ] **Step 3: `useId` for the sheet title**

`app/components/Sheet.tsx` hardcodes `id="sheet-title"` and `aria-labelledby="sheet-title"`. Two stacked sheets would then both point at the first one's title. Add `useId` to the React import, and in the component body:

```tsx
  // Stacked sheets must not collide on a hardcoded id — the second sheet's aria-labelledby
  // would resolve to the first sheet's <h2>.
  const titleId = useId();
```

Then change `aria-labelledby="sheet-title"` to `aria-labelledby={titleId}` and `<h2 id="sheet-title"` to `<h2 id={titleId}`.

- [ ] **Step 4: `EmptyState` for place detail's two plain-text empty states**

In `app/places/[id]/page.tsx`, lines 207-210 become:

```tsx
        {criteria === undefined ? null : criteria.length === 0 ? (
          <EmptyState
            emoji="⭐"
            title="No criteria yet"
            hint="Add rating criteria in Settings to start rating places."
          />
        ) : (
```

and lines 225-228 become:

```tsx
        {categories === undefined ? null : categories.length === 0 ? (
          <EmptyState
            emoji="🗂️"
            title="No lists yet"
            hint="Create one from the Lists tab to start ranking this place."
          />
        ) : (
```

`EmptyState` is already imported in this file (line 22).

- [ ] **Step 5: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 6: Verify with a screen reader / accessibility tree**

With `npm run dev -- -p 3001`:

1. Open a place's Edit sheet, tap **Delete place** — confirm the accessibility tree shows an `alertdialog` and that focus has moved into it (in Chrome DevTools: Elements → Accessibility pane, and check `document.activeElement` in the console).
2. Tab from the focused confirm box — focus stays inside the sheet (the `useModalA11y` trap still works around the new element).
3. Confirm the sheet's `aria-labelledby` resolves to its own `<h2>` (inspect the generated id).
4. Open a place with no criteria and no lists — both sections render the illustrated `EmptyState`, not bare sentences.

- [ ] **Step 7: Commit**

```bash
git add app/components/ui.tsx app/components/Sheet.tsx app/components/settings/BackupPanel.tsx app/components/categories/CategoryForm.tsx app/components/settings/CriteriaEditor.tsx "app/places/[id]/page.tsx"
git commit -m "feat(a11y): alertdialog confirm steps, useId sheet titles, EmptyState on place detail (#9)"
```

---

### Task 10: Record the decisions

Phase 7 of the spec is "record decisions in CLAUDE.md", but the `?sheet=` convention is the kind of thing a later contributor will otherwise undo by adding a second `useState` sheet flag. It goes in now.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add the new modules to the architecture tree**

In `CLAUDE.md`'s `lib/` block, after the `useLongPress.ts` line, add:

```
│   ├── sheetDrag.ts              # pure drag-to-dismiss math — offset, velocity, thresholds
│   ├── sheetParam.ts             # pure ?sheet= query-string helpers (withSheet/withoutSheet)
│   ├── useSheetParam.ts          # URL-derived sheet state — pushState open / history.back close
```

and in the `app/components/` block, note that `ui.tsx` now also exports `ConfirmBox`.

Update the test-file line to include the two new suites, and the "177 tests in 10 files" count in Workflow rules to whatever `npm test` actually reports at the end of this phase.

- [ ] **Step 2: Add the convention**

Under **Conventions**, after the "Overlays use `Sheet` + `useModalA11y`" bullet, add:

```markdown
- **Sheet open/closed state lives in `?sheet=<name>`, never in `useState`.** A sheet mounts
  when the param is present, so the Android back gesture and the browser Back button close it
  with no popstate listener of our own. Open with the **patched global**
  `window.history.pushState` (never a captured reference, never before mount — an entry
  missing Next's `__NA` marker causes a full page reload on Back); close with
  `window.history.back()`, so the entry is consumed and the stack stays balanced. The param is
  ephemeral and stripped on cold load. **Never put an entity id in the query** — the owning
  route already carries it in the path (`/places/[id]?sheet=edit`); a second id (which
  category a score breakdown is for, a prefill payload) stays in local state. Any component
  calling `useSheetParam` must sit inside a `<Suspense>` boundary or `next build` fails.
- **Destructive confirms use `ConfirmBox`.** Inline `role="alertdialog"` with a focus move —
  not a stacked sheet, and not a bare coral div.
```

- [ ] **Step 3: Note the deferred e2e coverage**

Under **Fast-follows**, add:

```markdown
- **e2e coverage for the `?sheet=` back-button path.** The `__NA` reload trap means Back,
  Forward, and navigating away with a sheet open each need a real browser assertion, and
  Phase 4 verified them by hand. Land them as Playwright specs when Phase 6 scaffolds
  `@playwright/test` (a new devDependency — ask first).
```

- [ ] **Step 4: Verify the full suite one last time**

Run: `npm test && npm run build && npm run lint`
Expected: all three pass. Record the test count from the output — that is the number Step 1 needs.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the ?sheet= convention and Phase 4 modules"
```

---

## Deferred out of Phase 4 (deliberately)

- **Playwright specs for Back / Forward / navigate-away with a sheet open.** The spec calls for them explicitly; `@playwright/test` is a new devDependency, which CLAUDE.md says to ask about first, and Phase 6 is where the spec scaffolds it. Task 10 Step 3 records this as a fast-follow so it cannot be quietly dropped.
- **Everything in Phase 5 (desktop ≥`md`)** — hover states, the left rail, the 720px content column. Phase 4 is the phone.
