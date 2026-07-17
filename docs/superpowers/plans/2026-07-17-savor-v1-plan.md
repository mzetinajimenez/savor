# savor v1 — Implementation Plan (lean)

> **For agentic workers:** Read the spec first: `docs/superpowers/specs/2026-07-17-savor-design.md`.
> Execute task-by-task via superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. UI tasks (6–12) should invoke the frontend-design skill
> before building screens. Checkboxes track completion.

**Goal:** Ship savor v1 — device-local, mobile-first food list/ranking/journal app — deployed on Vercel from `mzetinajimenez/savor`.

**Architecture:** Next.js App Router + Tailwind v4; Dexie (IndexedDB) as the single source of truth; reads via `useLiveQuery` hooks, writes via a `lib/repo.ts` facade; composite scores derived at render time, never stored.

**Tech stack:** Next.js (latest stable), React 19, TypeScript strict, Tailwind v4 (CSS-first), Dexie + dexie-react-hooks, zod, vitest + fake-indexeddb.

## Global constraints (apply to every task)

- TypeScript `strict: true`; path alias `@/*` → repo root.
- All entities carry the sync trio: `id` (crypto.randomUUID()), `createdAt`/`updatedAt` (ISO), `deletedAt: string | null`. Deletes are tombstones; every read filters `deletedAt === null`.
- Dexie migrations are additive-only, never destructive.
- Components never import Dexie directly — reads through `lib/hooks.ts`, writes through `lib/repo.ts`.
- No React context providers, no state libraries.
- Ratings are integers 1–5. Composite: `Σ(w×r)/Σ(w)` over criteria with weight > 0 AND a rating; display 1 decimal.
- App name is **savor** everywhere user-visible.
- Mobile-first: safe-area insets, `h-dvh` overlays, ≥44px touch targets, `active:` states.
- Each task ends green: `npm test` and `npm run build` pass, then commit directly to `main` (conventional-commit style message).

## Execution waves (parallelism map)

| Wave | Tasks | Notes |
|---|---|---|
| 1 | T1 | scaffold — everything depends on it |
| 2 | T2, T6 | data foundation ∥ app chrome (disjoint files) |
| 3 | T3, T4 | repo ∥ ranking (both depend only on T2) |
| 4 | T5, T13 | hooks ∥ backup lib |
| 5 | T7, T8, T9, T10, T11, T12 | feature screens — parallel-safe if each keeps its components feature-scoped |
| 6 | T14 | deploy + device verification |

---

### T1 — Scaffold & toolchain

**Files:** `package.json`, `next.config.mjs` (empty), `tsconfig.json`, `postcss.config.mjs`, `app/globals.css` (Tailwind v4 `@theme` tokens), `app/layout.tsx`, `app/page.tsx` (placeholder), `eslint.config.mjs` (explicit, pinned), `vitest.config.ts` (include `lib/**/*.test.ts`), `public/manifest.webmanifest` + icons, `.gitignore`.
**Depends:** —
**Deliverable:** `create-next-app` (TS, App Router, Tailwind, no src dir) trimmed to spec layout; deps added: `dexie`, `dexie-react-hooks`, `zod`; dev: `vitest`, `fake-indexeddb`. `layout.tsx` sets viewport (`viewportFit: "cover"`, device-width) + PWA metadata per pantry-keeper's pattern.
**Done when:** `npm run build`, `npm test` (empty suite ok), `npm run lint` all pass; commit pushed.

### T2 — Types + Dexie schema + seeding

**Files:** `lib/types.ts`, `lib/db.ts`, `lib/db.test.ts`.
**Depends:** T1
**Produces (interfaces other tasks rely on):**
```ts
type SyncFields = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null };
type PlaceStatus = "want_to_try" | "been";
interface Place extends SyncFields { name: string; status: PlaceStatus; cuisine?: string; address?: string; city?: string; lat?: number; lng?: number; notes?: string; categoryIds: string[]; ratings: Record<string, number>; }
interface Criterion extends SyncFields { name: string; sortOrder: number; }
interface Category extends SyncFields { name: string; emoji?: string; weights: Record<string, number>; sortOrder: number; }
interface Visit extends SyncFields { placeId: string; date: string; dishes: string; notes: string; }
// lib/db.ts
export const db: Dexie & { places; criteria; categories; visits; meta };
export async function ensureSeeded(): Promise<void>; // idempotent: seeds 4 default criteria + meta row on first run
```
Indexes: `places: id, status, *categoryIds, deletedAt`; `visits: id, placeId, date, deletedAt`; `criteria`/`categories`: `id, sortOrder, deletedAt`.
**Done when:** fake-indexeddb tests cover schema creation + idempotent seeding (Cost, Food quality, Service, Ambiance).

