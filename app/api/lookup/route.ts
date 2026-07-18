// GET /api/lookup?q= — Nominatim (OpenStreetMap) search proxy for the add-place lookup flow
// (T8). Runs on the Node runtime specifically so it can set a custom User-Agent: Nominatim's
// usage policy requires one identifying the app, and a browser calling Nominatim directly
// can't reliably set/keep a custom UA header — so this route is the only thing that ever talks
// to Nominatim. Responses are cached for an hour (next: revalidate) and mapped down to savor's
// LookupResult shape before returning; lib/lookup.ts (the client side of this contract) then
// zod-validates that shape defensively and never talks to Nominatim itself.

import { NextResponse } from "next/server";
import type { LookupResult } from "@/lib/lookup";

export const runtime = "nodejs";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "savor/1.0 (https://github.com/mzetinajimenez/savor)";
const MAX_RESULTS = 5;

// Nominatim's jsonv2 + addressdetails=1 shape, narrowed to only the fields this route reads.
interface NominatimResult {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: 'Missing or empty query parameter "q"' },
      { status: 400 }
    );
  }

  const upstreamUrl = `${NOMINATIM_SEARCH_URL}?format=jsonv2&addressdetails=1&limit=${MAX_RESULTS}&q=${encodeURIComponent(q)}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
  } catch {
    return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
  }

  if (!Array.isArray(data)) {
    return NextResponse.json({ error: "Lookup service unavailable" }, { status: 502 });
  }

  const results: LookupResult[] = data
    .slice(0, MAX_RESULTS)
    .map(toLookupResult)
    .filter((r): r is LookupResult => r !== null);

  return NextResponse.json(results);
}

function toLookupResult(raw: unknown): LookupResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as NominatimResult;

  const lat = item.lat !== undefined ? Number(item.lat) : NaN;
  const lng = item.lon !== undefined ? Number(item.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const firstSegment = item.display_name?.split(",")[0]?.trim();
  const name = firstSegment || item.name?.trim();
  if (!name) return null;

  const city = item.address?.city ?? item.address?.town ?? item.address?.village;

  return {
    name,
    address: item.display_name,
    city,
    lat,
    lng,
  };
}
