// GET /api/tiktok-oembed?url= — TikTok oEmbed proxy for the share-link import flow (T4/T7).
// Runs on the Node runtime so the fetch to TikTok always happens server-side; the browser never
// calls TikTok directly. TikTok's oEmbed endpoint is public (no token/User-Agent policy), unlike
// Nominatim in app/api/lookup/route.ts, but this route follows the same shape: validate input,
// fetch with an hour of caching (next: revalidate), and degrade to a small JSON error body on
// any failure rather than throwing. lib/social/tiktok.ts (T4, the client side of this contract)
// zod-validates the mapped shape defensively and treats a failure response as "no caption".

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIKTOK_OEMBED_URL = "https://www.tiktok.com/oembed";

// TikTok's oEmbed shape, narrowed to only the fields this route reads.
interface TikTokOEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url")?.trim();

  if (!rawUrl) {
    return NextResponse.json(
      { error: 'Missing or empty query parameter "url"' },
      { status: 400 }
    );
  }

  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (hostname !== "tiktok.com" && !hostname.endsWith(".tiktok.com")) {
    return NextResponse.json({ error: "Not a TikTok URL" }, { status: 400 });
  }

  const upstreamUrl = `${TIKTOK_OEMBED_URL}?url=${encodeURIComponent(rawUrl)}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { next: { revalidate: 3600 } });
  } catch {
    return NextResponse.json({ error: "oEmbed service unavailable" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "oEmbed service unavailable" }, { status: 502 });
  }

  let data: TikTokOEmbedResponse;
  try {
    data = (await upstream.json()) as TikTokOEmbedResponse;
  } catch {
    return NextResponse.json({ error: "oEmbed service unavailable" }, { status: 502 });
  }

  return NextResponse.json({
    title: data.title,
    authorName: data.author_name,
    thumbnailUrl: data.thumbnail_url,
  });
}
