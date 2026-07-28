// GET /api/lookup?q= — Photon (OpenStreetMap) search proxy for the add-place autocomplete.
// Runs on the Node runtime so it can set an identifying User-Agent and read Vercel's IP
// geolocation headers. This route is the only thing in savor that ever talks to a geocoder.
//
// Deliberately thin: query-cap, bias parsing, URL building and response mapping all live in
// lib/photon.ts, because vitest only covers lib/** and logic left here would be untested.
//
// Photon rather than Nominatim because Nominatim's usage policy forbids type-ahead outright.
// See docs/superpowers/specs/2026-07-25-lookup-autocomplete-design.md §2.

import { NextResponse } from "next/server";
import {
  buildPhotonUrl,
  MAX_QUERY_LENGTH,
  readBiasFromHeaders,
  toLookupResults,
} from "@/lib/photon";

export const runtime = "nodejs";

const USER_AGENT = "savor/1.0 (https://github.com/mzetinajimenez/savor)";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: 'Missing or empty query parameter "q"' },
      { status: 400 }
    );
  }

  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  // Bias is best-effort: absent headers (local dev) simply mean an unbiased search.
  const upstreamUrl = buildPhotonUrl(q, readBiasFromHeaders(request.headers));

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": USER_AGENT },
      // Repeated queries collapse in Vercel's Data Cache, which is most of how savor stays
      // inside Photon's "be fair" terms — the rest is the debounce and session cache in
      // lib/autocomplete.ts.
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

  return NextResponse.json(toLookupResults(data));
}
