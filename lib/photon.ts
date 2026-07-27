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

import { MAX_RESULTS, type LookupResult } from "./lookup";

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
  for (const feature of features) {
    const mapped = toLookupResult(feature);
    if (mapped) results.push(mapped);
  }
  // Sliced after validation, not before: capping the raw `features` array first would
  // silently yield fewer than MAX_RESULTS if early features were invalid.
  return results.slice(0, MAX_RESULTS);
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

  // Both fall back the same way (||, and both trimmed) so an empty-string field from
  // Photon is treated the same as a missing one in either chain — nothing meaningful
  // should hinge on which operator a given field happened to use.
  const street = [props.housenumber, props.street].filter(Boolean).join(" ").trim();
  const locality = props.locality?.trim() || undefined;
  const address = street || locality;
  const city = props.city?.trim() || locality || props.county?.trim();
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
