"use client";

// Sheet — savor's overlay surface. Bottom sheet on mobile (slides up from the edge, grab
// handle) / centered modal from `sm` up. h-dvh-aware so it never exceeds the visual viewport;
// backdrop tap closes; Escape + focus trap come from useModalA11y. Presentational shell only —
// forms and content render as children (T8+ fill it in).

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { dragOffset, dragVelocity, shouldDismiss } from "@/lib/sheetDrag";
import { useModalA11y } from "@/lib/useModalA11y";

export default function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Drag-to-dismiss — bottom-sheet form only. Below `sm` the panel is edge-anchored with a
  // grab handle; from `sm` up it is a centred modal, where dragging down means nothing. The
  // gesture is scoped to the header (handle + title row) so it can never fight the body's
  // own scrolling. Suppressed under prefers-reduced-motion, which is a motion preference and
  // an inner-ear one — a sheet that tracks the finger is exactly the motion it asks us to drop.
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const dragEnabled = useCallback(() => {
    if (typeof window === "undefined") return false;
    // 40rem is Tailwind's `sm`, where Sheet flips to the centred modal form.
    if (window.matchMedia("(min-width: 40rem)").matches) return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" || !dragEnabled() || drag.current) return;
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    state.velocity = dragVelocity(e.clientY - state.lastY, e.timeStamp - state.lastT);
    state.lastY = e.clientY;
    state.lastT = e.timeStamp;
    setOffset(dragOffset(state.startY, e.clientY));
  }

  function handlePointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setDragging(false);
    const height = panelRef.current?.offsetHeight ?? 0;
    const finalOffset = dragOffset(state.startY, e.clientY);
    if (shouldDismiss({ offset: finalOffset, height, velocity: state.velocity })) {
      onClose();
      return;
    }
    setOffset(0); // spring back — the transition below animates it
  }

  useModalA11y(panelRef, onClose);

  return (
    <div
      className="anim-fade fixed inset-x-0 top-0 z-40 flex h-dvh items-end justify-center bg-ground-deep/80 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        // Backdrop tap closes — but only when the press starts on the backdrop itself,
        // so a drag that ends outside the panel doesn't dismiss it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          // No transition while the finger is down — the sheet must track it exactly.
          transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="anim-sheet flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-sm bg-raised shadow-2xl ring-1 ring-rule/60 outline-none sm:anim-pop sm:rounded-sm"
      >
        <div
          className="relative shrink-0 touch-none px-5 pt-3"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {/* Grab handle — a bottom-sheet affordance, hidden once centered. */}
          <div
            aria-hidden
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-rule sm:hidden"
          />
          <div className="flex items-center justify-between gap-3 pb-3">
            <h2
              id="sheet-title"
              className="font-display text-2xl leading-none text-gold"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-sm text-cream transition active:scale-[0.97] active:bg-ground-deep"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body; the footer (if any) stays pinned. */}
        {/* overscroll-contain: a flick past the end of the sheet's content must not chain to
            the page behind it, and on Android must not trigger pull-to-refresh. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-rule px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)]" />
        )}
      </div>
    </div>
  );
}
