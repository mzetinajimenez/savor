// lib/photon.ts is the upstream seam: everything that knows Photon's wire format lives
// here so app/api/lookup/route.ts can stay a thin shell — and so this logic is covered at
// all, since vitest only includes lib/**.

import { describe, expect, it } from "vitest";
import { buildPhotonUrl, FOOD_TAGS, MAX_QUERY_LENGTH, readBiasFromHeaders, toLookupResults } from "./photon";

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

  // Mirror of the above: the two headers are treated symmetrically, so an empty
  // longitude with a present latitude must null out too, not just the reverse.
  it("returns null when the longitude header is empty", () => {
    const headers = new Headers({
      "x-vercel-ip-latitude": "30.2672",
      "x-vercel-ip-longitude": "",
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

  // Mirror of the above: longitude alone, with latitude absent entirely.
  it("returns null when only longitude is present", () => {
    expect(readBiasFromHeaders(new Headers({ "x-vercel-ip-longitude": "-97.74" }))).toBeNull();
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

  // Mirror of the above at the negative boundary — Math.abs() should treat +91/-91
  // and +181/-181 the same, but that symmetry was only ever exercised on one side.
  it("returns null for negative out-of-range coordinates", () => {
    const badLat = new Headers({
      "x-vercel-ip-latitude": "-91",
      "x-vercel-ip-longitude": "0",
    });
    const badLng = new Headers({
      "x-vercel-ip-latitude": "0",
      "x-vercel-ip-longitude": "-181",
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
