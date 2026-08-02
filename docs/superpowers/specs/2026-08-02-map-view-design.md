# Map view — Design Spec

**Date:** 2026-08-02
**Status:** Approved
**Repo:** git@github.com:mzetinajimenez/savor.git

## 1. Problem

savor knows where your restaurants are and never shows you. `Place` has carried `lat`,
`lng`, and `osmId` since `version(1)` of the schema (`lib/types.ts`), populated whenever a
place is chosen from a lookup suggestion — and nothing in the app reads them. The comment
on `osmId` even names the map view as their intended consumer.

Two jobs, one screen:

- **"Where should I eat?"** — what's near me, filtered to want-to-try or to high scorers.
- **"Where have I been?"** — the shape of your eating across a city.

These are the same map under a different filter, which is why they are one view and not
two features. A third, smaller job is separate: **spatial context on a single place**, as
a map behind the place-detail header.

## 2. What the data actually supports

Coordinates exist only for places picked from a lookup suggestion
(`PlaceForm.tsx:170`). Manually-typed places have none. Worse, editing a place's name
deliberately clears them (`PlaceForm.tsx:176-195`) on the reasoning that a captured
location is almost certainly wrong for a new name — and **no UI anywhere can put them
back**. The clearing is right; the dead-end is not.

So the map cannot assume full coverage, and any design that silently renders only the
places that happen to have pins under-reports the collection, with the gap growing on
every manual entry. §5 addresses this directly.

## 3. Rendering decision

Six options were built as a live side-by-side against real tiles rather than argued on
paper. Measured, not estimated:

| Option | JS added (gzipped) | Basemap control | Verdict |
| --- | --- | --- | --- |
| MapLibre GL JS + Protomaps vector | 281 KB (268 + 7 pmtiles + 6 basemaps) | Total — it's your style JSON | **Chosen** |
| Raster `<img>` + CSS `mix-blend-mode` tint | 0 KB | Hue only, uniformly | Strong runner-up |
| Leaflet + raster | 42 KB | None — it's someone's PNGs | No |
| OSM standard tiles | 0 KB | None | **Not permitted** — tile usage policy forbids this use |

**Chosen: MapLibre GL JS + Protomaps hosted vector tiles, stock `dark` flavor.**

The stock dark flavor is a deliberate choice over a custom Supper Club flavor, which was
also built and compared. Gold score seals need a neutral surface to sit on; on a
bottle-green basemap the pins compete with the ground for the same hue. A quiet charcoal
map makes the data the loudest thing on screen, which is the correct hierarchy when the
map's entire job is showing pins. savor's identity stays in the chrome around the map,
where it already lives.

MapLibre is lazy-loaded (`next/dynamic`, `ssr: false`) and imported by exactly one client
component, so no other route pays for it. The chunk is content-hashed and immutable: paid
once per user per deploy, shared between the map tab and the detail header.

### 3.1 CORS is a property of this option, not an accident

Verified empirically while building the comparison: `demo-bucket.protomaps.com` sends no
`Access-Control-Allow-Origin` and answers the CORS preflight with **403**. PMTiles reads
byte ranges, and `Range` is not a CORS-safelisted request header, so every tile request is
preflighted and blocked. The failure is silent and deeply misleading — the background layer
and the DOM markers still paint, so it looks like an empty map rather than a network error.

**savor therefore cannot point at a third-party PMTiles bucket.** The tiles must come from
an origin that grants CORS to savor's own. That is a real cost of this option; the raster
alternatives have no equivalent, since `<img>` is not subject to CORS.

`curl` will not catch this. It sends no `Origin` and enforces nothing.

## 4. Tile source and the offline story

**Protomaps hosted API with an origin-restricted key.** 1M requests/month free. Because
the key is restricted by origin, it can ship in the client — no per-tile proxy through a
Vercel function, so no cost or latency in the tile path. This differs from
`app/api/lookup/route.ts`, which proxies because it owns a `User-Agent` and an IP bias,
not because of a key.

Alternatives rejected: the planet PMTiles file is **137 GB** (verified from its header),
so bundling is not on the table; Stadia's free tier is non-commercial only; a self-hosted
regional extract is geographically bounded and blank outside it. Because PMTiles is
addressed by URL, moving to a self-hosted extract later is a config change, not a rewrite.

