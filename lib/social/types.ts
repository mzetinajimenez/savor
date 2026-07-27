// Shared, framework-free contract between share-link adapters (T4) and the /import route (T7).
// A SharedLink is the normalized result of resolving a shared Instagram/TikTok URL; a
// SocialAdapter knows how to recognize its own platform's URLs and hydrate one into a
// SharedLink. Canonicalization (turning a share-shortlink into a stable permalink) is folded
// into hydrate() — there is no separate canonicalize step.

export type SocialPlatform = "instagram" | "tiktok";

export interface SharedLink {
  platform: SocialPlatform;
  url: string; // canonical permalink → Place.sourceUrl
  authorName?: string; // "@account" if known
  captionText?: string; // raw caption if the adapter could fetch it (TikTok)
  nameGuess?: string; // best venue-name candidate (may be undefined)
}

export interface SocialAdapter {
  readonly platform: SocialPlatform;
  matches(url: string): boolean;
  hydrate(url: string): Promise<SharedLink>;
}
