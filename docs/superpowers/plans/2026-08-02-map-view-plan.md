# Map view — Implementation Plan (Stages 1 & 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put savor's places on a map. `Place.lat` / `Place.lng` / `Place.osmId` have existed since `version(1)` and nothing reads them. Stage 1 ships a working, independently valuable map for every place that already has coordinates. Stage 2 makes it complete and safe: a persistence-gated tile cache with a hard cap, a Settings readout and clear button, a way to put coordinates *back* on a place that lost them, and spatial context on place detail.

**Architecture:** Source of truth is `docs/superpowers/specs/2026-08-02-map-view-design.md` — MapLibre GL JS + Protomaps hosted vector tiles, stock `dark` flavor, lazy-loaded from exactly one client component. Three new framework-free modules carry the logic and the tests: `lib/mapStyle.ts` (style JSON + key/URL assembly, shared by the map tab and the detail header so the two basemaps cannot drift), `lib/mapBounds.ts` (fit-bounds math and the pinned/pinless partition), `lib/tileCache.ts` (cap, LRU eviction, cache-key derivation). One thin DOM wrapper, `lib/tileCacheStore.ts`, is the only thing that touches the Cache API. The React surface is `PlacesMap.tsx` (the single MapLibre importer), a `MapView.tsx` `next/dynamic` shell, a List/Map segmented toggle driven by `?view=map`, a non-modal selection card, a pinless-places sheet, and a Settings panel. **No schema change**: `lat`/`lng`/`osmId` already exist, so there is no `db.version(N)` block, no `SCHEMA_VERSION` bump, and no interaction with the backup-migration fast-follow. Writes go through `repo.updatePlace` only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind v4 with the Supper Club `@theme` tokens, Vitest (+ fake-indexeddb) for `lib/`. **New runtime dependencies:** `maplibre-gl`, `@protomaps/basemaps` (and `pmtiles` only if Task 1 Step 2's endpoint check shows it is required).

## Global Constraints

Copied forward from `CLAUDE.md` and the ADR. Every task's requirements implicitly include this section.

- **New dependencies are pre-approved for this plan only.** `maplibre-gl` and `@protomaps/basemaps` (plus `pmtiles` if Task 1 Step 2 determines the tile endpoint needs it) are the call the ADR itself made (§3, measured 281 KB gzipped, lazy-loaded, one importer). Do **not** re-ask permission for these. Any *other* package still falls under CLAUDE.md's "ask before adding dependencies" rule.
- **Green before every commit:** `npm test`, `npm run build`, `npm run lint` all pass. CLAUDE.md's test count (261 tests in 14 files today) gets updated by the final docs task of each stage.
- **Direct to `main`**, conventional-commit messages, staging explicit paths — never `git add -A`.
- **The storage seam is absolute.** No component imports `dexie` or `@/lib/db`. Reads go through `use*` hooks in `lib/hooks.ts`; **`lib/repo.ts` is the only write path**. The map's only write is `repo.updatePlace` (Task 11). Nothing in this plan adds a second write path, and the Cache API is a different bucket entirely — it cannot touch IndexedDB (ADR §4.2).
- **No schema change.** No new `db.version(N)`, no `SCHEMA_VERSION` bump, no change to the backup format.
- **Supper Club tokens only** — no raw hex, no off-palette Tailwind colours anywhere under `app/`. `lib/theme-contract.test.ts` reads `app/**/*.tsx` and fails the build otherwise. MapLibre's own stylesheet lives in `node_modules` and is not scanned, but any override we write **is** — the scrim and the attribution restyle use token opacity modifiers (`from-ground-deep/70`), never `rgba()`.
- **Gold is yes, coral is careful.** Gold seals for `been` pins, hollow cream ring for `want_to_try`. **Coral appears nowhere on the map** — it stays destructive-and-error only.
- **Contrast is a property of the pair.** On `bg-raised` (sheets, the selection card) secondary text must be `cream` or `cream/80`, never `sage` and never `cream/60`. Text on gold is `text-ground`, never white.
- **Rounding:** `0` default; `rounded-sm` for inputs/chips/sheets/buttons/the selection card; `rounded-full` only for the score seal and small circular indicators — which is exactly what a map pin is, so `rounded-full` on pins is correct and in-convention.
- **≥44px touch targets** on every interactive control, including map pins, the locate button, the segmented toggle, and the selection card's close ✕. Tap area may exceed the visual size.
- **`?sheet=<name>` is for sheets and goes through `useSheetParam`.** `?view=map` is a **new, separate pattern**: a plain view toggle, not a sheet and not a route. It is read with `useSearchParams()` and written with `router.replace` (never `pushState`, never `history.back()`), exactly like the existing `?city=` / `?tab=` filters on `app/categories/[id]/page.tsx`. It **must not** go through `useSheetParam`, which is built to push and consume history entries. `withoutSheet()` preserves every other param, so the cold-load `?sheet=` strip leaves `?view=map` alone — verify that (Task 6 Step 5).
- **No entity id ever enters the query string.** The selected place on the map is local state; the URL carries `view=map` and nothing else.
- **Any component calling `useSearchParams()` needs a `<Suspense>` boundary** or `next build` fails. `app/page.tsx` gains one in Task 6.
- **Overlays use `Sheet` + `useModalA11y`; sheets mount/unmount.** The pinless-places sheet (Task 11) follows this. The **selection card deliberately does not** — it is not modal and must not trap focus (ADR §6).
- **Framework-free `lib/`.** `lib/mapStyle.ts`, `lib/mapBounds.ts`, `lib/tileCache.ts` hold no React and no DOM, and each gets a Vitest suite. `lib/tileCacheStore.ts` is the deliberate exception — a thin Cache API wrapper with no logic of its own, verified in a browser rather than by unit test, in the same spirit as `lib/useModalA11y.ts`.
- **Attribution is not dismissible.** "Protomaps © OpenStreetMap" renders on the map tab and on the detail header (ADR §9), the same ODbL obligation savor already carries for Photon.
- **`navigator.vibrate()` is Android-only** and stays feature-guarded. Nothing here adds a call.
- **CORS is the failure mode to watch for.** A third-party bucket that denies the preflight produces a *silently blank* map, not an error (ADR §3.1). `curl` will not reproduce it — every tile-source check is a browser check with the Network tab open.

## Blocked on the user — read before starting

**The Protomaps account and origin-restricted API key do not exist yet** (ADR §12 open item #1). Exactly one step in this plan cannot be done by an agent:

> **Task 1, Step 4 — obtain the Protomaps key.** The user must create a Protomaps account, generate an API key, restrict it to savor's production origin, and put it in `.env.local` as `NEXT_PUBLIC_PROTOMAPS_API_KEY` (and in the Vercel project's environment for the deployed build). Local development is exempt from the origin restriction, so the same key works on `localhost`.

Everything else is built to be implementable and unit-testable **without** the key:

- `lib/mapStyle.ts` returns `null` when the key is absent, and `PlacesMap` renders an honest "Map unavailable" state instead of a blank canvas. This is deliberate: §3.1's whole lesson is that a broken tile path must not look like an empty map.
- Every automated gate (`npm test`, `npm run build`, `npm run lint`) passes with no key set.
- Manual verification steps that require **real tiles on screen** are marked **MANUAL (needs key)**. They are the only work that stalls. Manual steps that only need the app running are marked **MANUAL**.

If the key is still missing when a task is reached, implement it, run the automated gates, commit, and record the deferred manual checks in the task's commit message — do not fake or skip the check silently.

## File Structure

**Created — Stage 1:**
- `lib/mapStyle.ts` — Protomaps tile URL assembly, API-key read, MapLibre style JSON from `@protomaps/basemaps`' stock `dark` flavor. Framework-free, DOM-free. One source of truth for the basemap, shared by the map tab and the detail header.
- `lib/mapStyle.test.ts` — Vitest suite.
- `lib/mapBounds.ts` — pure camera math: pinned/pinless partition, coordinate validation, bounding box, padding, single-place case, everything-at-one-address case.
- `lib/mapBounds.test.ts` — Vitest suite.
- `app/components/places/MapView.tsx` — the `next/dynamic({ ssr: false })` shell + loading placeholder. The only module any page imports; keeps MapLibre out of every other route's bundle.
- `app/components/places/PlacesMap.tsx` — **the only module that imports `maplibre-gl`.** Owns the map instance, pins, selection, locate, attribution.
- `app/components/places/MapPin.tsx` — the pin's JSX (gold seal / hollow cream ring), portalled into a MapLibre marker element.
- `app/components/places/MapSelectionCard.tsx` — the non-modal selection card above the nav.
- `app/components/places/ViewToggle.tsx` — the List / Map segmented control.

**Created — Stage 2:**
- `lib/tileCache.ts` — cap, LRU eviction decisions, cache-key derivation. Pure.
- `lib/tileCache.test.ts` — Vitest suite.
- `lib/tileCacheStore.ts` — thin Cache API wrapper + the `savor-tiles://` MapLibre protocol handler. The only file that calls `caches`.
- `app/components/settings/MapCachePanel.tsx` — tile-cache usage readout + "Clear map cache".
- `app/components/places/PinlessPlacesSheet.tsx` — the "N places aren't on the map" sheet and the **Find location** flow.
- `app/components/places/PlaceHeaderMap.tsx` — the decorative, non-interactive place-detail header map.

**Modified:**
- `package.json` / `package-lock.json` — `maplibre-gl`, `@protomaps/basemaps` (± `pmtiles`).
- `.env.local` (user-managed, gitignored) — `NEXT_PUBLIC_PROTOMAPS_API_KEY`.
- `app/page.tsx` — Suspense wrapper, `?view=map` state, the toggle, List↔Map switch on one shared `usePlaces` result.
- `app/globals.css` — MapLibre control/attribution restyle in Supper Club tokens; map container overscroll containment.
- `app/settings/page.tsx` — a "Map cache" section mounting `MapCachePanel`.
- `app/places/[id]/page.tsx` — the header map slot, rendered only when the place has coordinates.
- `CLAUDE.md` — the `?view=` convention, the new modules, the updated test count, the tile-cache-cap fast-follow.

**`?sheet=` vocabulary added by this plan** (extends the Phase 4 table; still no ids, ever):

| Route | Param | Sheet |
| --- | --- | --- |
| `/` | `?sheet=pinless` | PinlessPlacesSheet (Task 11) |

`/` already leaves `?sheet=add` to the global `AddPlaceHost`; `pinless` cannot collide with it.

---
---

# STAGE 1 — The map exists

Ships a working map for every place that already has coordinates. **Deliberately carries no tile cache**: until §4.2's safeguards exist (Stage 2), savor must not write tiles into an origin it shares with the user's data.

---

### Task 1: Dependencies, the API key, and the shared basemap style

`lib/mapStyle.ts` is the single source of truth for the basemap so the map tab and the place-detail header cannot drift (ADR §8). It is also where the missing-key case is handled honestly, which is what makes every later task implementable before the user has an account.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/mapStyle.ts`
- Test: `lib/mapStyle.test.ts`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_PROTOMAPS_API_KEY`.
- Produces:
  - `PROTOMAPS_TILE_URL: string` — the `{z}/{x}/{y}` template, key-free
  - `MAP_FLAVOR = "dark"`
  - `protomapsApiKey(): string | null`
  - `tileUrlTemplate(key: string, scheme?: string): string`
  - `mapStyle(key: string | null, opts?: { scheme?: string }): StyleSpecification | null`
  - `MAP_ATTRIBUTION: string`

- [ ] **Step 1: Install the dependencies**

```bash
npm install maplibre-gl @protomaps/basemaps
```

Pre-approved by the ADR — do not stop to ask. Confirm the versions land in `dependencies` (not `devDependencies`) and that `package-lock.json` updates.

- [ ] **Step 2: Confirm the tile endpoint shape (and whether `pmtiles` is needed)**

Read the current Protomaps hosted-API docs and pin **one** of these, recording the choice in `lib/mapStyle.ts`'s header comment:

- **z/x/y vector tiles** — `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=…`, consumed by a plain MapLibre `vector` source with a `tiles` array. **No `pmtiles` dependency required.** This is the expected outcome.
- **A hosted PMTiles archive** — requires `npm install pmtiles` and `maplibregl.addProtocol("pmtiles", …)`. Pre-approved if the docs say this is the only hosted path.

Whichever is chosen, the URL must be a template built by `tileUrlTemplate()`, never a literal spread across files — ADR §4 notes that moving to a self-hosted extract later is meant to be a config change, not a rewrite. The rest of this plan assumes the z/x/y case; if PMTiles wins, only `mapStyle()`'s `sources` block and Task 9's protocol wrapper change shape.

- [ ] **Step 3: Write the failing test**

Create `lib/mapStyle.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAP_ATTRIBUTION,
  MAP_FLAVOR,
  mapStyle,
  protomapsApiKey,
  tileUrlTemplate,
} from "./mapStyle";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("protomapsApiKey", () => {
  it("is null when the env var is unset — local dev without an account is a supported state", () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOMAPS_API_KEY", "");
    expect(protomapsApiKey()).toBeNull();
  });

  it("is null for a whitespace-only value", () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOMAPS_API_KEY", "   ");
    expect(protomapsApiKey()).toBeNull();
  });

  it("returns the trimmed key when set", () => {
    vi.stubEnv("NEXT_PUBLIC_PROTOMAPS_API_KEY", " abc123 ");
    expect(protomapsApiKey()).toBe("abc123");
  });
});

describe("tileUrlTemplate", () => {
  it("keeps the {z}/{x}/{y} placeholders intact for MapLibre to substitute", () => {
    const url = tileUrlTemplate("abc123");
    expect(url).toContain("{z}");
    expect(url).toContain("{x}");
    expect(url).toContain("{y}");
  });

  it("carries the key as a query param", () => {
    expect(new URL(tileUrlTemplate("abc123")).searchParams.get("key")).toBe("abc123");
  });

  it("percent-encodes a key with URL-hostile characters", () => {
    expect(tileUrlTemplate("a b&c")).toContain("key=a%20b%26c");
  });

  it("prefixes a custom scheme when one is given (the Stage 2 cache protocol)", () => {
    expect(tileUrlTemplate("abc123", "savor-tiles")).toBe(
      `savor-tiles://${tileUrlTemplate("abc123")}`
    );
  });
});

