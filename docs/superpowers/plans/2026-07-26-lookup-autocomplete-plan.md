# Place-lookup Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Read first:** `docs/superpowers/specs/2026-07-25-lookup-autocomplete-design.md` — the
> approved design and, more importantly, *why* Nominatim cannot be used for this.

**Goal:** Replace the "Look up" button in the add-place sheet with a live, debounced
autocomplete dropdown backed by Photon, closing issues #22 and #7.

**Architecture:** Photon (`photon.komoot.io`) replaces Nominatim inside the existing
`/api/lookup` proxy — the route stays the only thing that talks to a geocoder. All
sequencing logic (debounce, abort, stale-response discard, caching) moves into
framework-free `lib/` modules, because `vitest.config.ts` only covers `lib/**/*.test.ts`
and logic left in a component is untested logic. The React layer becomes a thin ARIA
combobox.

**Tech Stack:** Next.js 16 App Router (Node runtime route), React 19, TypeScript strict,
zod 4, Vitest 4, Tailwind v4 with Cellar `@theme` tokens.

## Global Constraints

- **No new npm dependencies.** zod + built-ins only (CLAUDE.md).
- **Green before every commit:** `npm test`, `npm run build`, `npm run lint` must all
  pass. Every task ends green — no task may leave the build broken for a later one.
- **Dev server runs on port 3001**, never 3000: `npm run dev -- -p 3001`. A parallel
  agent may be using 3000.
- Commit straight to the current branch with conventional-commit messages. **Stage
  explicit paths — never `git add -A`.**
- TypeScript `strict`; path alias `@/*` → repo root.
- Reads through `lib/hooks.ts`, writes through `lib/repo.ts`. Components never import
  Dexie.
