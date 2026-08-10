"use client";

// PinlessPlacesSheet — lists places with no lat/lng and offers a per-row "Find location" that
// runs the same lookup PlaceForm's LookupCombobox uses, but keyed off the place's own name/city
// rather than a text field. This is the first path in savor that can set coordinates on an
// EXISTING place: a manually-typed name, or an edit that cleared the location (PlaceForm.tsx's
// name-clears-coords dead end), used to be permanent. It stops being permanent here.
//
// It lists ONLY places with no coordinates. Correcting a coordinate that exists but is wrong is
// a different problem with a different UI and is explicitly out of scope.
//
// Each row owns its own lookup state and its own AbortController — a lookup in one row must
// never block or cancel another, and a sheet dismissed mid-lookup must abort rather than resolve
// into a torn-down tree. searchPlaces rethrows AbortError by design (lib/lookup.ts); this
// swallows it exactly as lib/autocomplete.ts does.
//
// Suggestions render inline, pushing the row's content down, never as a floating popover —
// this mounts inside an h-dvh bottom sheet and LookupCombobox.tsx documents exactly why a
// popover mispositions with the iOS keyboard raised. Same constraint, same answer.

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type LookupFailureReason, type LookupResult } from "@/lib/lookup";
import { updatePlace } from "@/lib/repo";
import type { Place } from "@/lib/types";
import Sheet from "@/app/components/Sheet";
import { toast } from "@/app/components/Toast";

export default function PinlessPlacesSheet({
  places,
  onClose,
}: {
  places: Place[];
  onClose: () => void;
}) {
  // The live query re-runs on every write; once the last pinless place resolves, `places` goes
  // to length 0 and this closes itself rather than showing an empty sheet with nothing to do.
  useEffect(() => {
    if (places.length === 0) onClose();
  }, [places.length, onClose]);

  if (places.length === 0) return null;

  return (
    <Sheet title="Not on the map" onClose={onClose}>
      <ul className="flex flex-col">
        {places.map((place) => (
          <li key={place.id} className="border-t border-rule py-3 first:border-t-0">
            <PinlessPlaceRow place={place} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

type RowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; reason: LookupFailureReason }
  | { status: "empty" }
  | { status: "results"; results: LookupResult[] };

function reasonText(reason: LookupFailureReason): string {
  switch (reason) {
    case "network":
      return "Couldn't reach lookup — check your connection.";
    case "upstream":
      return "The lookup service is having trouble right now.";
    case "invalid":
      return "Got an unexpected response from lookup.";
  }
}

function PinlessPlaceRow({ place }: { place: Place }) {
  const [state, setState] = useState<RowState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  // One AbortController per row, held across the row's lifetime — aborted on unmount so a
  // sheet dismissed mid-lookup doesn't resolve a fetch into a torn-down tree.
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  async function runSearch() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });

    const query = [place.name, place.city].filter(Boolean).join(" ");
    let outcome;
    try {
      outcome = await searchPlaces(query, controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState({ status: "error", reason: "network" });
      return;
    }

    if (!outcome.ok) {
      setState({ status: "error", reason: outcome.reason });
      return;
    }
    setState(
      outcome.results.length > 0
        ? { status: "results", results: outcome.results }
        : { status: "empty" }
    );
  }

  async function choose(result: LookupResult) {
    setSaving(true);
    try {
      await updatePlace(place.id, {
        lat: result.lat,
        lng: result.lng,
        osmId: result.osmId,
        address: result.address,
        city: result.city,
      });
      toast("Location added");
      // The place leaves this list on its own once usePlaces' live query re-runs — no local
      // state to clear here.
    } catch {
      toast("Couldn't save the location", true);
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-snug text-cream">{place.name}</p>
          {place.city ? (
            <p className="truncate text-xs leading-snug text-cream/80">{place.city}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={state.status === "loading" || saving}
          className="min-h-11 shrink-0 rounded-sm bg-gold px-3.5 text-sm font-semibold text-ground transition active:scale-[0.97] disabled:opacity-60"
        >
          Find location
        </button>
      </div>

      {state.status === "loading" ? (
        <p className="mt-2 text-sm text-cream/80">Searching…</p>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-cream/80">{reasonText(state.reason)}</p>
          <button
            type="button"
            onClick={runSearch}
            className="min-h-11 shrink-0 rounded-sm border border-rule px-3 text-sm font-semibold text-cream transition active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {state.status === "empty" ? (
        <p className="mt-2 text-sm text-cream/80">Couldn&apos;t find this venue.</p>
      ) : null}

      {state.status === "results" ? (
        <ul className="mt-2 flex flex-col">
          {state.results.map((result, i) => (
            <li key={result.osmId ?? `${result.lat}-${result.lng}-${i}`}>
              <button
                type="button"
                onClick={() => choose(result)}
                disabled={saving}
                className="min-h-11 w-full border-t border-rule py-2.5 text-left transition-colors active:bg-ground-deep disabled:opacity-60"
              >
                <p className="text-sm font-semibold leading-snug text-cream">{result.name}</p>
                {result.address || result.city ? (
                  <p className="text-xs leading-snug text-cream/80">
                    {[result.address, result.city].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
