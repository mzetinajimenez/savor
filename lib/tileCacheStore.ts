// The one and only module in savor that calls the Cache API.
//
// Every DECISION (the cache name, the byte/entry caps, the cache-key normalization, LRU
// eviction selection, the human-readable size format) lives in lib/tileCache.ts and is
// unit-tested there with plain data — no Cache API involved. This file is deliberately thin:
// it just wires those pure decisions to `caches`, `fetch`, and MapLibre's addProtocol.
//
// NO VITEST SUITE, DELIBERATELY: the Cache API is not available under Vitest's default node
// test environment, and a mock-based test would only prove the mock behaves like the mock —
// it would never touch a real Cache Storage bucket. This file's verification is a browser pass
// (DevTools Application → Cache Storage, Application → Storage persistence toggle), the same
// stance lib/useModalA11y.ts documents for focus-trap behavior that only means something with
// real DOM focus and real keyboard events.
//
// THE GATE IS THE FEATURE: cacheEnabled() must be false unless the browser has GRANTED
// persistent storage. Tiles are always fetched and served to MapLibre regardless of the gate —
// a not-yet-persisted origin still gets a working map, just always from the network, never from
// this cache. Only the WRITE side is gated. See cacheEnabled()'s own comment for why this is
// re-checked on every call rather than cached once.

import {
  fitsInCache,
  MAX_TILE_BYTES,
  selectEvictions,
  tileCacheKey,
  TILE_CACHE_NAME,
  totalBytes,
  type CacheEntry,
} from "@/lib/tileCache";

/** The custom MapLibre protocol scheme tile URLs are routed through. Matches Task 1's
 *  `tileUrlTemplate` scheme option. */
export const TILE_SCHEME = "savor-tiles";

/** Header a cached Response is stamped with on write, holding its LRU timestamp (epoch ms) as
 *  a string. There is no separate LRU index table — `selectEvictions` needs a `lastUsed` per
 *  entry, and the cached Response itself is the only place that survives a page reload. */
const LAST_USED_HEADER = "x-savor-last-used";

/** Header a cached Response is stamped with on write, holding its byte length as a string.
 *  `currentEntries` reads this instead of calling `.clone().arrayBuffer()` on every entry on
 *  every store — that would mean re-reading every cached tile's full body just to compute sizes
 *  for LRU eviction, real memory churn on a phone during heavy panning. A pre-existing entry
 *  written before this header existed falls back to a body read (see `currentEntries`). */
const BYTE_LENGTH_HEADER = "x-savor-byte-length";

/**
 * Whether tile writes to Cache Storage are currently allowed.
 *
 * Both conditions are required:
 * - `typeof caches !== "undefined"` — the Cache API exists in this environment at all (absent
 *   in some in-app browsers, and in any non-browser context).
 * - `navigator.storage.persisted()` resolves `true` — the origin has been GRANTED persistent
 *   storage. Without this, a "clear site data under storage pressure" sweep could take the tile
 *   cache down alongside the actual IndexedDB data with no warning, and offline tiles are a
 *   nice-to-have savor has no business risking that for.
 *
 * Deliberately NOT memoized at module scope: a browser can grant persistence LATER in the same
 * session, as engagement heuristics (bookmarked, used repeatedly, notifications granted, etc.)
 * are satisfied, or because the user pressed Settings' "Protect my data" button. Re-running this
 * check on every write decision means savor starts caching the instant that happens, rather than
 * only after a fresh page load.
 */
export async function cacheEnabled(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const persisted = await navigator.storage?.persisted?.();
    return persisted === true;
  } catch {
    // Some environments throw rather than reject on a missing/locked-down navigator.storage.
    // Fail closed — no persistence guarantee means no write.
    return false;
  }
}