- **Data-model changes are additive only.** The `osmId` field adds no index, therefore
  **no `db.version(2)` block and no `SCHEMA_VERSION` bump** (a bump would trip
  `parseBackup`'s exact-version check — an unresolved fast-follow).
- Keep `lib/types.ts` ↔ `lib/repo.ts` `placeFields` in sync — they are two hand-
  maintained sources of truth for the same shape.
- Cellar `@theme` tokens only (`plum`, `ember`, `gold`, `shell`, `surface`, `ink`,
  `line`, …). No raw hex, no off-palette Tailwind colors.
- Mobile-first: ≥44px touch targets, `text-base` (≥16px) on text inputs so iOS doesn't
  focus-zoom.
- `lib/` stays framework-free — no React, no DOM globals beyond `fetch`/`Headers`/
  `AbortController` — so Vitest runs it without jsdom.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/lookup.ts` (modify) | Client seam: one call to our own `/api/lookup`, zod-validate, classify failures | 1 |
| `lib/lookup.test.ts` (rewrite) | Pins the `LookupOutcome` contract | 1 |
| `lib/photon.ts` (create) | Upstream seam: query cap, bias headers, URL building, GeoJSON → `LookupResult` | 2, 3 |
| `lib/photon.test.ts` (create) | Pins the Photon wire-format mapping | 2, 3 |
| `app/api/lookup/route.ts` (modify) | Thin shell over `lib/photon.ts` | 4 |
| `lib/autocomplete.ts` (create) | Sequencing: debounce, abort, stale-discard, cache | 5 |
| `lib/autocomplete.test.ts` (create) | Pins the "newest query wins" invariant | 5 |
| `lib/types.ts`, `lib/repo.ts` (modify) | `Place.osmId` | 6 |
| `app/components/places/LookupCombobox.tsx` (create) | ARIA combobox UI | 7 |
| `app/components/places/PlaceForm.tsx` (modify) | Consumes the combobox; loses the button | 8 |
| `CLAUDE.md`, `README.md` (modify) | Architecture tree + resolved fast-follow | 9 |

## Deviation from the spec (flag at review)

Spec §8 specifies a `selected()` method carrying a one-shot suppression flag, to stop
the programmatic name-write after selection from re-triggering a search. **This plan
drops it**, because searches are driven from the input's `onChange` handler (user input
only) rather than a `useEffect` on the value — and React does not fire `onChange` for a
programmatic state update, so the re-trigger it guards against cannot happen. The select
handler calls `cancel()` to close the list instead. If a future change moves searching
into an effect, the suppression flag must come back.

---

## Task 1: `LookupOutcome` — make failure distinguishable from empty

**Files:**
- Modify: `lib/lookup.ts` (whole file)
- Rewrite: `lib/lookup.test.ts`
- Modify: `app/components/places/PlaceForm.tsx:98-99` (minimal patch to stay green)

**Interfaces:**
- Produces: `MAX_RESULTS = 6`, `lookupResultSchema`, `type LookupResult`,
  `type LookupOutcome = { ok: true; results: LookupResult[] } | { ok: false; reason: "network" | "upstream" | "invalid" }`,
  `searchPlaces(q: string, signal?: AbortSignal): Promise<LookupOutcome>`

**Context:** Today every failure collapses to `[]`. With a button that was defensible;
with a live dropdown a network blip renders as *"that restaurant doesn't exist."*
`AbortError` is deliberately **not** an outcome — it rethrows, so Task 5 can drop a
superseded request silently rather than render it as a failure.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `lib/lookup.test.ts`:

```ts
// searchPlaces returns a discriminated LookupOutcome so the UI can tell "lookup failed"
// from "no matches" — a distinction a live dropdown needs and the old degrade-to-[]
// contract threw away. AbortError is the one thing that rejects rather than resolving:
// a superseded request has no answer worth rendering. fetch is stubbed per-test.

import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "./lookup";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchPlaces", () => {
  it("returns ok with parsed results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { name: "Taco Spot", address: "123 Main St", city: "Austin", lat: 30.1, lng: -97.7 },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await searchPlaces("taco");

    expect(outcome).toEqual({
      ok: true,
      results: [
        { name: "Taco Spot", address: "123 Main St", city: "Austin", lat: 30.1, lng: -97.7 },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/lookup?q=taco", { signal: undefined });
  });

  it("keeps the new optional category and osmId fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { name: "Franklin Barbecue", lat: 30.27, lng: -97.73, category: "restaurant", osmId: "way/382368408" },
        ])
      )
    );

    const outcome = await searchPlaces("franklin");

    expect(outcome).toEqual({
      ok: true,
      results: [
        { name: "Franklin Barbecue", lat: 30.27, lng: -97.73, category: "restaurant", osmId: "way/382368408" },
      ],
    });
  });

  it("encodes the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await searchPlaces("ramen & noodles");

    expect(fetchMock).toHaveBeenCalledWith("/api/lookup?q=ramen%20%26%20noodles", {
      signal: undefined,
    });
  });

  it("forwards an AbortSignal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await searchPlaces("taco", controller.signal);

    expect(fetchMock).toHaveBeenCalledWith("/api/lookup?q=taco", {
      signal: controller.signal,
    });
  });

  it("rethrows AbortError instead of returning an outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"))
    );

    await expect(searchPlaces("taco")).rejects.toThrow(DOMException);
  });

  it("ok with an empty array is a real 'no matches', not a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    expect(await searchPlaces("zzzz")).toEqual({ ok: true, results: [] });
  });

  it("returns reason 'network' when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await searchPlaces("anything")).toEqual({ ok: false, reason: "network" });
  });

  it("returns reason 'upstream' on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([], false, 502)));

    expect(await searchPlaces("anything")).toEqual({ ok: false, reason: "upstream" });
  });

  it("returns reason 'invalid' when the body is not an array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" })));

    expect(await searchPlaces("anything")).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns reason 'invalid' when the body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as Response)
    );

    expect(await searchPlaces("anything")).toEqual({ ok: false, reason: "invalid" });
  });

  it("drops individual malformed entries but keeps valid ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { name: "Valid Spot", lat: 1, lng: 2 },
          { name: "Missing Lat", lng: 2 },
          { lat: 3, lng: 4 },
          { name: "Also Valid", lat: 5, lng: 6 },
        ])
      )
    );

    expect(await searchPlaces("spot")).toEqual({
      ok: true,
      results: [
        { name: "Valid Spot", lat: 1, lng: 2 },
        { name: "Also Valid", lat: 5, lng: 6 },
      ],
    });
  });

  it("caps results at MAX_RESULTS (6)", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Place ${i}`, lat: i, lng: i }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(many)));

    const outcome = await searchPlaces("place");

    expect(outcome.ok && outcome.results).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/lookup.test.ts`
Expected: FAIL — the current `searchPlaces` resolves to an array, so every
`toEqual({ ok: ... })` assertion mismatches.

- [ ] **Step 3: Rewrite `lib/lookup.ts`**

```ts
// searchPlaces — client-side entry point for the add-place lookup flow. Calls this app's
// own /api/lookup proxy (never a geocoder directly — the server route owns the upstream
// choice, the User-Agent, and the location bias), then zod-validates what comes back.
//
// It returns a discriminated LookupOutcome rather than degrading every failure to []. A
// live autocomplete renders "no matches" constantly, so an offline blip that looked like
// an empty result would read as "that restaurant doesn't exist". Individually malformed
// entries are still dropped silently — one bad row shouldn't sink a good response.
//
// AbortError is the deliberate exception: it rethrows rather than becoming an outcome,
// because a superseded request has no answer worth showing. lib/autocomplete.ts swallows
// it.

import { z } from "zod";

// Shared by the route (as Photon's `limit`) and here (as a defensive cap) so the two can
// never drift.
export const MAX_RESULTS = 6;

export const lookupResultSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  // OSM's amenity/shop value — "restaurant", "cafe", "bakery". Display-only: it renders
  // as the secondary line of a suggestion and is discarded on select.
  category: z.string().optional(),
  // Normalised OSM identity, e.g. "way/382368408". Persisted onto Place — see lib/types.ts.
  osmId: z.string().optional(),
});

export type LookupResult = z.infer<typeof lookupResultSchema>;

export type LookupFailureReason = "network" | "upstream" | "invalid";

export type LookupOutcome =
  | { ok: true; results: LookupResult[] }
  | { ok: false; reason: LookupFailureReason };

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<LookupOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/lookup?q=${encodeURIComponent(q)}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { ok: false, reason: "network" };
  }

  if (!res.ok) return { ok: false, reason: "upstream" };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!Array.isArray(body)) return { ok: false, reason: "invalid" };

  const results: LookupResult[] = [];
  for (const item of body) {
    const parsed = lookupResultSchema.safeParse(item);
    if (parsed.success) results.push(parsed.data);
  }
  return { ok: true, results: results.slice(0, MAX_RESULTS) };
}
```

- [ ] **Step 4: Patch `PlaceForm.tsx` so the build stays green**

Task 8 replaces this whole block. For now, the two changed lines at
`app/components/places/PlaceForm.tsx:98-99`:

```tsx
    const outcome = await searchPlaces(trimmedName);
    setLookupResults(outcome.ok ? outcome.results : []);
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run lib/lookup.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: Verify the whole suite and the build**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/lookup.ts lib/lookup.test.ts app/components/places/PlaceForm.tsx
git commit -m "refactor(lookup): return a discriminated LookupOutcome instead of degrading to []"
```

---

## Task 2: `lib/photon.ts` — query cap, bias headers, URL building

**Files:**
- Create: `lib/photon.ts`
- Create: `lib/photon.test.ts`

**Interfaces:**
- Consumes: `MAX_RESULTS` from `lib/lookup.ts` (Task 1)
- Produces: `PHOTON_SEARCH_URL`, `MAX_QUERY_LENGTH = 200`, `FOOD_TAGS`,
  `interface Bias { lat: number; lng: number }`,
  `readBiasFromHeaders(headers: Headers): Bias | null`,
  `buildPhotonUrl(q: string, bias: Bias | null): string`

**Context — the bug this task's tests exist to prevent:** `headers.get()` returns `null`
for an absent header, and `Number(null) === 0`, as does `Number("")`. A naive
implementation silently biases every lookup to **0°N 0°E** (the Atlantic off Ghana)
whenever the header is missing — which is *always*, in local dev. Absent headers must
return `null`, not a zero bias.

- [ ] **Step 1: Write the failing tests**

Create `lib/photon.test.ts`:

```ts
// lib/photon.ts is the upstream seam: everything that knows Photon's wire format lives
// here so app/api/lookup/route.ts can stay a thin shell — and so this logic is covered at
// all, since vitest only includes lib/**.

import { describe, expect, it } from "vitest";
import { buildPhotonUrl, FOOD_TAGS, MAX_QUERY_LENGTH, readBiasFromHeaders } from "./photon";

describe("MAX_QUERY_LENGTH", () => {
  it("is 200", () => {
    expect(MAX_QUERY_LENGTH).toBe(200);
  });
});

describe("readBiasFromHeaders", () => {
  it("reads Vercel's IP geolocation headers", () => {
    const headers = new Headers({
      "x-vercel-ip-latitude": "30.2672",
      "x-vercel-ip-longitude": "-97.7431",
    });

    expect(readBiasFromHeaders(headers)).toEqual({ lat: 30.27, lng: -97.74 });
  });

  it("rounds to 2 decimals so Data Cache keys collapse across nearby users", () => {
    const headers = new Headers({
      "x-vercel-ip-latitude": "37.774929",
      "x-vercel-ip-longitude": "-122.419418",
    });

    expect(readBiasFromHeaders(headers)).toEqual({ lat: 37.77, lng: -122.42 });
  });

  // Number(null) === 0 and Number("") === 0, so a naive implementation biases every
  // local-dev lookup to 0,0 in the Atlantic. Absent means absent.
  it("returns null when the headers are absent (NOT a 0,0 bias)", () => {
    expect(readBiasFromHeaders(new Headers())).toBeNull();
  });

  it("returns null when a header is empty", () => {
    const headers = new Headers({
      "x-vercel-ip-latitude": "",
      "x-vercel-ip-longitude": "-97.7431",
    });

    expect(readBiasFromHeaders(headers)).toBeNull();
  });

  it("returns null when a header is not a number", () => {
    const headers = new Headers({
      "x-vercel-ip-latitude": "not-a-number",
      "x-vercel-ip-longitude": "-97.7431",
    });

    expect(readBiasFromHeaders(headers)).toBeNull();
  });

  it("returns null when only one of the pair is present", () => {
    expect(readBiasFromHeaders(new Headers({ "x-vercel-ip-latitude": "30.26" }))).toBeNull();
  });

  it("returns null for out-of-range coordinates", () => {
    const badLat = new Headers({
      "x-vercel-ip-latitude": "91",
      "x-vercel-ip-longitude": "0",
    });
    const badLng = new Headers({
      "x-vercel-ip-latitude": "0",
      "x-vercel-ip-longitude": "181",
    });

    expect(readBiasFromHeaders(badLat)).toBeNull();
    expect(readBiasFromHeaders(badLng)).toBeNull();
  });

  it("accepts a genuine 0,0 bias when both headers really say so", () => {
    const headers = new Headers({
      "x-vercel-ip-latitude": "0",
      "x-vercel-ip-longitude": "0",
    });

    expect(readBiasFromHeaders(headers)).toEqual({ lat: 0, lng: 0 });
  });
});

describe("buildPhotonUrl", () => {
  it("includes the query, the limit, and every food tag", () => {
    const url = new URL(buildPhotonUrl("taco", null));

    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(url.searchParams.get("q")).toBe("taco");
    expect(url.searchParams.get("limit")).toBe("6");
    expect(url.searchParams.getAll("osm_tag")).toEqual([...FOOD_TAGS]);
  });

  it("omits lat/lon entirely when there is no bias", () => {
    const url = new URL(buildPhotonUrl("taco", null));

    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("lon")).toBe(false);
  });

  it("emits lat and lon (Photon uses 'lon', not 'lng') when biased", () => {
    const url = new URL(buildPhotonUrl("taco", { lat: 30.27, lng: -97.74 }));

    expect(url.searchParams.get("lat")).toBe("30.27");
    expect(url.searchParams.get("lon")).toBe("-97.74");
  });

  it("encodes a query containing spaces and ampersands", () => {
    const url = new URL(buildPhotonUrl("ramen & noodles", null));

    expect(url.searchParams.get("q")).toBe("ramen & noodles");
    expect(url.toString()).toContain("q=ramen+%26+noodles");
  });

  it("restricts results to food venues", () => {
    expect(FOOD_TAGS).toContain("amenity:restaurant");
    expect(FOOD_TAGS).toContain("shop:bakery");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/photon.test.ts`
Expected: FAIL — "Failed to resolve import ./photon".

- [ ] **Step 3: Create `lib/photon.ts`**

```ts
// The Photon (photon.komoot.io) upstream seam. Everything that knows Photon's wire format
// lives here; app/api/lookup/route.ts is a thin shell over it. Two reasons for the split:
// routes sit outside vitest's include path (lib/**), so logic left in the route is
// untested; and keeping the upstream isolated is what makes swapping geocoders a one-file
// change.
//
// Photon rather than Nominatim because Nominatim's usage policy explicitly forbids
// type-ahead ("you must not implement such a service on the client side using the API").
// Photon is the same OSM/ODbL data, purpose-built for search-as-you-type — see
// docs/superpowers/specs/2026-07-25-lookup-autocomplete-design.md §2.

import { MAX_RESULTS } from "./lookup";

export const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";

// Bounds `q` before it reaches the upstream. Nothing legitimate approaches 200 chars.
export const MAX_QUERY_LENGTH = 200;

// savor is a restaurant app, so results are restricted to food venues. Without this,
// "Kogi" returns Nigerian administrative boundaries; with it, only eateries. Sent as
// repeated osm_tag params, which Photon ORs together.
export const FOOD_TAGS = [
  "amenity:restaurant",
  "amenity:cafe",
  "amenity:fast_food",
  "amenity:bar",
  "amenity:pub",
  "amenity:ice_cream",
  "shop:bakery",
  "shop:deli",
  "shop:confectionery",
] as const;

export interface Bias {
  lat: number;
  lng: number;
}

// Vercel injects these on every request, so the bias costs no permission prompt and no
// client-side geolocation API. Absent in local dev, which is fine — bias only reranks.
export function readBiasFromHeaders(headers: Headers): Bias | null {
  const rawLat = headers.get("x-vercel-ip-latitude");
  const rawLng = headers.get("x-vercel-ip-longitude");
  // Explicit null/empty guards: Number(null) and Number("") are both 0, so falling
  // through would silently bias every unbiased lookup to 0°N 0°E.
  if (rawLat === null || rawLng === null) return null;
  if (rawLat.trim() === "" || rawLng.trim() === "") return null;

  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  // ~1km precision. Coarse on purpose: it collapses Vercel Data Cache keys across nearby
  // users instead of minting one per distinct IP location.
  return { lat: round2(lat), lng: round2(lng) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildPhotonUrl(q: string, bias: Bias | null): string {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(MAX_RESULTS));
  if (bias) {
    // Photon spells it "lon", not "lng".
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lng));
  }
  for (const tag of FOOD_TAGS) params.append("osm_tag", tag);
  return `${PHOTON_SEARCH_URL}?${params.toString()}`;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run lib/photon.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/photon.ts lib/photon.test.ts
git commit -m "feat(photon): query cap, Vercel IP bias headers, and food-filtered URL building"
```

---

## Task 3: `lib/photon.ts` — GeoJSON → `LookupResult` mapping

**Files:**
- Modify: `lib/photon.ts` (append)
- Modify: `lib/photon.test.ts` (append)

**Interfaces:**
- Consumes: `lookupResultSchema`, `LookupResult`, `MAX_RESULTS` from `lib/lookup.ts`
- Produces: `toLookupResults(body: unknown): LookupResult[]`

**Context:** A real Photon feature, captured from the live API, looks like:

```json
{
  "type": "Feature",
  "properties": {
    "osm_type": "W", "osm_id": 382368408,
    "osm_key": "amenity", "osm_value": "restaurant",
    "housenumber": "900", "name": "Franklin Barbecue",
    "street": "East 11th Street", "locality": "Central East Austin",
    "city": "Austin", "county": "Travis", "state": "TX", "postcode": "78702"
  },
  "geometry": { "type": "Point", "coordinates": [-97.7312847, 30.2701463] }
}
```

**The single most dangerous line in this task:** GeoJSON orders coordinates
**`[longitude, latitude]`** — the reverse of every other lat/lng pair in savor.
Transposing them fails silently and puts every saved place in the wrong hemisphere.

- [ ] **Step 1: Write the failing tests**

Append to `lib/photon.test.ts` (and extend the import at the top of the file to
`import { buildPhotonUrl, FOOD_TAGS, MAX_QUERY_LENGTH, readBiasFromHeaders, toLookupResults } from "./photon";`):

```ts
describe("toLookupResults", () => {
  // Captured verbatim from the live Photon API.
  const franklin = {
    type: "Feature",
    properties: {
      osm_type: "W",
      osm_id: 382368408,
      osm_key: "amenity",
      osm_value: "restaurant",
      housenumber: "900",
      name: "Franklin Barbecue",
      street: "East 11th Street",
      locality: "Central East Austin",
      city: "Austin",
      county: "Travis",
      state: "TX",
      postcode: "78702",
    },
    geometry: { type: "Point", coordinates: [-97.7312847, 30.2701463] },
  };

  it("maps a real feature into a LookupResult", () => {
    expect(toLookupResults({ features: [franklin] })).toEqual([
      {
        name: "Franklin Barbecue",
        address: "900 East 11th Street",
        city: "Austin",
        lat: 30.2701463,
        lng: -97.7312847,
        category: "restaurant",
        osmId: "way/382368408",
      },
    ]);
  });

  // GeoJSON is [lng, lat]. Getting this backwards is silent and catastrophic.
  it("reads coordinates as [lng, lat], not [lat, lng]", () => {
    const [result] = toLookupResults({ features: [franklin] });

    expect(result.lat).toBeCloseTo(30.27, 2);
    expect(result.lng).toBeCloseTo(-97.73, 2);
  });

  it("normalises all three osm_type prefixes", () => {
    const at = (osm_type: string, osm_id: number) => ({
      properties: { name: "X", osm_type, osm_id },
      geometry: { coordinates: [1, 2] },
    });

    const results = toLookupResults({ features: [at("N", 1), at("W", 2), at("R", 3)] });

    expect(results.map((r) => r.osmId)).toEqual(["node/1", "way/2", "relation/3"]);
  });

  it("omits osmId when osm_type is unrecognised or osm_id is missing", () => {
    const results = toLookupResults({
      features: [
        { properties: { name: "A", osm_type: "Z", osm_id: 1 }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "B", osm_type: "W" }, geometry: { coordinates: [1, 2] } },
      ],
    });

    expect(results.map((r) => r.osmId)).toEqual([undefined, undefined]);
  });

  it("falls back through city -> locality -> county", () => {
    const results = toLookupResults({
      features: [
        { properties: { name: "A", city: "Austin", locality: "L", county: "C" }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "B", locality: "Central East Austin", county: "C" }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "C", county: "Travis" }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "D" }, geometry: { coordinates: [1, 2] } },
      ],
    });

    expect(results.map((r) => r.city)).toEqual([
      "Austin",
      "Central East Austin",
      "Travis",
      undefined,
    ]);
  });

  it("composes address from housenumber + street, falling back to locality", () => {
    const results = toLookupResults({
      features: [
        { properties: { name: "A", housenumber: "900", street: "E 11th St" }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "B", street: "E 11th St" }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "C", locality: "Downtown" }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "D" }, geometry: { coordinates: [1, 2] } },
      ],
    });

    expect(results.map((r) => r.address)).toEqual([
      "900 E 11th St",
      "E 11th St",
      "Downtown",
      undefined,
    ]);
  });

  it("drops features with no name", () => {
    const results = toLookupResults({
      features: [
        { properties: { name: "Keeper" }, geometry: { coordinates: [1, 2] } },
        { properties: {}, geometry: { coordinates: [1, 2] } },
        { properties: { name: "   " }, geometry: { coordinates: [1, 2] } },
      ],
    });

    expect(results.map((r) => r.name)).toEqual(["Keeper"]);
  });

  it("drops features with missing or non-finite coordinates", () => {
    const results = toLookupResults({
      features: [
        { properties: { name: "Keeper" }, geometry: { coordinates: [1, 2] } },
        { properties: { name: "NoGeometry" } },
        { properties: { name: "Short" }, geometry: { coordinates: [1] } },
        { properties: { name: "NaN" }, geometry: { coordinates: ["x", 2] } },
      ],
    });

    expect(results.map((r) => r.name)).toEqual(["Keeper"]);
  });

  it("caps at MAX_RESULTS", () => {
    const features = Array.from({ length: 9 }, (_, i) => ({
      properties: { name: `Place ${i}` },
      geometry: { coordinates: [i, i] },
    }));

    expect(toLookupResults({ features })).toHaveLength(6);
  });

  it("returns [] for any non-FeatureCollection body", () => {
    expect(toLookupResults(null)).toEqual([]);
    expect(toLookupResults("nope")).toEqual([]);
    expect(toLookupResults({})).toEqual([]);
    expect(toLookupResults({ features: "not-an-array" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/photon.test.ts`
Expected: FAIL — `toLookupResults is not a function`.

- [ ] **Step 3: Append the implementation to `lib/photon.ts`**

```ts
// Photon's GeoJSON, narrowed to the fields this module reads.
interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  city?: string;
  county?: string;
  osm_type?: string;
  osm_id?: number;
  osm_value?: string;
}

interface PhotonFeature {
  properties?: PhotonProperties;
  geometry?: { coordinates?: unknown };
}

const OSM_TYPE_NAMES: Record<string, string> = { N: "node", W: "way", R: "relation" };

export function toLookupResults(body: unknown): LookupResult[] {
  if (typeof body !== "object" || body === null) return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const results: LookupResult[] = [];
  for (const feature of features.slice(0, MAX_RESULTS)) {
    const mapped = toLookupResult(feature);
    if (mapped) results.push(mapped);
  }
  return results;
}

// One feature in, one LookupResult or null out. Bad features are dropped individually
// rather than sinking the whole response — one malformed row shouldn't cost the user
// five good suggestions.
function toLookupResult(raw: unknown): LookupResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const feature = raw as PhotonFeature;
  const props = feature.properties ?? {};

  const name = props.name?.trim();
  if (!name) return null;

  // GeoJSON orders coordinates [longitude, latitude] — the reverse of every other lat/lng
  // pair in savor. Transposing here is silent and puts the place in the wrong hemisphere.
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const street = [props.housenumber, props.street].filter(Boolean).join(" ").trim();
  const address = street || props.locality || undefined;
  const city = props.city ?? props.locality ?? props.county;
  const osmId = normaliseOsmId(props);

  return {
    name,
    ...(address ? { address } : {}),
    ...(city ? { city } : {}),
    lat,
    lng,
    ...(props.osm_value ? { category: props.osm_value } : {}),
    ...(osmId ? { osmId } : {}),
  };
}

// "W" + 382368408 -> "way/382368408". The long form is self-describing and usable
// directly against Overpass or the OSM API later.
function normaliseOsmId(props: PhotonProperties): string | undefined {
  const typeName = props.osm_type ? OSM_TYPE_NAMES[props.osm_type] : undefined;
  if (!typeName || typeof props.osm_id !== "number") return undefined;
  return `${typeName}/${props.osm_id}`;
}
```

Also extend the import at the top of `lib/photon.ts`:

```ts
import { MAX_RESULTS, type LookupResult } from "./lookup";
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run lib/photon.test.ts`
Expected: PASS (24 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/photon.ts lib/photon.test.ts
git commit -m "feat(photon): map Photon GeoJSON features to LookupResult"
```

---

## Task 4: Switch `/api/lookup` from Nominatim to Photon

**Files:**
- Modify: `app/api/lookup/route.ts` (whole file)

**Interfaces:**
- Consumes: `buildPhotonUrl`, `MAX_QUERY_LENGTH`, `readBiasFromHeaders`,
  `toLookupResults` from `lib/photon.ts`

**Context:** After this task the app works end-to-end on Photon while still using the
old button UI — a genuine checkpoint you can exercise by hand. Routes are outside
vitest's include path, which is exactly why every decision above lives in `lib/`; what
remains here is orchestration.

- [ ] **Step 1: Replace `app/api/lookup/route.ts`**

```ts
// GET /api/lookup?q= — Photon (OpenStreetMap) search proxy for the add-place autocomplete.
// Runs on the Node runtime so it can set an identifying User-Agent and read Vercel's IP
// geolocation headers. This route is the only thing in savor that ever talks to a geocoder.
//
// Deliberately thin: query-cap, bias parsing, URL building and response mapping all live in
// lib/photon.ts, because vitest only covers lib/** and logic left here would be untested.
//
// Photon rather than Nominatim because Nominatim's usage policy forbids type-ahead outright.
// See docs/superpowers/specs/2026-07-25-lookup-autocomplete-design.md §2.

import { NextResponse } from "next/server";
import {
  buildPhotonUrl,
  MAX_QUERY_LENGTH,
  readBiasFromHeaders,
  toLookupResults,
} from "@/lib/photon";

export const runtime = "nodejs";

const USER_AGENT = "savor/1.0 (https://github.com/mzetinajimenez/savor)";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: 'Missing or empty query parameter "q"' },
      { status: 400 }
    );
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  // Bias is best-effort: absent headers (local dev) simply mean an unbiased search.
  const upstreamUrl = buildPhotonUrl(q, readBiasFromHeaders(request.headers));

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": USER_AGENT },
      // Repeated queries collapse in Vercel's Data Cache, which is most of how savor stays
      // inside Photon's "be fair" terms — the rest is the debounce and session cache in
      // lib/autocomplete.ts.
      next: { revalidate: 3600 },
    });
  } catch {
    return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
  }

  return NextResponse.json(toLookupResults(data));
}
```

- [ ] **Step 2: Verify the build and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 3: Verify against the real upstream by hand**

Start the dev server **on port 3001** (3000 may be in use by a parallel agent):

```bash
npm run dev -- -p 3001
```

Then, in another shell:

```bash
curl -s 'http://localhost:3001/api/lookup?q=Franklin%20Barbecue' | head -c 600
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3001/api/lookup?q='
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3001/api/lookup?q=$(printf 'x%.0s' {1..250})"
```

Expected: the first returns a JSON array whose first entry is Franklin Barbecue in
Austin with `"osmId":"way/382368408"` and `"category":"restaurant"`; the second returns
`400`; the third returns `400`.

- [ ] **Step 4: Commit**

```bash
git add app/api/lookup/route.ts
git commit -m "feat(api): switch /api/lookup from Nominatim to Photon