describe("mapStyle", () => {
  it("is null without a key, so callers render an honest 'unavailable' state", () => {
    expect(mapStyle(null)).toBeNull();
  });

  it("produces a v8 style with a tile source carrying the key", () => {
    const style = mapStyle("abc123");
    expect(style).not.toBeNull();
    expect(style!.version).toBe(8);
    expect(JSON.stringify(style!.sources)).toContain("abc123");
  });

  it("uses the stock dark flavor and has layers", () => {
    expect(MAP_FLAVOR).toBe("dark");
    expect(mapStyle("abc123")!.layers.length).toBeGreaterThan(0);
  });

  it("carries glyphs, so labels render rather than silently vanishing", () => {
    expect(mapStyle("abc123")!.glyphs).toBeTruthy();
  });

  it("threads the custom scheme through to the source", () => {
    const style = mapStyle("abc123", { scheme: "savor-tiles" });
    expect(JSON.stringify(style!.sources)).toContain("savor-tiles://");
  });

  it("states the ODbL attribution the map must show", () => {
    expect(MAP_ATTRIBUTION).toContain("Protomaps");
    expect(MAP_ATTRIBUTION).toContain("OpenStreetMap");
  });
});
```

- [ ] **Step 4: 🔒 BLOCKED ON USER — obtain the Protomaps key**

**This step cannot be performed by an agent.** The user must:

1. Create a Protomaps account and generate an API key.
2. Restrict the key to savor's production origin. Local development is exempt from the origin restriction, so the same key works on `localhost`.
3. Add it to `.env.local` (already gitignored) as `NEXT_PUBLIC_PROTOMAPS_API_KEY=…`.
4. Add the same variable to the Vercel project's environment for the deployed build.

`NEXT_PUBLIC_` is correct and deliberate: an origin-restricted key is *designed* to ship in the client, which is precisely what buys savor a tile path with no proxy, no function cost, and no added latency (ADR §4). This is a different situation from `app/api/lookup/route.ts`, which proxies because it owns a `User-Agent` and an IP bias, not because of a secret.

**If the key is not available yet: continue.** Steps 5–7 and every later task work without it; only the **MANUAL (needs key)** checks stall.

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run lib/mapStyle.test.ts`
Expected: FAIL — "Failed to resolve import ./mapStyle".

- [ ] **Step 6: Write the implementation**

Create `lib/mapStyle.ts`:

```ts
// The one and only definition of savor's basemap.
//
// Both map surfaces — the Places-tab map and the place-detail header — build their style
// from here, so the two screens cannot drift apart (see the design spec §8). Framework-free
// and DOM-free: this returns plain JSON, and app/components/places/PlacesMap.tsx is the only
// module that imports maplibre-gl itself.
//
// Stock `dark` flavor, deliberately not a Supper Club basemap. Gold score seals need a
// neutral surface to sit on; on a bottle-green ground the pins compete with the map for the
// same hue. savor's identity stays in the chrome around the map.
//
// TILE SOURCE: Protomaps hosted API with an ORIGIN-RESTRICTED key. The key is public by
// design — that is what buys a tile path with no proxy, no function cost and no latency.
// Local dev is exempt from the origin restriction. With NO key at all, mapStyle() returns
// null and the caller renders an explicit "map unavailable" state: a broken tile path must
// never look like an empty map (a third-party bucket that denies the CORS preflight paints
// exactly that, and it is the single most misleading failure in this feature).

import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export const MAP_FLAVOR = "dark";

/** Key-free template. Never inline this URL anywhere else — swapping to a self-hosted
 *  extract later is meant to be a one-line change here, not a rewrite. */
export const PROTOMAPS_TILE_URL = "https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt";

const GLYPHS_URL = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const SPRITE_URL = `https://protomaps.github.io/basemaps-assets/sprites/v4/${MAP_FLAVOR}`;

/** ODbL requires visible attribution — the same obligation savor already carries for Photon.
 *  It is rendered by MapLibre's AttributionControl and is not dismissible. */
export const MAP_ATTRIBUTION =
  '<a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a> © <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap</a>';

const SOURCE_NAME = "protomaps";

/** The origin-restricted key, or null when none is configured (local dev without an account). */
export function protomapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_PROTOMAPS_API_KEY?.trim();
  return key ? key : null;
}

/**
 * The tile URL template with the key attached, optionally behind a custom MapLibre protocol
 * scheme (Stage 2's `savor-tiles://` Cache-API-backed handler).
 */
export function tileUrlTemplate(key: string, scheme?: string): string {
  const url = `${PROTOMAPS_TILE_URL}?key=${encodeURIComponent(key)}`;
  return scheme ? `${scheme}://${url}` : url;
}

/** The full MapLibre style, or null when there is no key to build one with. */
export function mapStyle(
  key: string | null,
  opts: { scheme?: string } = {}
): StyleSpecification | null {
  if (!key) return null;
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL,
    sources: {
      [SOURCE_NAME]: {
        type: "vector",
        tiles: [tileUrlTemplate(key, opts.scheme)],
        maxzoom: 15,
        attribution: MAP_ATTRIBUTION,
      },
    },
    layers: layers(SOURCE_NAME, namedFlavor(MAP_FLAVOR), { lang: "en" }),
  } as StyleSpecification;
}
```

Adjust the glyph/sprite URLs and the `layers()` signature to whatever the installed `@protomaps/basemaps` version actually documents — the assertions in Step 3 are written loosely (non-empty layers, truthy glyphs) precisely so a version difference does not require rewriting the test.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run lib/mapStyle.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 8: Verify the whole suite and the build still pass**

Run: `npm test && npm run build && npm run lint`
Expected: all pass. `maplibre-gl` is only type-imported so far, so no bundle grows yet.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json lib/mapStyle.ts lib/mapStyle.test.ts
git commit -m "feat(map): Protomaps dark basemap style + origin-restricted key wiring"
```

---

### Task 2: Fit-bounds math and the pinned/pinless partition

Every camera decision the map makes is a number, and numbers belong in `lib/` where they can be checked without a browser. The partition lives here too — the map consumes **the same `usePlaces` result the list does** and splits it (ADR §7), so this function is the split, not a second query.

