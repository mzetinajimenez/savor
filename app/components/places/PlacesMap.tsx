"use client";

// PlacesMap — the ONLY module in savor that may import maplibre-gl. Everything else that needs
// a map imports MapView (the lazy, SSR-disabled shell around this file).
//
// This task is the canvas, the camera, the attribution, and the no-key state — pins and the
// selection card land in Task 5, the List/Map toggle in Task 4. `liveCriterionIds` is accepted
// and ignored for now so the prop shape Task 5 needs doesn't have to be re-added later.

import { useEffect, useMemo, useRef, useState } from "react";
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
  // `key` is an env var — fixed for the lifetime of the app, never changes at runtime. `style`
  // is read again, fresh, inside the mount effect below rather than threaded in as a dependency
  // (see that effect's comment for why: the effect must run its create/destroy cycle exactly
  // once per mount, matching LookupCombobox.tsx's session-ref pattern, not respond to a
  // recomputed style object's identity).
  const key = protomapsApiKey();
  const style = mapStyle(key);

  // Set when maplibregl.Map's constructor throws (e.g. no WebGL — private browsing, some
  // in-app browsers). A broken tile path must never look like a blank map; this folds the
  // construction-failure case into the same "Map unavailable" fallback the no-key case uses.
  const [mapFailed, setMapFailed] = useState(false);

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
    // Fresh read, not the outer `style`/`key` closure — this effect has `[]` deps (see below)
    // so it must not implicitly depend on anything from render scope that could theoretically
    // change; recomputing here keeps that true regardless.
    const style = mapStyle(protomapsApiKey());
    if (!style || !containerRef.current) return;

    // The map instance lives in this ref and is created AND destroyed by THIS SAME effect —
    // never a useMemo paired with a separately-scoped cleanup effect, and never re-created by a
    // dependency-array change (hence `[]` below). maplibregl.Map#remove() is a one-way teardown,
    // the same shape as LookupCombobox.tsx's session.destroy() (see its useEffect at line ~91,
    // also `[]`): React Strict Mode double-invokes a committed mount's effects (setup -> cleanup
    // -> setup) WITHOUT recreating useMemo values, so a memoized map torn down by an unrelated
    // effect's cleanup would go create -> destroy -> (dead) before the first paint settles, and
    // every later fitBounds/jumpTo call would silently no-op against a removed map. Pairing
    // create/destroy inside one effect with empty deps means Strict Mode's extra cleanup+setup
    // cycle produces a fresh, live map instead of killing the only one that will ever exist.
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style,
        // Default attribution control is replaced below with an explicit, non-compact one —
        // ODbL requires it visible, not collapsed into a toggle button.
        attributionControl: false,
      });
    } catch (err) {
      // The constructor throws when the environment can't give it a WebGL context (private
      // browsing in some browsers, certain in-app browsers, disabled hardware acceleration).
      // A broken tile path must never look like a blank/empty map — fold this into the same
      // "Map unavailable" fallback the no-key case renders, rather than letting the exception
      // propagate out of the effect and crash the component.
      console.error("PlacesMap: MapLibre failed to initialize", err);
      // react-hooks/set-state-in-effect forbids calling setState synchronously within an
      // effect body; queueMicrotask defers it to a callback, the same shape the rule's own
      // guidance describes ("calling setState in a callback function when external state
      // changes"), without introducing a visible delay.
      queueMicrotask(() => setMapFailed(true));
      return;
    }
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
    // Exactly once per mount (create/destroy paired, see comment above) — mirrors
    // LookupCombobox.tsx's session effect exactly. `style` is read fresh inside the effect body
    // (see above) rather than listed as a dependency, since `protomapsApiKey()` never changes
    // at runtime and this effect must not re-run on it regardless. `places`/`pinned` are
    // deliberately excluded — re-running this effect on every places change is the re-fit bug
    // this whole structure exists to avoid. `pinnedRef` (a ref) and `cameraFor`/`partitionByCoords`
    // (module-level pure functions) are stable and don't need to be listed.
  }, []);

  if (!style || mapFailed) {
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
