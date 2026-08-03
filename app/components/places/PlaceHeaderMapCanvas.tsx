"use client";

// The only module PlaceHeaderMap's maplibre-gl mount lives in — the header-map counterpart to
// PlacesMap.tsx ("the ONLY module in savor that may import maplibre-gl itself" for the Places
// tab). Loaded through next/dynamic from PlaceHeaderMap.tsx, itself gated behind
// requestIdleCallback there, so this file — and the maplibre-gl chunk it pulls in (shared with
// the Places tab; same webpack module, fetched once per user per deploy) — never sits on place
// detail's critical path. See app/components/places/PlaceHeaderMap.tsx for the idle gate, the
// reserved-height container, the aria-hidden boundary, and the scrim.
//
// Non-interactive by construction: `interactive: false` disables every drag/zoom/rotate/pinch
// handler inside MapLibre itself (there is no separate "ignore gestures" logic to write here),
// and MapLibre's own Map#_setupContainer stamps the canvas `tabindex="-1"` whenever `interactive`
// is false (src/ui/map.ts) — so the canvas itself is never keyboard-reachable without this file
// doing anything extra. The one focusable thing MapLibre still creates regardless of
// `interactive` is the AttributionControl's `<a>` tags (plain anchors, unaffected by the
// interactive flag) — those get `tabIndex = -1` by hand below, once, right after the control is
// added.
//
// jumpTo (not flyTo/easeTo) on 'load': an unanimated cut straight to the place. There is no
// prior camera position for a user to notice snapping from — this map only ever shows one
// place, for as long as it exists.

import { useEffect, useRef, useState } from "react";
// maplibre-gl v6 ships no default export (ESM-only named exports) — same import shape as
// PlacesMap.tsx: the namespace import feeds registerTileProtocol's addProtocol call, the named
// imports are what this file actually constructs.
import * as maplibregl from "maplibre-gl";
import { AttributionControl, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, protomapsApiKey, MAP_ATTRIBUTION } from "@/lib/mapStyle";
import { SINGLE_PLACE_ZOOM } from "@/lib/mapBounds";
import { registerTileProtocol, TILE_SCHEME } from "@/lib/tileCacheStore";

export default function PlaceHeaderMapCanvas({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Drives the fade-in: starts transparent, flips once MapLibre's own 'load' fires so the tiles
  // that fade in are actually painted, not a blank canvas fading to visible.
  const [loaded, setLoaded] = useState(false);
  // Set when MapLibre's constructor throws (no WebGL — private browsing in some browsers, some
  // in-app webviews) or there is no key to build a style with. Decorative surface: unlike
  // PlacesMap.tsx's "Map unavailable" fallback, there is no interactive feature to apologize for
  // losing here — failing into rendering nothing extra (PlaceHeaderMap's scrim-only state) is
  // the correct, and simplest, fallback.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const style = mapStyle(protomapsApiKey(), { scheme: TILE_SCHEME });
    if (!style || !containerRef.current) {
      setFailed(true);
      return;
    }

    // Re-checked on every mount, never cached — see registerTileProtocol's own comment. No-ops
    // after the first call for the page lifetime regardless of which map surface (this one or
    // PlacesMap.tsx) calls it first.
    registerTileProtocol(maplibregl);

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style,
        center: [lng, lat],
        zoom: SINGLE_PLACE_ZOOM,
        interactive: false,
        attributionControl: false,
      });
    } catch (err) {
      console.error("PlaceHeaderMapCanvas: MapLibre failed to initialize", err);
      // react-hooks/set-state-in-effect forbids a synchronous setState in an effect body — defer
      // to a microtask, same workaround PlacesMap.tsx uses for its own construction-failure path.
      queueMicrotask(() => setFailed(true));
      return;
    }

    // top-right, not MapLibre's bottom-right default: the scrim's gradient (see
    // PlaceHeaderMap.tsx) goes fully opaque at the BOTTOM edge to blend into the page background,
    // which would visually swallow the attribution chip entirely if it sat there. The top is only
    // partially scrimmed, so the chip stays visible (tinted, not hidden) — ODbL's obligation is
    // that it's visible, not that it sits in any particular corner.
    const attribution = new AttributionControl({
      compact: false,
      customAttribution: MAP_ATTRIBUTION,
    });
    map.addControl(attribution, "top-right");
    // aria-hidden on PlaceHeaderMap's outer container removes this control from the
    // accessibility tree already, but aria-hidden does NOT pull a naturally-focusable element
    // (the <a> tags customAttribution renders) out of the keyboard TAB order — do that by hand so
    // Tab never lands on a link a screen reader user has no way to hear announced.
    for (const anchor of map.getContainer().querySelectorAll("a")) {
      anchor.tabIndex = -1;
    }

    map.on("load", () => {
      // MapLibre measures its container on construction; this mounts inside a next/dynamic
      // boundary behind a reserved-height container, so it should already be full height, but
      // resize() once anyway as a cheap ResizeObserver-free safety net (same call PlacesMap.tsx
      // makes on 'load' for the same reason).
      map.resize();
      map.jumpTo({ center: [lng, lat], zoom: SINGLE_PLACE_ZOOM });
      queueMicrotask(() => setLoaded(true));
    });

    return () => {
      map.remove();
    };
    // `[]` deps, deliberately: this decorative map is constructed once per mount and never
    // re-centers on a prop change mid-life — page.tsx renders a fresh PlaceHeaderMap (and so a
    // fresh mount of this component) per place id, it never re-parents an existing instance onto
    // a new lat/lng. Mirrors PlacesMap.tsx's map-creation effect, which pairs create and destroy
    // in one `[]`-deps effect for the same React Strict Mode double-invoke reasoning documented
    // there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;

  return (
    <div
      ref={containerRef}
      className={`h-full w-full transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