### T3 — Repo write facade

**Files:** `lib/repo.ts`, `lib/repo.test.ts`.
**Depends:** T2
**Produces:**
```ts
createPlace(input: PlaceInput): Promise<Place>; updatePlace(id, patch: Partial<PlaceInput>): Promise<void>;
deletePlace(id): Promise<void>; // tombstone; same trio for categories, criteria, visits
setRating(placeId: string, criterionId: string, value: number | null): Promise<void>; // null clears
setWeights(categoryId: string, weights: Record<string, number>): Promise<void>;
```
All writes zod-validate input, stamp `updatedAt`, generate `id`/`createdAt` on create. Rating values clamped to int 1–5.
**Done when:** tests cover CRUD, tombstone semantics (deleted rows excluded from reads, still present in table), rating set/clear/clamp.

### T4 — Ranking math (pure)

**Files:** `lib/ranking.ts`, `lib/ranking.test.ts`.
**Depends:** T2 (types only)
**Produces:**
```ts
compositeScore(ratings: Record<string, number>, weights: Record<string, number>, liveCriterionIds: Set<string>): number | null;
// null when no overlapping rated+weighted+live criteria
rankCategory(places: Place[], category: Category, criteria: Criterion[], lastVisitByPlace: Map<string, string>): RankedEntry[];
interface RankedEntry { place: Place; score: number; rank: number; tied: boolean; }
```
Rules: skipped criteria drop out; tombstoned criteria excluded via `liveCriterionIds`; ties share rank + `tied: true`, secondary sort by most recent visit desc, then name; zero total weight → null.
**Done when:** tests cover weighted average, skips, ties, deleted criterion, zero weights, empty inputs.

### T5 — Read hooks

**Files:** `lib/hooks.ts` (+ `lib/hooks.test.ts` if practical; hooks are thin, logic lives in T3/T4).
**Depends:** T3, T4
**Produces:**
```ts
usePlaces(filter?: { status?: PlaceStatus; categoryId?: string; search?: string }): Place[] | undefined;
usePlace(id: string): Place | undefined; useCategories(): Category[] | undefined; useCategory(id): Category | undefined;
useCriteria(): Criterion[] | undefined; useVisits(placeId?: string): Visit[] | undefined;
useRankedCategory(id: string): { ranked: RankedEntry[]; wantToTry: Place[] } | undefined;
```
All built on `useLiveQuery`; all filter tombstones; `undefined` = loading.
**Done when:** typecheck + build green; `useRankedCategory` composes T4 correctly (unit-test the underlying query function, not the hook).

### T6 — App chrome & UI primitives

