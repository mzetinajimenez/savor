# Share-a-link → add-place — Implementation Plan (Tier 0 + TikTok caption)

> **Read first:** `docs/research/social-link-place-import.md` (the research + decisions).
> This plan implements **Tier 0** (share/paste a link → prefilled add-place sheet) plus the
> **TikTok oEmbed caption → name guess** slice of Tier 1, behind one shared adapter interface.

**Goal:** When the user shares an Instagram/TikTok link to savor (Android) or pastes one
(iOS/anywhere), open the existing add-place sheet **prefilled** — venue-name guess seeded into
the lookup box, the permalink stored as the place's source — and let the user confirm the
geocode match and save. **No auto-add; no OAuth for any platform.**

**Locked decisions (from research §9):**
- ✅ **Prefill + confirm**, never silent auto-add.
- ✅ **Android** = Web Share Target; **iOS** = paste-a-link fallback (both hit the same seam).
- ✅ **No OAuth / no login** on either platform.
- TikTok caption comes from the **public oEmbed** endpoint (no token). Instagram is URL-only
  in v1 (its oEmbed has no caption and needs App Review — deferred).

**Architecture:** per-platform adapters in `lib/social/` behind one `resolveSharedLink(url)
→ SharedLink`. The `/import` route and `PlaceForm` only ever see `SharedLink`. Mirrors savor's
existing `lib/repo.ts` write seam and `app/api/lookup` proxy pattern.

## Global constraints (apply to every task)

- TypeScript `strict`; path alias `@/*` → repo root. **No new npm dependencies** (research
  and CLAUDE.md both forbid it — zod + built-ins only).
- Reads through `lib/hooks.ts`, writes through `lib/repo.ts`; components never import Dexie.
- **Additive, non-destructive** data change only: new optional `Place` fields, **no index**,
  therefore **no `SCHEMA_VERSION` bump** and **no new `db.version(N)` block**. (Avoiding the
  bump sidesteps the `parseBackup` exact-version blocker — see research §7.)
- Keep `lib/types.ts` ↔ `lib/repo.ts` `placeFields` in sync (add the field to both).
- Framework-free `lib/social/*` (except nothing DOM-y) so it's Vitest-testable with the
  existing setup; new logic gets a test alongside it.
- Outbound fetch (TikTok oEmbed) goes through a **Node API route**, never the browser — same
  rule as the Nominatim proxy.
- Cellar tokens only in any UI; ≥44px touch targets; `text-base` inputs.
- **Green before every commit:** `npm test`, `npm run build`, `npm run lint` all pass.
  Conventional-commit messages, logical chunks, explicit `git add` paths.

## Execution waves (parallelism map)

| Wave | Tasks | Notes |
|---|---|---|
| 1 | T1 (data model) | unblocks the write path; tiny |
| 2 | T2 (social types + parser), T3 (TikTok oEmbed proxy) | disjoint files, parallel |
| 3 | T4 (adapters + resolveSharedLink) | depends on T2, T3 |
| 4 | T5 (PlaceForm prefill contract) | depends on T1; disjoint from T4 |
| 5 | T6 (manifest share_target), T7 (`/import` route + iOS paste) | T7 depends on T4 + T5 |
| 6 | T8 (device verification) | manual, after everything |

---

### T1 — Data model: `Place.sourceUrl` + `Place.sourcePlatform`

**Files:** `lib/types.ts`, `lib/repo.ts`, `lib/repo.test.ts`

- `lib/types.ts`: add to `Place` (and thus flow through `PlaceInput`):
  ```ts
  sourceUrl?: string;
  sourcePlatform?: "instagram" | "tiktok";
  ```
- `lib/repo.ts` `placeFields`: add matching zod:
  ```ts
  sourceUrl: z.string().url().optional(),
  sourcePlatform: z.enum(["instagram", "tiktok"]).optional(),
  ```
  (Goes in the shared `placeFields` so create/update/backup all agree — the file's stated
  single-source-of-truth pattern.)
- **No `db.ts` change** — unindexed optional fields need no schema version block. Confirm the
  existing `places` store line is untouched.
- Test: `createPlace` round-trips both new fields; omitting them stays `undefined`;
  `updatePlace` can set them; a non-URL `sourceUrl` rejects.

**Acceptance:** new fields persist and read back; `SCHEMA_VERSION` still `1`; all existing
repo/backup tests green.

---

### T2 — `lib/social/` types + venue-name parser

