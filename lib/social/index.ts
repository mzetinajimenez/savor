// resolveSharedLink is the single seam the UI depends on for share-link import: the /import
// route (T7) and PlaceForm (T5) call this and only ever see a SharedLink, never a platform SDK
// or adapter. Adding a future platform means adding one adapter to this list — nothing above
// this file changes.

import { instagramAdapter } from "./instagram";
import { tiktokAdapter } from "./tiktok";
import type { SharedLink } from "./types";

// TikTok before Instagram: both are host-gated on disjoint hostnames, so order between them
// doesn't affect correctness today, but TikTok is checked first since it's the adapter with a
// network round-trip (fewest wasted checks on the common case).
const adapters = [tiktokAdapter, instagramAdapter];

export async function resolveSharedLink(url: string): Promise<SharedLink | null> {
  const adapter = adapters.find((a) => a.matches(url));
  if (!adapter) return null;
  return adapter.hydrate(url);
}