### 4.1 Offline: a warm cache, not offline maps

savor has **no service worker today** — it is installable via `manifest.webmanifest` but
has no offline app shell. Introducing one solely for map tiles is the wrong scope: cache
versioning and update semantics are a decision about the whole app.

Instead, a `savor-tiles://` MapLibre protocol backed by the **Cache API**, called from the
page. Check cache → miss → fetch → store. No service worker, no dependency.

Be honest about what this buys: **tiles you have already viewed keep working offline; a
neighbourhood you have never opened will not be there.**

### 4.2 Data safety — the constraint that shapes §4.1

The Cache API cannot touch IndexedDB. Different API, different bucket; writing tiles
cannot remove or corrupt a Dexie row. This feature also requires **no schema change** —
`lat`, `lng`, and `osmId` already exist in `version(1)` — so there is no new
`db.version(N)` block, no `SCHEMA_VERSION` bump, and consequently no interaction with the
"backup forward-migration required before the first bump" fast-follow in `CLAUDE.md`.

The indirect risk is real, though. Cache API and IndexedDB **share one origin quota**, and
browsers evict **per-origin, all-or-nothing** under storage pressure — Chrome drops the
whole origin, Safari does the same and additionally caps non-persisted script-writable
storage at 7 days without user interaction. A large tile cache does not delete data, but
it raises the probability that the browser evicts the origin, which would take IndexedDB
with it.

`lib/hooks.ts:188` already calls `navigator.storage.persist()`, and a persisted origin is
exempt from eviction — but it is best-effort and Safari grants it heuristically. Today
this is moot because savor stores a few hundred KB of text. Tiles are the first thing that
would push the origin toward a quota where it matters.

Three safeguards, in decreasing order of importance:

1. **Gate caching on `navigator.storage.persisted()`.** If persistence was not granted,
   do not populate the tile cache — reads still work, they just always go to the network.
   Offline tiles are a nice-to-have; the user's data is not. This is the conservative
   variant and it is the decision. The check is re-run on every mount of the map
   component, not cached at startup: browsers can grant persistence later as engagement
   heuristics are satisfied, and savor should start caching when that happens.
2. **Enforce our own cap** (~40 MB, roughly 500 tiles) with LRU eviction, so savor never
   drifts near the browser's quota and never lets the browser decide what to drop.
3. **Surface it in Settings** — `navigator.storage.estimate()` usage plus a "Clear map
   cache" button that touches only the tile cache. It must never approach `meta` or
   `criteria`; the reset-path rule in `CLAUDE.md` is about those two together, and this
   button stays well clear of both.

## 5. Places without coordinates

`usePlaces` already returns everything the list renders. The map partitions that result
into pinned and pinless (see §7) and renders an honest footer line:

> *3 places aren't on the map*

Tapping it opens a `Sheet` listing them. Each row offers **Find location**, which runs the
existing `searchPlaces()` (`lib/lookup.ts`) with that place's name and city and presents
the suggestions. The user picks one; `repo.updatePlace` writes `lat`, `lng`, `osmId`, and
the address fields. **Nothing is written without an explicit tap** — no silent
auto-geocoding, because there is no UI to correct a wrong coordinate and a silent write
would be permanent.

Lookup can fail, and `searchPlaces()` returns a discriminated `LookupOutcome` precisely so
that failure is not flattened into "no matches". The sheet distinguishes the three cases:
a `network` / `upstream` / `invalid` failure shows the reason and offers retry; a
successful search with an empty result says the venue wasn't found and leaves the place
pinless; only a user tap on a suggestion writes.

The sheet lists **only places with no coordinates**. Correcting a coordinate that exists
but is wrong is a different problem with a different UI, and is out of scope (§10).

This is the first path in savor that can set coordinates on an existing place, so it also
retires the `PlaceForm.tsx:176-195` dead-end: editing a name still clears the location,
but the loss stops being unrecoverable.

## 6. Where it lives

A **List / Map segmented toggle** at the top of the Places tab. Not a fifth nav tab:
`BottomNav` is four tabs around a centered FAB, and a fifth crowds the FAB out of the
middle.

Search and the status chips (All / Been / Want to try) apply to **both** views. This is
what makes "where should I eat" and "where have I been" one screen with a different
filter rather than two features.

