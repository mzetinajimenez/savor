"use client";

// Sheet — savor's overlay surface. Bottom sheet on mobile (slides up from the edge, grab
// handle) / centered modal from `sm` up. h-dvh-aware so it never exceeds the visual viewport;
// backdrop tap closes; Escape + focus trap come from useModalA11y. Presentational shell only —
// forms and content render as children (T8+ fill it in).

import { useRef, type ReactNode } from "react";
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
  useModalA11y(panelRef, onClose);

  return (
    <div
      className="anim-fade fixed inset-x-0 top-0 z-40 flex h-dvh items-end justify-center bg-ink/40 sm:items-center sm:p-4"
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
        className="anim-sheet flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-surface shadow-2xl ring-1 ring-line/60 outline-none sm:anim-pop sm:rounded-2xl"
      >
        <div className="relative shrink-0 px-5 pt-3">
          {/* Grab handle — a bottom-sheet affordance, hidden once centered. */}
          <div
            aria-hidden
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden"
          />
          <div className="flex items-center justify-between gap-3 pb-3">
            <h2
              id="sheet-title"
              className="font-display text-2xl leading-none text-plum"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-soft transition active:scale-90 active:bg-surface-sunk"
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
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-line px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)]" />
        )}
      </div>
    </div>
  );
}
