// searchPlaces — client-side entry point for the add-place lookup flow (T8). Calls this app's
// own /api/lookup proxy (never Nominatim directly — the server route owns the User-Agent policy
// and response shaping), then zod-validates what comes back. Any failure mode — a non-array
// body, individually malformed entries, a non-200 response, or the fetch itself throwing
// (offline, DNS, etc.) — degrades to `[]` rather than throwing, so PlaceForm can treat "no
// results" and "lookup failed" identically and always fall back to manual entry.

import { z } from "zod";

export const lookupResultSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
});

export type LookupResult = z.infer<typeof lookupResultSchema>;

const MAX_RESULTS = 5;

export async function searchPlaces(q: string): Promise<LookupResult[]> {
  try {
    const res = await fetch(`/api/lookup?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];

    const body: unknown = await res.json();
    if (!Array.isArray(body)) return [];

    const results: LookupResult[] = [];
    for (const item of body) {
      const parsed = lookupResultSchema.safeParse(item);
      if (parsed.success) results.push(parsed.data);
    }
    return results.slice(0, MAX_RESULTS);
  } catch {
    return [];
  }
}
