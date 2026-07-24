// resolveSharedLink is the single seam the UI depends on for share-link import: the /import
// route (T7) and PlaceForm (T5) call this and only ever see a SharedLink, never a platform SDK
// or adapter. Adding a future platform means adding one adapter to this list — nothing above
// this file changes.

import { instagramAdapter } from "./instagram";
import { tiktokAdapter } from "./tiktok";
import type { SharedLink } from "./types";

// TikTok before Instagram: both adapters' `matches()` are host-gated on disjoint hostnames and
// do no network I/O (only `hydrate()` does, and only after a match), so the order between them
// is arbitrary — it doesn't affect correctness or performance either way. Kept stable for diff
// hygiene, not for any behavioral reason.
const adapters = [tiktokAdapter, instagramAdapter];

export async function resolveSharedLink(url: string): Promise<SharedLink | null> {
  const adapter = adapters.find((a) => a.matches(url));
  if (!adapter) return null;
  return adapter.hydrate(url);
}
