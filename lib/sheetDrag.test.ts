import { describe, expect, it } from "vitest";
import {
  DISMISS_FRACTION,
  DISMISS_VELOCITY,
  dragOffset,
  dragVelocity,
  shouldDismiss,
} from "./sheetDrag";

describe("dragOffset", () => {
  it("tracks downward movement one-for-one", () => {
    expect(dragOffset(100, 180)).toBe(80);
  });

  it("floors at 0 — a sheet never drags up past its resting edge", () => {
    expect(dragOffset(100, 40)).toBe(0);
    expect(dragOffset(100, 100)).toBe(0);
  });
});

describe("dragVelocity", () => {
  it("is pixels per millisecond", () => {
    expect(dragVelocity(60, 100)).toBeCloseTo(0.6);
  });

  it("is 0 when no time has passed, rather than Infinity", () => {
    expect(dragVelocity(60, 0)).toBe(0);
    expect(dragVelocity(60, -5)).toBe(0);
  });
});

describe("shouldDismiss", () => {
  it("dismisses past the distance threshold", () => {
    expect(shouldDismiss({ offset: 201, height: 800, velocity: 0 })).toBe(true);
  });

  it("springs back just under the distance threshold", () => {
    expect(shouldDismiss({ offset: 199, height: 800, velocity: 0 })).toBe(false);
  });

  it("dismisses on a fast flick even when barely moved", () => {
    expect(shouldDismiss({ offset: 20, height: 800, velocity: 0.9 })).toBe(true);
  });

  it("springs back on a slow short drag", () => {
    expect(shouldDismiss({ offset: 20, height: 800, velocity: 0.1 })).toBe(false);
  });

  it("never dismisses on a zero-height measurement", () => {
    expect(shouldDismiss({ offset: 0, height: 0, velocity: 0 })).toBe(false);
  });

  it("exposes the thresholds the spec pins", () => {
    expect(DISMISS_FRACTION).toBe(0.25);
    expect(DISMISS_VELOCITY).toBe(0.5);
  });
});
