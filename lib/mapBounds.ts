// Camera math for the map view, and the pinned/pinless split that feeds it.
//
// Framework-free on purpose: the degenerate cases are the whole design here — one place, and
// several places at the same address — and a zero-area fitBounds zooms to the maximum, which
// on a vector basemap means a screenful of one building's outline. Both resolve to a fixed
// center+zoom instead.
//
// partitionByCoords lives here rather than in a query: the map consumes the SAME usePlaces
// result the list does and splits it in the component. A second DB query is exactly the bug
// commit 393cdfe fixed for category city chips — a superset query disagreeing with what was
// actually rendered. One shared result makes List↔Map disagreement unrepresentable.

export type Coord = { lat: number; lng: number };

export type MapCamera =
  | { kind: "center"; center: [number, number]; zoom: number }
  | {
      kind: "bounds";
      bounds: [[number, number], [number, number]];
      padding: number;
      maxZoom: number;
    };

/** Breathing room around a fitted box, in px — pins near an edge must not be half-cropped. */
export const FIT_PADDING = 48;

/** Never fit tighter than this: a two-places-one-block fit would otherwise land at max zoom. */
export const MAX_FIT_ZOOM = 15;

/** Street-level, for the single-place and everything-at-one-address cases. */
export const SINGLE_PLACE_ZOOM = 15;

/** ~1 m. Below this, a "spread" is measurement noise, not a spread. */
export const SAME_SPOT_EPSILON = 1e-5;

function validLat(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}

function validLng(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}

/** True only when BOTH halves are present, finite and in range. 0,0 is legitimate. */
export function hasCoords<T extends { lat?: number; lng?: number }>(item: T): boolean {
  return validLat(item.lat) && validLng(item.lng);
}

/** Splits a rendered list into what can be pinned and what cannot, order preserved in both. */
export function partitionByCoords<T extends { lat?: number; lng?: number }>(
  items: T[]
): { pinned: (T & Coord)[]; pinless: T[] } {
  const pinned: (T & Coord)[] = [];
  const pinless: T[] = [];
  for (const item of items) {
    if (hasCoords(item)) pinned.push(item as T & Coord);
    else pinless.push(item);
  }
  return { pinned, pinless };
}

/** [[west, south], [east, north]] — MapLibre's LngLatBounds corner order. Null when empty. */
export function boundsOf(coords: Coord[]): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { lat, lng } of coords) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [
    [west, south],
    [east, north],
  ];
}

/**
 * The camera to open on. Null when there is nothing to show — the caller must then leave the
 * map where it is rather than jumping to null island.
 *
 * Antimeridian-spanning collections (Fiji plus Samoa) fit the long way round. Not handled:
 * savor is a personal restaurant ledger, and the fix is a real projection concern that would
 * be untested speculation here.
 */
export function cameraFor(coords: Coord[]): MapCamera | null {
  const bounds = boundsOf(coords);
  if (!bounds) return null;
  const [[west, south], [east, north]] = bounds;
  if (east - west < SAME_SPOT_EPSILON && north - south < SAME_SPOT_EPSILON) {
    return {
      kind: "center",
      center: [(west + east) / 2, (south + north) / 2],
      zoom: SINGLE_PLACE_ZOOM,
    };
  }
  return { kind: "bounds", bounds, padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM };
}