**Files:**
- Create: `lib/mapBounds.ts`
- Test: `lib/mapBounds.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Coord = { lat: number; lng: number }`
  - `type MapCamera = { kind: "center"; center: [number, number]; zoom: number } | { kind: "bounds"; bounds: [[number, number], [number, number]]; padding: number; maxZoom: number }`
  - `FIT_PADDING = 48`, `MAX_FIT_ZOOM = 15`, `SINGLE_PLACE_ZOOM = 15`, `SAME_SPOT_EPSILON = 1e-5`
  - `hasCoords<T>(item: T & { lat?: number; lng?: number }): boolean`
  - `partitionByCoords<T extends { lat?: number; lng?: number }>(items: T[]): { pinned: (T & Coord)[]; pinless: T[] }`
  - `boundsOf(coords: Coord[]): [[number, number], [number, number]] | null`
  - `cameraFor(coords: Coord[]): MapCamera | null`

- [ ] **Step 1: Write the failing test**

Create `lib/mapBounds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FIT_PADDING,
  MAX_FIT_ZOOM,
  SINGLE_PLACE_ZOOM,
  boundsOf,
  cameraFor,
  hasCoords,
  partitionByCoords,
} from "./mapBounds";

const austin = { lat: 30.2672, lng: -97.7431 };
const dallas = { lat: 32.7767, lng: -96.797 };

describe("hasCoords", () => {
  it("accepts a real pair", () => {
    expect(hasCoords(austin)).toBe(true);
  });

  it("rejects a missing half — a place with one coordinate is not placeable", () => {
    expect(hasCoords({ lat: 30.2672 })).toBe(false);
    expect(hasCoords({ lng: -97.7431 })).toBe(false);
    expect(hasCoords({})).toBe(false);
  });

  it("rejects non-finite and out-of-range values rather than sending MapLibre somewhere absurd", () => {
    expect(hasCoords({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(hasCoords({ lat: Number.POSITIVE_INFINITY, lng: 0 })).toBe(false);
    expect(hasCoords({ lat: 91, lng: 0 })).toBe(false);
    expect(hasCoords({ lat: 0, lng: 181 })).toBe(false);
  });

  it("accepts a legitimate 0,0 rather than treating falsy as absent", () => {
    expect(hasCoords({ lat: 0, lng: 0 })).toBe(true);
  });
});

describe("partitionByCoords", () => {
  it("splits placeable from unplaceable, preserving input order in both halves", () => {
    const items = [
      { id: "a", ...austin },
      { id: "b" },
      { id: "c", ...dallas },
      { id: "d", lat: 1 },
    ];
    const { pinned, pinless } = partitionByCoords(items);
    expect(pinned.map((p) => p.id)).toEqual(["a", "c"]);
    expect(pinless.map((p) => p.id)).toEqual(["b", "d"]);
  });

  it("returns two empty arrays for an empty input", () => {
    expect(partitionByCoords([])).toEqual({ pinned: [], pinless: [] });
  });
});

describe("boundsOf", () => {
  it("is null for no coordinates", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("returns [[west, south], [east, north]] — MapLibre's corner order", () => {
    expect(boundsOf([austin, dallas])).toEqual([
      [-97.7431, 30.2672],
      [-96.797, 32.7767],
    ]);
  });

  it("is a degenerate box for a single point", () => {
    expect(boundsOf([austin])).toEqual([
      [austin.lng, austin.lat],
      [austin.lng, austin.lat],
    ]);
  });
});

describe("cameraFor", () => {
  it("is null with nothing to show, so the caller leaves the camera alone", () => {
    expect(cameraFor([])).toBeNull();
  });

  it("centers on a single place rather than fitting a zero-area box", () => {
    expect(cameraFor([austin])).toEqual({
      kind: "center",
      center: [austin.lng, austin.lat],
      zoom: SINGLE_PLACE_ZOOM,
    });
  });

  it("centers when every place is at the same address — a zero-area fit would zoom to infinity", () => {
    const camera = cameraFor([austin, { ...austin }, { ...austin }]);
    expect(camera?.kind).toBe("center");
  });

  it("still centers when the spread is below the epsilon (two units in one building)", () => {
    const camera = cameraFor([austin, { lat: austin.lat + 1e-7, lng: austin.lng + 1e-7 }]);
    expect(camera?.kind).toBe("center");
  });

  it("fits a real spread, with padding and a zoom ceiling", () => {
    const camera = cameraFor([austin, dallas]);
    expect(camera).toEqual({
      kind: "bounds",
      bounds: [
        [-97.7431, 30.2672],
        [-96.797, 32.7767],
      ],
      padding: FIT_PADDING,
      maxZoom: MAX_FIT_ZOOM,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/mapBounds.test.ts`
Expected: FAIL — "Failed to resolve import ./mapBounds".

- [ ] **Step 3: Write the implementation**

Create `lib/mapBounds.ts`:

```ts
// Camera math for the map view, and the pinned/pinless split that feeds it.
//
// Framework-free on purpose: the degenerate cases are the whole design here — one place, and
// several places at the same address — and a zero-area fitBounds zooms to the maximum, which
// on a vector basemap means a screenful of one building's outline. Both resolve to a fixed
// center+zoom instead.
//
// partitionByCoords lives here rather than in a query: the map consumes the SAME usePlaces
// result the list does and splits it in the component. A second DB query is exactly the bug
// commit 393cdfe fixed for category city chips — a superset query disagreeing with what was
// actually rendered. One shared result makes List↔Map disagreement unrepresentable.

export type Coord = { lat: number; lng: number };

export type MapCamera =
  | { kind: "center"; center: [number, number]; zoom: number }
  | {
      kind: "bounds";
      bounds: [[number, number], [number, number]];
      padding: number;
      maxZoom: number;
    };

/** Breathing room around a fitted box, in px — pins near an edge must not be half-cropped. */
export const FIT_PADDING = 48;

/** Never fit tighter than this: a two-places-one-block fit would otherwise land at max zoom. */
export const MAX_FIT_ZOOM = 15;

/** Street-level, for the single-place and everything-at-one-address cases. */
export const SINGLE_PLACE_ZOOM = 15;

/** ~1 m. Below this, a "spread" is measurement noise, not a spread. */
export const SAME_SPOT_EPSILON = 1e-5;

function validLat(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}

function validLng(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}

/** True only when BOTH halves are present, finite and in range. 0,0 is legitimate. */
export function hasCoords<T extends { lat?: number; lng?: number }>(item: T): boolean {
  return validLat(item.lat) && validLng(item.lng);
}

/** Splits a rendered list into what can be pinned and what cannot, order preserved in both. */
export function partitionByCoords<T extends { lat?: number; lng?: number }>(
  items: T[]
): { pinned: (T & Coord)[]; pinless: T[] } {
  const pinned: (T & Coord)[] = [];
  const pinless: T[] = [];
  for (const item of items) {
    if (hasCoords(item)) pinned.push(item as T & Coord);
    else pinless.push(item);
  }
  return { pinned, pinless };
}

/** [[west, south], [east, north]] — MapLibre's LngLatBounds corner order. Null when empty. */
export function boundsOf(coords: Coord[]): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { lat, lng } of coords) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [
    [west, south],
    [east, north],
  ];
}

/**
 * The camera to open on. Null when there is nothing to show — the caller must then leave the
 * map where it is rather than jumping to null island.
 *
 * Antimeridian-spanning collections (Fiji plus Samoa) fit the long way round. Not handled:
 * savor is a personal restaurant ledger, and the fix is a real projection concern that would
 * be untested speculation here.
 */
export function cameraFor(coords: Coord[]): MapCamera | null {
  const bounds = boundsOf(coords);
  if (!bounds) return null;
  const [[west, south], [east, north]] = bounds;
  if (east - west < SAME_SPOT_EPSILON && north - south < SAME_SPOT_EPSILON) {
    return {
      kind: "center",
      center: [(west + east) / 2, (south + north) / 2],
      zoom: SINGLE_PLACE_ZOOM,
    };
  }
  return { kind: "bounds", bounds, padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/mapBounds.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/mapBounds.ts lib/mapBounds.test.ts
git commit -m "feat(map): pure fit-bounds camera math + pinned/pinless partition"
```

---

### Task 3: The MapLibre client component (map shell, camera, attribution)

The one module in savor that imports `maplibre-gl`. Pins come in Task 5 — this task is the canvas, the camera, the attribution, and the no-key state, so the riskiest part (does the tile path actually work in a browser?) gets verified before any feature is layered on it.

**Files:**
- Create: `app/components/places/PlacesMap.tsx`
- Create: `app/components/places/MapView.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `mapStyle`, `protomapsApiKey`, `MAP_ATTRIBUTION` from `lib/mapStyle.ts` (Task 1); `cameraFor`, `partitionByCoords` from `lib/mapBounds.ts` (Task 2).
- Produces:
  - `PlacesMap(props: { places: Place[]; liveCriterionIds: Set<string> }): JSX.Element` — default export of `PlacesMap.tsx`
  - `MapView` — same props, default export of `MapView.tsx`, lazily loaded and SSR-disabled

- [ ] **Step 1: Write `PlacesMap.tsx`**

Rules this component is written to, all of which a reviewer should check:

- `"use client"`, and it imports `maplibre-gl` plus `maplibre-gl/dist/maplibre-gl.css` — **the only file in the repo that may.** Anything else needing a map imports `MapView`.
- The map instance lives in a ref, created in a `useEffect` with `[]` deps and **destroyed in that same effect's cleanup** (`map.remove()`), never in a `useMemo` paired with a separate cleanup — the same Strict Mode double-invoke trap `LookupCombobox.tsx`'s session ref documents at length. A `map.remove()`d instance is permanently dead; recreating it must be paired with creation.
- `const key = protomapsApiKey(); const style = mapStyle(key);` — when `style` is `null`, **return the unavailable state and never construct a map.** Copy: "Map unavailable" / "savor needs a map tile key to draw this. The list view has everything." on `bg-raised` with `text-cream`. This is the honest failure the ADR demands; it is also what makes local dev without a key a supported state rather than a blank rectangle.
- Attribution: `new maplibregl.AttributionControl({ compact: false, customAttribution: MAP_ATTRIBUTION })` added to the map. **Do not** add a `NavigationControl` — pinch and drag are the phone gestures, and buttons would crowd the selection card.
- Camera: compute `partitionByCoords(places).pinned` → `cameraFor(...)` and apply once on `load` (`map.fitBounds(bounds, { padding, maxZoom, animate: false })` or `map.jumpTo({ center, zoom })`). **Do not re-fit on every `places` change** — a filter chip tap must not yank the camera out from under a user who has panned somewhere. Re-fit only when the *map has not yet been moved by the user*, tracked with a `userMovedRef` set on `dragstart`/`zoomstart`. Null camera → leave the camera at its initial position and render the empty state overlay ("No places on the map yet").
- Container: `h-[calc(100dvh-…)]` under the sticky header and above the nav, with `overscroll-contain` so a map drag never scroll-chains the page. `touch-action` is MapLibre's own concern — do not fight it.
- Sizing: MapLibre measures its container on construction. Because this mounts inside a `next/dynamic` boundary the container is present, but add a `ResizeObserver`-free safety net — call `map.resize()` once on `load` — rather than debugging a half-height canvas later.

- [ ] **Step 2: Write `MapView.tsx`, the lazy shell**

```tsx
"use client";

