"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SHEET_PARAM, withSheet, withoutSheet } from "./sheetParam";

/**
 * URL-derived sheet state. `open` is true iff `?sheet=<name>` is on the current URL, so the
 * Android back gesture / browser Back closes the sheet by removing the param — with no
 * popstate listener of our own. Next patches window.history.pushState and owns the popstate
 * path; see lib/sheetParam.ts's header for why the patched GLOBAL must be what we call.
 *
 * `pushedRef` tracks whether *this hook instance* is the one that pushed the history entry
 * currently making `open` true. It's a ref, not state, so setting it never causes a re-render.
 * Two ways `open` can become true:
 *   - `openSheet()` ran, which pushed a new entry — `pushedRef.current` is set `true`.
 *   - the param simply arrived on the URL (cold load before the strip runs, a client-side nav
 *     that lands with `?sheet=` already on it, e.g. `/import`'s `router.replace("/?sheet=add")`)
 *     — nothing was pushed by this instance, so `pushedRef.current` stays `false`.
 * `closeSheet()` branches on that: if this instance pushed, `history.back()` consumes that
 * entry and the history stack stays balanced. If it didn't, calling `history.back()` would
 * walk off to whatever entry preceded the page (see lib/useSheetParam.test.ts and the Phase 4
 * cold-load fix notes for the reload-then-✕ regression this avoids) — so instead the current
 * entry is replaced with the param-free URL, closing the sheet in place without moving history.
 *
 * NOTE: the calling component must sit inside a <Suspense> boundary — useSearchParams()
 * makes the route dynamic and `next build` fails outright without one.
 */
export function useSheetParam(name: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get(SHEET_PARAM) === name;
  const pushedRef = useRef(false);

  function openSheet() {
    if (open) return;
    pushedRef.current = true;
    window.history.pushState(null, "", withSheet(window.location.search, name));
  }

  function closeSheet() {
    if (!open) return;
    if (pushedRef.current) {
      window.history.back();
    } else {
      router.replace(
        `${window.location.pathname}${withoutSheet(window.location.search)}${window.location.hash}`,
        { scroll: false }
      );
    }
    pushedRef.current = false;
  }

  return { open, openSheet, closeSheet };
}

/**
 * `?sheet=` is ephemeral: it describes a gesture in progress, not a destination. A reload or
 * a shared link must never restore a half-filled form, so the param is stripped once on cold
 * load.
 *
 * This goes through `router.replace(...)` rather than `window.history.replaceState(...)`
 * because `replaceState` is invisible to Next's router: it edits the URL bar without
 * dispatching anything, so `useSearchParams()` — which every `useSheetParam()` call site reads
 * `open` from — keeps reporting the stale `sheet=` value even after the bar shows it gone. A
 * sheet host would then stay mounted (scroll-lock engaged) believing it's open while the URL
 * says otherwise, and its ✕ would call `closeSheet()` -> `history.back()` over an entry that
 * was never pushed, ejecting the user from the page entirely. `router.replace` updates what
 * `useSearchParams()` reports, so every mounted sheet host re-renders closed for real — and,
 * like `replaceState`, it doesn't push a new history entry, so there's still nothing extra to
 * go back to.
 *
 * `useRouter()` (unlike `useSearchParams()`) doesn't require the calling component to sit
 * inside a `<Suspense>` boundary, so `AppInit` — which mounts once in the root layout and is
 * not itself Suspense-wrapped — can call this directly. The effect's empty dependency array is
 * what keeps this cold-load-only: `AppInit` mounts once per app lifetime and never remounts on
 * client-side navigation, so this never fires for a same-session nav to `?sheet=` (e.g.
 * `/import`'s `router.replace("/?sheet=add")`, which must be left alone for the add-place sheet
 * to open).
 */
export function useStripSheetParamOnLoad() {
  const router = useRouter();
  useEffect(() => {
    const search = window.location.search;
    if (!new URLSearchParams(search).has(SHEET_PARAM)) return;
    router.replace(
      `${window.location.pathname}${withoutSheet(search)}${window.location.hash}`,
      { scroll: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
