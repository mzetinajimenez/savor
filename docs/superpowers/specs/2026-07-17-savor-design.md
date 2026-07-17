# savor — v1 Design Spec

**Date:** 2026-07-17
**Status:** Approved pending user review
**Repo:** git@github.com:mzetinajimenez/savor.git (app name is **savor**; local folder `sabor`)

## 1. Vision

A personal, mobile-first web app to track restaurants and food experiences: remember
places you've been, keep a want-to-try list, rank places in categories *you* define
using criteria and weights *you* choose, and keep a lightweight journal of what you ate.
Beli-like in spirit, but more ergonomic and more customizable — and without Beli's
pairwise-comparison ranking, which forces absurd comparisons (tacos vs. omakase).

Sibling project: `pantry-keeper` (same author) proves the core architecture — Next.js
App Router + Tailwind v4 + IndexedDB, zero-config Vercel deploys, installable PWA,
excellent mobile patterns. savor reuses what worked and fixes what its own docs flag
as pain points.

## 2. Scope

### In scope (v1)

- Places: add manually or via free OpenStreetMap lookup; statuses `want_to_try` / `been`.
- User-defined **criteria** library (seeded: Cost, Food quality, Service, Ambiance).
- User-defined **categories** (e.g. date night, japanese, casual) with per-category
  weights over the criteria.
- Rate a place once (1–5 per criterion, skippable); every category it belongs to ranks
  it by that category's weights.
- Visit journal: text-only entries (date, dishes, notes) per place.
- Export/import JSON backup (validated).
- Installable PWA, deployed on Vercel.

### Explicitly deferred (designed-for, not built)

| Deferred | v1 provision that keeps the door open |
|---|---|
| Cloud sync / multi-device | UUIDs, `createdAt`/`updatedAt`, tombstone deletes, repo facade as the swap seam |
| Photos on visits | Additive field + Dexie version bump; no migration pain |
| Recommend/share features | None needed; rankings are local |
| Offline cold-start (service worker) | All data ops are local already; SW is additive |
| Manual tie-break ordering | Ties displayed honestly; weight tweaks are the natural tie-breaker |
| Auth | Not needed until sync exists |

## 3. Architecture

- **Next.js** (App Router, latest stable), **TypeScript strict**, **Tailwind CSS v4**
  (CSS-first config in `globals.css` with `@theme` tokens — no tailwind.config).
- **Dexie.js** for IndexedDB. `useLiveQuery` makes components reactive DB queries —
  this deliberately eliminates the two biggest pantry-keeper pain points: the
  state-owning god component and hand-rolled IndexedDB/migration boilerplate.
- **Real routes** (not single-route tabs) so the phone back-button works naturally.
- **zod** for runtime validation (backup import, lookup responses).
- **vitest + fake-indexeddb** for the data layer; pure unit tests for ranking math.
- Only serverless surface: `/api/lookup` (Nominatim proxy with caching).
- Zero-config Vercel deploy (empty `next.config`), PWA manifest + icons, no service
  worker in v1.

### File structure

```
app/
  layout.tsx            # viewport/safe-area/PWA metadata, bottom nav
  page.tsx              # Places tab (all places, search, filters)
  categories/page.tsx   # Lists tab (category cards)
  categories/[id]/page.tsx  # Ranked + Want-to-try sections
  places/[id]/page.tsx  # Place detail: info, ratings, categories, visits
  journal/page.tsx      # Reverse-chron visit feed
  settings/page.tsx     # Criteria editor, backup, storage status
  api/lookup/route.ts   # OSM Nominatim proxy (cached)
  components/           # BottomNav, sheets (PlaceForm, VisitForm, RatingEditor,
                        #   WeightsEditor), cards, ui primitives, useModalA11y
lib/
  db.ts                 # Dexie schema + versions (additive-only migrations)
  repo.ts               # Write facade: stamps updatedAt, tombstones, zod-validates
  hooks.ts              # useLiveQuery read hooks (usePlaces, useRankedCategory, …)
  ranking.ts            # Pure weighted-average math (fully tested)
  backup.ts             # Export/import envelope + zod schema
  lookup.ts             # Client for /api/lookup
  types.ts              # Entity types + input types
```

### Data flow rules

- Components **never** touch Dexie directly: reads via `lib/hooks.ts`, writes via
  `lib/repo.ts`.
- Composite scores are **derived at render time**, never stored — changing weights or
  criteria recomputes every ranking instantly with nothing to migrate.
- State management is Dexie + liveQuery only: no context providers, no state library,
  no lifted mega-state.

## 4. Data model

Five Dexie tables. Every record is sync-ready: `id: string` (crypto.randomUUID()),
`createdAt`/`updatedAt` ISO timestamps, soft delete via `deletedAt: string | null`
(tombstones; all queries filter them out; purged by a future sync layer).

### `places`

| Field | Type | Notes |
|---|---|---|
| id | string (UUID) | |
| name | string | required |
| status | `"want_to_try"` \| `"been"` | |
| cuisine | string? | freeform |
| address, city | string? | |
| lat, lng | number? | from lookup or manual |
| notes | string? | |
| categoryIds | string[] | multiEntry index; membership is embedded |
| ratings | Record<criterionId, 1..5> | scored **once per place**; integers |
| createdAt, updatedAt, deletedAt | | sync-ready trio |

