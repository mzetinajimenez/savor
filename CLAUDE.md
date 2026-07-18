# CLAUDE.md — working in savor

savor is a mobile-first PWA for tracking restaurants and food experiences. It is
**device-local**: all data lives in the browser's IndexedDB (via Dexie), there is
no backend database, and there is no auth. Next.js 16 (App Router) serves the UI
and one small proxy route. This file is the orientation for anyone (human or
agent) making changes.

## Workflow rules

- **Direct to `main`.** This is a solo, trunk-based repo. Commit straight to
  `main` with conventional-commit messages (`feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`). Keep commits in logical chunks. Stage explicit paths — never
  `git add -A`.
- **Green before every commit.** `npm test`, `npm run build`, and `npm run lint`
  must all pass. 121 tests today; keep them passing.
- **Ask before adding dependencies.** The dependency set is deliberately tiny
  (Dexie, dexie-react-hooks, next, react, zod). Do not add an npm package without
  asking first — prefer a built-in or a few lines of local code. (The PWA icons,
  for example, are generated with Node's built-in `zlib`, not a canvas library.)
- **IndexedDB migrations are additive-only, NEVER destructive.** The Dexie schema
  is versioned in `lib/db.ts`. A schema change adds a **new** `db.version(N)`
  block (and bumps `SCHEMA_VERSION`); it never edits the existing `version(1)`
  block, drops a table, or removes an index. Users' data lives in their browser —
  a destructive migration silently eats it. Deletes are tombstones, never row
  removal (see Product decisions).
- **Any "reset app" path must clear `meta` + `criteria` together.** `ensureSeeded`
  keys "first run" off the singleton `meta` row; deleting data without deleting
  `meta` leaves the app un-seedable, and deleting `meta` without re-seeding
  criteria leaves it criteria-less. `importBackup` deliberately never touches
  `meta` for this reason.

## Architecture

```
sabor/
├── app/                          # Next.js App Router — all UI + the one API route
│   ├── layout.tsx                # Root layout: fonts, metadata + viewport, mounts AppInit / BottomNav / Toaster / AddPlaceHost
│   ├── globals.css               # Tailwind v4 import + "Cellar" @theme tokens + motion keyframes
│   ├── page.tsx                  # "/" Places tab — search + status filter + place list (usePlaces)
│   ├── categories/
│   │   ├── page.tsx              #   "/categories" Lists tab — all lists (useCategories)
│   │   └── [id]/page.tsx         #   one list: ranked "been" places + want-to-try (useRankedCategory)
│   ├── journal/page.tsx          # "/journal" tab — every visit across places (useVisits)
│   ├── places/[id]/page.tsx      # place detail — ratings, list membership, visits; edit / rate / log-visit
│   ├── settings/page.tsx         # "/settings" tab — criteria editor + backup panel
│   ├── api/lookup/route.ts       # GET /api/lookup?q= — Node-runtime Nominatim (OSM) proxy; owns the User-Agent
│   └── components/
│       ├── AppInit.tsx           # renders null; runs useDbInit() exactly once (seed + request persistent storage)
│       ├── BottomNav.tsx         # fixed 4-tab nav + elevated ember "+" FAB (dispatches savor:add-place)
│       ├── Sheet.tsx             # overlay shell: bottom-sheet ≤sm / centered modal ≥sm; h-dvh; backdrop-close; useModalA11y
│       ├── Toast.tsx             # toast() module-level pub/sub + <Toaster/> (no context)
│       ├── ui.tsx                # presentational primitives — HeaderShell, Chip, EmptyState, ScoreBadge, RatingRow, glyphs
│       ├── places/
│       │   ├── PlaceForm.tsx     #   add/edit place sheet + AddPlaceHost (listens for savor:add-place); inline ratings + OSM lookup
│       │   ├── PlaceCard.tsx     #   place list-row: name, status, ScoreBadge
│       │   ├── PlaceFilters.tsx  #   status filter chips (All / Been / Want to try)
│       │   └── RatingEditor.tsx  #   per-criterion 1–5 editor → repo.setRating
│       ├── categories/
│       │   ├── CategoryForm.tsx  #   add/edit list sheet
│       │   └── WeightsEditor.tsx #   per-list criterion weights → repo.setWeights
│       ├── visits/
│       │   ├── VisitForm.tsx     #   add/edit visit sheet (date / dishes / notes)
│       │   └── VisitCard.tsx     #   visit row for journal + place detail
│       └── settings/
│           ├── CriteriaEditor.tsx#   rename / add / remove / reorder criteria
│           └── BackupPanel.tsx   #   export + import the JSON backup
│
├── lib/                          # framework-free core; unit-tested with fake-indexeddb (no React/jsdom)
│   ├── types.ts                  # entity types, the SyncFields trio, and *Input write-payload shapes
│   ├── db.ts                     # Dexie schema (version 1) + ensureSeeded() + SCHEMA_VERSION      ◀ storage seam
│   ├── repo.ts                   # THE WRITE PATH — zod-validate, stamp timestamps, tombstone deletes  ◀ storage seam
│   ├── hooks.ts                  # THE READ PATH — query fns + useLiveQuery hooks + useDbInit
│   ├── ranking.ts                # pure ranking math — compositeScore, formatScore, rankCategory
│   ├── lookup.ts                 # client side of /api/lookup — searchPlaces() + zod result schema
│   ├── backup.ts                 # export / parseBackup / importBackup / summarizeBackup (JSON envelope)
│   ├── useModalA11y.ts           # focus trap + Escape-to-close + body scroll-lock for overlays
│   └── *.test.ts                 # Vitest suites: db, repo, hooks, ranking, lookup, backup
│
├── public/                       # manifest.webmanifest + icon-192 / icon-512 / icon-maskable-512 / apple-touch-icon
├── scripts/generate-icons.mjs    # regenerates the PWA icons (built-in zlib PNG encoder, no deps)
└── (config) next.config.mjs · tsconfig.json ("@/*" → repo root, strict) · eslint.config.mjs · postcss.config.mjs · vitest.config.ts
```

## Persistence — the storage seam

All data access funnels through **two files**, and nothing else touches Dexie:

- **`lib/db.ts`** — the Dexie instance and schema, plus `ensureSeeded()` (seeds
  the 4 default criteria + the singleton `meta` row on first run) and the exported
  `SCHEMA_VERSION`.
- **`lib/repo.ts`** — **the only write path.** Every mutation validates its input
  with zod, stamps `updatedAt` (and mints `id`/`createdAt`/`deletedAt: null` on
  create), and deletes by setting `deletedAt` (tombstone) rather than removing the
  row. Read-modify-write setters (`setRating`, `setWeights`) run inside a Dexie
  `rw` transaction to avoid lost updates.

Reads go through **`lib/hooks.ts`**, which wraps plain async query functions in
`useLiveQuery`. Every query filters `deletedAt === null`.

**Why this matters:** `lib/db.ts` + `lib/repo.ts` are the deliberate **cloud-sync
seam**. Every entity already carries the sync trio (`id`, `createdAt`,
`updatedAt`, `deletedAt`), so a future sync backend can hook into the repo write
path and a background pull — pushing tombstones and last-writer-wins timestamps —
**without changing a single UI call site or hook**. Keep it that way: do not let
components import `dexie` or `@/lib/db` directly, and do not add a second write
path around the repo.

## Product decisions (pinned semantics — do not silently change)

- **Per-category weights over a shared criteria library.** Criteria (Cost, Food
  quality, …) are global and shared. Each list (category) carries its own
  `weights: Record<criterionId, number>` — the same place can rank differently in
  different lists.
- **Weight defaulting:** a criterion **missing** from a list's `weights` map
  counts as weight **1** (lists don't re-enumerate weights when new criteria are
  added). An **explicit `0` excludes** the criterion from that list's score. So
  "missing" ≠ "0".
- **Ratings are integers 1–5**, stored per place as `ratings:
  Record<criterionId, number>` — one rating per (place, criterion), not per visit.
- **Composite score = Σ(w·r) / Σ(w)**, over criteria that are live (not
  tombstoned), have weight > 0, and have a rating. It is **derived at render**
  (`compositeScore`/`rankCategory`), **never stored**. `null` when nothing
  contributes (that place is unranked, not zero). Display is 1 decimal
  (`formatScore`).
- **Ties are at display precision.** Two places tie iff their scores round to the
  same 1-decimal value. Tied entries share a rank under **standard competition
  ranking** (1, 2, 2, 4); within a tie they order by most-recent visit desc, then
  name asc. Only "been" places are ranked; "want to try" are listed separately.
- **Deletes are tombstones.** Set `deletedAt`; never remove the row. Every read
  filters it out. This is what makes sync/backup lossless.
- **No context providers, no state library.** Dexie `liveQuery` **is** the state
  layer — components re-render when the DB changes. Cross-cutting one-offs
  (toasts, the add-place event) use tiny module-level pub/sub, not React context.

## Conventions

- **Cellar tokens only.** Colors, fonts, and radii come from the `@theme` tokens
  in `app/globals.css` (`plum`, `ember`, `gold`, `shell`, `surface`, `ink`, …).
  No raw hex or off-palette Tailwind colors in components. The look: wine-plum
  structure, ember action/ratings, gold score seals, on clay parchment.
- **Read through hooks, write through repo.** UI uses `use*` hooks from
  `lib/hooks.ts` to read and `lib/repo.ts` functions to write. Never import Dexie
  in a component.
- **Overlays use `Sheet` + `useModalA11y`.** Any modal/sheet renders inside
  `components/Sheet.tsx` (which wires `useModalA11y` for focus trap, Escape, and
  body scroll-lock). Sheets mount/unmount rather than toggling an `open` prop.
- **Toast on failed writes.** Wrap repo writes in the UI and `toast(...)` on
  rejection so a failed save is never silent.
- **Mobile-first, ≥44px touch targets.** Safe-area insets on fixed chrome,
  `h-dvh` overlays, `active:` press states, and a minimum 44px hit area on
  interactive controls (tap area can exceed the visual size — see `Chip`,
  `RatingRow`). Text-entry inputs are ≥16px (`text-base`) so iOS doesn't
  focus-zoom; pinch-zoom is intentionally left enabled (WCAG 1.4.4).
- **Framework-free `lib/`.** Keep `lib/ranking.ts`, `lib/backup.ts`, and the query
  functions in `lib/hooks.ts` free of React/DOM so they stay unit-testable with
  fake-indexeddb. New data/logic gets a Vitest test alongside it.
