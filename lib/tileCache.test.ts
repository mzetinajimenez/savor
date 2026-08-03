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
