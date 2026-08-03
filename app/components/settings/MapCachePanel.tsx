"use client";

// Settings panel: map tile-cache usage readout + "Clear map cache" button.
//
// INVARIANT: "Clear map cache" deletes exactly one named Cache Storage bucket
// (savor-tiles-v1, via lib/tileCacheStore.ts's clearTileCache()) and can NEVER
// reach `meta` or `criteria` — those live in Dexie/IndexedDB, structurally
// distinct from Cache Storage. Do not wire this button, or any future
// reset-everything path, into clearing both together.
//
// Modeled directly on the Storage panel in app/settings/page.tsx: same
// { loading | unavailable | ready } state machine, same fail-closed posture
// (any throw during feature-detection or reads falls to "unavailable" rather
// than crashing the Settings page). Unlike that panel's "Protect my data"
// button, "Clear map cache" is NOT coral and takes NO ConfirmBox — coral and
// confirm steps are reserved for destructive actions that touch the user's
// actual data, and this only throws away re-downloadable tiles.

import { useEffect, useState } from "react";
import { toast } from "@/app/components/Toast";
import { formatCacheSize } from "@/lib/tileCache";
import { cacheEnabled, clearTileCache, tileCacheUsage } from "@/lib/tileCacheStore";

type MapCacheState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; bytes: number; count: number; enabled: boolean };

export default function MapCachePanel() {
  const [state, setState] = useState<MapCacheState>({ status: "loading" });
  const [clearing, setClearing] = useState(false);

  async function refresh() {
    try {
      const usage = await tileCacheUsage();
      if (usage === null) {
        setState({ status: "unavailable" });
        return;
      }
      const enabled = await cacheEnabled();
      setState({ status: "ready", bytes: usage.bytes, count: usage.count, enabled });
    } catch {
      // Fail closed, same as StoragePanel: a browser that half-implements the Cache API
      // or throws in a locked-down context should show "unavailable", not crash Settings.
      setState({ status: "unavailable" });
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, []);

  async function handleClear() {
    setClearing(true);
    try {
      await clearTileCache();
      toast("Map cache cleared");
    } catch {
      // clearTileCache() already degrades silently and never throws, but this button must
      // never crash the page even if that contract changes underneath it.
    }
    try {
      await refresh();
    } catch {
      setState({ status: "unavailable" });
    } finally {
      setClearing(false);
    }
  }

  if (state.status === "loading") {
    return <p className="px-1 text-sm text-sage">Checking map cache…</p>;
  }

  if (state.status === "unavailable") {
    return (
      <p className="rounded-sm bg-ground-deep px-3.5 py-3 text-sm text-sage">
        Map cache info unavailable on this browser.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-rule bg-raised px-4 py-3.5 shadow-sm">
      <p className="text-sm text-cream">
        {`~${formatCacheSize(state.bytes)} of map tiles (${state.count} tiles)`}
      </p>
      {!state.enabled ? (
        <p className="text-sm text-cream">
          Map tiles aren&rsquo;t being saved for offline use — savor only caches them once your
          browser protects this site&rsquo;s storage. Use the &ldquo;Protect my data&rdquo;
          button in the Storage section above to enable it.
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleClear}
        disabled={clearing}
        className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-sm border border-rule bg-ground-deep px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition active:scale-[0.97] disabled:opacity-50"
      >
        {clearing ? "Clearing…" : "Clear map cache"}
      </button>
    </div>
  );
}
