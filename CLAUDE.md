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
  must all pass. 308 tests in 17 files today; keep them passing.
- **Ask before adding dependencies.** The dependency set is deliberately tiny
  (Dexie, dexie-react-hooks, next, react, zod, maplibre-gl, @protomaps/basemaps).
  Do not add an npm package without asking first — prefer a built-in or a few
  lines of local code. (The PWA icons, for example, are generated with Node's
  built-in `zlib`, not a canvas library. maplibre-gl and @protomaps/basemaps are
  lazy-loaded behind one dynamic import — this was one deliberate, measured
  exception.)
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
│   ├── globals.css               # Tailwind v4 import + "Supper Club" @theme tokens + motion keyframes
│   ├── page.tsx                  # "/" Places tab — search + status filter + place list (usePlaces)
│   ├── categories/
│   │   ├── page.tsx              #   "/categories" Lists tab — all lists (useCategories)
│   │   └── [id]/page.tsx         #   one list: ranked "been" places + want-to-try (useRankedCategory)
│   ├── journal/page.tsx          # "/journal" tab — every visit across places (useVisits)
│   ├── places/[id]/page.tsx      # place detail — ratings, list membership, visits; edit / rate / log-visit
│   ├── settings/page.tsx         # "/settings" tab — criteria editor + backup panel
│   ├── api/lookup/route.ts       # GET /api/lookup?q= — Node-runtime Photon (OSM) proxy; owns the User-Agent
│   └── components/
│       ├── AppInit.tsx           # renders null; runs useDbInit() exactly once (seed + request persistent storage) + useStripSheetParamOnLoad()
│       ├── BottomNav.tsx         # fixed 4-tab nav + elevated ember "+" FAB (dispatches savor:add-place)
│       ├── Sheet.tsx             # overlay shell: bottom-sheet ≤sm / centered modal ≥sm; h-dvh; backdrop-close; drag-to-dismiss; useModalA11y
│       ├── Toast.tsx             # toast() module-level pub/sub + <Toaster/> (no context)
│       ├── ui.tsx                # presentational primitives — HeaderShell, Chip, EmptyState, ScoreBadge, RatingRow, ConfirmBox, glyphs
│       ├── places/
│       │   ├── PlaceForm.tsx     #   add/edit place sheet + AddPlaceHost (listens for savor:add-place); inline ratings
│       │   ├── LookupCombobox.tsx#   name field + live debounced OSM suggestions (ARIA combobox)
│       │   ├── PlaceCard.tsx     #   place list-row: name, status, ScoreBadge
│       │   ├── PlaceFilters.tsx  #   status filter chips (All / Been / Want to try)
│       │   ├── RatingEditor.tsx  #   per-criterion 1–5 editor → repo.setRating
│       │   ├── ScoreBreakdown.tsx#   per-criterion weight/rating/why explanation, 2 mounts
│       │   ├── MapView.tsx       #   map view wrapper (next/dynamic, ssr: false) + partitionByCoords split
│       │   ├── PlacesMap.tsx     #   MapLibre canvas + markers, listens for place click → selection card
│       │   ├── MapPin.tsx        #   rendered marker: scored/unscored visual + tap to select
│       │   ├── MapSelectionCard.tsx #   place info overlay (like PlaceCard), dismissible
│       │   ├── ViewToggle.tsx    #   list/map tab selector, route.replace with ?view=map/list
│       │   ├── PinlessPlacesSheet.tsx #   map-based "Find location" sheet: list uncoordinated places, tap to geolocate
│       │   ├── PlaceHeaderMap.tsx #   place-detail header map (next/dynamic, ssr: false)
│       │   └── PlaceHeaderMapCanvas.tsx #   MapLibre canvas for header (mounted via idle callback)
│       ├── categories/
│       │   ├── CategoryForm.tsx  #   add/edit list sheet
│       │   └── WeightsEditor.tsx #   per-list criterion weights → repo.setWeights
│       ├── visits/
│       │   ├── VisitForm.tsx     #   add visit sheet (date / dishes / notes)
│       │   └── VisitCard.tsx     #   visit row for journal + place detail
│       └── settings/
│           ├── CriteriaEditor.tsx#   rename / add / remove / reorder criteria
│           ├── BackupPanel.tsx   #   export + import the JSON backup
│           └── MapCachePanel.tsx #   tile cache size + clear button
│
├── lib/                          # framework-free core; unit-tested with fake-indexeddb (no React/jsdom)
│   ├── types.ts                  # entity types, the SyncFields trio, and *Input write-payload shapes
│   ├── db.ts                     # Dexie schema (version 1) + ensureSeeded() + SCHEMA_VERSION      ◀ storage seam
│   ├── repo.ts                   # THE WRITE PATH — zod-validate, stamp timestamps, tombstone deletes  ◀ storage seam
│   ├── hooks.ts                  # THE READ PATH — query fns + useLiveQuery hooks + useDbInit
│   ├── ranking.ts                # pure ranking math — compositeScore, formatScore, rankCategory
│   ├── lookup.ts                 # client side of /api/lookup — searchPlaces() + zod result schema
│   ├── photon.ts                 # Photon wire format — query cap, IP bias, GeoJSON → LookupResult
│   ├── autocomplete.ts           # lookup sequencing — debounce, abort, stale-discard, cache
│   ├── backup.ts                 # export / parseBackup / importBackup / summarizeBackup (JSON envelope)
│   ├── useModalA11y.ts           # focus trap + Escape-to-close + body scroll-lock for overlays
│   ├── useLongPress.ts           # long-press/hover-intent peek gesture (categories/[id]'s ranked rows)
│   ├── sheetDrag.ts              # pure drag-to-dismiss math — offset, velocity, thresholds
│   ├── sheetParam.ts             # pure ?sheet= query-string helpers (withSheet/withoutSheet)
│   ├── tileCache.ts              # pure tile-cache policy — byte cap, LRU eviction, cache keys
│   ├── tileCacheStore.ts         # thin Cache API wrapper + the savor-tiles:// MapLibre protocol
│   ├── mapStyle.ts               # Protomaps dark basemap style + origin-restricted key wiring
│   ├── mapBounds.ts              # pure fit-bounds camera math + pinned/pinless partition
│   ├── useSheetParam.ts          # URL-derived sheet state — pushState open / history.back close
│   └── *.test.ts                 # Vitest suites across lib/ (db, repo, hooks, ranking, lookup, photon, autocomplete, backup, sheetDrag, sheetParam, tileCache, mapStyle, mapBounds) and lib/social/ (index, parse, pickUrl)
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
- **No component library — decided, not defaulted.** Not Mantine, not shadcn/ui,
  not Base UI. What makes savor's look distinctive is tokens, type and layout —
  exactly the surface a component library wants to own, so adopting one trades a
  distinctive look for a competent generic one. Mantine specifically carries
  documented Tailwind v4 integration cost (`postcss-preset-mantine` alongside
  `@tailwindcss/postcss`, hand-managed `@layer` ordering) and its
  `Popover`-portaling `Combobox` fights the `h-dvh` bottom sheet with the iOS
  keyboard raised. **Scoped to presentation only:** if a specific interaction ever
  needs a hard accessibility state machine, adopting a *headless* primitive for
  that one interaction is a separate decision on its own merits, and is not
  foreclosed by this.
