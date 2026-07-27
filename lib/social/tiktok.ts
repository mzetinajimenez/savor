// TikTok adapter (T4). `hydrate` never throws: it calls this app's own /api/tiktok-oembed proxy
// (T3) for a caption, but any failure mode — a non-ok response, a rejected fetch (offline, DNS),
// a JSON body that won't parse, or a body that parses but fails the zod shape below — degrades
// to a URL-only SharedLink exactly like a TikTok URL this adapter never fetched. That mirrors
// lib/lookup.ts's degrade-to-[] contract: a failed enrichment is never worse than "manual entry".

import { z } from "zod";
import { guessVenueName } from "./parse";
import type { SharedLink, SocialAdapter } from "./types";

// The proxy's own response shape (see app/api/tiktok-oembed/route.ts): a plain object with
// optional string fields. Fields are individually optional/nullable-tolerant so a partial or
// slightly-off upstream body still validates; a body that isn't even an object, or whose present
// fields are the wrong type, fails and triggers the degrade path.
const tiktokOEmbedProxyResponseSchema = z.object({
  title: z.string().optional(),
  authorName: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

function urlOnly(url: string): SharedLink {
  return {
    platform: "tiktok",
    url,
    captionText: undefined,
    nameGuess: undefined,
  };
}

export const tiktokAdapter: SocialAdapter = {
  platform: "tiktok",

  matches(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    const host = parsed.hostname;
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  },

  async hydrate(url: string): Promise<SharedLink> {
    let res: Response;
    try {
      res = await fetch(`/api/tiktok-oembed?url=${encodeURIComponent(url)}`);
    } catch {
      return urlOnly(url);
    }
    if (!res.ok) return urlOnly(url);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return urlOnly(url);
    }

    const parsed = tiktokOEmbedProxyResponseSchema.safeParse(body);
    if (!parsed.success) return urlOnly(url);

    const { title, authorName } = parsed.data;
    return {
      platform: "tiktok",
      url,
      captionText: title,
      authorName,
      nameGuess: title ? guessVenueName(title) : undefined,
    };
  },
};
