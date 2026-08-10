"use client";

// Decorative, non-interactive map behind the place-detail header — design spec §8
// (docs/superpowers/specs/2026-08-02-map-view-design.md). Rendered only when the place has
// coordinates; the coordinate guard lives in app/places/[id]/page.tsx (hasCoords(place)), not
// here, so a coordinate-less place never even constructs this component — there is no
// "no-coords" branch to author in this file at all.
//
// Deliberately maplibre-gl-FREE at this module's top level: the actual MapLibre mount lives in
// PlaceHeaderMapCanvas.tsx, loaded through next/dynamic's own import() call below. That call
// only fires once `shouldLoad` flips true, which itself only happens once the browser reports
// idle time (requestIdleCallback, with a setTimeout fallback for Safari's recent/inconsistent
// support) — so the ~281 KB maplibre-gl chunk (shared with the Places tab; same webpack module,
// fetched once) is never even requested until after place detail has already rendered and
// become interactive.
//
// The container below reserves its final height unconditionally, before shouldLoad ever flips —
// place detail renders complete without the map (a slow connection, no Protomaps key, no WebGL
// all resolve to the same "just the scrim, forever" state) and nothing reflows if or when it
// arrives.
//
// aria-hidden="true" on the whole thing: the address line in place detail's info block is the
// accessible source of location, the same accelerator-not-only-path principle the score-peek
// long-press keeps (see CLAUDE.md). PlaceHeaderMapCanvas.tsx separately strips tabIndex from the
// AttributionControl's anchor tags — aria-hidden removes this subtree from the accessibility
// tree, but does not by itself pull naturally-focusable elements out of the keyboard TAB order.
//
// The scrim is token opacity modifiers only (from-ground-deep/70 via-ground/40 to-ground) — no
// raw rgba()/hex — so lib/theme-contract.test.ts stays green. It renders ABOVE the map (a later
// sibling in the same stacking context) so it actually affects how the tiles read, fully opaque
// at the bottom edge to blend into the page background below. AttributionControl is positioned
// top-right specifically so it sits under the scrim's lighter region instead of the fully-opaque
// bottom — see PlaceHeaderMapCanvas.tsx's own comment on that choice.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PlaceHeaderMapCanvas = dynamic(() => import("./PlaceHeaderMapCanvas"), {
  ssr: false,
  loading: () => null,
});

// Fixed height, always rendered — this is what makes "nothing reflows" true regardless of
// whether the map ever loads. Not derived from the viewport (unlike PlacesMap.tsx's full-bleed
// CONTAINER_CLASS): this sits inline in the page's normal flow between the header and the status
// pill, not behind a fixed-chrome frame, so a plain fixed height is the right tool here.
const CONTAINER_CLASS = "relative h-48 w-full overflow-hidden";

export default function PlaceHeaderMap({ lat, lng }: { lat: number; lng: number }) {
  // Idle gate: place detail's own interactive content (header, status pill, ratings) must never
  // wait on this. `requestIdleCallback` is preferred; Safari's support is recent/inconsistent
  // (still true as of this writing), hence the setTimeout fallback.
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof w.requestIdleCallback === "function") {
      const idleId = w.requestIdleCallback(() => setShouldLoad(true));
      return () => w.cancelIdleCallback?.(idleId);
    }

    const timeoutId = window.setTimeout(() => setShouldLoad(true), 200);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div aria-hidden="true" className={CONTAINER_CLASS}>
      {shouldLoad ? (
        <div className="absolute inset-0">
          <PlaceHeaderMapCanvas lat={lat} lng={lng} />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ground-deep/70 via-ground/40 to-ground" />
    </div>
  );
}
