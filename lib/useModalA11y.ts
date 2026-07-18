import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Escape-to-close + a focus trap for full-screen / modal overlays (savor's Sheet).
 *
 * On mount: remembers what was focused, then moves focus to the first focusable
 * element inside `containerRef` (or the container itself). While open: Escape
 * calls `onClose`, and Tab / Shift+Tab wrap within the container. On unmount:
 * restores focus to whatever was focused before the overlay opened.
 *
 * Reimplemented for savor (do not import cross-app). Runs once per open lifecycle
 * — the overlay is expected to mount/unmount rather than toggle an `open` prop.
 */
export function useModalA11y(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable[0] ?? container).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = container!.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
