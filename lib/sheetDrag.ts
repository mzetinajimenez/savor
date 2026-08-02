// Pure drag-to-dismiss math for the bottom sheet (app/components/Sheet.tsx).
//
// Framework-free on purpose: the thresholds are the whole design decision here, and they
// should be verifiable without a browser or a pointer. Sheet.tsx owns the pointer events
// and the transform; this file owns every number.

/** Dismiss once the sheet has been dragged past this fraction of its own height. */
export const DISMISS_FRACTION = 0.25;

/** …or flicked faster than this, in px/ms, however short the drag. */
export const DISMISS_VELOCITY = 0.5;

/**
 * How far the sheet should be translated for a pointer that started at `startY` and is
 * now at `currentY`. Floors at 0 — dragging up past the resting edge does nothing, so the
 * sheet never lifts off the bottom of the screen.
 */
export function dragOffset(startY: number, currentY: number): number {
  return Math.max(0, currentY - startY);
}

/** Pixels per millisecond. Returns 0 rather than Infinity when no time has elapsed. */
export function dragVelocity(deltaY: number, deltaMs: number): number {
  if (deltaMs <= 0) return 0;
  return deltaY / deltaMs;
}

/** Distance OR velocity is enough — a short fast flick dismisses, a long slow drag dismisses. */
export function shouldDismiss({
  offset,
  height,
  velocity,
}: {
  offset: number;
  height: number;
  velocity: number;
}): boolean {
  if (height <= 0) return false;
  return offset > height * DISMISS_FRACTION || velocity > DISMISS_VELOCITY;
}