**Files:** `app/components/BottomNav.tsx`, `app/components/ui.tsx` (HeaderShell, Chip, EmptyState, Sheet, RatingRow display, score badge, formatters), `app/components/Toast.tsx`, `lib/useModalA11y.ts`, finalize `app/globals.css` theme.
**Depends:** T1 (parallel with T2–T5)
**Deliverable:** Bottom nav (Places · Lists · ＋FAB · Journal · Settings) wired to routes with active states + safe-area padding; `Sheet` = bottom sheet on mobile / centered modal ≥sm with focus trap + Escape (pantry-keeper's `useModalA11y` pattern); distinctive food-forward theme via `@theme` tokens (invoke frontend-design skill — do not ship default-Tailwind gray).
**Done when:** all 4 tab routes render placeholder pages with chrome; build green.

### T7 — Places tab

**Files:** `app/page.tsx`, `app/components/places/PlaceCard.tsx`, `app/components/places/PlaceFilters.tsx`.
**Depends:** T5, T6
**Deliverable:** All-places list (name, status badge, cuisine/city, avg score if rated), search box, filter chips (status / category / cuisine), empty state onboarding ("Add your first place"). Tap → `/places/[id]`.
**Done when:** filters compose (search+status+category), empty + populated states verified in browser.

### T8 — Add-place flow + OSM lookup

**Files:** `app/components/places/PlaceForm.tsx`, `app/api/lookup/route.ts`, `lib/lookup.ts`, `lib/lookup.test.ts`.
**Depends:** T3, T5, T6
**Produces:** `GET /api/lookup?q=` → Nominatim proxy (User-Agent header, `revalidate: 3600`, max 5 results) → `searchPlaces(q): Promise<LookupResult[]>`; `LookupResult = { name, address?, city?, lat, lng }`, zod-checked, malformed → `[]`, network fail → `[]` (form stays manual).
**Deliverable:** FAB opens PlaceForm sheet: name → optional lookup autofill → status toggle → category checkboxes → if `been`, inline 1–5 RatingRows per criterion (skippable) → save via repo. ~15s happy path.
**Done when:** place creatable fully offline (manual) and via lookup; lookup failure degrades silently; tests cover response parsing/rejection.

### T9 — Place detail + rating editor

**Files:** `app/places/[id]/page.tsx`, `app/components/places/RatingEditor.tsx`.
**Depends:** T5, T6
**Deliverable:** Detail page: info block, per-category score chips, ratings section (tap to open RatingEditor sheet: RatingRow per criterion, tap-to-set, tap-again-to-clear), categories editor, visit list, "Log visit" button (opens T11's VisitForm), edit/delete (tombstone + confirm) actions. Marking `want_to_try` place as `been` prompts rating.
**Done when:** rating changes reflect instantly in composite scores everywhere (liveQuery), delete returns to list.

### T10 — Lists (categories) tab + weights editor

**Files:** `app/categories/page.tsx`, `app/categories/[id]/page.tsx`, `app/components/categories/CategoryForm.tsx`, `app/components/categories/WeightsEditor.tsx`.
**Depends:** T4, T5, T6
**Deliverable:** Category cards (name, emoji, place count) + create/edit/delete; category view with **Ranked** section (rank #, tie marker, score to 1 decimal) and **Want to try** section; WeightsEditor sheet (per-criterion weight steppers, default 1) — rankings recompute live on save.
**Done when:** weight change visibly reorders ranked list; ties render `#N =`.

### T11 — Journal tab + visit form

**Files:** `app/journal/page.tsx`, `app/components/visits/VisitForm.tsx`, `app/components/visits/VisitCard.tsx`.
**Depends:** T5, T6
**Deliverable:** Reverse-chron visit feed grouped by date (place name, dishes, notes; tap → place detail); VisitForm sheet (place picker when opened from Journal, fixed place from detail page; date defaults today; dishes; notes; optional "adjust ratings?" nudge linking to RatingEditor).
**Done when:** visit creatable from both entry points; feed updates live; most-recent-visit tie-breaking in categories reflects new visits.

### T12 — Settings: criteria editor + storage status

**Files:** `app/settings/page.tsx`, `app/components/settings/CriteriaEditor.tsx`.
**Depends:** T5, T6
**Deliverable:** Criteria list (rename inline, add, delete-with-confirm noting "existing scores for this criterion stop counting"), reorder via sortOrder up/down; storage panel (`navigator.storage.estimate()` usage + `persist()` status, request persistence button if not granted; also call `persist()` best-effort on app load in layout); app version/about.
**Done when:** criterion add/rename/delete flows through to rating rows and scores live.

### T13 — Backup export/import

**Files:** `lib/backup.ts`, `lib/backup.test.ts`, `app/components/settings/BackupPanel.tsx` (wired into `/settings`).
**Depends:** T3 (lib), T12 (panel placement — UI wiring may land with/after T12)
**Produces:**
```ts
exportBackup(): Promise<Blob>; // { app: "savor", schemaVersion, exportedAt, places, criteria, categories, visits } incl. tombstones
parseBackup(json: unknown): Backup;            // zod, throws BackupValidationError
importBackup(b: Backup): Promise<void>;        // destructive replace, single transaction
summarizeBackup(b: Backup): string;            // "42 places, 3 categories, 17 visits"
```
**Deliverable:** Export downloads `savor-backup-YYYY-MM-DD.json`; import validates FIRST, shows summary confirm, then replaces atomically.
**Done when:** round-trip test (export → wipe → import → deep-equal); malformed/wrong-app JSON rejected before any write.

### T14 — PWA polish, Vercel deploy, device verification

**Files:** `public/manifest.webmanifest`, icons, `app/layout.tsx` metadata touch-ups, `README.md` (setup/deploy notes), `CLAUDE.md` (architecture tree + conventions, pantry-keeper style).
**Depends:** all
**Deliverable:** Installable PWA (name savor, theme color, icons 192/512 + apple-touch); connect repo to Vercel project + production deploy; Playwright pass at iPhone viewport over every flow: add (manual + lookup) → rate → category ranking with weight change → visit log → criteria edit → backup round-trip; safe-area/keyboard behavior checked.
**Done when:** production URL live and flows verified on it; docs committed.

---

## Self-review notes

- Spec coverage: §2 scope → T7–T13; §3 architecture → T1–T6; §4 data model → T2; §5 ranking → T4/T10; §6 nav/flows → T6–T11; §7 safety → T3 (tombstones), T12 (persist), T13 (backup); §8 testing → tests folded into each lib task; §9 deploy → T14.
- Deliberately deferred (per spec §2): cloud sync, photos, sharing, service worker, manual tie-break, auth.
- Type/name consistency pinned in **Produces** blocks — workers must use those exact signatures.
