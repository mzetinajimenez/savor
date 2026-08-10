"use client";

// The only import path to the map. Everything MapLibre-shaped sits behind this next/dynamic
// boundary so no other route pays for the ~281 KB chunk: it is content-hashed and immutable,
// paid once per user per deploy, and shared between the Places-tab map and the place-detail
// header. ssr: false is required, not stylistic — MapLibre touches window at module scope.

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./PlacesMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-ground-deep"
      aria-busy="true"
    >
      <p className="text-sm text-sage">Loading map…</p>
    </div>
  ),
});

export default MapView;