// The only import path to the map. Everything MapLibre-shaped sits behind this next/dynamic
// boundary so no other route pays for the ~281 KB chunk: it is content-hashed and immutable,
// paid once per user per deploy, and shared between the Places-tab map and the place-detail
// header. ssr: false is required, not stylistic — MapLibre touches window at module scope.

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./PlacesMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-ground-deep"
      aria-busy="true"
    >
      <p className="text-sm text-sage">Loading map…</p>
    </div>
  ),
});

export default MapView;
```

- [ ] **Step 3: Restyle MapLibre's controls in Supper Club tokens**

MapLibre's stylesheet ships white control chrome that will look pasted-on. Add an override block to `app/globals.css` (a `.css` file, so it is outside `lib/theme-contract.test.ts`'s `app/**/*.tsx` scan — but use `var(--color-…)` anyway, because a raw hex here is exactly the drift the rule exists to prevent):

```css
/* MapLibre chrome in Supper Club tokens. The attribution is NOT dismissible — ODbL requires
   it visible, the same obligation savor already carries for Photon. Restyled, never hidden. */
.maplibregl-ctrl-attrib {
  background: var(--color-ground-deep);
  color: var(--color-cream);
  border-radius: var(--radius-sm);
  font-size: 0.6875rem;
}
.maplibregl-ctrl-attrib a {
  color: var(--color-cream);
  text-decoration: underline;
}
```

Confirm against the real rendered DOM which class names apply in the installed version, and keep the selector list minimal.

- [ ] **Step 4: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass, `lib/theme-contract.test.ts` included. Read the build's route table — `/` must not have grown; nothing imports `MapView` yet.

- [ ] **Step 5: MANUAL (needs key) — confirm tiles actually paint**

Deferred until Task 1 Step 4 is done. This check is deliberately impossible to satisfy by reading code — §3.1's CORS failure paints a *plausible-looking empty map*, and `curl` cannot reproduce it because it sends no `Origin`.

Temporarily render `<MapView places={[]} liveCriterionIds={new Set()} />` on `/` (or wait for Task 4 and do this check there). With `npm run dev -- -p 3001` and Chrome DevTools open:

1. The map paints actual streets and labels, not a flat charcoal rectangle.
2. **Network tab**: tile requests to `api.protomaps.com` return `200`, not `403` and not `(failed) CORS error`. Filter by `.mvt`.
3. **Console**: no CORS or style errors.
4. "Protomaps © OpenStreetMap" is visible in the corner and its links open.
5. Unset `NEXT_PUBLIC_PROTOMAPS_API_KEY`, restart dev, reload — the **"Map unavailable"** state renders, not a blank canvas and not a crash. Restore the key.

- [ ] **Step 6: Commit**

```bash
git add app/components/places/PlacesMap.tsx app/components/places/MapView.tsx app/globals.css
git commit -m "feat(map): lazy-loaded MapLibre canvas with camera fit and ODbL attribution"
```

---

### Task 4: The List / Map toggle and `?view=map`

`?view=map` is a **new URL convention alongside `?sheet=`** and does not go through `useSheetParam`. It is a view toggle, in the shape of the existing `?city=` / `?tab=` filters on `app/categories/[id]/page.tsx`: read with `useSearchParams()`, written with `router.replace(…, { scroll: false })` so toggling never grows the history stack. Search and the status/category/cuisine chips apply to **both** views — that is what makes "where should I eat" and "where have I been" one screen under a different filter rather than two features.

**Files:**
- Create: `app/components/places/ViewToggle.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `MapView` from `app/components/places/MapView.tsx` (Task 3).
- Produces: `ViewToggle(props: { view: "list" | "map"; onChange: (view: "list" | "map") => void }): JSX.Element`

- [ ] **Step 1: Build the segmented control**

Two buttons in a `bg-ground-deep` well with a `border border-rule`, `rounded-sm`. Active segment: `bg-gold-deep text-ground` (gold is yes). Inactive: `text-sage` on `ground-deep` — legal at 6.45:1. `role="group"` with `aria-label="View"`, each button `type="button"` with `aria-pressed`. **`min-h-11`** on both segments. `active:scale-[0.97]` to match every other control. No `rounded-full` — this is a control, not an indicator.

- [ ] **Step 2: Wrap `app/page.tsx` in Suspense and derive the view**

`app/page.tsx` has no boundary today and does not currently call `useSearchParams()`. Rename the default export to `PlacesInner` and add the wrapper, matching `app/categories/[id]/page.tsx:26-35`:

```tsx
export default function PlacesPage() {
  // The List/Map toggle reads ?view= via useSearchParams(), which makes this route dynamic
  // and requires a Suspense boundary around its caller or `next build` fails — same split as
  // app/categories/[id]/page.tsx.
  return (
    <Suspense fallback={null}>
      <PlacesInner />
    </Suspense>
  );
}
```

Inside `PlacesInner`:

```tsx
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ?view= is a VIEW TOGGLE, not a sheet: read here and written with router.replace, exactly
  // like ?tab= / ?city= on the category route. It deliberately does NOT go through
  // useSheetParam — that hook pushes a history entry and consumes it with history.back(),
  // which is right for a sheet you dismiss and wrong for a view you switch to and stay in.
  const view: "list" | "map" = searchParams.get("view") === "map" ? "map" : "list";

  function setView(next: "list" | "map") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "map") params.set("view", "map");
    else params.delete("view");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }
```

Any unrecognised `?view=` value falls through to `"list"` — a shared or hand-edited URL must degrade to the list, never to a broken screen.

- [ ] **Step 3: Render the toggle and switch the body**

Mount `<ViewToggle view={view} onChange={setView} />` inside `HeaderShell`'s children, **below** the search input and above `PlaceFilters` (both apply to both views). Show it only when `hasAnyPlaces` — a first-run user with zero places gets the onboarding `EmptyState`, not a toggle to an empty map.

Then branch the body on `view`, feeding the map **the same `places` value the list renders** — the already-filtered, already-cuisine-narrowed array. Not `allPlaces`, and emphatically not a new query:

```tsx
      {view === "map" && places ? (
        <div className="h-[calc(100dvh-14rem)] w-full overscroll-contain">
          <MapView places={places} liveCriterionIds={liveCriterionIds} />
        </div>
      ) : null}
```

Keep the two empty states (no places at all vs. filters excluding everything) applying to the list branch as they do today; the map branch renders its own in-canvas empty state from Task 3.

Measure the `14rem` against the real header + nav rather than trusting the number — the header is sticky with a safe-area top inset and `BottomNav` is `fixed` with `layout.tsx`'s `pb-[calc(8rem+env(safe-area-inset-bottom))]` beneath it.

- [ ] **Step 4: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass. `/` will now be reported as dynamic (`ƒ`) — expected and correct, same as the other `useSearchParams` routes.

- [ ] **Step 5: MANUAL — the toggle, the shared filter, and the param**

With `npm run dev -- -p 3001` on a mobile viewport:

1. Open the Places tab. The List/Map toggle is visible above the filter chips with List active.
2. Tap **Map** — the URL becomes `/?view=map`, the map mounts, the loading placeholder shows briefly. **(Tiles themselves are MANUAL (needs key).)**
3. Type in the search box and tap a status chip — both stay visible and keep working in map view.
4. Tap **List** — URL returns to `/`, the same set of places is listed. Toggle back and forth several times and press Back **once**: you leave the Places tab entirely. The toggle must not have stacked history entries.
5. Reload on `/?view=map` — it comes back in map view (a view is a destination; a sheet is not).
6. **Param coexistence:** on `/?view=map`, tap the FAB. The URL becomes `/?view=map&sheet=add`, the add-place sheet opens, Back closes the sheet and leaves `?view=map` intact. Then reload `/?view=map&sheet=add` directly: the cold-load strip removes `sheet` and keeps `view=map`.

- [ ] **Step 6: Commit**

```bash
git add app/components/places/ViewToggle.tsx app/page.tsx
git commit -m "feat(places): List/Map segmented toggle at ?view=map"
```

---

### Task 5: Pins and the selection card

**Files:**
- Create: `app/components/places/MapPin.tsx`
- Create: `app/components/places/MapSelectionCard.tsx`
- Modify: `app/components/places/PlacesMap.tsx`

