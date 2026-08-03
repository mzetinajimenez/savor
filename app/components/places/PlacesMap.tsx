"use client";

// PlacesMap — the ONLY module in savor that may import maplibre-gl. Everything else that needs
// a map imports MapView (the lazy, SSR-disabled shell around this file).
//
// This task is the canvas, the camera, the attribution, and the no-key state — pins and the
// selection card land in Task 5, the List/Map toggle in Task 4. `liveCriterionIds` is accepted
// and ignored for now so the prop shape Task 5 needs doesn't have to be re-added later.

import { useEffect, useMemo, useRef } from "react";
// maplibre-gl v6 ships no default export (ESM-only named exports) — import the pieces used
// directly rather than a `maplibregl` namespace default that doesn't exist.
import { AttributionControl, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, protomapsApiKey, MAP_ATTRIBUTION } from "@/lib/mapStyle";
import { cameraFor, partitionByCoords } from "@/lib/mapBounds";
import type { Place } from "@/lib/types";

// Clears the sticky HeaderShell above (title-only, no filter row: ~4.25rem including its
// safe-area top inset) and the fixed BottomNav + FAB overhang below (the same 8rem the page
// body's <main> already reserves in app/layout.tsx). This is a standalone estimate — Task 4
// mounts this inside the actual Places-tab frame and is the place to true it up against the
// real rendered header height if it turns out to be off.
const CONTAINER_CLASS = "relative h-[calc(100dvh-4.25rem-8rem)] w-full overscroll-contain";

export default function PlacesMap({
  places,
}: {
  places: Place[];
  liveCriterionIds: Set<string>;
}) {
  const key = protomapsApiKey();
  // Memoized on `key` (a stable primitive that never changes at runtime) rather than recomputed
  // bare on every render — mapStyle() returns a fresh object literal each call, and depending on
  // that identity directly in the effect below would tear down and rebuild the map on every
  // parent re-render (e.g. every places-prop change), which is exactly the camera-yank the
  // userMovedRef guard exists to prevent.
  const style = useMemo(() => mapStyle(key), [key]);

  const pinned = useMemo(() => partitionByCoords(places).pinned, [places]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Latest pinned coords for the 'load' handler below, which is registered once at mount and
  // must not close over a stale `places` snapshot from that moment.
  const pinnedRef = useRef(pinned);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  // Set once the user drags or zooms. After that, a prop-driven re-render (a filter chip
  // narrowing `places`, a new place added elsewhere) must never yank the camera out from under
  // them — see the effect below, which fits camera exactly once, on 'load'.
  const userMovedRef = useRef(false);

  useEffect(() => {
    if (!style || !containerRef.current) return;

    // The map instance lives in this ref and is created AND destroyed by THIS SAME effect —
    // never a useMemo paired with a separately-scoped cleanup effect. maplibregl.Map#remove()
    // is a one-way teardown, the same shape as LookupCombobox.tsx's session.destroy(): React
    // Strict Mode double-invokes a committed mount's effects (setup -> cleanup -> setup)
    // WITHOUT recreating useMemo values, so a memoized map torn down by an unrelated effect's
    // cleanup would go create -> destroy -> (dead) before the first paint settles, and every
    // later fitBounds/jumpTo call would silently no-op against a removed map. Pairing
    // create/destroy inside one effect means Strict Mode's extra cleanup+setup cycle produces a
    // fresh, live map instead of killing the only one that will ever exist.
    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      // Default attribution control is replaced below with an explicit, non-compact one —
      // ODbL requires it visible, not collapsed into a toggle button.
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new AttributionControl({ compact: false, customAttribution: MAP_ATTRIBUTION })
    );
    // No NavigationControl: pinch and drag are the phone gestures here, and zoom/rotate
    // buttons would crowd the selection card Task 5 adds.

    map.on("dragstart", () => {
      userMovedRef.current = true;
    });
    map.on("zoomstart", () => {
      userMovedRef.current = true;
    });

    map.on("load", () => {
      // MapLibre measures its container on construction. This mounts inside a next/dynamic
      // boundary so the container is present by then, but call resize() once anyway as a
      // ResizeObserver-free safety net against a half-height canvas rather than debugging one
      // later.
      map.resize();

      // Fit exactly once, on initial load — never re-run on a `places` change. A filter chip
      // tap or a background DB write must not yank the camera out from under a user who has
      // already panned somewhere (userMovedRef guards the case where 'load' itself is slow and
      // the user moves the map before it fires).
      if (userMovedRef.current) return;
      const camera = cameraFor(pinnedRef.current);
      if (!camera) return; // nothing to show — leave the camera at its default position
      if (camera.kind === "center") {
        map.jumpTo({ center: camera.center, zoom: camera.zoom });
      } else {
        map.fitBounds(camera.bounds, {
          padding: camera.padding,
          maxZoom: camera.maxZoom,
          animate: false,
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Exactly once per mount (create/destroy paired, see comment above). `style` is the only
    // dependency that can legitimately change it (a runtime key swap); `places`/`pinned` are
    // deliberately excluded — re-running this effect on every places change is the re-fit bug
    // this whole structure exists to avoid. `pinnedRef` (a ref) and `cameraFor`/`partitionByCoords`
    // (module-level pure functions) are stable and don't need to be listed.
  }, [style]);

  if (!style) {
    return (
      <div
        className={`${CONTAINER_CLASS} flex items-center justify-center bg-raised px-6 text-center`}
      >
        <div>
          <p className="font-display text-lg text-cream">Map unavailable</p>
          <p className="mt-1 text-sm text-cream">
            savor needs a map tile key to draw this. The list view has everything.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={CONTAINER_CLASS}>
      <div ref={containerRef} className="h-full w-full" />
      {pinned.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="rounded-sm bg-ground-deep/90 px-4 py-2 text-sm text-cream">
            No places on the map yet
          </p>
        </div>
      ) : null}
    </div>
  );
}