**Files:** `lib/social/types.ts`, `lib/social/parse.ts`, `lib/social/parse.test.ts`

- `types.ts`:
  ```ts
  export type SocialPlatform = "instagram" | "tiktok";
  export interface SharedLink {
    platform: SocialPlatform;
    url: string;              // canonical permalink → Place.sourceUrl
    authorName?: string;      // "@account" if known
    captionText?: string;     // raw caption if the adapter could fetch it (TikTok)
    nameGuess?: string;       // best venue-name candidate (may be undefined)
  }
  export interface SocialAdapter {
    readonly platform: SocialPlatform;
    matches(url: string): boolean;
    hydrate(url: string): Promise<SharedLink>;
  }
  ```
- `parse.ts`: `guessVenueName(text: string): string | undefined` — framework-free.
  - v1 heuristics (keep small, all tested): strip URLs; prefer a `📍`/"at {Name}" line;
    else the first non-hashtag/non-mention clause; expose `@handle` as a fallback query
    (`@tacoseloax` → `tacos el oax`). Return `undefined` when nothing usable.
- Tests cover: caption with `📍`, "at X in Y", handle-only, hashtag soup ("BEST tacos in CDMX
  🔥" → undefined or city-less name, never fabricated coords), empty string.

**Acceptance:** parser is pure, deterministic, fully unit-tested; no DOM/React imports.

---

### T3 — TikTok oEmbed proxy route

**Files:** `app/api/tiktok-oembed/route.ts`

- Mirror `app/api/lookup/route.ts`: `runtime = "nodejs"`, GET `?url=`, validate it's a TikTok
  URL, `fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(url))` with
  `next: { revalidate: 3600 }`, map down to `{ authorName, title, thumbnailUrl }`, return JSON.
- Degrade like the lookup route: any failure → `502` with a small error body (caller treats as
  "no caption", never throws).
- No token, no User-Agent policy needed (public endpoint) — but keep the fetch server-side so
  the browser never calls TikTok directly.

**Acceptance:** valid TikTok URL returns `{ title, authorName, thumbnailUrl }`; junk/non-200
upstream returns 502; missing `url` returns 400.

---

### T4 — Adapters + `resolveSharedLink`

**Files:** `lib/social/instagram.ts`, `lib/social/tiktok.ts`, `lib/social/index.ts`,
`lib/social/index.test.ts`

- `instagram.ts`: `matches` = IG permalink regex (`/p/`, `/reel/`, `/{user}/`, `share/`
  wrapper). `hydrate` returns `{ platform:"instagram", url: canonical, captionText: undefined,
  nameGuess: undefined }` — URL-only (no network). Canonicalize = strip query/tracking params.
- `tiktok.ts`: `matches` = TikTok regex (`/@user/video/{id}`, `vm.`/`vt.` short). `hydrate`
  calls the T3 proxy (`/api/tiktok-oembed?url=`), zod-validates the response, sets
  `captionText = title`, `authorName`, then `nameGuess = guessVenueName(title)`. On proxy
  failure, degrade to URL-only (no throw).
- `index.ts`: `const adapters = [tiktokAdapter, instagramAdapter];`
  `resolveSharedLink(url): Promise<SharedLink | null>` → first adapter whose `matches` is true,
  else `null` (unknown link → still importable as a bare source URL by the caller).
- Tests: correct adapter selected per URL; TikTok hydrate maps oEmbed → nameGuess (mock fetch);
  unknown URL → null. (Client-side fetch mockable; keep zod validation of the proxy response.)

**Acceptance:** one call resolves any supported URL to a normalized `SharedLink`; adding a
future adapter needs no change above this file.

---

### T5 — PlaceForm prefill contract

**Files:** `app/components/ui.tsx`, `app/components/places/PlaceForm.tsx`

The current `emitAddPlace()` dispatches a **payload-less** `ADD_PLACE_EVENT`, and is wired as
`onClick={emitAddPlace}` (so the MouseEvent would leak in as an arg — guard against that).

- `ui.tsx`: extend to an optional typed payload:
  ```ts
  export interface PlacePrefill {
    name?: string;            // seeds the name / lookup box
    sourceUrl?: string;
    sourcePlatform?: SocialPlatform;
    autoLookup?: boolean;     // if true + name present, run the OSM lookup immediately
  }
  export function emitAddPlace(prefill?: PlacePrefill) {
    window.dispatchEvent(new CustomEvent(ADD_PLACE_EVENT, { detail: prefill }));
  }
  ```
  Fix the FAB wiring to `onClick={() => emitAddPlace()}` so a click never passes an event as
  prefill.
- `PlaceForm.tsx`:
  - `AddPlaceHost` reads `e.detail` into state and passes it as an `initial?: PlacePrefill`
    prop to `AddPlaceSheet` (still mount/unmount per open, so state stays clean).
  - `emptyForm()` seeds `name`, `sourceUrl`, `sourcePlatform` from `initial`.
  - If `initial.autoLookup && initial.name`, run `handleLookup()` once on mount (effect) so the
    user lands on the geocode picker — **still a confirm**, not an auto-save.
  - `handleSave` passes `sourceUrl`/`sourcePlatform` into `createPlace(...)`.
  - Default `status` for imported places: **`want_to_try`** when a prefill is present (you're
    saving something to try), else keep `been`.

**Acceptance:** existing FAB flow unchanged; `emitAddPlace({name, sourceUrl, autoLookup:true})`
opens the sheet with the name filled, lookup already run, source stored on save. Prefill+confirm
— never writes without the user tapping Save.

---

### T6 — Manifest: register the Web Share Target

**Files:** `public/manifest.webmanifest`

- Add:
  ```jsonc
  "share_target": {
    "action": "/import",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
  ```
- GET (navigable). No file handling in v1.

**Acceptance:** manifest validates; on an installed Android PWA, savor appears in the system
share sheet for a shared link.

---

### T7 — `/import` route (share target handler + iOS paste fallback)

**Files:** `app/import/page.tsx`

One client route serving both entry points:

- **Shared (Android):** on mount, read `url` / `text` / `title` from `searchParams`. The IG/TT
  URL sometimes rides in `text` rather than `url` — pull the first URL out of `text` if `url`
  is empty. Call `resolveSharedLink(bestUrl)`.
  - Resolved → `emitAddPlace({ name: link.nameGuess, sourceUrl: link.url,
    sourcePlatform: link.platform, autoLookup: !!link.nameGuess })`, then `router.replace("/")`
    so the prefilled sheet sits over the Places tab.
  - Unknown/no URL → still `emitAddPlace({ sourceUrl?: rawUrl })` (bare source), or show the
    paste UI below.
- **iOS / manual:** when there's no usable share param, render a minimal paste screen — one
  `text-base` input ("Paste an Instagram or TikTok link") + a "Find place" button that runs the
  exact same `resolveSharedLink → emitAddPlace` path. This is the documented iOS fallback.
- Keep it lightweight (a small "Importing…" state while `hydrate` awaits; Cellar tokens; safe
  areas). No new global chrome.

**Acceptance:** `/import?url=<tiktok>` opens the sheet with a name guess + geocode picker
already showing; `/import?url=<instagram>` opens with the source stored and the box ready to
type; visiting `/import` with no params shows the paste box; pasting a link does the same as
sharing.

---

### T8 — Device verification (manual)

- **Android/Chrome:** install PWA → share a TikTok food reel → savor appears → sheet opens with
  a name guess → confirm geocode → Save → place has `sourceUrl` + `sourcePlatform`.
- **Android:** share an Instagram reel → sheet opens, source stored, user types name → Save.
- **iOS/Safari:** confirm savor is *not* in the share sheet (expected) → open savor → `/import`
  paste box → paste link → same result.
- Verify a bad/expired link degrades to manual entry (no crash, no silent write).
- Confirm existing add-place FAB flow and all 125 tests still green.

**Acceptance:** both platforms reach a saved place via prefill+confirm; iOS via paste; no
regressions.

---

## Out of scope (explicitly, for v1)

- OAuth / login on either platform (research §2 — doesn't unlock shared posts).
- Instagram oEmbed thumbnail/attribution (needs Meta App Review; research Tier 2).
- Scraping captions/locations from page HTML (research §5 — terms + brittleness).
- POST/file share target (sharing a screenshot image) — future, if ever.
- Auto-add without confirmation.

## New surface area (summary)

`lib/social/{types,parse,instagram,tiktok,index}.ts` (+ tests) · `app/api/tiktok-oembed/route.ts`
· `app/import/page.tsx` · manifest `share_target` · 2 optional `Place` fields · a typed prefill
payload on the existing add-place event. **Geocoding, the form body, and the repo write path
are reused unchanged.**
