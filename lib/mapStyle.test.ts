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
