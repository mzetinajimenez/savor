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
