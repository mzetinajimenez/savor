// The one and only definition of savor's basemap.
//
// Both map surfaces — the Places-tab map and the place-detail header — build their style
// from here, so the two screens cannot drift apart (see the design spec §8). Framework-free
// and DOM-free: this returns plain JSON. The two modules that import maplibre-gl itself are
// app/components/places/PlacesMap.tsx and app/components/places/PlaceHeaderMapCanvas.tsx —
// nothing else should.
//
// Stock `dark` flavor, deliberately not a Supper Club basemap. Gold score seals need a
// neutral surface to sit on; on a bottle-green ground the pins compete with the map for the
// same hue. savor's identity stays in the chrome around the map.
//
// TILE SOURCE: Protomaps hosted API, z/x/y vector tiles — confirmed against protomaps.com/api
// (Aug 2026): `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=…`, maxzoom 15. This is
// a plain MapLibre `vector` source with a `tiles` array; no `pmtiles` package is required
// (that would only be needed for a hosted PMTiles-archive path, which the current docs do not
// require). The key is ORIGIN-RESTRICTED and public by design — that is what buys a tile path
// with no proxy, no function cost and no latency. Local dev is exempt from the origin
// restriction. With NO key at all, mapStyle() returns null and the caller renders an explicit
// "map unavailable" state: a broken tile path must never look like an empty map (a third-party
// bucket that denies the CORS preflight paints exactly that, and it is the single most
// misleading failure in this feature).
//
// Fonts and sprites for the basemaps styles are not served through the tile API — they are
// hosted separately on GitHub Pages by protomaps/basemaps-assets.

import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export const MAP_FLAVOR = "dark";

/** Key-free template. Never inline this URL anywhere else — swapping to a self-hosted
 *  extract later is meant to be a one-line change here, not a rewrite. */
export const PROTOMAPS_TILE_URL = "https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt";

const GLYPHS_URL = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const SPRITE_URL = `https://protomaps.github.io/basemaps-assets/sprites/v4/${MAP_FLAVOR}`;

/** ODbL requires visible attribution — the same obligation savor already carries for Photon.
 *  It is rendered by MapLibre's AttributionControl and is not dismissible. */
export const MAP_ATTRIBUTION =
  '<a href="https://protomaps.com" target="_blank" rel="noreferrer">Protomaps</a> © <a href="https://openstreetmap.org" target="_blank" rel="noreferrer">OpenStreetMap</a>';

const SOURCE_NAME = "protomaps";

/** The origin-restricted key, or null when none is configured (local dev without an account). */
export function protomapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_PROTOMAPS_API_KEY?.trim();
  return key ? key : null;
}

/**
 * The tile URL template with the key attached, optionally behind a custom MapLibre protocol
 * scheme (Stage 2's `savor-tiles://` Cache-API-backed handler).
 */
export function tileUrlTemplate(key: string, scheme?: string): string {
  const url = `${PROTOMAPS_TILE_URL}?key=${encodeURIComponent(key)}`;
  return scheme ? `${scheme}://${url}` : url;
}

/** The full MapLibre style, or null when there is no key to build one with. */
export function mapStyle(
  key: string | null,
  opts: { scheme?: string } = {}
): StyleSpecification | null {
  if (!key) return null;
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL,
    sources: {
      [SOURCE_NAME]: {
        type: "vector",
        tiles: [tileUrlTemplate(key, opts.scheme)],
        maxzoom: 15,
        attribution: MAP_ATTRIBUTION,
      },
    },
    layers: layers(SOURCE_NAME, namedFlavor(MAP_FLAVOR), { lang: "en" }),
  } as StyleSpecification;
}
