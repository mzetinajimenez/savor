# Place-lookup autocomplete — Design Spec

**Date:** 2026-07-25
**Status:** Approved pending user review
**Closes:** [#22 Autocomplete for place lookup](https://github.com/mzetinajimenez/savor/issues/22),
[#7 OSM lookup robustness](https://github.com/mzetinajimenez/savor/issues/7)
**Repo:** git@github.com:mzetinajimenez/savor.git

## 1. Problem

Adding a place today means typing a name, then tapping a **Look up** button, then
waiting, then picking from a list. Issue #22 asks for the native-feeling thing: a
dropdown that live-updates as you type.

The blocker is not the UI. It is the upstream provider.

## 2. Provider decision

### Nominatim cannot do this

The [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
is explicit:

> "Auto-complete search — This is not yet supported by Nominatim and you **must not**
> implement such a service on the client side using the API."

with a hard ceiling of **1 request per second**. Issue #22 is unbuildable on savor's
current backend. The button exists *because* of this rule.

### Why not Google Places or Mapbox

savor writes lookup results (`name`, `address`, `city`, `lat`, `lng`) into IndexedDB
and into JSON backups, and keeps them **forever, offline**. That is the product. It is
also precisely what the major commercial geocoders forbid.

- **Google Places** — [policy](https://developers.google.com/maps/documentation/places/web-service/policies):
  "You must not pre-fetch, cache, or store Places API content," with exactly one
  exception — "you can store place ID values indefinitely." A compliant savor would
  persist only a `place_id` and re-fetch the name and address on every render: it
  breaks offline, and bills per view. Google additionally requires results shown on a
  map be shown *on a Google Map* with Google attribution — which collides with the
  planned map view (§11).
- **Mapbox** — default *temporary geocoding* (100k free/mo) explicitly cannot store
  results. Storage requires the *Permanent Geocoding* SKU at **$5/1k with no free
  tier**.
- **Foursquare** — strong restaurant data, but caching is bounded by their usage
  guidelines, and the free Pro allowance drops to 500 calls/month on 2026-06-01.

OSM-derived providers (Nominatim, **Photon**, Geoapify, LocationIQ) are ODbL: storage,
modification and redistribution are granted up front; the obligation is attribution.
**The license, not the price, is the deciding factor.**

### Evidence that OSM is good enough

Eight real restaurant queries, Photon vs Nominatim, 1.1s spacing:

| Query | Photon | Nominatim |
|---|---|---|
| Franklin Barbecue | ✅ ranked #1 | ✅ |
| Uchi (Austin) | ✅ ranked #1, + Houston/Denver | ✅ |
| Veracruz All Natural | ✅ all 4 locations | ✅ 3 |
| Chipotle | ✅ 5 Austin locations | ✅ 5 |
| Superiority Burger | ✅ | ✅ |
| Gramercy Tavern | ✅ ranked #1 | ✅ |
| Tartine | ✅ Bakery + Manufactory | ✅ 2 |
| Kogi | ❌ noise | ❌ nothing |

7/8. The single miss is a food-truck fleet with no fixed address — not an OSM coverage
gap. **We do not need to leave the OSM family**, so the proprietary-geocoder storage
restrictions never bind.

### Decision: Photon (`photon.komoot.io`)

Purpose-built for search-as-you-type, OSM/ODbL, no API key. Beyond being *permitted*,
it beats Nominatim on three measured axes:

1. **Native `lat`/`lon` bias** put the correct result at #1 in every successful query.
2. **`osm_tag` filtering works** (verified) — restricting to food categories strips
   `place=village` / `boundary=administrative` noise that Nominatim's current
   implementation cannot filter at all.
3. **Structured `name`/`housenumber`/`street`/`city`/`state`** retires the
   `display_name.split(",")[0]` hack in the route today.

Terms are "be fair — extensive usage will be throttled," with no availability
guarantee. §8 covers how we stay fair; §12 covers the availability risk.

## 3. Scope

### In scope

- Live suggestions under the name field, debounced, on every keystroke.
- Photon replaces Nominatim inside `/api/lookup`. The route stays the only thing that
  talks to any geocoder.
- Location bias from Vercel IP headers.
- Failed lookups become distinguishable from empty ones (a contract change, §6).
- `osmId` persisted on `Place` (§7).
- Full ARIA combobox with keyboard support (§9).
- ODbL attribution (§10).
- All three items of issue #7: stale-response discard, query-length cap, labelled
  results list.

### Out of scope

- The map view. Tile-provider choice is deliberately left open (§11).
- `navigator.geolocation`. Deferred to the map view, which will want a location
  permission anyway — better to introduce that prompt once, in a context where it
  self-evidently makes sense.
- Reverse geocoding, "near me" browsing, cuisine inference from OSM tags.
- Any change to how ranking, categories, or visits work.

## 4. Architecture

`vitest.config.ts` includes only `lib/**/*.test.ts` — no jsdom, no React Testing
Library. **Logic living in a component is untested logic.** This is not incidental:
issue #7's stale-response bug exists in `PlaceForm.tsx` precisely because nothing
guards it. Autocomplete makes that bug fire on every keystroke rather than every
button press.

So every non-trivial behaviour moves into `lib/`, and the component becomes thin
enough to review by eye.

```
lib/photon.ts        upstream seam — URL building, bias parsing, GeoJSON → LookupResult
lib/lookup.ts        client seam   — fetch /api/lookup, zod-validate, classify failures
lib/autocomplete.ts  sequencing    — debounce · abort · stale-discard · cache
app/api/lookup/route.ts            thin shell over lib/photon.ts
app/components/places/LookupCombobox.tsx   ARIA combobox
app/components/places/PlaceForm.tsx        consumes it; loses the "Look up" button
```

`lib/photon.ts` mirrors the existing `lib/social/` pattern: upstream-shape parsing
lives in a tested lib module and the route is a shell. This also fixes a current gap —
the route's `toLookupResult` has **zero coverage today**, because routes are outside
the vitest include path.

Each module answers the three questions cleanly:

| Module | Does | Depends on |
|---|---|---|
| `lib/photon.ts` | Photon's wire format ↔ savor's `LookupResult` | zod |
| `lib/lookup.ts` | one HTTP call to our own route, typed outcome | zod, `fetch` |
| `lib/autocomplete.ts` | *when* to search and *which* answer wins | an injected search fn |
| `LookupCombobox` | render + keyboard + ARIA | the above, React |

`lib/autocomplete.ts` never imports `lib/lookup.ts` directly — the search function is
injected. That is what makes it testable with fake timers and no network.

## 5. `lib/photon.ts`

```ts
export const MAX_QUERY_LENGTH = 200;
export const MAX_RESULTS = 6;

// amenity/shop values savor cares about. Sent as repeated osm_tag params.
export const FOOD_TAGS = [
  "amenity:restaurant", "amenity:cafe", "amenity:fast_food",
  "amenity:bar", "amenity:pub", "amenity:ice_cream",
  "shop:bakery", "shop:deli", "shop:confectionery",
] as const;

export interface Bias { lat: number; lng: number }

export function readBiasFromHeaders(headers: Headers): Bias | null;
export function buildPhotonUrl(q: string, bias: Bias | null): string;
export function toLookupResults(body: unknown): LookupResult[];
```

**`readBiasFromHeaders`** reads `x-vercel-ip-latitude` / `x-vercel-ip-longitude`
(both confirmed present on every Vercel request). Returns `null` when absent (local
dev), non-finite, or out of range — bias is an optimisation, never a requirement.
Coordinates are **rounded to 2 decimals (~1km)** so that Vercel's Data Cache keys
collapse across nearby users instead of proliferating per-IP.

**`buildPhotonUrl`** emits
`?q=…&limit=6&lat=…&lon=…&osm_tag=amenity:restaurant&osm_tag=…`, omitting `lat`/`lon`
entirely when bias is `null`.

**`toLookupResults`** maps each GeoJSON feature:

| `LookupResult` | Source |
|---|---|
| `name` | `properties.name` (required — feature dropped without it) |
| `address` | `[housenumber, street].join(" ")`, falling back to `locality` |
| `city` | `properties.city ?? properties.locality ?? properties.county` |
| `lat` / `lng` | `geometry.coordinates` — **note: GeoJSON is `[lng, lat]`** |
| `category` | `properties.osm_value` (`"restaurant"`, `"cafe"`, `"bakery"`…) |
| `osmId` | normalised from `osm_type` + `osm_id` (§7) |

Features with a non-finite coordinate pair or no `name` are dropped individually,
matching the existing "drop bad entries, keep good ones" behaviour.

`MAX_RESULTS` is defined **here and imported by `lib/lookup.ts`**, so the route's
`limit` and the client's defensive cap can never drift apart. It rises from the
current 5 to 6.

`lookupResultSchema` in `lib/lookup.ts` gains both new fields as optional:
`category: z.string().optional()` and `osmId: z.string().optional()`. Of the two,
**`category` is display-only and never persisted** — it renders as the secondary line
in a suggestion row and is discarded on select. `osmId` *is* persisted (§7).

## 6. `lib/lookup.ts` — the contract change

Today every failure mode collapses to `[]`. With a button that was defensible. With a
live dropdown it is actively misleading: a network blip renders as *"that restaurant
doesn't exist."*

```ts
export type LookupOutcome =
  | { ok: true; results: LookupResult[] }
  | { ok: false; reason: "network" | "upstream" | "invalid" };

export function searchPlaces(q: string, signal?: AbortSignal): Promise<LookupOutcome>;
```

- `network` — `fetch` threw (offline, DNS).
- `upstream` — non-2xx from our route.
- `invalid` — 2xx whose body isn't parseable / isn't an array.

An `AbortError` is **not** an outcome: it propagates as a rejection and is swallowed
by `lib/autocomplete.ts`, because an aborted request has no result worth showing.

`lib/lookup.test.ts` is rewritten against this shape. The old degrade-to-`[]` tests
become explicit `{ ok: false, reason }` assertions — same failure coverage, more
information preserved.

## 7. Data model — `Place.osmId`

Additive optional field on `Place`, in both `lib/types.ts` and `lib/repo.ts`'s
`placeFields` (the shared source of truth, so create/update *and* backup import both
carry it).

```ts
osmId?: string;   // "node/123" | "way/456" | "relation/789"
```

Photon returns `osm_type: "N" | "W" | "R"` and a numeric `osm_id`; `lib/photon.ts`
normalises to the conventional long form, which is self-describing and directly usable
against Overpass or the OSM API later.

It flows through the existing select path: `handleSelectResult` copies `osmId` onto
the form alongside `name`/`address`/`city`/`lat`/`lng`, and `handleSave` passes it to
`createPlace` next to `sourceUrl`. A place added manually simply has no `osmId`.

**No index, therefore no `db.version(2)` block and no `SCHEMA_VERSION` bump** — the
same additive trick `sourceUrl` used, and it deliberately avoids tripping
`parseBackup`'s exact-version equality check (still an open fast-follow).

Why now, given the map view isn't scoped: it is free at this moment (the data is
already in the response we are parsing), ODbL explicitly permits keeping it, and it
buys stable identity for map pins, cross-session "did I already add this?" dedupe, and
future re-fetching of stale OSM data. Adding it later would mean a second pass over
the same file.

## 8. Sequencing, politeness, and caching — `lib/autocomplete.ts`

```ts
export interface LookupSession {
  search(query: string): void;
  selected(): void;   // suppress the next search (§9)
  cancel(): void;
  destroy(): void;
}

export function createLookupSession(opts: {
  onState: (state: LookupState) => void;
  search: (q: string, signal: AbortSignal) => Promise<LookupOutcome>;
  debounceMs?: number;  // default 250
  minLength?: number;   // default 3
}): LookupSession;

export type LookupState =
  | { status: "idle" }
  | { status: "loading"; results: LookupResult[] }        // prior results retained
  | { status: "results"; query: string; results: LookupResult[] }
  | { status: "empty";   query: string }
  | { status: "error";   query: string; reason: "network" | "upstream" | "invalid" };
```

**Defaults: 250ms debounce, 3-character minimum, 6 results.**

The invariant this module exists to guarantee, stated so it can be tested:
**only the newest query's results are ever emitted.** Enforced two ways — an
`AbortController` per in-flight request, plus a monotonic request token checked on
resolution, so even a response that races past `abort()` is discarded.

`loading` deliberately carries the previous results so the list does not blank and
re-fill on every keystroke.

**Cache.** A session-scoped `Map<string, LookupResult[]>` keyed on the trimmed,
lowercased query, capped at 50 entries (FIFO eviction). Backspacing therefore never
refetches. **Only successful outcomes are cached** — caching an error would pin a
transient network failure for the rest of the session. The cache dies with the sheet.

Together, debounce + 3-char minimum + cache means roughly **one upstream request per
typing pause**, which is what keeps us inside Photon's "be fair" terms. The route
additionally keeps `next: { revalidate: 3600 }`, so repeated queries collapse at the
Vercel Data Cache layer too.

## 9. Interaction and accessibility

`LookupCombobox` implements the ARIA 1.2 combobox-with-listbox pattern:

- Input: `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-autocomplete="list"`, `aria-activedescendant`.
- List: `role="listbox"`, **`aria-label="Place suggestions"`** (issue #7, item 3).
- Options: `role="option"`, `aria-selected`, stable `id`s for `aria-activedescendant`.
- Keys: ↓/↑ move (wrapping), Enter selects the active option, Escape closes the list
  and keeps typed text, Tab closes and moves on.
- A polite `aria-live` region announces counts — "6 suggestions", "No matches".

**Suggestions render inline, below the input — not as an absolutely-positioned
popover.** Inside an `h-dvh` bottom sheet with the iOS keyboard raised, a floating
popover is unreliable; an inline list simply pushes content down in an
already-scrollable sheet. Rows are ≥44px per CLAUDE.md.

**The "Look up" button is removed.** Live suggestions make it redundant, and keeping
both would mean two paths into the same state.

**The suppress-after-select subtlety.** The input is simultaneously the place *name*
and the *search box*. Selecting a suggestion writes that suggestion's name back into
the input — which would otherwise immediately trigger a fresh search for the name just
filled in, reopening the list under the user. `selected()` sets a one-shot suppression
flag consumed by the next `search()` call. This gets its own test.

**Prefill path.** `AddPlaceHost`'s `autoLookup` prefill (share-link import, T7) still
works: it seeds the query and fires the session immediately, bypassing the debounce
for that one mount-time search. The existing one-shot `useEffect` is replaced by the
session's own lifecycle.

**States rendered:** below-minimum → nothing; `loading` → prior list plus a subtle
indicator; `results` → the list; `empty` → "No matches — add manually."; `error` →
"Couldn't reach lookup — add manually." Manual entry is always available regardless.

## 10. Attribution

ODbL requires it and savor currently has none. A single line beneath the suggestions
list — "Results © OpenStreetMap contributors" — linking to
`https://www.openstreetmap.org/copyright`. Cellar tokens, `text-xs`, `text-ink-soft`.

## 11. Relationship to the future map view

The planned map view influenced two decisions here and is otherwise deferred:

- It **reinforces** the OSM choice. Google Places content must be displayed on a
  Google Map, so choosing Google for geocoding would have dragged tiles, billing and
  Google branding along with it — while leaving the permanent-storage problem
  unsolved underneath.
- It motivates persisting `osmId` now (§7).

Deliberately **not** decided here: the tile provider. That choice depends on
raster-vs-vector, styling control, and offline caching — none of which are scoped yet.
Some providers (Geoapify, MapTiler, Stadia) serve geocoding *and* tiles under one key;
if the map view later favours one, consolidating the geocoder onto it is a one-file
change behind the `/api/lookup` seam. Deciding it now, blind, would be speculative
coupling. The map view will also need MapLibre GL or equivalent — a real npm
dependency, and therefore a conversation under CLAUDE.md's ask-first rule.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Photon's public instance has no availability guarantee | `error` state degrades to manual entry, which always works. Swapping providers is one file behind `/api/lookup`. |
| Photon's soft bias lets distant results into the tail | Food-only `osm_tag` filter removes category noise; each row shows city/state so distance is legible. Revisit a hard distance cut only if it proves annoying in use. |
| IP bias is wrong on VPN or while travelling | Bias only *reranks* — the correct result is still reachable by typing more. `navigator.geolocation` is the escalation, deferred to the map view. |
| Typing bursts hit Photon harder than a button did | Debounce + 3-char minimum + session cache + route-level `revalidate: 3600`. |
| `LookupOutcome` is a breaking change to `lib/lookup.ts` | Single call site (`PlaceForm.tsx`); tests rewritten in the same commit. |

## 13. Testing

All new logic is framework-free and lands under the existing `lib/**/*.test.ts`
include path. No new test infrastructure and no new dependencies.

**`lib/photon.test.ts`** — GeoJSON → `LookupResult` mapping; `[lng, lat]` order (a
transposition here would be silent and catastrophic); address composition and each
city fallback; `osmId` normalisation for all three `osm_type` values; per-feature drop
of missing `name` / non-finite coordinates; `buildPhotonUrl` with and without bias and
with a query needing encoding; `readBiasFromHeaders` for present / absent / malformed
/ out-of-range headers and 2-decimal rounding.

**`lib/lookup.test.ts`** (rewritten) — each failure mode maps to its `reason`;
successful parse; per-entry malformed-entry dropping; `MAX_RESULTS` cap; `AbortSignal`
forwarded to `fetch`; abort rejects rather than resolving.

**`lib/autocomplete.test.ts`** (new, fake timers + stub search) —
debounce coalesces a burst into one call; below-minimum never calls;
**out-of-order responses: slow "ta" resolving after fast "tacos" must not overwrite**
(the issue #7 bug, finally covered); `abort` called on the superseded request;
cache hit on backspace issues no second call; errors are not cached;
`selected()` suppresses exactly one following search;
`cancel`/`destroy` stop pending timers and emit no further state.

**`lib/repo.test.ts`** (extended) — `createPlace` round-trips `osmId`; a place created
without one stays `undefined`; `lib/backup.test.ts` confirms it survives an
export → import cycle, since `placeFields` is shared with the restore schema.

**Manual verification** — a real device pass: iOS keyboard behaviour with the inline
list, VoiceOver announcement of the live region, and the share-link `autoLookup`
prefill path still landing on suggestions.

**Green before commit:** `npm test`, `npm run build`, `npm run lint`.

## 14. Rejected alternatives

- **Keep Nominatim, debounce politely.** Would violate an explicit written prohibition
  from a volunteer-funded service. Not a close call.
- **Google Places storing only `place_id`.** Fully compliant and genuinely works — at
  the cost of offline support and a billed call per place render. Backwards for an
  app whose premise is working on a plane.
- **Geoapify now** (OSM, keyed, autocomplete-permitted). Same ODbL data as Photon, so
  no data-quality gain; its advantages are SLA and tiles-under-one-key, both of which
  belong to the map-view decision. Config cost was *not* the reason to decline —
  env vars are acceptable in this repo.
- **Debounce via `useDeferredValue`.** Handles neither abort, nor ordering, nor
  caching, and lives in a component where nothing can test it.
