// searchPlaces degrades silently in every failure mode (malformed response, non-200, network
// throw) so the add-place form can always fall back to manual entry — these tests pin that
// contract. fetch is stubbed per-test via vi.stubGlobal and restored in afterEach.

import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "./lookup";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchPlaces", () => {
  it("parses a successful response into LookupResult[]", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { name: "Taco Spot", address: "123 Main St", city: "Austin", lat: 30.1, lng: -97.7 },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchPlaces("taco");

    expect(results).toEqual([
      { name: "Taco Spot", address: "123 Main St", city: "Austin", lat: 30.1, lng: -97.7 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/lookup?q=taco");
  });

  it("encodes the query passed to the lookup route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await searchPlaces("ramen & noodles");

    expect(fetchMock).toHaveBeenCalledWith("/api/lookup?q=ramen%20%26%20noodles");
  });

  it("allows results without address/city (both optional)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ name: "No Address Cafe", lat: 1, lng: 2 }]))
    );

    const results = await searchPlaces("cafe");

    expect(results).toEqual([{ name: "No Address Cafe", lat: 1, lng: 2 }]);
  });

  it("caps results at 5 even if the response has more", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      name: `Place ${i}`,
      lat: i,
      lng: i,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(many)));

    const results = await searchPlaces("place");

    expect(results).toHaveLength(5);
    expect(results.map((r) => r.name)).toEqual(["Place 0", "Place 1", "Place 2", "Place 3", "Place 4"]);
  });

  it("drops individual malformed entries but keeps valid ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { name: "Valid Spot", lat: 1, lng: 2 },
          { name: "Missing Lat", lng: 2 },
          { lat: 3, lng: 4 }, // missing name
          { name: "Also Valid", lat: 5, lng: 6 },
        ])
      )
    );

    const results = await searchPlaces("spot");

    expect(results).toEqual([
      { name: "Valid Spot", lat: 1, lng: 2 },
      { name: "Also Valid", lat: 5, lng: 6 },
    ]);
  });

  it("returns [] when the response body is not an array (bad shape)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" })));

    const results = await searchPlaces("anything");

    expect(results).toEqual([]);
  });

  it("returns [] on a non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ name: "X", lat: 1, lng: 2 }], false, 502)));

    const results = await searchPlaces("anything");

    expect(results).toEqual([]);
  });

  it("returns [] when fetch throws (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const results = await searchPlaces("anything");

    expect(results).toEqual([]);
  });

  it("returns [] when the response body isn't valid JSON", async () => {
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

    const results = await searchPlaces("anything");

    expect(results).toEqual([]);
  });
});