A looked-up place and a custom place are identical after creation — lookup only
prefills fields.

### `criteria`

id, name, sortOrder, + sync trio. Seeded on first run: Cost, Food quality, Service,
Ambiance — all renamable, deletable, extendable. Deleting a criterion tombstones it;
existing ratings keyed by its id simply stop contributing to scores.

### `categories`

id, name, emoji?, `weights: Record<criterionId, number>`, sortOrder, + sync trio.
Weights default to 1 for every criterion; editing is optional per category.

### `visits`

id, placeId, date (YYYY-MM-DD), dishes (string), notes (string), + sync trio.
Photos later = additive field.

### `meta`

Single row: schema version, install id, backup bookkeeping (e.g. lastExportedAt).

## 5. Ranking system

For category **C** and place **P**, over criteria where `C.weights[c] > 0` **and**
`P.ratings[c]` exists:

```
score(P, C) = Σ(weights[c] × ratings[c]) / Σ(weights[c])
```

- Always lands on the 1–5 scale; displayed to one decimal (e.g. **4.3**).
- Skipped criteria (no "service" at a taco stand) drop out of that place's average.
- Category view has two sections: **Ranked** (status `been`, ≥1 rating, sorted by
  composite desc) and **Want to try** (sorted by date added).
- Ties shown honestly (`#3 =`); secondary sort by most recent visit date.
- Edge cases (tested): zero total weight → unranked; no ratings → Want-to-try
  section; deleted criterion → drops out everywhere.

## 6. Navigation & screens

Persistent bottom nav (safe-area insets, `h-dvh`, big touch targets, `active:` states),
four tabs + center FAB:

| Tab | Route | Content |
|---|---|---|
| Places | `/` | All places; search box; filter chips (status, cuisine, category) |
| Lists | `/categories` → `/categories/[id]` | Category cards → Ranked/Want-to-try view |
| **＋ Add** (FAB) | bottom sheet | Add-place flow, from anywhere |
| Journal | `/journal` | Reverse-chron visit feed; tap → place |
| Settings | `/settings` | Criteria editor, export/import, storage status |

Detail pages are **routes** (back-button friendly); quick actions are **bottom sheets**
(pantry-keeper's `useModalA11y` focus-trap + Escape pattern; sheets on mobile, centered
modals ≥ sm).

### Key flows

- **Add place** (~15s): name → optional "look up" (OSM autofill) → status → tick
  categories → if `been`, 1–5 rating rows appear inline → save.
- **Rate**: each criterion is a row of five tap targets; skip = don't tap. Scores
  update live everywhere via liveQuery.
- **Log visit**: from place detail or Journal: date (defaults today), dishes, notes;
  optional rating nudge after.
- **Edit weights**: sheet on the category; rankings recompute instantly.

## 7. Data safety & error handling

- `navigator.storage.persist()` requested on first load (best-effort, non-blocking).
- **Backup export**: versioned JSON envelope `{app: "savor", schemaVersion,
  exportedAt, places, criteria, categories, visits}` (tombstones included) downloaded
  as a file from Settings.
- **Backup import**: zod-validated **before** anything is touched; shows a summary
  ("Replace 42 places, 3 categories…?"); destructive replace runs in a single
  transaction only after confirmation.
- Dexie migrations are **additive-only, never destructive** (iron rule inherited from
  pantry-keeper).
- Writes: Dexie is the single source of truth — no optimistic React state to roll
  back. Failed write → toast with retry.
- Lookup failure / offline → form stays manual, no error ceremony. Lookup responses
  are schema-checked; malformed results discarded.

## 8. Testing

`vitest`, two layers:

1. **Pure logic** (`lib/ranking.ts`): weighted-average math, tie handling, zero
   weights, missing ratings, deleted criteria.
2. **Repo layer** (`lib/repo.ts` + `lib/db.ts` against **fake-indexeddb**): CRUD,
   tombstone semantics, backup round-trip, migration vN→vN+1 preserves data.

Components untested in v1 (matches sibling app); the two layers where bugs destroy
data or miscompute rankings are covered. Manual verification during development via
Playwright browser tooling.

## 9. Deployment

- GitHub: `mzetinajimenez/savor` (fresh; first push creates `main`). Direct-to-main
  workflow, no PR ceremony (matches sibling project convention).
- Vercel: connect repo to a new Vercel project; zero special config; app shell
  prerenders static; `/api/lookup` is the only function.
- PWA: `public/manifest.webmanifest` + icons + `metadata`/`viewport` in `layout.tsx`
  (`viewportFit: "cover"` for safe-area insets), matching pantry-keeper.

## 10. Anti-patterns deliberately avoided (from pantry-keeper's own postmortem)

- God component owning all state → Dexie liveQuery hooks instead.
- Hand-rolled IndexedDB promise wrappers + monolithic migration chain → Dexie.
- Untested storage layer → fake-indexeddb tests from day one.
- `as`-cast backup import before destructive replace → zod validation first.
- Implicit ESLint config → pin an explicit `eslint.config.*`.
- Shared formatting logic duplicated inline across components → single formatter
  helpers in `lib/`.