Nominatim's usage policy forbids type-ahead outright, which blocks #22. Photon is
the same OSM/ODbL data, purpose-built for search-as-you-type, and adds native
lat/lon bias plus osm_tag food filtering. Closes the query-length cap from #7."
```

---

## Task 5: `lib/autocomplete.ts` — the sequencing state machine

**Files:**
- Create: `lib/autocomplete.ts`
- Create: `lib/autocomplete.test.ts`

**Interfaces:**
- Consumes: `LookupOutcome`, `LookupResult`, `LookupFailureReason` from `lib/lookup.ts`
- Produces: `type LookupState`, `interface LookupSession`,
  `createLookupSession(opts): LookupSession`, `DEFAULT_DEBOUNCE_MS = 250`,
  `DEFAULT_MIN_LENGTH = 3`

**Context:** This module exists to make one invariant testable: **only the newest
query's results are ever emitted.** That is issue #7's bug — today an in-flight
`searchPlaces` response can land after the user has typed something else and repopulate
the list for a stale query, and nothing catches it because the logic sits in a React
component. The search function is *injected* rather than imported, which is what lets
these tests run with fake timers and no network.

- [ ] **Step 1: Write the failing tests**

Create `lib/autocomplete.test.ts`:

```ts
// createLookupSession owns "when to search" and "which answer wins". Its whole reason for
// existing outside React is testability: the search fn is injected, so these tests drive it
// with fake timers and hand-resolved promises, no network and no DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLookupSession, type LookupState } from "./autocomplete";
import type { LookupOutcome, LookupResult } from "./lookup";