- **The score-breakdown long-press/hover-intent peek is an accelerator, never the only
  path.** It is not discoverable, not keyboard-reachable, and not exposed to screen readers —
  its container is `aria-hidden` and never receives focus. The canonical, fully-accessible route
  to the same information is `ScoreBreakdown` mounted in a `Sheet` from place detail's score
  chips. Any future mount of the peek elsewhere must keep this property, not just the two mounts
  that exist today.
- **`navigator.vibrate()` is Android-only.** Safari has never implemented the Vibration API and
  there is no web equivalent for the Taptic Engine. Every call must be feature-guarded
  (`typeof navigator.vibrate === "function"`); no copy or comment may imply iOS gets a haptic
  tick from the long-press peek.

## Conventions

- **Supper Club tokens only.** Colors, fonts, and radii come from the `@theme`
  tokens in `app/globals.css` (`ground`, `ground-deep`, `raised`, `rule`, `cream`,
  `sage`, `gold`, `coral`, …). No raw hex or off-palette Tailwind colors in
  components — `lib/theme-contract.test.ts` enforces this and fails the build if a
  raw hex or an unknown token appears in `app/`. The look: restaurant ephemera —
  bottle green ground, cream ink, butter-gold score seals; Bodoni Moda display,
  Hanken Grotesk body, Archivo utility caps.
- **Gold is yes, coral is careful.** Gold means primary action, active state and
  score seals. Coral means destructive and error, and **nothing else** — not
  want-to-try markers, not accents.
- **Contrast is a property of the pair, not the token.** `sage` is text-legal on
  `ground` (5.23:1) and `ground-deep` (6.45:1) **only** — on `raised` it is 3.85:1
  and fails AA, so secondary text there must be `cream`. `sage-deep` is non-text
  only (rules, dividers, inactive glyph strokes). With an opacity modifier,
  compute the alpha-composited ratio: `cream/60` on `raised` fails at 3.86:1,
  `cream/80` passes at 5.55:1. Never pair a token with a surface without checking.
