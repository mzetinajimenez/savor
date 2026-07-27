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
