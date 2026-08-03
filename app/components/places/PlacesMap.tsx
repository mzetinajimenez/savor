"use client";

// PlacesMap — the ONLY module in savor that may import maplibre-gl. Everything else that needs
// a map imports MapView (the lazy, SSR-disabled shell around this file).
//
// Task 3 laid the canvas, the camera, the attribution, and the no-key state. Task 5 (this pass)
// adds pins — one maplibregl.Marker per pinned place, whose element is a bare
// document.createElement("div") that a <MapPin/> gets createPortal'd into, so pins are ordinary
// JSX using Supper Club tokens rather than string-built DOM — and the non-modal selection card
// (which does use ScoreBadge). The List/Map toggle is Task 4.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
// maplibre-gl v6 ships no default export (ESM-only named exports) — import the pieces used
// directly rather than a `maplibregl` namespace default that doesn't exist.
import { AttributionControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, protomapsApiKey, MAP_ATTRIBUTION } from "@/lib/mapStyle";
import { cameraFor, partitionByCoords } from "@/lib/mapBounds";
import { compositeScore } from "@/lib/ranking";
import type { Place } from "@/lib/types";
import MapPin from "./MapPin";
import MapSelectionCard from "./MapSelectionCard";

// Clears the sticky HeaderShell above (title-only, no filter row: ~4.25rem including its
// safe-area top inset) and the fixed BottomNav + FAB overhang below (the same 8rem the page
// body's <main> already reserves in app/layout.tsx). This is a standalone estimate — Task 4
// mounts this inside the actual Places-tab frame and is the place to true it up against the
// real rendered header height if it turns out to be off.
const CONTAINER_CLASS = "relative h-[calc(100dvh-4.25rem-8rem)] w-full overscroll-contain";

export default function PlacesMap({
  places,
  liveCriterionIds,
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

  // Exactly one selected pin at a time, or none. Cleared by: the background map click handler
  // (registered in the map-creation effect below), the selection card's ✕, and the
  // filtered-out effect further down (a place disappearing from `pinned` while selected).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // One maplibregl.Marker per pinned place, keyed by place id, reconciled (not
  // torn-down-and-rebuilt) on every `pinned` change — see the reconciliation effect below for
  // why. `container` is the bare div each Marker wraps; `<MapPin/>` gets createPortal'd into it
  // from this component's render, so the pin's actual visual content is ordinary JSX rather
  // than string-built DOM.
  const markersRef = useRef<Map<string, { marker: Marker; container: HTMLDivElement }>>(
    new Map()
  );
  // Mirrors markersRef's containers into React state so render can createPortal into each one.
  // Only reassigned by the reconciliation effect, never read by it.
  const [markerEls, setMarkerEls] = useState<{ id: string; container: HTMLDivElement }[]>([]);

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

    // Deselect on a background tap. MapLibre distinguishes a drag from a click (this fires on
    // release-without-drag only), so panning with the selection card open never trips this — no
    // separate "was it a drag" bookkeeping needed. A tap on a pin itself never reaches here: the
    // click listener the reconciliation effect attaches to each marker's own container div
    // stopPropagation()s first.
    map.on("click", () => {
      setSelectedId(null);
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

  // Marker reconciliation — deliberately its OWN effect, separate from the map-creation effect
  // above, and keyed on `pinned` rather than `[]`. Filter chips change `places` (and so `pinned`)
  // on nearly every render; diffing by id here — add markers for new ids, marker.remove() for
  // departed ones, setLngLat for moved ones — means only the places that actually changed touch
  // the DOM. A full teardown-and-rebuild every render (the naive approach) would flicker every
  // pin on every filter tap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = markersRef.current;
    const currentIds = new Set(pinned.map((p) => p.id));

    for (const [id, entry] of markers) {
      if (!currentIds.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    }

    for (const place of pinned) {
      const existing = markers.get(place.id);
      if (existing) {
        existing.marker.setLngLat([place.lng, place.lat]);
        continue;
      }
      // A bare div — no Tailwind classes assigned here. The visual pin is <MapPin/>, portalled
      // into this container from render below, so Tailwind's literal-class-string scanner sees
      // real JSX rather than anything string-built. This click listener is native DOM (not
      // React), attached once at marker creation and closing over this place's stable id — it
      // never goes stale across re-renders, since the container itself is only ever created
      // once per id and torn down (not reused) when that id departs.
      const container = document.createElement("div");
      container.addEventListener("click", (e) => {
        // Selecting a pin must not also trigger the map's background click handler above,
        // which deselects.
        e.stopPropagation();
        setSelectedId(place.id);
      });
      const marker = new Marker({ element: container, anchor: "center" })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      markers.set(place.id, { marker, container });
    }

    setMarkerEls(
      pinned.flatMap((place) => {
        const entry = markers.get(place.id);
        return entry ? [{ id: place.id, container: entry.container }] : [];
      })
    );
  }, [pinned]);

  // Unmount-only teardown, deliberately a SEPARATE effect from the reconciliation effect above
  // rather than that effect's own cleanup — a cleanup returned from the `[pinned]`-keyed effect
  // would run on every reconciliation, not just unmount, defeating the whole point of diffing.
  // This effect's `[]` deps mean React Strict Mode's double-invoke (setup -> cleanup -> setup)
  // clears every marker between the reconciliation effect's two mount-time runs, but that read
  // is self-healing: the reconciliation effect's second run sees an empty `markersRef` against a
  // non-empty `pinned` and simply recreates them all, unlike the map instance above (a true
  // singleton that is NEVER recreated after its one create/destroy effect runs, which is why
  // that one effect owns both halves).
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const { marker } of markers.values()) {
        marker.remove();
      }
      markers.clear();
    };
  }, []);

  // A filter chip narrowing `places` can remove the currently-selected place from `pinned`.
  // Rendering MapSelectionCard for a place no longer on the map would be a stale, confusing
  // card floating over pins that no longer include it — clear the selection instead.
  // react-hooks/set-state-in-effect forbids calling setState synchronously within an effect
  // body (same rule the mapFailed branch above works around); queueMicrotask defers it to a
  // callback without introducing a visible delay.
  useEffect(() => {
    if (selectedId && !pinned.some((p) => p.id === selectedId)) {
      queueMicrotask(() => setSelectedId(null));
    }
  }, [pinned, selectedId]);

  const selectedPlace = selectedId ? pinned.find((p) => p.id === selectedId) ?? null : null;
  const selectedScore = selectedPlace
    ? compositeScore(selectedPlace.ratings, {}, liveCriterionIds)
    : null;

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
      {/* Each pin is ordinary JSX portalled into its marker's bare container div (see the
          reconciliation effect above) — this is what lets <MapPin/> use Supper Club tokens
          instead of string-built DOM. Rendered here rather than deriving `pinned` inline so a
          marker's container identity stays stable across re-renders. */}
      {markerEls.map(({ id, container }) => {
        const place = pinned.find((p) => p.id === id);
        if (!place) return null;
        const score = compositeScore(place.ratings, {}, liveCriterionIds);
        return createPortal(
          <MapPin key={id} place={place} score={score} selected={id === selectedId} />,
          container
        );
      })}
      {selectedPlace ? (
        <MapSelectionCard
          place={selectedPlace}
          score={selectedScore}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