- **Rounding is rare and deliberate.** `0` is the default — list rows and sections
  are flat and separated by `border-t border-rule` hairlines, never floating
  cards. `rounded-sm` (4px) for inputs, chips, sheets and buttons. `rounded-full`
  is reserved for the score seal and small circular indicators (rating beads,
  status dots, spinners, the FAB) — never for cards, rows, buttons or pills. A
  gap between hairline-separated rows re-creates the card look out of whitespace;
  don't add one.
- **Text on a gold background is `text-ground`, never `text-white`** (white on
  `gold-deep` is 2.56:1 and fails AA).
- **Read through hooks, write through repo.** UI uses `use*` hooks from
  `lib/hooks.ts` to read and `lib/repo.ts` functions to write. Never import Dexie
  in a component.
- **Overlays use `Sheet` + `useModalA11y`.** Any modal/sheet renders inside
  `components/Sheet.tsx` (which wires `useModalA11y` for focus trap, Escape, and
  body scroll-lock). Sheets mount/unmount rather than toggling an `open` prop.
- **Sheet open/closed state lives in `?sheet=<name>`, never in `useState`.** A sheet mounts
  when the param is present, so the Android back gesture and the browser Back button close it
  with no popstate listener of our own. Open with the **patched global**
  `window.history.pushState` (never a captured reference, never before mount — an entry
  missing Next's `__NA` marker causes a full page reload on Back). `useSheetParam` tracks per
  instance, in a ref, whether *it* was the one that pushed: if so, close with
  `window.history.back()`, so the entry is consumed and the stack stays balanced; if the param
  arrived on the URL some other way (cold load before the strip runs, a client-side nav that
  lands with `?sheet=` already set), close by `router.replace`-ing the param-free URL instead,
  so closing never traverses an entry this instance didn't push. The param is ephemeral and
  stripped once on cold load via `router.replace` (not `window.history.replaceState`, which is
  invisible to `useSearchParams()` and would leave a sheet host believing it's still open).
  **Never put an entity id in the query** — the owning
  route already carries it in the path (`/places/[id]?sheet=edit`); a second id (which
  category a score breakdown is for, a prefill payload) stays in local state. Any component
  calling `useSheetParam` must sit inside a `<Suspense>` boundary or `next build` fails. A
  delete-then-navigate path never calls `closeSheet()`: `history.back()` queues a traversal
  that resolves against the history index at the time the queue drains, not when it was
  called, so a synchronous `router.replace` right after it would land first and the deferred
  `back()` would then resolve against the post-navigation index — landing on `?sheet=edit` for
  an entity that no longer exists. Navigate with `router.replace` (not `push`, which would
  stack a new entry instead of consuming the `?sheet=` one) and let the sheet unmount with the
  route; see `CategoryForm.tsx`'s and `PlaceEditSheet`'s `handleDelete`.
- **View state lives in `?view=<name>`, and it is NOT the `?sheet=` mechanism.** `?view=map` on
  the Places tab is a view toggle: read with `useSearchParams()`, written with
  `router.replace(…, { scroll: false })` so switching never grows the history stack, exactly like
  `?tab=` / `?city=` on the category route. It must not go through `useSheetParam`, which pushes
  an entry and consumes it with `history.back()` — right for a sheet you dismiss, wrong for a
  view you switch to and stay in. An unrecognised value falls back to the default view. The
  param survives the cold-load `?sheet=` strip (`withoutSheet` preserves every other param), so
  `/?view=map&sheet=add` reloads as `/?view=map`.
- **MapLibre is imported in exactly two modules.** `app/components/places/PlacesMap.tsx` (the
  interactive Places-tab map) and `app/components/places/PlaceHeaderMapCanvas.tsx` (the
  decorative, non-interactive place-detail header map) are the only files that may import
  `maplibre-gl`; everything else goes through `MapView.tsx` / `PlaceHeaderMap.tsx`'s
  `next/dynamic({ ssr: false })` boundaries, so no other route pays for the ~281 KB chunk. The
  basemap style is defined once in `lib/mapStyle.ts` and shared by the map tab and the
  place-detail header, so the two cannot drift.
- **The map partitions the list's result; it never runs its own query.** The map consumes the
  same `usePlaces` output the list renders and splits it with `partitionByCoords`. A separate
  query is the bug commit `393cdfe` fixed for category city chips.
- **Tile attribution is not dismissible.** "Protomaps © OpenStreetMap" renders on every map
  surface — the same ODbL obligation savor carries for Photon. Restyle it, never hide it.
- **Map tiles must come from an origin that grants CORS to savor's.** A third-party PMTiles
  bucket that denies the preflight paints a plausible-looking *empty map*, not an error, and
  `curl` cannot reproduce it (it sends no `Origin`). Any tile-source change is verified in a
  browser with the Network tab open.
- **Tile caching is gated on `navigator.storage.persisted()`, and the gate is not optional.**
  The Cache API cannot touch IndexedDB, but the two **share one origin quota**, and browsers
  evict **per-origin, all-or-nothing**. A large tile cache does not delete data — it raises the
  odds the browser throws away the whole origin *including* the data. So: if persistence was not
  granted, tiles are served but never stored; the check is re-run on **every mount** of a map
  (browsers grant persistence later as engagement heuristics are satisfied), never cached at
  startup; and `lib/tileCache.ts`'s own byte cap with LRU eviction means savor never drifts near
  the browser's quota and never lets the browser decide what to drop.
- **"Clear map cache" deletes exactly one named Cache Storage bucket.** It can never reach `meta`
  or `criteria`, which is why it needs no `ConfirmBox` and is **not** coral — it throws away
  re-downloadable tiles, not user data. Do not wire it into any reset-everything path; CLAUDE.md's
  "clear `meta` + `criteria` together" rule is about those two and this button stays clear of both.
- **Offline means a warm cache, not offline maps.** Tiles already viewed keep working offline; a
  neighbourhood never opened will not be there. savor has no service worker, and introducing one
  solely for tiles is the wrong scope — cache versioning and update semantics are a decision
  about the whole app.
- **Coordinates are only ever written on an explicit tap.** The **Find location** flow in
  `PinlessPlacesSheet` is the only path that sets coordinates on an existing place. No silent
  auto-geocoding, ever, not even for a single high-confidence match: there is no UI anywhere to
  correct a wrong coordinate, so a silent write would be permanent. `searchPlaces`' three
  outcomes (failure / empty / results) stay distinct — an offline blip must never read as
  "that restaurant doesn't exist".
- **The place-detail header map is decorative.** `aria-hidden`, never focusable, loaded on idle,
  and the page renders complete without it. The address line remains the accessible source of
  location — the same accelerator-never-the-only-path principle as the long-press score peek.
- **Destructive confirms use `ConfirmBox`.** Inline `role="alertdialog"` with a focus move —
  not a stacked sheet, and not a bare coral div.
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

## Fast-follows

Known gaps, not yet urgent enough to block a commit but worth doing soon:

- **The map tile-cache cap may still be an estimate.** Task 8's tile-cache-cap measurement
  (confirming ~40MB/~500 tiles against real tile sizes) was deferred and never performed — it
  remains an unconfirmed estimate. Revisit once the Protomaps API key is available and cache
  behaviour can be measured against real tile payloads.
- **No automated coverage for the map's browser behaviour.** Pin rendering, pan-vs-tap
  deselection, the geolocation prompt, the persistence gate and the warm-cache offline path were
  all verified by hand. Land them alongside the `?sheet=` specs when `@playwright/test` is
  scaffolded (a new devDependency — ask first).
- **Antimeridian-spanning collections fit the long way round.** `lib/mapBounds.ts` does not
  handle a bounding box crossing ±180°. Irrelevant for a personal restaurant ledger; fix it if
  someone's places ever straddle the date line.
- **Type↔zod drift guard.** `lib/types.ts`'s entity interfaces and `lib/repo.ts`'s
  hand-maintained `*Fields` zod schemas are two independent sources of truth for
  the same shape. Nothing currently fails CI if they drift (e.g. a new optional
  field added to `Place` but forgotten in `placeFields`). Add a static or
  test-time check that ties them together.
- **Backup forward-migration-on-import strategy — required BEFORE the first
  `SCHEMA_VERSION` bump.** `parseBackup` currently requires exact
  `schemaVersion` equality (see `lib/backup.ts`), so the moment `SCHEMA_VERSION`
  moves to 2, every v1 export becomes unimportable. Design and land a
  migration step (v1 → v2 → …) before that bump ships, not after.
- **No automated e2e coverage for the `?sheet=` back-button path.** A manual browser pass at
  the end of Phase 4 exercised Back, Forward, and navigating away with a sheet open (and
  caught two real defects along the way — a `ConfirmBox` focus restore that was a no-op, and
  a `?sheet=add` name collision — both fixed), but none of it is automated, so a future
  regression here won't fail CI. Land them as Playwright specs when Phase 6 scaffolds
  `@playwright/test` (a new devDependency — ask first).
- **Drag-to-dismiss is untested on a real touch device.** `lib/sheetDrag.ts`'s thresholds
  (`DISMISS_FRACTION`, `DISMISS_VELOCITY`) have unit-test coverage, but no one has dragged a
  sheet with an actual finger on actual glass, and `prefers-reduced-motion` suppression
  (`dragEnabled()`) has never been toggled at the OS level to confirm the gesture actually
  turns off.
