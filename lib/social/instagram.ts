// Instagram adapter (T4). Instagram has no public oEmbed/API route worth calling for a
// device-local app with no auth, so this adapter is URL-only: it recognizes IG permalink
// shapes and canonicalizes them (strip query string + hash — IG share links carry tracking
// params like ?utm_source=ig_share&igshid=... that aren't part of the stable permalink), but
// never fetches a caption. `nameGuess` is left undefined; PlaceForm (T5) falls back to manual
// entry for Instagram imports.

import type { SharedLink, SocialAdapter } from "./types";

const IG_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

// Matches /p/{shortcode}, /reel/{shortcode}, /share/... , and a bare /{username}/ profile.
// Host-gated by `matches` before this ever runs, so the broad bare-username case can't swallow
// non-Instagram URLs.
const IG_PATH_RE = /^\/(p|reel|share)\/[^/]+\/?$|^\/[A-Za-z0-9._]+\/?$/;

export const instagramAdapter: SocialAdapter = {
  platform: "instagram",

  matches(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (!IG_HOSTS.has(parsed.hostname)) return false;
    return IG_PATH_RE.test(parsed.pathname);
  },

  async hydrate(url: string): Promise<SharedLink> {
    const parsed = new URL(url);
    const canonical = `${parsed.origin}${parsed.pathname}`;
    return {
      platform: "instagram",
      url: canonical,
      captionText: undefined,
      nameGuess: undefined,
    };
  },
};
