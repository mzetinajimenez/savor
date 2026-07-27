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
