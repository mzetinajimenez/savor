// searchPlaces — client-side entry point for the add-place lookup flow. Calls this app's
// own /api/lookup proxy (never a geocoder directly — the server route owns the upstream
// choice, the User-Agent, and the location bias), then zod-validates what comes back.
//
// It returns a discriminated LookupOutcome rather than degrading every failure to []. A
// live autocomplete renders "no matches" constantly, so an offline blip that looked like
// an empty result would read as "that restaurant doesn't exist". Individually malformed
// entries are still dropped silently — one bad row shouldn't sink a good response.
//
// AbortError is the deliberate exception: it rethrows rather than becoming an outcome,
// because a superseded request has no answer worth showing. lib/autocomplete.ts swallows
// it.

import { z } from "zod";

// Shared by the route (as Photon's `limit`) and here (as a defensive cap) so the two can
// never drift.
export const MAX_RESULTS = 6;

export const lookupResultSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  // OSM's amenity/shop value — "restaurant", "cafe", "bakery". Currently unused —
  // LookupCombobox renders [address, city] as its secondary line, not this — but kept
  // (produced, validated, tested) because a future map view is a plausible consumer.
  category: z.string().optional(),
  // Normalised OSM identity, e.g. "way/382368408". Persisted onto Place — see lib/types.ts.
  osmId: z.string().optional(),
});

export type LookupResult = z.infer<typeof lookupResultSchema>;

export type LookupFailureReason = "network" | "upstream" | "invalid";

export type LookupOutcome =
  | { ok: true; results: LookupResult[] }
  | { ok: false; reason: LookupFailureReason };

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<LookupOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/lookup?q=${encodeURIComponent(q)}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { ok: false, reason: "network" };
  }

  if (!res.ok) return { ok: false, reason: "upstream" };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!Array.isArray(body)) return { ok: false, reason: "invalid" };

  const results: LookupResult[] = [];
  for (const item of body) {
    const parsed = lookupResultSchema.safeParse(item);
    if (parsed.success) results.push(parsed.data);
  }
  return { ok: true, results: results.slice(0, MAX_RESULTS) };
}
