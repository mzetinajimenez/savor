"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SHEET_PARAM, withSheet, withoutSheet } from "./sheetParam";

/**
 * URL-derived sheet state. `open` is true iff `?sheet=<name>` is on the current URL, so the
 * Android back gesture / browser Back closes the sheet by removing the param — with no
 * popstate listener of our own. Next patches window.history.pushState and owns the popstate
 * path; see lib/sheetParam.ts's header for why the patched GLOBAL must be what we call.
 *
 * Closing goes through history.back() rather than another pushState, so the entry we pushed
 * is consumed and the history stack stays balanced however many times a sheet is opened.
 *
 * NOTE: the calling component must sit inside a <Suspense> boundary — useSearchParams()
 * makes the route dynamic and `next build` fails outright without one.
 */
export function useSheetParam(name: string) {
  const searchParams = useSearchParams();
  const open = searchParams.get(SHEET_PARAM) === name;

  function openSheet() {
    if (open) return;
    window.history.pushState(null, "", withSheet(window.location.search, name));
  }

  function closeSheet() {
    if (!open) return;
    window.history.back();
  }

  return { open, openSheet, closeSheet };
}

/**
 * `?sheet=` is ephemeral: it describes a gesture in progress, not a destination. A reload or
 * a shared link must never restore a half-filled form, so the param is stripped once on cold
 * load with replaceState (which leaves no entry to go back to).
 */
export function useStripSheetParamOnLoad() {
  useEffect(() => {
    const search = window.location.search;
    if (!new URLSearchParams(search).has(SHEET_PARAM)) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${withoutSheet(search)}${window.location.hash}`
    );
  }, []);
}
