"use client";

// Long-press (touch/pen, ~450ms) / hover-intent (mouse, ~600ms, `(pointer: fine)` only) gesture
// for the ranked-list score peek (app/categories/[id]/page.tsx). Same category of hook as
// useModalA11y.ts: uses React + DOM, lives in lib/ because it's a reusable interaction primitive,
// not page-specific JSX.
//
// This is NOT a modal: the peek it drives is `aria-hidden`, never focus-trapped, and dismissed
// by pointerup/pointercancel/pointerleave, Escape, or any scroll — matching the spec's "the peek
// is an accelerator, never the only path" constraint (CLAUDE.md Product decisions).

import { useEffect, useRef, useState } from "react";

const TOUCH_DELAY_MS = 450;
const HOVER_DELAY_MS = 600;
const MOVE_CANCEL_PX = 10;

export function useLongPress(): {
  open: boolean;
  /** Call at the top of the row's onClick. Returns true (and resets) if the open peek was
   *  triggered by a touch long-press — meaning the click that just fired is the same gesture's
   *  pointerup-then-click, not a separate tap, and navigation should be suppressed. Always false
   *  for a mouse-hover-triggered peek, so a real mouse click still navigates normally. */
  consumeTrigger: () => boolean;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
} {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function schedule(delayMs: number, suppressNextClick: boolean) {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (suppressNextClick) triggeredRef.current = true;
      if (typeof navigator.vibrate === "function") navigator.vibrate(10);
      setOpen(true);
    }, delayMs);
  }

  function dismiss() {
    clearTimer();
    startRef.current = null;
    setOpen(false);
  }

  // Escape / scroll dismissal only while the peek is actually open. `{ capture: true }` on the
  // scroll listener catches a scroll anywhere in the DOM tree (scroll events don't bubble), not
  // just a direct window scroll — same trick used for detecting scroll inside a nested
  // scrollable container without one listener per container.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    function onScroll() {
      dismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return {
    open,
    consumeTrigger() {
      if (!triggeredRef.current) return false;
      triggeredRef.current = false;
      return true;
    },
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        if (e.pointerType === "mouse") return; // mouse uses hover-intent below, not this timer
        startRef.current = { x: e.clientX, y: e.clientY };
        schedule(TOUCH_DELAY_MS, true);
      },
      onPointerMove(e: React.PointerEvent) {
        if (!startRef.current) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearTimer();
      },
      onPointerUp() {
        clearTimer();
        if (open) dismiss();
      },
      onPointerCancel() {
        clearTimer();
        dismiss();
      },
      onPointerEnter(e: React.PointerEvent) {
        if (e.pointerType !== "mouse") return;
        if (!window.matchMedia("(pointer: fine)").matches) return;
        schedule(HOVER_DELAY_MS, false); // a real mouse click must still navigate — see consumeTrigger
      },
      onPointerLeave() {
        clearTimer();
        if (open) dismiss();
      },
      onContextMenu(e: React.MouseEvent) {
        // Only suppress iOS's native callout during/after an active touch long-press
        // (startRef is only set by the touch path in onPointerDown, and `open` covers the case
        // where the callout would otherwise appear over our own peek). A desktop right-click —
        // startRef stays null, open stays false — is untouched, so "open link in new tab" etc.
        // keeps working on the same row.
        if (startRef.current !== null || open) e.preventDefault();
      },
    },
  };
}