/** Guards maplibregl.addProtocol so it is only ever called once per page lifetime. It is a
 *  module-level boolean, deliberately NOT a React ref or state: PlacesMap's map-creation effect
 *  runs on every mount (and twice on the first mount, under React Strict Mode's double-invoke),
 *  but addProtocol itself must only ever run once for the page — calling it again either throws
 *  or silently replaces the handler, and either way every earlier map instance's in-flight
 *  requests would be routed through a stale-vs-fresh mix of handlers. */
let protocolRegistered = false;

/**
 * Registers the `savor-tiles://` MapLibre custom protocol, backed by Cache Storage.
 *
 * Safe to call on every mount — actually registers with MapLibre exactly once (see
 * `protocolRegistered` above); every call after the first is a no-op.
 *
 * The handler itself:
 * 1. Recovers the real tile URL from the `savor-tiles://` prefix and derives its cache key
 *    (strips the API key — see tileCacheKey's own comment for why).
 * 2. Looks up that key in the `savor-tiles-v1` cache. A hit returns its bytes immediately and
 *    touches its LRU timestamp (fire-and-forget — never delays the response).
 * 3. A miss fetches the real URL over the network and returns those bytes to MapLibre FIRST.
 *    Storing the response in the cache happens afterward, fire-and-forget, gated on
 *    `cacheEnabled()` and `fitsInCache()` — a slow or disabled cache write must never delay a
 *    tile appearing on screen, and an ungranted origin must never write at all.
 *
 * Every Cache API call is wrapped in try/catch and degrades to network-only on failure
 * (including `QuotaExceededError` on `.put`) — a cache failure must never break the map.
 */
export function registerTileProtocol(maplibregl: typeof import("maplibre-gl")): void {
  if (protocolRegistered) return;
  protocolRegistered = true;

  maplibregl.addProtocol(TILE_SCHEME, async (params, abortController) => {
    const realUrl = params.url.startsWith(`${TILE_SCHEME}://`)
      ? params.url.slice(`${TILE_SCHEME}://`.length)
      : params.url;
    const key = tileCacheKey(realUrl);

    const cached = await readFromCache(key);
    if (cached) {
      // Fire-and-forget LRU touch — re-stamp the same bytes with a fresh lastUsed header.
      // Never awaited: a cache hit should be as fast as the cache itself, not gated on a
      // second round-trip through Cache Storage.
      void touchLastUsed(key, cached);
      return { data: cached };
    }

    const response = await fetch(realUrl, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`savor-tiles: tile fetch failed (${response.status}) for ${realUrl}`);
    }
    const bytes = await response.arrayBuffer();

    // Return to MapLibre first. The store below is fire-and-forget: it happens after this
    // function has already resolved the tile, so a slow or failing write never delays paint.
    void storeInCache(key, bytes);

    return { data: bytes };
  });
}

/** Reads a cache entry's bytes, or null on a miss or any Cache API failure. */
async function readFromCache(key: string): Promise<ArrayBuffer | null> {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const match = await cache.match(key);
    if (!match) return null;
    return await match.arrayBuffer();
  } catch {
    return null;
  }
}

/** Re-writes the same bytes under a fresh `lastUsed` header, if writes are currently allowed.
 *  Best-effort: a failure here just means this entry's LRU timestamp goes stale, which only
 *  affects eviction ORDER, never correctness. */
async function touchLastUsed(key: string, bytes: ArrayBuffer): Promise<void> {
  if (!(await cacheEnabled())) return;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    await cache.put(
      key,
      new Response(bytes, {
        headers: {
          [LAST_USED_HEADER]: String(Date.now()),
          [BYTE_LENGTH_HEADER]: String(bytes.byteLength),
        },
      })
    );
  } catch {
    // QuotaExceededError or any other Cache API failure — degrade silently, the map doesn't
    // depend on this succeeding.
  }
}

/** Stores a freshly-fetched tile, evicting LRU entries first if needed to stay under the caps
 *  from lib/tileCache.ts. No-ops (network-only) unless persistence is currently granted and the
 *  response is small enough to ever fit. */