function place(name: string): LookupResult {
  return { name, lat: 1, lng: 2 };
}

function ok(...names: string[]): LookupOutcome {
  return { ok: true, results: names.map(place) };
}

// Collects every emitted state so assertions can look at the sequence, not just the end.
function harness(search: (q: string, signal: AbortSignal) => Promise<LookupOutcome>) {
  const states: LookupState[] = [];
  const session = createLookupSession({ onState: (s) => states.push(s), search });
  return { states, session, last: () => states[states.length - 1] };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLookupSession", () => {
  it("debounces a burst of keystrokes into a single search", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.search("ta");
    session.search("tac");
    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe("taco");
  });

  it("does not search below the minimum length", async () => {
    const search = vi.fn().mockResolvedValue(ok());
    const { session, last } = harness(search);

    session.search("ta");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).not.toHaveBeenCalled();
    expect(last()).toEqual({ status: "idle" });
  });

  it("trims before measuring length and before searching", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.search("  taco  ");
    await vi.advanceTimersByTimeAsync(250);

    expect(search.mock.calls[0][0]).toBe("taco");
  });

  it("emits results for a successful search", async () => {
    const { session, last } = harness(vi.fn().mockResolvedValue(ok("Taco Spot")));

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(last()).toEqual({
      status: "results",
      query: "taco",
      results: [place("Taco Spot")],
    });
  });

  it("emits empty (not error) when the search succeeds with no matches", async () => {
    const { session, last } = harness(vi.fn().mockResolvedValue(ok()));

    session.search("zzzz");
    await vi.advanceTimersByTimeAsync(250);

    expect(last()).toEqual({ status: "empty", query: "zzzz" });
  });

  it("emits error with the reason when the search fails", async () => {
    const { session, last } = harness(
      vi.fn().mockResolvedValue({ ok: false, reason: "network" } as LookupOutcome)
    );

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(last()).toEqual({ status: "error", query: "taco", reason: "network" });
  });

  it("keeps the previous results visible while loading, to avoid a blank flash", async () => {
    const { session, states } = harness(vi.fn().mockResolvedValue(ok("Taco Spot")));

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("tacos");

    expect(states.at(-1)).toEqual({ status: "loading", results: [place("Taco Spot")] });
  });

  // This is issue #7: a slow response for an older query landing after a newer one.
  it("discards a stale response that resolves after a newer query", async () => {
    let resolveSlow!: (o: LookupOutcome) => void;
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise<LookupOutcome>((r) => (resolveSlow = r)))
      .mockResolvedValueOnce(ok("Tacos Fast"));
    const { session, last } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);   // "taco" is now in flight, unresolved
    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);   // "tacos" resolves

    expect(last()).toEqual({
      status: "results",
      query: "tacos",
      results: [place("Tacos Fast")],
    });

    resolveSlow(ok("Taco Slow"));             // the stale answer finally arrives
    await vi.advanceTimersByTimeAsync(0);

    expect(last()).toEqual({
      status: "results",
      query: "tacos",
      results: [place("Tacos Fast")],
    });
  });

  it("aborts the in-flight request when a newer query starts", async () => {
    const signals: AbortSignal[] = [];
    const search = vi.fn().mockImplementation((_q: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<LookupOutcome>(() => {});
    });
    const { session } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    expect(signals[0].aborted).toBe(false);

    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);

    expect(signals[0].aborted).toBe(true);
  });

  it("swallows a rejected (aborted) search without emitting an error", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    const { session, states } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(states.some((s) => s.status === "error")).toBe(false);
  });

  it("serves a repeated query from cache without searching again", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session, last } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);
    session.search("taco");   // backspace

    expect(search).toHaveBeenCalledTimes(2);
    expect(last()).toEqual({
      status: "results",
      query: "taco",
      results: [place("Taco Spot")],
    });
  });

  it("matches the cache case-insensitively", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("TACO");

    expect(search).toHaveBeenCalledTimes(1);
  });

  // Caching a failure would pin a transient blip for the rest of the session.
  it("never caches a failed search", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "network" } as LookupOutcome)
      .mockResolvedValueOnce(ok("Taco Spot"));
    const { session, last } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).toHaveBeenCalledTimes(2);
    expect(last()).toEqual({
      status: "results",
      query: "taco",
      results: [place("Taco Spot")],
    });
  });

  it("cancel() stops a pending search and goes idle", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session, last } = harness(search);

    session.search("taco");
    session.cancel();
    await vi.advanceTimersByTimeAsync(250);

    expect(search).not.toHaveBeenCalled();
    expect(last()).toEqual({ status: "idle" });
  });

  it("destroy() stops pending work and emits nothing further", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session, states } = harness(search);

    session.search("taco");
    session.destroy();
    const count = states.length;
    await vi.advanceTimersByTimeAsync(250);
    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).not.toHaveBeenCalled();
    expect(states.length).toBe(count);
  });

  it("searchNow() bypasses the debounce for the prefill path", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.searchNow("taco");
    await vi.advanceTimersByTimeAsync(0);

    expect(search).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/autocomplete.test.ts`
Expected: FAIL — "Failed to resolve import ./autocomplete".

- [ ] **Step 3: Create `lib/autocomplete.ts`**

```ts
// createLookupSession — everything about *when* to search and *which* answer wins, kept
// out of React so it can be tested. This is where issue #7's stale-response bug is fixed:
// the invariant is that only the newest query's results are ever emitted, enforced twice
// over (an AbortController per request, plus a monotonic token checked on resolution, so
// even a response that races past abort() is discarded).
//
// The search function is injected rather than imported so tests can drive it with fake
// timers and hand-resolved promises. lib/lookup.ts's searchPlaces is the production one.

import type { LookupFailureReason, LookupOutcome, LookupResult } from "./lookup";

export const DEFAULT_DEBOUNCE_MS = 250;
export const DEFAULT_MIN_LENGTH = 3;

// Session-scoped and small: it exists so backspacing never refetches, not as a real cache.
const MAX_CACHE_ENTRIES = 50;

export type LookupState =
  | { status: "idle" }
  // `results` carries the *previous* results so the list doesn't blank between keystrokes.
  | { status: "loading"; results: LookupResult[] }
  | { status: "results"; query: string; results: LookupResult[] }
  | { status: "empty"; query: string }
  | { status: "error"; query: string; reason: LookupFailureReason };

export interface LookupSession {
  /** Debounced search. Call from an input's onChange. */
  search(query: string): void;
  /** Immediate search, skipping the debounce — for the share-link prefill on mount. */
  searchNow(query: string): void;
  /** Abort anything pending and close the list. */
  cancel(): void;
  /** Permanent teardown; emits nothing afterwards. */
  destroy(): void;
}

export function createLookupSession(opts: {
  onState: (state: LookupState) => void;
  search: (q: string, signal: AbortSignal) => Promise<LookupOutcome>;
  debounceMs?: number;
  minLength?: number;
}): LookupSession {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const minLength = opts.minLength ?? DEFAULT_MIN_LENGTH;

  const cache = new Map<string, LookupResult[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let token = 0;
  let lastResults: LookupResult[] = [];
  let destroyed = false;

  function emit(state: LookupState): void {
    if (state.status === "results") lastResults = state.results;
    else if (state.status !== "loading") lastResults = [];
    opts.onState(state);
  }

  // Cancels the pending debounce and aborts any in-flight request. Bumping the token is
  // what makes a response that resolves anyway (racing past abort) get dropped.
  function stop(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
    token += 1;
  }

  function cachePut(key: string, results: LookupResult[]): void {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, results);
  }

  async function run(query: string, myToken: number): Promise<void> {
    const ctrl = new AbortController();
    controller = ctrl;

    let outcome: LookupOutcome;
    try {
      outcome = await opts.search(query, ctrl.signal);
    } catch {
      // An aborted (or thrown) search has no answer worth showing. Superseded requests
      // land here and are dropped silently rather than rendering as a failure.
      return;
    }

    if (destroyed || myToken !== token) return;
    controller = null;

    if (!outcome.ok) {
      // Deliberately not cached: a transient blip shouldn't be pinned for the session.
      emit({ status: "error", query, reason: outcome.reason });
      return;
    }

    cachePut(query.toLowerCase(), outcome.results);
    emit(
      outcome.results.length > 0
        ? { status: "results", query, results: outcome.results }
        : { status: "empty", query }
    );
  }

  function begin(raw: string, immediate: boolean): void {
    if (destroyed) return;

    const query = raw.trim();
    stop();

    if (query.length < minLength) {
      emit({ status: "idle" });
      return;
    }

    const cached = cache.get(query.toLowerCase());
    if (cached) {
      emit(
        cached.length > 0
          ? { status: "results", query, results: cached }
          : { status: "empty", query }
      );
      return;
    }

    emit({ status: "loading", results: lastResults });

    const myToken = token;
    if (immediate) {
      void run(query, myToken);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void run(query, myToken);
    }, debounceMs);
  }

  return {
    search(query: string) {
      begin(query, false);
    },
    searchNow(query: string) {
      begin(query, true);
    },
    cancel() {
      if (destroyed) return;
      stop();
      emit({ status: "idle" });
    },
    destroy() {
      stop();
      destroyed = true;
    },
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run lib/autocomplete.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Verify the whole suite**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/autocomplete.ts lib/autocomplete.test.ts
git commit -m "feat(lookup): debounced session with abort, stale-response discard, and cache

Fixes the stale-response half of #7 with an actual test: a slow response for an
older query can no longer overwrite a newer one."
```

---

## Task 6: Persist `Place.osmId`

**Files:**
- Modify: `lib/types.ts:13-26` (the `Place` interface)
- Modify: `lib/repo.ts` (the `placeFields` object)
- Modify: `lib/repo.test.ts` (append)
- Modify: `lib/backup.test.ts` (append)

**Interfaces:**
- Produces: `Place.osmId?: string` — flows automatically into `PlaceInput`, which is
  `Omit<Place, keyof SyncFields | "ratings" | "categoryIds">`

**Context:** `placeFields` in `lib/repo.ts` is shared between the create schema, the
update schema, **and** `lib/backup.ts`'s restore schema — so adding the field there
covers all three. `lib/types.ts` and `placeFields` are two hand-maintained sources of
truth for the same shape (a known fast-follow); both must be edited together.

**No index is added, so there is no `db.version(2)` block and no `SCHEMA_VERSION` bump.**
This is the same additive trick `sourceUrl` used, and it deliberately avoids tripping
`parseBackup`'s exact-version equality check.

- [ ] **Step 1: Write the failing tests**

Append to `lib/repo.test.ts`, inside the existing `describe("createPlace", …)` block at
line 37. Neighbouring tests read rows back with `db.places.get(...)` directly, so these
do the same:

```ts
  it("round-trips osmId", async () => {
    const place = await createPlace({
      name: "Franklin Barbecue",
      status: "been",
      osmId: "way/382368408",
    });

    expect(place.osmId).toBe("way/382368408");
    expect((await db.places.get(place.id))?.osmId).toBe("way/382368408");
  });

  it("leaves osmId undefined for a manually added place", async () => {
    const place = await createPlace({ name: "Hole in the Wall", status: "been" });

    expect(place.osmId).toBeUndefined();
  });
```

Append to `lib/backup.test.ts` as a new top-level `describe`. Note the two API shapes
that are easy to get wrong: **`exportBackup()` resolves to a `Blob`**, and
**`parseBackup` throws `BackupValidationError` on bad input rather than returning a
result object** — so a successful parse is just the `Backup` itself:

```ts
describe("osmId round-trip", () => {
  it("survives an export -> parse cycle", async () => {
    await createPlace({
      name: "Franklin Barbecue",
      status: "been",
      osmId: "way/382368408",
    });

    const blob = await exportBackup();
    const parsed = parseBackup(JSON.parse(await blob.text()));

    const franklin = parsed.places.find((p) => p.name === "Franklin Barbecue");
    expect(franklin?.osmId).toBe("way/382368408");
  });
});
```

`exportBackup`, `parseBackup` and `createPlace` are all already imported at the top of
`lib/backup.test.ts`; no import changes are needed.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/repo.test.ts lib/backup.test.ts`
Expected: FAIL — TypeScript rejects `osmId` as an unknown property on `PlaceInput`.

- [ ] **Step 3: Add the field to `lib/types.ts`**

In the `Place` interface, after `sourcePlatform`:

```ts
  // Normalised OSM identity of the geocoded venue, e.g. "way/382368408". Present only for
  // places chosen from a lookup suggestion; manual entries have none. Kept because ODbL
  // permits it, and it gives the planned map view stable pin identity plus a way to detect
  // "already added" across sessions.
  osmId?: string;
```

- [ ] **Step 4: Add the field to `placeFields` in `lib/repo.ts`**

After `sourcePlatform`:

```ts
  osmId: z.string().optional(),
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run lib/repo.test.ts lib/backup.test.ts`
Expected: PASS

- [ ] **Step 6: Verify the whole suite**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/repo.ts lib/repo.test.ts lib/backup.test.ts
git commit -m "feat(place): persist optional osmId from lookup suggestions

Additive optional field, no index, so no db.version(2) block and no SCHEMA_VERSION
bump (which would trip parseBackup's exact-version check)."
```

---

## Task 7: `LookupCombobox` — the ARIA combobox

> **Errata (post-review):** the code block below shipped three defects, fixed in
> `293b783` and `bf03c28`. The session must be created **and** destroyed inside one
> effect (React Strict Mode kills a `useMemo`-created session); `results` must also
> read from the `loading` status or the list blanks on every keystroke; and Escape
> must use `e.nativeEvent.stopImmediatePropagation()` gated on the list being open,
> because Next's App Router puts React's root listener and `useModalA11y`'s Escape
> listener on the same DOM node. **Read `app/components/places/LookupCombobox.tsx`
> at HEAD, not this block.**

**Files:**
- Create: `app/components/places/LookupCombobox.tsx`

**Interfaces:**
- Consumes: `createLookupSession`, `LookupState` (Task 5); `searchPlaces`,
  `LookupResult` (Task 1)
- Produces: `<LookupCombobox value onChange onSelect autoLookup />`

**Context:** Suggestions render **inline below the input, not as an absolutely
positioned popover** — inside an `h-dvh` bottom sheet with the iOS keyboard raised, a
floating popover is unreliable, whereas an inline list just pushes content down in an
already-scrollable sheet.

Searches are driven from `onChange` (user input only). React does not fire `onChange`
for a programmatic state update, so writing the selected name back into the input cannot
re-trigger a search — which is why the spec's `selected()` suppression flag is not
needed here.

- [ ] **Step 1: Create the component**

```tsx
"use client";

// LookupCombobox — the place-name field and its live suggestion list, in one control.
//
// The input doubles as the place's name and the geocoder query, so this owns both. All
// the timing-sensitive behaviour (debounce, abort, discarding stale responses, caching)
// lives in lib/autocomplete.ts, deliberately outside React so it can be unit-tested;
// this component is the render + keyboard + ARIA layer over it.
//
// Suggestions render inline below the input rather than as an absolutely positioned
// popover: this mounts inside an h-dvh bottom sheet, and with the iOS keyboard up a
// floating popover mispositions. An inline list just pushes content down in a sheet
// that already scrolls.

import { useEffect, useMemo, useRef, useState } from "react";
import { createLookupSession, type LookupState } from "@/lib/autocomplete";
import { searchPlaces, type LookupResult } from "@/lib/lookup";

const LISTBOX_ID = "place-lookup-listbox";
const optionId = (index: number) => `place-lookup-option-${index}`;

export default function LookupCombobox({
  value,
  onChange,
  onSelect,
  autoLookup = false,
}: {
  value: string;
  onChange: (name: string) => void;
  onSelect: (result: LookupResult) => void;
  autoLookup?: boolean;
}) {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const [activeIndex, setActiveIndex] = useState(-1);

  // Latest onSelect without making it a dependency of the session effect — the session
  // must be built exactly once per mount.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const session = useMemo(
    () =>
      createLookupSession({
        onState: (next) => {
          setState(next);
          setActiveIndex(-1);
        },
        search: searchPlaces,
      }),
    []
  );

  useEffect(() => {
    // The share-link import path (PlacePrefill.autoLookup) opens the sheet with a venue
    // name already seeded and expects suggestions immediately, with no keystroke and no
    // debounce to wait through.
    if (autoLookup && value.trim()) session.searchNow(value);
    return () => session.destroy();
    // Exactly once per mount: re-running would restart the session mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = state.status === "results" ? state.results : [];
  const isOpen = results.length > 0;

  function handleChange(next: string) {
    onChange(next);
    session.search(next);
  }

  function choose(result: LookupResult) {
    onChange(result.name);
    onSelectRef.current(result);
    session.cancel();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      session.cancel();
      return;
    }
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === "Tab") {
      session.cancel();
    }
  }

  return (
    <div>
      <label htmlFor="place-name" className="mb-1 block text-sm font-semibold text-ink-soft">
        Name
      </label>
      <input
        id="place-name"
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Taco Spot"
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
      />

      {/* Announced to screen readers without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {state.status === "results"
          ? `${state.results.length} suggestion${state.results.length === 1 ? "" : "s"}`
          : state.status === "empty"
            ? "No matches"
            : ""}
      </p>

      {isOpen ? (
        <>
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Place suggestions"
            className="mt-2 flex flex-col gap-1.5"
          >
            {/*
              role="option" goes on the <li> itself, with no nested <button>. Two reasons:
              a listbox's children must be options, and putting role="option" on a button
              overrides the button's implicit role — legal ARIA, but a known source of
              screen-reader inconsistency. And because this is the aria-activedescendant
              pattern, focus never leaves the input, so options must not be focusable or
              tabbable; a button would be both. Keyboard selection is handled by the
              input's onKeyDown, and this onClick covers pointer and touch.
            */}
            {results.map((result, i) => (
              <li
                key={result.osmId ?? `${result.lat}-${result.lng}-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => choose(result)}
                className={`min-h-11 cursor-pointer rounded-xl border px-3.5 py-2.5 transition active:scale-[0.99] ${
                  i === activeIndex
                    ? "border-plum bg-surface-sunk"
                    : "border-line bg-surface active:bg-surface-sunk"
                }`}
              >
                <p className="text-sm font-semibold leading-snug text-ink">{result.name}</p>
                {result.address || result.city ? (
                  <p className="text-xs leading-snug text-ink-soft">
                    {[result.address, result.city].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {/* ODbL requires attribution for OSM-derived results. */}
          <p className="mt-1.5 text-xs text-ink-soft/70">
            Results ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              OpenStreetMap
            </a>{" "}
            contributors
          </p>
        </>
      ) : null}

      {state.status === "loading" ? (
        <p className="mt-2 text-sm text-ink-soft">Searching…</p>
      ) : null}

      {state.status === "empty" ? (
        <p className="mt-2 text-sm text-ink-soft">No matches — add manually.</p>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-2 text-sm text-ink-soft">Couldn&apos;t reach lookup — add manually.</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run build && npm run lint`
Expected: pass. (The component is not yet rendered anywhere — Task 8 wires it in.)

If `jsx-a11y/click-events-have-key-events` fires on the `<li onClick>`, **do not add a
`tabIndex` or an `onKeyDown` to the option to satisfy it** — that would break the
`aria-activedescendant` pattern, which requires options to be non-focusable while the
input keeps focus. Keyboard handling already lives on the input. Suppress the rule for
that line with a comment explaining why instead.

- [ ] **Step 3: Commit**

```bash
git add app/components/places/LookupCombobox.tsx
git commit -m "feat(places): ARIA combobox for live place-lookup suggestions

Adds the labelled results list and OSM attribution called for by #7."
```

---

## Task 8: Wire the combobox into `PlaceForm` and drop the button

**Files:**
- Modify: `app/components/places/PlaceForm.tsx`

**Interfaces:**
- Consumes: `LookupCombobox` (Task 7), `Place.osmId` (Task 6)

**Context:** This removes `handleLookup`, the `lookupLoading` / `lookupResults` /
`searched` state, the mount `useEffect` that kicked off the prefill lookup, the "Look
up" button, and the results `<ul>` — all of it now lives in `LookupCombobox` and
`lib/autocomplete.ts`. The button goes because live suggestions make it redundant, and
keeping both would mean two paths into the same state.

- [ ] **Step 1: Update the imports**

Replace the `searchPlaces` import with the combobox:

```tsx
import LookupCombobox from "./LookupCombobox";
import type { LookupResult } from "@/lib/lookup";
```

- [ ] **Step 2: Add `osmId` to the form state**

In `emptyForm`, after `lng`:

```ts
    osmId: undefined as string | undefined,
```

- [ ] **Step 3: Delete the old lookup state and handlers**

Remove these from `AddPlaceSheet`:
- the `lookupLoading`, `lookupResults`, and `searched` `useState` calls
- the whole `handleLookup` function
- the whole mount `useEffect` that calls `handleLookup`

Replace `handleSelectResult` with:

```tsx
  function handleSelectResult(result: LookupResult) {
    setForm((f) => ({
      ...f,
      name: result.name,
      address: result.address,
      city: result.city,
      lat: result.lat,
      lng: result.lng,
      osmId: result.osmId,
    }));
  }
```

- [ ] **Step 4: Replace the name field block with the combobox**

Everything from the `{/* Name + OSM lookup */}` comment through the closing `</div>` of
that block — the label, the input, the "Look up" button, the results `<ul>`, and the
"Nothing found" hint — becomes:

```tsx
        {/* Name + live OSM lookup. The combobox owns both; see LookupCombobox.tsx. */}
        <LookupCombobox
          value={form.name}
          onChange={(name) => setForm((f) => ({ ...f, name }))}
          onSelect={handleSelectResult}
          autoLookup={Boolean(initial?.autoLookup && initial.name)}
        />
```

- [ ] **Step 5: Pass `osmId` through on save**

In `handleSave`'s `createPlace` call, after `sourcePlatform`:

```ts
        osmId: form.osmId,
```

- [ ] **Step 6: Update the file's header comment**

The block comment at the top of `PlaceForm.tsx` documents the old flow ("optional OSM
lookup (tap a result to autofill …)"). Update that sentence to describe live
suggestions and note that the timing logic lives in `lib/autocomplete.ts`.

- [ ] **Step 7: Verify**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 8: Verify by hand in a browser**

```bash
npm run dev -- -p 3001
```

Open `http://localhost:3001`, tap the **+** FAB, and check:
- typing `fr` (2 chars) shows nothing — below the 3-char minimum
- typing `fra` (exactly 3) does search
- typing `franklin barbecue` produces suggestions without any button press
- typing quickly fires **one** request, not one per keystroke (Network tab)
- ↓ / ↑ move the highlight, Enter selects, Escape closes the list
- selecting a suggestion fills the name and does **not** immediately reopen the list
- saving that place and reopening it shows the address and city populated

- [ ] **Step 9: Commit**

```bash
git add app/components/places/PlaceForm.tsx
git commit -m "feat(places): live autocomplete in the add-place sheet

Replaces the explicit Look up button with debounced suggestions. Closes #22."
```

---

## Task 9: Documentation and issue cleanup

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update the architecture tree in `CLAUDE.md`**

In the `app/components/places/` block, replace the `PlaceForm.tsx` line's description
and add the new component:

```
│       │   ├── PlaceForm.tsx     #   add/edit place sheet + AddPlaceHost (listens for savor:add-place); inline ratings
│       │   ├── LookupCombobox.tsx#   name field + live debounced OSM suggestions (ARIA combobox)
```

In the `lib/` block, add the two new modules after `lookup.ts`:

```
│   ├── photon.ts                 # Photon wire format — query cap, IP bias, GeoJSON → LookupResult
│   ├── autocomplete.ts           # lookup sequencing — debounce, abort, stale-discard, cache
```

And update the `api/lookup/route.ts` line:

```
│   ├── api/lookup/route.ts       # GET /api/lookup?q= — Node-runtime Photon (OSM) proxy; owns the User-Agent
```

- [ ] **Step 2: Remove the resolved fast-follow from `CLAUDE.md`**

Delete the **"AbortController / request-token for in-flight OSM lookups"** bullet from
the Fast-follows section — `lib/autocomplete.ts` resolves it, with tests. Leave the
type↔zod drift guard and the backup forward-migration bullets untouched.

- [ ] **Step 3: Add a lookup note to CLAUDE.md's Product decisions**

So a future agent doesn't "helpfully" reintroduce Nominatim or reach for Google:

```markdown
- **Place lookup is OSM-only, and that is a licensing constraint, not a preference.**
  savor stores lookup results (name/address/lat/lng) in IndexedDB permanently and in
  backups. Google Places permits storing only `place_id`; Mapbox requires a paid
  permanent-geocoding SKU. OSM/ODbL grants storage outright. Separately, **Nominatim's
  usage policy forbids type-ahead**, which is why the upstream is Photon. Do not swap
  in a proprietary geocoder without re-reading
  `docs/superpowers/specs/2026-07-25-lookup-autocomplete-design.md` §2.
```

- [ ] **Step 4: Update the test count references**

`CLAUDE.md` says "125 tests today" and `README.md` says "run the Vitest suite (121
tests)". Run `npm test`, read the actual total, and update both to match.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: record the Photon lookup architecture and the OSM licensing constraint"
```

- [ ] **Step 7: Close the issues**

```bash
gh issue close 22 --comment "Live debounced autocomplete shipped on Photon. Nominatim's usage policy forbids type-ahead, so the upstream moved to Photon (same OSM/ODbL data, purpose-built for search-as-you-type) — see docs/superpowers/specs/2026-07-25-lookup-autocomplete-design.md."
gh issue close 7 --comment "All three items done: stale in-flight responses are discarded in lib/autocomplete.ts (with a regression test), q is capped at 200 chars in the route, and the results list is a labelled ARIA listbox."
```

---

## Manual device verification (after Task 9)

Not automatable with the current test setup — no jsdom, no Playwright in this repo.

- [ ] On a real iPhone, confirm the inline suggestion list behaves with the keyboard up
      and the sheet scrolled.
- [ ] With VoiceOver on, confirm the live region announces suggestion counts and that
      arrowing through options reads them.
- [ ] Share a TikTok/Instagram link into savor and confirm the `autoLookup` prefill path
      still lands directly on suggestions (this is the `searchNow` path).
- [ ] Confirm results are biased to your actual city on the deployed Vercel preview
      (the IP bias headers are absent in local dev, so this only shows up once deployed).