View state lives in `?view=map`, following the `?city=` precedent on the categories route.
It is a view toggle, not a sheet and not a route — no entity id ever enters the query
string, consistent with the Phase 4 convention.

**Pins:** gold seal with the score for `been`; hollow cream ring for `want_to_try`. Coral
appears nowhere — it stays destructive-and-error only.

**Selection:** tapping a pin raises a compact card above the nav (name, cuisine, score,
status); tapping the card routes to `/places/[id]`. Tapping the map background, or the
card's close control, deselects; panning does not. At most one place is selected at a
time. Deliberately not a `Sheet` — `Sheet` is modal and traps focus, which is wrong for
something tapped while panning.

**Locate:** a button that requests geolocation on tap only, never on load. The position is
never persisted.

## 7. Read path and module boundaries

The map consumes **the same `usePlaces` result the list does** and partitions it in the
component. No second query. Commit `393cdfe` fixed a bug of exactly this shape — category
city chips derived from a superset DB query instead of from the rendered places, so the
two disagreed. One shared result makes that class of bug unrepresentable: toggling
List↔Map is guaranteed to show the same set.

Writes go through `repo.updatePlace`. Nothing new touches Dexie. No component imports
`dexie` or `@/lib/db`.

**New framework-free modules, each with a Vitest suite:**

- `lib/tileCache.ts` — cap and LRU eviction decisions, and the cache-key derivation. Pure;
  the Cache API calls sit in a thin wrapper around it.
- `lib/mapBounds.ts` — fit-bounds math over a set of coordinates: bounding box, padding,
  the single-place case, and the everything-at-one-address case.

**New React surface:** one client component owning the MapLibre instance, plus the
segmented toggle, the selection card, and the pinless-places sheet. MapLibre is imported
in exactly one place. `lib/` stays free of React and DOM.

## 8. The place-detail header

Rendered only when the place has coordinates; otherwise the page keeps today's layout with
no empty slot.

It uses **MapLibre, non-interactive**, sharing the same style module as the map tab — one
source of truth for the basemap, so the two screens cannot drift apart. The raster
shortcut is unavailable: Protomaps is vector-only, so `<img>` tiles would mean a visibly
different basemap on two screens showing the same place.

It loads **on idle, after the page is interactive**, and fades in. Place detail renders
complete without it.

It is decorative: `aria-hidden`, never focusable. The address line remains the accessible
source of location — the same principle as the long-press score peek, an accelerator and
never the only path.

The scrim is built from token opacity modifiers (`from-ground-deep/70` and similar), not
raw `rgba()`, so `lib/theme-contract.test.ts` stays green. Cream over the scrim was
checked against real tiles during the comparison and clears AA.

## 9. Attribution

OSM/ODbL requires visible attribution, the same obligation savor already carries for
Photon. MapLibre's `AttributionControl` renders "Protomaps © OpenStreetMap" on the map tab
and on the detail header. It is not dismissible.

## 10. Out of scope

Marker clustering (dozens of places, not thousands — revisit when it is measurably slow).
Service worker and offline app shell. Directions or routing. Tap-the-map-to-create-a-place
reverse geocoding. Manual lat/lng entry, since **Find location** covers the same need with
better data. Correcting a coordinate that already exists but is wrong. Any change to the
backup format.

## 11. Delivery order

This is more than one implementation plan's worth of work, and the two halves have a clean
seam: the first is useless without tiles, the second is useless without the first.

**Stage 1 — the map exists.** Tile source and origin-restricted key, `lib/mapBounds.ts`,
the lazy-loaded MapLibre component, the List/Map toggle and `?view=map`, pins, selection
card, locate button, attribution. Ships a working map for every place that already has
coordinates, and is independently valuable.

**Stage 2 — the map is complete and safe.** `lib/tileCache.ts` and the persistence-gated
cache, the Settings usage readout and "Clear map cache", the pinless-places footer and the
**Find location** flow, and the place-detail header.

Stage 1 deliberately carries no tile cache: until §4.2's safeguards exist, savor should
not be writing tiles to an origin it shares with the user's data.

## 12. Open items

- **Protomaps account and origin-restricted key** must be created, and the production
  origin registered, before the map renders anywhere but localhost. Local development is
  exempt from the origin restriction.
- **Tile cache cap (~40 MB) is an estimate.** Confirm against real tile sizes at the zoom
  levels savor actually uses before fixing the number.