async function storeInCache(key: string, bytes: ArrayBuffer): Promise<void> {
  if (!fitsInCache(bytes.byteLength)) return;
  if (!(await cacheEnabled())) return;

  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const entries = await currentEntries(cache);
    const evictions = selectEvictions(entries, bytes.byteLength);
    for (const evictKey of evictions) {
      await cache.delete(evictKey);
    }
    await cache.put(
      key,
      new Response(bytes, {
        headers: {
          [LAST_USED_HEADER]: String(Date.now()),
          [BYTE_LENGTH_HEADER]: String(bytes.byteLength),
        },
      })
    );
  } catch {
    // Covers QuotaExceededError and any other Cache API failure. Storing a tile is a
    // nice-to-have; the map already has the bytes it needs regardless of this outcome.
  }
}

/** Enumerates the cache's current contents as CacheEntry[] for selectEvictions — `bytes` comes
 *  from the `x-savor-byte-length` header stamped on write, `lastUsed` from `x-savor-last-used`
 *  (0, i.e. "oldest", if a pre-existing entry somehow lacks it). Reading the header avoids a
 *  `.clone().arrayBuffer()` body read per entry on every store call, which would mean re-reading
 *  every cached tile's full response body just to size it — real memory churn on a phone during
 *  heavy panning. A legacy entry written before the byte-length header existed (or one whose
 *  header is somehow unparseable) falls back to a body read so eviction sizing stays correct
 *  rather than treating it as zero-sized and never evicting it. Any failure enumerating returns
 *  an empty array, which just means eviction proceeds as if the cache were empty (selectEvictions
 *  itself is safe to call with []). */
async function currentEntries(cache: Cache): Promise<CacheEntry[]> {
  try {
    const requests = await cache.keys();
    const entries = await Promise.all(
      requests.map(async (request) => {
        const response = await cache.match(request);
        if (!response) return null;
        const lastUsedHeader = response.headers.get(LAST_USED_HEADER);
        const byteLengthHeader = response.headers.get(BYTE_LENGTH_HEADER);
        const parsedBytes = byteLengthHeader ? Number(byteLengthHeader) : NaN;
        const bytes = Number.isFinite(parsedBytes)
          ? parsedBytes
          : (await response.clone().arrayBuffer()).byteLength;
        const entry: CacheEntry = {
          key: request.url,
          bytes,
          lastUsed: lastUsedHeader ? Number(lastUsedHeader) : 0,
        };
        return entry;
      })
    );
    return entries.filter((e): e is CacheEntry => e !== null);
  } catch {
    return [];
  }
}

/**
 * Current tile-cache usage, for Task 10's Settings panel — or null if the Cache API is
 * unavailable or enumeration fails (the panel should show "unavailable", not a lying 0).
 */
export async function tileCacheUsage(): Promise<{ bytes: number; count: number } | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const entries = await currentEntries(cache);
    return { bytes: totalBytes(entries), count: entries.length };
  } catch {
    return null;
  }
}

/**
 * Deletes the entire tile cache bucket.
 *
 * This is the WHOLE implementation, and that is deliberate: `savor-tiles-v1` (TILE_CACHE_NAME)
 * is a separate, named, versioned Cache Storage bucket, structurally distinct from IndexedDB.
 * Deleting it cannot reach, and must never be wired to reach, the `meta` or `criteria` rows
 * CLAUDE.md's "any reset app path must clear meta + criteria together" rule is about — those
 * live in Dexie, not here. This button is tile-cache-only; do not fold it into a future
 * reset-everything path on the theory that it's "another thing to clear along the way".
 */
export async function clearTileCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(TILE_CACHE_NAME);
  } catch {
    // Degrade silently, same as every other Cache API call in this file — a user-initiated
    // "Clear map cache" button (Task 10) must never surface an unhandled rejection.
  }
}

// MAX_TILE_BYTES is re-exported only so callers that want to display the cap (Task 10's panel)
// don't need a second import from lib/tileCache.ts alongside this module.
export { MAX_TILE_BYTES };