**Interfaces:**
- Consumes: `partitionByCoords` from `lib/mapBounds.ts`; `compositeScore` / `formatScore` from `lib/ranking.ts`; `ScoreBadge` from `app/components/ui.tsx`.
- Produces:
  - `MapPin(props: { place: Place; score: number | null; selected: boolean }): JSX.Element`
  - `MapSelectionCard(props: { place: Place; score: number | null; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Render pins as React through a portal**

Each pinned place gets one `maplibregl.Marker` whose element is a bare `document.createElement("div")`, into which the component `createPortal`s a `<MapPin/>`. This is the point: pins are ordinary JSX, so they use Supper Club tokens and can reuse `ScoreBadge`, and Tailwind's source scanner sees literal class strings. **Do not** build class names by string concatenation on an imperatively-created element — Tailwind v4 generates only classes it can see as literals, and a dynamically-assembled `bg-${x}` silently renders unstyled.

Marker lifecycle: a `Map<placeId, Marker>` in a ref, reconciled in a `useEffect` keyed on the pinned array — add markers for new ids, `marker.remove()` for departed ids, `setLngLat` for moved ones. The effect's cleanup removes **all** markers. Filter chips change `places` constantly; a full teardown-and-rebuild every render would flicker.

Pin design, per ADR §6:
- `been` → the gold score seal: `rounded-full bg-gold text-ground` with the 1-decimal composite score. `rounded-full` is correct here — this is the score seal, its named exception. A `been` place with no contributing rating has a `null` score; render the seal with a `·` rather than `0`, since unranked is not zero.
- `want_to_try` → a hollow ring: `rounded-full border-2 border-cream bg-ground/70`, no fill, no number.
- **No coral anywhere.**
- Selected pin: a `ring-2 ring-cream` (or a scale bump), not a hue change — the gold/cream split already carries meaning.
- The visual pin can stay ~28px, but the marker element gets `min-h-11 min-w-11` with the visual centered inside it, so the tap target clears 44px without inflating the dot. Same trick as `Chip`.
- Each pin is a `<button type="button">` with an accessible name (`aria-label={place.name}`), not a `div` — pins are the map's only interactive content and must be reachable by keyboard and announceable.

- [ ] **Step 2: Selection state and deselection rules**

`const [selectedId, setSelectedId] = useState<string | null>(null)` in `PlacesMap`. Exactly one at a time.

- Pin tap → select. The pin's click handler must `stopPropagation` so the map's background handler does not immediately deselect it.
- `map.on("click", …)` on the background → deselect.
- **Panning must NOT deselect** — MapLibre distinguishes a drag from a click, so a background `click` handler is already correct; verify it by hand in Step 4.
- The card's ✕ → deselect.
- A place disappearing from `places` (a filter change) while selected → clear the selection in an effect rather than rendering a card for a place no longer on the map.

- [ ] **Step 3: The selection card**

`position: fixed`, above `BottomNav` (`bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`, measured against the real nav), `inset-x-4`, `bg-raised`, `border border-rule`, `rounded-sm`, `shadow-lg`, `z-20` (below the nav's `z-30`).

Content: name (`font-display`), cuisine · city (`text-cream/80` — **not** `sage`, which fails AA on `raised`), a `ScoreBadge`, and the status. The whole card body is a `next/link` to `/places/[id]`; the ✕ is a separate `<button>` with `min-h-11 min-w-11` and `aria-label="Close"`, so the nested-interactive trap is avoided by putting the ✕ outside the link, not inside it.

**Deliberately not a `Sheet`.** `Sheet` is modal and traps focus, which is wrong for something tapped while panning (ADR §6). Do not wire `useModalA11y`, do not add `aria-modal`. Escape deselecting is a reasonable convenience; a focus trap is not. Animate in with the existing `savor-toast`-style keyframe rather than inventing a new one, and respect the file's `prefers-reduced-motion` suppression.

- [ ] **Step 4: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass, `lib/theme-contract.test.ts` included (new `.tsx` files under `app/` are now in its scan — a stray hex in the pin styles fails here).

- [ ] **Step 5: MANUAL (needs key) — pins and selection on glass**

With `npm run dev -- -p 3001`, a mobile viewport with touch emulation, and at least three places with coordinates (add them via the FAB and pick a lookup suggestion) plus one `want_to_try`:

1. Toggle to Map. Every place with coordinates has a pin; the camera fits them all with visible margin.
2. `been` pins show a gold seal with the score; `want_to_try` pins are hollow cream rings. No coral anywhere on screen.
3. Tap a pin — the selection card rises above the nav with that place's name, cuisine/city and score. The pin shows as selected.
4. Tap a **different** pin — the card swaps. Never two cards.
5. **Pan the map with the card open — the card stays.** Tap the map background — it dismisses. Tap the ✕ — it dismisses.
6. Tap the card body — you land on `/places/[id]`. Press Back — you return to `/?view=map`.
7. Tap a status chip to filter to Want to try — the pin set narrows, and if the selected place was filtered out the card dismisses itself.
8. With a screen reader (VoiceOver rotor / Chrome accessibility tree): pins announce as buttons with the place name, and focus is **not** trapped when the card is open — Tab moves out of it into the page.

- [ ] **Step 6: Commit**

```bash
git add app/components/places/MapPin.tsx app/components/places/MapSelectionCard.tsx app/components/places/PlacesMap.tsx
git commit -m "feat(map): score-seal and want-to-try pins with a non-modal selection card"
```

---

### Task 6: The locate button

**Files:**
- Modify: `app/components/places/PlacesMap.tsx`

**Interfaces:**
- Consumes: `navigator.geolocation`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the control**

A `<button type="button" aria-label="Show my location">` floating over the canvas, top-right under the header, `min-h-11 min-w-11`, `rounded-sm bg-raised border border-rule text-cream`, `active:scale-[0.97]`, with a crosshair glyph in the style of `ui.tsx`'s existing inline SVGs (`stroke="currentColor"`, `aria-hidden`).

Non-negotiables from ADR §6:
- **Geolocation is requested on tap only, never on load.** No `useEffect` may call `getCurrentPosition`.
- **The position is never persisted** — not to Dexie, not to `localStorage`, not to the URL. It lives in component state for the lifetime of the mount and dies with it.
- Use `getCurrentPosition`, not `watchPosition`. A live tracking loop is a battery cost for no feature.

Behaviour: feature-detect `navigator.geolocation` and do not render the button at all when absent. On tap set a pending state (label/spinner), then on success `map.easeTo({ center: [longitude, latitude], zoom: 14 })` and drop a distinct **cream** dot marker (`rounded-full` — a small circular indicator, the other named exception) that is visually unmistakable against both pin styles. On failure `toast("Couldn't get your location", true)` — permission denied, timeout and unavailable all land there; the user does not need the distinction and the browser already explained a denial. Always clear the pending state in a `finally`.

- [ ] **Step 2: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 3: MANUAL — geolocation behaviour**

With `npm run dev -- -p 3001`:

1. Load the map. **No permission prompt appears.** (This is the check that matters most; watch for it before touching anything.)
2. Tap the locate button — the browser prompts. Allow. The map eases to your position and shows the cream dot.
3. Reload and tap again — with permission already granted there is no second prompt and it recenters.
4. In DevTools → Sensors, set location to "Location unavailable" and tap — a toast appears, the button returns to its resting state, the map does not move.
5. Deny permission in site settings, reload, tap — the same toast, no crash.
6. Confirm no key holding a latitude appears in Application → Local Storage / IndexedDB.

- [ ] **Step 4: Commit**

```bash
git add app/components/places/PlacesMap.tsx
git commit -m "feat(map): tap-only locate button (position never persisted)"
```

---

### Task 7: Record Stage 1 in CLAUDE.md

`?view=` is a new URL convention. Without a written rule, the next contributor reasonably reaches for `useSheetParam` or a `useState` and gets the history semantics wrong in one direction or the other. It goes in now, at the stage boundary, not at the end of Stage 2.

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes / Produces: nothing.

- [ ] **Step 1: Add the modules to the architecture tree**

In the `lib/` block, after `sheetParam.ts`:

```
│   ├── mapStyle.ts               # Protomaps dark basemap style + origin-restricted key wiring
│   ├── mapBounds.ts              # pure fit-bounds camera math + pinned/pinless partition
```

In `app/components/places/`, add `MapView.tsx`, `PlacesMap.tsx`, `MapPin.tsx`, `MapSelectionCard.tsx`, `ViewToggle.tsx` with one-line descriptions matching the file's existing style. Update the `lib/*.test.ts` line to include the two new suites.

- [ ] **Step 2: Add the conventions**

Under **Conventions**, after the `?sheet=` bullet:

```markdown
- **View state lives in `?view=<name>`, and it is NOT the `?sheet=` mechanism.** `?view=map` on
  the Places tab is a view toggle: read with `useSearchParams()`, written with
  `router.replace(…, { scroll: false })` so switching never grows the history stack, exactly like
  `?tab=` / `?city=` on the category route. It must not go through `useSheetParam`, which pushes
  an entry and consumes it with `history.back()` — right for a sheet you dismiss, wrong for a
  view you switch to and stay in. An unrecognised value falls back to the default view. The
  param survives the cold-load `?sheet=` strip (`withoutSheet` preserves every other param), so
  `/?view=map&sheet=add` reloads as `/?view=map`.
- **MapLibre is imported in exactly one module.** `app/components/places/PlacesMap.tsx` is the
  only file that may import `maplibre-gl`; everything else goes through
  `app/components/places/MapView.tsx`'s `next/dynamic({ ssr: false })` boundary, so no other
  route pays for the ~281 KB chunk. The basemap style is defined once in `lib/mapStyle.ts` and
  shared by the map tab and the place-detail header, so the two cannot drift.
- **The map partitions the list's result; it never runs its own query.** The map consumes the
  same `usePlaces` output the list renders and splits it with `partitionByCoords`. A separate
  query is the bug commit `393cdfe` fixed for category city chips.
- **Tile attribution is not dismissible.** "Protomaps © OpenStreetMap" renders on every map
  surface — the same ODbL obligation savor carries for Photon. Restyle it, never hide it.
- **Map tiles must come from an origin that grants CORS to savor's.** A third-party PMTiles
  bucket that denies the preflight paints a plausible-looking *empty map*, not an error, and
  `curl` cannot reproduce it (it sends no `Origin`). Any tile-source change is verified in a
  browser with the Network tab open.
```

- [ ] **Step 3: Note the Stage 2 boundary as a fast-follow**

Under **Fast-follows**:

```markdown
- **The map has no tile cache yet, deliberately.** Stage 1 does not write tiles, because the
  Cache API shares one origin quota with IndexedDB and browsers evict per-origin,
  all-or-nothing. The persistence gate, the ~40 MB cap with LRU eviction, and the Settings
  clear button are Stage 2 of `docs/superpowers/plans/2026-08-02-map-view-plan.md`. Do not add
  tile caching without them.
```

- [ ] **Step 4: Update the test count**

Run `npm test` and replace the "261 tests in 14 files" figure in **Workflow rules** with whatever it now reports.

- [ ] **Step 5: Verify everything one last time**

Run: `npm test && npm run build && npm run lint`
Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the ?view= convention and the Stage 1 map modules"
```

---
---

# STAGE 2 — The map is complete and safe

Stage 1 is shippable on its own. Stage 2 adds the tile cache **with its safeguards in the same stage** (never separately), the Settings controls, the way back from a pinless place, and the detail header.

---

### Task 8: Tile-cache policy — cap, LRU eviction, cache keys

Pure decisions only. The Cache API calls are Task 9. Written first so the cap and the eviction order are checkable without a browser, and so the cap number is a named constant with a documented provenance rather than a magic number buried in a fetch handler.

**Files:**
- Create: `lib/tileCache.ts`
- Test: `lib/tileCache.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TILE_CACHE_NAME = "savor-tiles-v1"`
  - `MAX_TILE_BYTES`, `MAX_TILE_ENTRIES`
  - `type CacheEntry = { key: string; bytes: number; lastUsed: number }`
  - `tileCacheKey(url: string): string`
  - `totalBytes(entries: CacheEntry[]): number`
  - `fitsInCache(bytes: number): boolean`
  - `selectEvictions(entries: CacheEntry[], incomingBytes: number): string[]`
  - `formatCacheSize(bytes: number): string`

- [ ] **Step 1: Write the failing test**

Create `lib/tileCache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_TILE_BYTES,
  MAX_TILE_ENTRIES,
  TILE_CACHE_NAME,
  fitsInCache,
  formatCacheSize,
  selectEvictions,
  tileCacheKey,
  totalBytes,
  type CacheEntry,
} from "./tileCache";

const entry = (key: string, bytes: number, lastUsed: number): CacheEntry => ({
  key,
  bytes,
  lastUsed,
});

describe("tileCacheKey", () => {
  it("strips the API key, so rotating it doesn't orphan the whole cache", () => {
    expect(tileCacheKey("https://api.protomaps.com/tiles/v4/12/1/2.mvt?key=abc")).toBe(
      tileCacheKey("https://api.protomaps.com/tiles/v4/12/1/2.mvt?key=xyz")
    );
  });

  it("never stores the API key in the cache key", () => {
    expect(tileCacheKey("https://api.protomaps.com/tiles/v4/12/1/2.mvt?key=abc")).not.toContain(
      "abc"
    );
  });

  it("strips the custom protocol prefix so the key matches the real tile URL", () => {
    expect(tileCacheKey("savor-tiles://https://api.protomaps.com/tiles/v4/12/1/2.mvt?key=a")).toBe(
      tileCacheKey("https://api.protomaps.com/tiles/v4/12/1/2.mvt?key=a")
    );
  });

  it("keeps z/x/y distinct — two different tiles are two different entries", () => {
    const a = tileCacheKey("https://api.protomaps.com/tiles/v4/12/1/2.mvt?key=k");
    const b = tileCacheKey("https://api.protomaps.com/tiles/v4/12/1/3.mvt?key=k");
    expect(a).not.toBe(b);
  });

  it("preserves non-key query params", () => {
    expect(tileCacheKey("https://x/t.mvt?key=k&lang=en")).toContain("lang=en");
  });
});

describe("totalBytes", () => {
  it("sums an empty cache to 0", () => {
    expect(totalBytes([])).toBe(0);
  });

  it("sums entries", () => {
    expect(totalBytes([entry("a", 10, 1), entry("b", 25, 2)])).toBe(35);
  });
});

describe("fitsInCache", () => {
  it("accepts an ordinary tile", () => {
    expect(fitsInCache(80 * 1024)).toBe(true);
  });

  it("rejects a single response larger than the whole cap rather than evicting everything for it", () => {
    expect(fitsInCache(MAX_TILE_BYTES + 1)).toBe(false);
  });

  it("rejects a zero or negative size", () => {
    expect(fitsInCache(0)).toBe(false);
    expect(fitsInCache(-1)).toBe(false);
  });
});

describe("selectEvictions", () => {
  it("evicts nothing when there is room", () => {
    expect(selectEvictions([entry("a", 100, 1)], 100)).toEqual([]);
  });

  it("evicts least-recently-used first, and only as many as needed", () => {
    const half = MAX_TILE_BYTES / 2;
    const entries = [
      entry("old", half, 1),
      entry("mid", half / 2, 5),
      entry("new", half / 2, 9),
    ];
    expect(selectEvictions(entries, half)).toEqual(["old"]);
  });

  it("keeps evicting until the incoming response fits", () => {
    const third = MAX_TILE_BYTES / 3;
    const entries = [entry("a", third, 1), entry("b", third, 2), entry("c", third, 3)];
    expect(selectEvictions(entries, third)).toEqual(["a"]);
    expect(selectEvictions(entries, MAX_TILE_BYTES)).toEqual(["a", "b", "c"]);
  });

  it("evicts on the entry-count cap even when well under the byte cap", () => {
    const entries = Array.from({ length: MAX_TILE_ENTRIES }, (_, i) => entry(`t${i}`, 1, i));
    expect(selectEvictions(entries, 1)).toEqual(["t0"]);
  });

  it("returns every key when the incoming response cannot fit at all — the caller must not store it", () => {
    expect(selectEvictions([entry("a", 1, 1)], MAX_TILE_BYTES + 1)).toEqual(["a"]);
  });

  it("does not mutate the caller's array", () => {
    const entries = [entry("b", 1, 9), entry("a", 1, 1)];
    const snapshot = [...entries];
    selectEvictions(entries, 1);
    expect(entries).toEqual(snapshot);
  });
});

describe("formatCacheSize", () => {
  it("reads in MB with one decimal", () => {
    expect(formatCacheSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("reads small caches in KB rather than 0.0 MB", () => {
    expect(formatCacheSize(200 * 1024)).toBe("200 KB");
  });

  it("reads an empty cache as 0 KB, not an error", () => {
    expect(formatCacheSize(0)).toBe("0 KB");
  });
});

describe("the cache name", () => {
  it("is versioned and scoped to tiles, so clearing it can never touch anything else", () => {
    expect(TILE_CACHE_NAME).toBe("savor-tiles-v1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/tileCache.test.ts`
Expected: FAIL — "Failed to resolve import ./tileCache".

- [ ] **Step 3: Write the implementation**

Create `lib/tileCache.ts`. Points the implementation must carry in comments, because they are the reasoning a later reader will otherwise undo:

- **Why a cap at all.** The Cache API cannot touch IndexedDB — different API, different bucket — so a tile write can never corrupt a Dexie row. But Cache and IndexedDB **share one origin quota**, and browsers evict **per-origin, all-or-nothing**: a large tile cache does not delete the user's data, it raises the odds the browser throws away the whole origin *including* the data. The cap exists so savor never drifts near the browser's quota and never lets the browser choose what to drop.
- **Bytes are the authoritative cap; the entry count is a secondary guard.** `MAX_TILE_BYTES` is what protects the quota. `MAX_TILE_ENTRIES` only bounds the bookkeeping, and is derived from the byte cap over an assumed average tile size — it is the number Step 4 confirms.
- **The API key is stripped from the cache key.** Two reasons: rotating the key must not orphan every cached tile, and the key should not be written into Cache Storage where it outlives the session.

```ts
export const MAX_TILE_BYTES = 40 * 1024 * 1024;
// ~500 tiles at an ASSUMED ~80 KB average. This is an ESTIMATE inherited from the design
// spec's open item #2 and NOT yet confirmed against real tiles at the zoom levels savor uses.
// MAX_TILE_BYTES is the cap that matters; this only bounds the bookkeeping. See Task 8 Step 4.
export const MAX_TILE_ENTRIES = 500;
```

`selectEvictions` sorts a **copy** by `lastUsed` ascending and accumulates keys until both `totalBytes(remaining) + incomingBytes <= MAX_TILE_BYTES` and `remainingCount + 1 <= MAX_TILE_ENTRIES`. When the incoming response cannot fit even in an empty cache, it returns every key — but the caller checks `fitsInCache()` **first** and skips the store entirely, so nothing is thrown away for a response that will not be kept.

- [ ] **Step 4: 📏 Confirm the cap against real tiles (ADR open item #2)**

The ~40 MB / ~500-tile figure is an estimate, and the plan does not hardcode it as final. **Do this measurement, do not skip it.**

**MANUAL (needs key)** — with `npm run dev -- -p 3001` on `/?view=map` and DevTools → Network filtered to `.mvt`:

1. Fit the map to a real collection of places, then pan and zoom across the range savor actually uses — roughly **z10–z13** for a city-wide fit and **z14–z16** for a single place and the detail header.
2. Record the **median** and **p90** transferred size per tile at each of those zooms. (Vector tiles at z14+ over a dense city centre are the worst case; sample one.)
3. Compute `MAX_TILE_BYTES / medianTileBytes` and set `MAX_TILE_ENTRIES` to that, rounded down. Update the constant **and its comment** with the measured number and the date.
4. Sanity-check the byte cap itself: 40 MB against a typical mobile origin quota (Chrome allows a large share of free disk; Safari is far tighter). If the measurement shows a warm city fits comfortably under 40 MB, keeping the cap is right. If a single city already blows past it, say so and raise it with the user rather than silently raising the cap — the whole point of the number is that it stays well clear of the browser's quota.

**If the key is not available yet:** leave the estimate in place, keep the comment marking it unconfirmed, and add this to CLAUDE.md's **Fast-follows** in Task 13 so it cannot be quietly dropped:

```markdown
- **The map tile-cache cap is still an estimate.** `MAX_TILE_ENTRIES` in `lib/tileCache.ts` is
  derived from an assumed ~80 KB average tile, never measured. Confirm it against real tile
  sizes at z10–z16 and update the constant with the measured figure and the date.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/tileCache.test.ts`
Expected: PASS, ~19 tests. If Step 4 changed `MAX_TILE_ENTRIES`, the entry-cap test still passes — it is written against the constant, not a literal.

- [ ] **Step 6: Commit**

```bash
git add lib/tileCache.ts lib/tileCache.test.ts
git commit -m "feat(map): tile-cache policy — byte cap, LRU eviction, key-free cache keys"
```

---

### Task 9: The `savor-tiles://` protocol, gated on persistent storage

The one place that calls the Cache API. **The gate is the feature**: if persistence was not granted, tiles are fetched and served but **never stored**. Offline tiles are a nice-to-have; the user's data is not.

**Files:**
- Create: `lib/tileCacheStore.ts`
- Modify: `app/components/places/PlacesMap.tsx`

**Interfaces:**
- Consumes: everything from `lib/tileCache.ts` (Task 8); `tileUrlTemplate` from `lib/mapStyle.ts`.
- Produces:
  - `TILE_SCHEME = "savor-tiles"`
  - `registerTileProtocol(maplibre: typeof import("maplibre-gl")): void`
  - `cacheEnabled(): Promise<boolean>`
  - `tileCacheUsage(): Promise<{ bytes: number; count: number } | null>`
  - `clearTileCache(): Promise<void>`

- [ ] **Step 1: Write the wrapper**

`lib/tileCacheStore.ts` is deliberately thin — every *decision* is in `lib/tileCache.ts` and unit-tested; this file only calls `caches`. It has no Vitest suite (the Cache API is not available under the node test environment and a mock would test the mock); its verification is Step 4's browser pass, in the same spirit as `lib/useModalA11y.ts`. Say so in the header comment.

Behaviour:

- **`cacheEnabled()`** returns `false` unless `typeof caches !== "undefined"` **and** `await navigator.storage?.persisted?.()` is true. **Re-run on every mount of the map, never cached at module scope** — browsers grant persistence later as engagement heuristics are satisfied, and savor should start caching the moment that happens (ADR §4.2, safeguard 1).
- **`registerTileProtocol(maplibregl)`** calls `maplibregl.addProtocol(TILE_SCHEME, handler)` **once** (guard with a module-level boolean — `addProtocol` throws or silently replaces on re-registration, and Strict Mode will double-invoke the effect). The handler:
  1. Strips the `savor-tiles://` prefix to recover the real URL, and derives `tileCacheKey(url)`.
  2. `caches.open(TILE_CACHE_NAME)` → `match(key)`. **Hit** → return its `ArrayBuffer`, and touch its `lastUsed` (store it in the cached `Response`'s headers on write, e.g. `x-savor-last-used`, so LRU survives a reload — there is no other place to keep it).
  3. **Miss** → `fetch(url, { signal })`. Return the bytes to MapLibre **first**; the store is fire-and-forget so a slow cache write never delays a tile.
  4. Store only when `await cacheEnabled()` and `fitsInCache(bytes)`. Before putting, enumerate the cache, build `CacheEntry[]`, `selectEvictions(entries, bytes)`, delete those keys, then `put`.
  5. Every cache operation is wrapped in `try/catch` and degrades to network-only. A `QuotaExceededError` must never break the map.
- **`clearTileCache()`** → `caches.delete(TILE_CACHE_NAME)`. This is the whole implementation, and it is the safety property: the cache is a **separate, named, versioned bucket**, so clearing it is structurally incapable of reaching `meta` or `criteria`. CLAUDE.md's "any reset path must clear `meta` + `criteria` together" rule is about those two; this button never approaches either, and the comment must say so explicitly so nobody later "helpfully" wires it into a reset-everything path.

- [ ] **Step 2: Wire it into the map**

In `PlacesMap.tsx`, in the same `useEffect` that constructs the map, before construction:

```tsx
    // Persistence is re-checked on every mount, never cached: a browser can grant it later as
    // engagement heuristics are satisfied, and savor should start caching when that happens.
    // Registering the protocol is cheap and unconditional — the HANDLER decides whether to
    // store, so a not-yet-persisted origin still gets tiles, just always from the network.
    registerTileProtocol(maplibregl);
```

and build the style with the scheme: `mapStyle(key, { scheme: TILE_SCHEME })`.

The **place-detail header map (Task 12) uses the same style module**, so it inherits caching for free — which is the point of one source of truth.

- [ ] **Step 3: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 4: MANUAL (needs key) — caching, the gate, and offline**

With `npm run dev -- -p 3001` and DevTools:

1. **Application → Storage**: confirm "Persistent" is granted (Settings' "Protect my data" button requests it). Open the map, pan around. **Application → Cache Storage** shows `savor-tiles-v1` filling with entries. Inspect one key — **it contains no `key=` param**.
2. **The gate.** In a fresh profile/incognito where persistence is *not* granted, open the map: tiles render, and `savor-tiles-v1` stays **empty or absent**. This is the single most important check in Stage 2.
3. **Warm-cache offline.** With tiles cached, DevTools → Network → **Offline**, reload, open the map: the area you already viewed still paints. Pan to a neighbourhood you have never opened: it is blank. That is the honest, documented behaviour — "tiles you have already viewed keep working offline", not offline maps.
4. **Eviction.** Temporarily lower `MAX_TILE_BYTES` to something small (e.g. 1 MB), pan widely, and confirm the entry count stops growing and the oldest entries disappear. **Restore the constant.**
5. **Data safety.** After all of the above, confirm the Places list, lists, and visits are all still intact in Application → IndexedDB.

- [ ] **Step 5: Commit**

```bash
git add lib/tileCacheStore.ts app/components/places/PlacesMap.tsx
git commit -m "feat(map): Cache-API tile protocol, gated on persistent storage"
```

---

### Task 10: Settings — map cache usage and "Clear map cache"

**Files:**
- Create: `app/components/settings/MapCachePanel.tsx`
- Modify: `app/settings/page.tsx`

**Interfaces:**
- Consumes: `tileCacheUsage`, `clearTileCache`, `cacheEnabled` from `lib/tileCacheStore.ts` (Task 9); `formatCacheSize` from `lib/tileCache.ts`; `toast` from `app/components/Toast.tsx`.
- Produces: `MapCachePanel(): JSX.Element`

- [ ] **Step 1: Build the panel**

Model it directly on the existing `StoragePanel` in `app/settings/page.tsx`, including its state machine and its failure posture — feature-detect, and on any throw fall closed to an "unavailable" message rather than crashing the page.

- `{ status: "loading" } | { status: "unavailable" } | { status: "ready"; bytes: number; count: number; enabled: boolean }`.
- Ready copy: `~{formatCacheSize(bytes)} of map tiles ({count} tiles)`.
- When `enabled` is false, add a `text-cream` line explaining *why* nothing is being stored and what fixes it: "Map tiles aren't being saved for offline use — savor only caches them once your browser protects this site's storage." Point at the existing **Protect my data** button in the Storage section rather than duplicating it.
- **"Clear map cache"** button: `min-h-11`, `border border-rule bg-ground-deep text-cream` — **not coral**. This is not destructive in savor's sense; it throws away re-downloadable tiles, not user data, and coral is reserved. For the same reason it takes **no `ConfirmBox`** — a confirm step implies a stake this action does not have. On success `toast("Map cache cleared")` and refresh the readout.
- Header comment must state the invariant plainly: *this button deletes exactly one named Cache Storage bucket and can never reach `meta` or `criteria`; do not wire it into any reset-everything path.*

- [ ] **Step 2: Mount it in Settings**

Add a section between **Storage** and **Backup**, matching the existing `<section>` / `<h2 className="font-util …">` pattern exactly:

```tsx
      <section className="px-4 py-6">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">Map cache</h2>
        <div className="mt-3">
          <MapCachePanel />
        </div>
      </section>
```

- [ ] **Step 3: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass, `lib/theme-contract.test.ts` included.

- [ ] **Step 4: MANUAL — the readout and the clear**

With `npm run dev -- -p 3001`:

1. On a browser without the Cache API (or with it stubbed out), Settings renders the "unavailable" message, not a crash.
2. With no tiles cached, the readout shows `~0 KB` / 0 tiles.
3. **(needs key)** After panning the map, return to Settings — the number has grown, and roughly matches Cache Storage's own count in DevTools.
4. Tap **Clear map cache** — the toast fires, the readout drops to zero, and `savor-tiles-v1` is gone from Application → Cache Storage.
5. **Confirm IndexedDB is untouched**: places, lists, criteria and visits all still there. Reload and check again.
6. Without persistence granted, the "not being saved" explanation renders and the readout stays at zero.

- [ ] **Step 5: Commit**

```bash
git add app/components/settings/MapCachePanel.tsx app/settings/page.tsx
git commit -m "feat(settings): map tile-cache usage readout and clear button"
```

---

### Task 11: Pinless places — the footer and the Find location flow

This is the first path in savor that can set coordinates on an **existing** place, and it retires the dead-end at `PlaceForm.tsx:176-195`: editing a name still clears the location, but the loss stops being unrecoverable.

**Files:**
- Create: `app/components/places/PinlessPlacesSheet.tsx`
- Modify: `app/components/places/PlacesMap.tsx` (the footer line), `app/page.tsx` (the sheet mount)

**Interfaces:**
- Consumes: `partitionByCoords` from `lib/mapBounds.ts`; `searchPlaces` / `LookupOutcome` / `LookupResult` from `lib/lookup.ts`; `updatePlace` from `lib/repo.ts`; `useSheetParam` from `lib/useSheetParam.ts`; `Sheet` from `app/components/Sheet.tsx`.
- Produces: `PinlessPlacesSheet(props: { places: Place[]; onClose: () => void }): JSX.Element`

- [ ] **Step 1: The honest footer**

In `PlacesMap`, when `pinless.length > 0`, render a line pinned to the bottom of the map area (above the nav, and above the selection card's slot so the two never overlap — if a card is open, the footer hides):

> *3 places aren't on the map*

as a `<button type="button">`, `min-h-11`, `text-cream` on a `bg-ground-deep/90` strip. Singular/plural correctly ("1 place isn't"). This line is a requirement, not decoration: without it the map silently under-reports the collection, and the gap grows with every manual entry.

The button raises the sheet. `PlacesMap` does not own `useSheetParam` — it takes an `onShowPinless` callback and `app/page.tsx` owns the param, keeping the URL concern in the page and MapLibre concerns in the map.

- [ ] **Step 2: The sheet**

In `app/page.tsx`: `const pinless = useSheetParam("pinless");`, mounting `{pinless.open ? <PinlessPlacesSheet places={pinlessPlaces} onClose={pinless.closeSheet} /> : null}`. Standard `Sheet` + `useModalA11y`, mount/unmount, title "Not on the map".

**It lists only places with no coordinates.** Correcting a coordinate that exists but is wrong is a different problem with a different UI and is explicitly out of scope (ADR §5, §10).

Each row: place name + city, and a **Find location** button (`min-h-11`, gold — this is the primary action of the row).

- [ ] **Step 3: The Find location flow — all three lookup outcomes, distinctly**

Tapping **Find location** calls `searchPlaces([place.name, place.city].filter(Boolean).join(" "))` and expands an inline result area under that row. `searchPlaces` returns a **discriminated `LookupOutcome`** precisely so failure is not flattened into "no matches" — handle all three, and do not collapse them:

| Outcome | UI |
| --- | --- |
| `{ ok: false, reason: "network" \| "upstream" \| "invalid" }` | The reason in plain words + a **Retry** button. The place stays pinless. |
| `{ ok: true, results: [] }` | "Couldn't find this venue." The place stays pinless. No retry — retrying an empty result changes nothing. |
| `{ ok: true, results: [...] }` | The suggestions, each a `min-h-11` button showing name + `[address, city]` — mirroring `LookupCombobox`'s secondary line. |

Render suggestions **inline, pushing content down**, not as a popover: this mounts inside an `h-dvh` bottom sheet, and `LookupCombobox` documents exactly why a floating popover mispositions with the iOS keyboard up.

**Nothing is written without an explicit tap.** No auto-geocoding, not even for a single high-confidence result — there is no UI anywhere to correct a wrong coordinate, so a silent write would be permanent. On tap:

```tsx
  await updatePlace(place.id, {
    lat: result.lat,
    lng: result.lng,
    osmId: result.osmId,
    address: result.address,
    city: result.city,
  });
```

Wrap it and `toast("Couldn't save the location", true)` on rejection — a failed write must never be silent. On success `toast("Location added")`. The row then leaves the list on its own: `usePlaces`' live query re-runs, the place moves to the `pinned` side of the partition, and a pin appears on the map behind the sheet. When the list empties, close the sheet (`onClose()`) rather than showing an empty sheet with nothing to do.

Requests must be abortable — hold an `AbortController` per row and abort it on unmount, so a sheet dismissed mid-lookup does not resolve into a torn-down tree. `searchPlaces` rethrows `AbortError` by design; swallow it, as `lib/autocomplete.ts` does.

- [ ] **Step 4: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 5: MANUAL — the flow and all three failure modes**

With `npm run dev -- -p 3001` and at least two manually-typed places (no lookup suggestion picked, so no coordinates):

1. Map view shows *"2 places aren't on the map"* with correct grammar. With every place pinned, the line is absent entirely.
2. Tap it — the sheet opens with `?sheet=pinless` on the URL, listing exactly the pinless places. **Press Back — it closes** (the `?sheet=` contract) and `?view=map` survives.
3. Tap **Find location** on a real restaurant name — suggestions appear inline. Tap one: a toast fires, the row disappears, and a pin for it is on the map behind the sheet.
4. Navigate to that place's detail page and confirm the address and city updated too.
5. **Network failure:** DevTools → Network → Offline, tap **Find location** — the failure reason and a **Retry** show, *not* "no matches". Go back online and tap **Retry** — it succeeds.
6. **Empty result:** search a nonsense name — "couldn't find this venue", no retry button, the place stays in the list.
7. **No silent writes:** open the sheet, trigger a search, dismiss the sheet without tapping a suggestion. Confirm on the place's detail page that nothing was written.
8. With one pinless place left, resolve it — the sheet closes itself and the footer line disappears.

- [ ] **Step 6: Commit**

```bash
git add app/components/places/PinlessPlacesSheet.tsx app/components/places/PlacesMap.tsx app/page.tsx
git commit -m "feat(places): pinless-places sheet with Find location (first path that restores coordinates)"
```

---

### Task 12: The place-detail header map

**Files:**
- Create: `app/components/places/PlaceHeaderMap.tsx`
- Modify: `app/places/[id]/page.tsx`

**Interfaces:**
- Consumes: `mapStyle`, `protomapsApiKey`, `MAP_ATTRIBUTION` from `lib/mapStyle.ts`; `TILE_SCHEME`, `registerTileProtocol` from `lib/tileCacheStore.ts`; `SINGLE_PLACE_ZOOM`, `hasCoords` from `lib/mapBounds.ts`.
- Produces: `PlaceHeaderMap(props: { lat: number; lng: number }): JSX.Element`

- [ ] **Step 1: Build the header map**

Constraints, each of which is a decision from ADR §8:

- **Rendered only when the place has coordinates.** Otherwise the page keeps today's layout with **no empty slot** — not a placeholder, not a grey box. Guard the mount with `hasCoords(place)` in `page.tsx`.
- **MapLibre, non-interactive.** `interactive: false` on construction; no drag, no zoom, no pins, no controls beyond attribution. It shares `lib/mapStyle.ts` with the map tab, so one source of truth for the basemap — the raster shortcut is unavailable anyway, since Protomaps is vector-only and `<img>` tiles would mean a visibly different basemap on two screens showing the same place.
- **Loads on idle, after the page is interactive, and fades in.** Gate construction behind `requestIdleCallback` (with a `setTimeout` fallback — Safari's support is recent) inside the effect, and mount the whole thing through the `next/dynamic` boundary so the chunk is not on place detail's critical path. **Place detail must render complete without it**, which means the header renders its final height whether or not the map arrives — reserve the space with a fixed-height container so nothing reflows when it fades in.
- **Decorative: `aria-hidden`, never focusable.** `tabIndex={-1}` on anything focusable inside, `aria-hidden="true"` on the container. The address line in the info block remains the accessible source of location — the same principle as the long-press score peek: an accelerator, never the only path. **Attribution must still be visible** (ODbL is a visual obligation, not an a11y one) — if `aria-hidden` on the container would swallow the attribution links from the a11y tree, move the attribution outside the hidden container rather than dropping it.
- **The scrim is token opacity modifiers, never raw `rgba()`** — `bg-gradient-to-b from-ground-deep/70 via-ground/40 to-ground` or similar — so `lib/theme-contract.test.ts` stays green. Cream over the scrim was checked against real tiles during the comparison and clears AA; re-check it in Step 4 rather than trusting it.
- Camera: `map.jumpTo({ center: [lng, lat], zoom: SINGLE_PLACE_ZOOM })`. No marker — the whole header *is* the place; a pin on a single-place map is redundant.

- [ ] **Step 2: Mount it in place detail**

In `app/places/[id]/page.tsx`, between `HeaderShell` and the status pill, behind the coordinate guard:

```tsx
      {hasCoords(place) ? <PlaceHeaderMap lat={place.lat!} lng={place.lng!} /> : null}
```

- [ ] **Step 3: Verify tests, build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass. Check the build's route table: `/places/[id]` should not have gained a large first-load JS figure — the chunk is behind `next/dynamic` and shared with `/`.

- [ ] **Step 4: MANUAL (needs key) — the header**

With `npm run dev -- -p 3001`:

1. Open a place **with** coordinates: the page renders immediately with its full layout, and the map fades in a beat later behind the scrim. **Nothing reflows** when it arrives.
2. The place name and any text over the scrim are comfortably legible. Spot-check the worst pairing with DevTools' contrast checker against a light patch of the basemap.
3. Open a place **without** coordinates: today's layout exactly, no empty slot, no placeholder.
4. Try to drag/pinch the header — it does not move.
5. Tab through the page: focus **never** enters the map. In the accessibility tree the map container is hidden, while the address line is present and announced.
6. Attribution is visible on the header.
7. The basemap looks **identical** to the map tab's — same flavor, same labels. Any difference means the two are not sharing `lib/mapStyle.ts`.
8. On a throttled connection (DevTools → Slow 4G), place detail is fully usable before the map appears.

- [ ] **Step 5: Commit**

```bash
git add app/components/places/PlaceHeaderMap.tsx "app/places/[id]/page.tsx"
git commit -m "feat(places): decorative non-interactive map behind the place-detail header"
```

---

### Task 13: Record Stage 2 and close the open items

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes / Produces: nothing.

- [ ] **Step 1: Add the Stage 2 modules to the architecture tree**

In `lib/`:

```
│   ├── tileCache.ts              # pure tile-cache policy — byte cap, LRU eviction, cache keys
│   ├── tileCacheStore.ts         # thin Cache API wrapper + the savor-tiles:// MapLibre protocol
```

Add `PinlessPlacesSheet.tsx` and `PlaceHeaderMap.tsx` under `app/components/places/`, `MapCachePanel.tsx` under `app/components/settings/`, and note the new "Map cache" section on the settings page. Update the `lib/*.test.ts` line with `tileCache`.

- [ ] **Step 2: Add the Stage 2 conventions**

```markdown
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
```

- [ ] **Step 3: Record the remaining fast-follows**

Add whichever of these are still true:

```markdown
- **The map tile-cache cap may still be an estimate.** [Include only if Task 8 Step 4's
  measurement has not been done — with the exact wording from that step.]
- **No automated coverage for the map's browser behaviour.** Pin rendering, pan-vs-tap
  deselection, the geolocation prompt, the persistence gate and the warm-cache offline path were
  all verified by hand. Land them alongside the `?sheet=` specs when `@playwright/test` is
  scaffolded (a new devDependency — ask first).
- **Antimeridian-spanning collections fit the long way round.** `lib/mapBounds.ts` does not
  handle a bounding box crossing ±180°. Irrelevant for a personal restaurant ledger; fix it if
  someone's places ever straddle the date line.
```

- [ ] **Step 4: Update the test count and the dependency list**

Run `npm test` and update the count in **Workflow rules**. Also update the "dependency set is deliberately tiny (Dexie, dexie-react-hooks, next, react, zod)" line to include `maplibre-gl` and `@protomaps/basemaps` (and `pmtiles` if Task 1 Step 2 required it), noting they are lazy-loaded behind one dynamic import — the rule still stands, this was one deliberate, measured exception.

- [ ] **Step 5: Final verification**

Run: `npm test && npm run build && npm run lint`
Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the tile-cache safeguards and Stage 2 map modules"
```

---

## Deferred out of both stages (deliberately)

- **Marker clustering.** Dozens of places, not thousands. Revisit when it is measurably slow.
- **Service worker and an offline app shell.** Cache versioning and update semantics are a decision about the whole app, not something to smuggle in behind map tiles.
- **Directions, routing, tap-the-map-to-create-a-place reverse geocoding, manual lat/lng entry.** **Find location** covers the same need with better data.
- **Correcting a coordinate that already exists but is wrong.** A different problem with a different UI. The pinless sheet lists *only* places with no coordinates, on purpose.
- **Any change to the backup format.** No schema change means none is needed.
- **Playwright specs for the map's interaction and storage behaviour.** Recorded as a fast-follow in Task 13; `@playwright/test` is a new devDependency and its introduction is a separate ask.
