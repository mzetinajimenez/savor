import { describe, expect, it } from "vitest";
import {
  FIT_PADDING,
  MAX_FIT_ZOOM,
  SINGLE_PLACE_ZOOM,
  boundsOf,
  cameraFor,
  hasCoords,
  partitionByCoords,
} from "./mapBounds";

const austin = { lat: 30.2672, lng: -97.7431 };
const dallas = { lat: 32.7767, lng: -96.797 };

describe("hasCoords", () => {
  it("accepts a real pair", () => {
    expect(hasCoords(austin)).toBe(true);
  });

  it("rejects a missing half — a place with one coordinate is not placeable", () => {
    expect(hasCoords({ lat: 30.2672 })).toBe(false);
    expect(hasCoords({ lng: -97.7431 })).toBe(false);
    expect(hasCoords({})).toBe(false);
  });

  it("rejects non-finite and out-of-range values rather than sending MapLibre somewhere absurd", () => {
    expect(hasCoords({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(hasCoords({ lat: Number.POSITIVE_INFINITY, lng: 0 })).toBe(false);
    expect(hasCoords({ lat: 91, lng: 0 })).toBe(false);
    expect(hasCoords({ lat: 0, lng: 181 })).toBe(false);
  });

  it("accepts a legitimate 0,0 rather than treating falsy as absent", () => {
    expect(hasCoords({ lat: 0, lng: 0 })).toBe(true);
  });
});

describe("partitionByCoords", () => {
  it("splits placeable from unplaceable, preserving input order in both halves", () => {
    const items = [
      { id: "a", ...austin },
      { id: "b" },
      { id: "c", ...dallas },
      { id: "d", lat: 1 },
    ];
    const { pinned, pinless } = partitionByCoords(items);
    expect(pinned.map((p) => p.id)).toEqual(["a", "c"]);
    expect(pinless.map((p) => p.id)).toEqual(["b", "d"]);
  });

  it("returns two empty arrays for an empty input", () => {
    expect(partitionByCoords([])).toEqual({ pinned: [], pinless: [] });
  });
});

describe("boundsOf", () => {
  it("is null for no coordinates", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("returns [[west, south], [east, north]] — MapLibre's corner order", () => {
    expect(boundsOf([austin, dallas])).toEqual([
      [-97.7431, 30.2672],
      [-96.797, 32.7767],
    ]);
  });

  it("is a degenerate box for a single point", () => {
    expect(boundsOf([austin])).toEqual([
      [austin.lng, austin.lat],
      [austin.lng, austin.lat],
    ]);
  });
});

describe("cameraFor", () => {
  it("is null with nothing to show, so the caller leaves the camera alone", () => {
    expect(cameraFor([])).toBeNull();
  });

  it("centers on a single place rather than fitting a zero-area box", () => {
    expect(cameraFor([austin])).toEqual({
      kind: "center",
      center: [austin.lng, austin.lat],
      zoom: SINGLE_PLACE_ZOOM,
    });
  });

  it("centers when every place is at the same address — a zero-area fit would zoom to infinity", () => {
    const camera = cameraFor([austin, { ...austin }, { ...austin }]);
    expect(camera?.kind).toBe("center");
  });

  it("still centers when the spread is below the epsilon (two units in one building)", () => {
    const camera = cameraFor([austin, { lat: austin.lat + 1e-7, lng: austin.lng + 1e-7 }]);
    expect(camera?.kind).toBe("center");
  });

  it("fits a real spread, with padding and a zoom ceiling", () => {
    const camera = cameraFor([austin, dallas]);
    expect(camera).toEqual({
      kind: "bounds",
      bounds: [
        [-97.7431, 30.2672],
        [-96.797, 32.7767],
      ],
      padding: FIT_PADDING,
      maxZoom: MAX_FIT_ZOOM,
    });
  });
});
