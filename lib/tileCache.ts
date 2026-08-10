export const TILE_CACHE_NAME = "savor-tiles-v1";

export const MAX_TILE_BYTES = 40 * 1024 * 1024;
// ~500 tiles at an ASSUMED ~80 KB average. This is an ESTIMATE inherited from the design
// spec's open item #2 and NOT yet confirmed against real tiles at the zoom levels savor uses.
// MAX_TILE_BYTES is the cap that matters; this only bounds the bookkeeping. See Task 8 Step 4.
export const MAX_TILE_ENTRIES = 500;

export interface CacheEntry {
  key: string;
  bytes: number;
  lastUsed: number;
}

/**
 * Derives a cache key from a tile URL.
 *
 * - Strips the API key so rotating it doesn't orphan every cached tile.
 * - Strips the custom "savor-tiles://" protocol prefix if present, so the key
 *   matches the real tile URL and can be re-used across key rotations.
 * - Preserves z/x/y and other query params (except the key param).
 *
 * Why strip the key: Two reasons. First, rotating the key must not orphan
 * every cached tile — the tile data itself is unchanged. Second, the key
 * should not be written into Cache Storage where it outlives the session.
 */
export function tileCacheKey(url: string): string {
  // Strip the custom "savor-tiles://" protocol prefix if present.
  let normalized = url;
  if (normalized.startsWith("savor-tiles://")) {
    normalized = normalized.slice("savor-tiles://".length);
  }

  // Parse URL and remove the 'key' query parameter.
  const u = new URL(normalized);
  u.searchParams.delete("key");
  return u.toString();
}

/**
 * Sums the bytes in a cache entry array.
 */
export function totalBytes(entries: CacheEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.bytes, 0);
}

/**
 * Returns true if a single tile response can fit in the cache.
 *
 * Rejects zero, negative, or oversized responses so the caller never
 * evicts everything for a response that cannot be kept.
 */
export function fitsInCache(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_TILE_BYTES;
}

/**
 * Selects cache entries to evict (by key) to make room for an incoming tile.
 *
 * Uses LRU (least-recently-used) eviction: entries are sorted by lastUsed
 * ascending (oldest first) and evicted until both:
 * - The total bytes of remaining entries + incoming bytes <= MAX_TILE_BYTES
 * - The count of remaining entries + 1 <= MAX_TILE_ENTRIES
 *
 * If the incoming response cannot fit even in an empty cache, returns all keys.
 * (The caller checks fitsInCache() first and skips the store entirely, so
 * nothing is thrown away for a response that will not be kept.)
 *
 * Does not mutate the input array.
 */
export function selectEvictions(entries: CacheEntry[], incomingBytes: number): string[] {
  // If the incoming response is too large to ever fit, return all keys so
  // the caller knows to skip storing it.
  if (incomingBytes > MAX_TILE_BYTES) {
    return entries.map((e) => e.key);
  }

  // Sort by lastUsed ascending (oldest first) without mutating the input.
  const sorted = [...entries].sort((a, b) => a.lastUsed - b.lastUsed);

  const toEvict = new Set<string>();

  for (const entry of sorted) {
    // Calculate bytes of entries that would remain (all entries except those marked for eviction).
    let remainingBytes = 0;
    for (const e of entries) {
      if (!toEvict.has(e.key)) {
        remainingBytes += e.bytes;
      }
    }
    const remainingCount = entries.length - toEvict.size;

    // Check if remaining entries + incoming response fit in the cache.
    if (
      remainingBytes + incomingBytes <= MAX_TILE_BYTES &&
      remainingCount + 1 <= MAX_TILE_ENTRIES
    ) {
      break;
    }

    // Need to evict this (oldest) entry.
    toEvict.add(entry.key);
  }

  return Array.from(toEvict);
}

/**
 * Formats a byte count as a human-readable cache size.
 *
 * - Uses MB with one decimal for ≥1 MB
 * - Uses KB for < 1 MB to avoid "0.0 MB"
 */
export function formatCacheSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb >= 1024) {
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }
  return `${Math.floor(kb)} KB`;
}
