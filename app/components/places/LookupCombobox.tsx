"use client";

// LookupCombobox — the place-name field and its live suggestion list, in one control.
//
// The input doubles as the place's name and the geocoder query, so this owns both. All
// the timing-sensitive behaviour (debounce, abort, discarding stale responses, caching)
// lives in lib/autocomplete.ts, deliberately outside React so it can be unit-tested;
// this component is the render + keyboard + ARIA layer over it.
//
// Suggestions render inline below the input rather than as an absolutely positioned
// popover: this mounts inside an h-dvh bottom sheet, and with the iOS keyboard up a
// floating popover mispositions. An inline list just pushes content down in a sheet
// that already scrolls.

import { useEffect, useRef, useState } from "react";
import { createLookupSession, type LookupSession, type LookupState } from "@/lib/autocomplete";
import { searchPlaces, type LookupResult } from "@/lib/lookup";

const LISTBOX_ID = "place-lookup-listbox";
const optionId = (index: number) => `place-lookup-option-${index}`;

export default function LookupCombobox({
  value,
  onChange,
  onSelect,
  autoLookup = false,
  searchNonce = 0,
}: {
  value: string;
  onChange: (name: string) => void;
  onSelect: (result: LookupResult) => void;
  autoLookup?: boolean;
  /** Bump to search `value` immediately, for names set programmatically after mount. */
  searchNonce?: number;
}) {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const [activeIndex, setActiveIndex] = useState(-1);

  // Latest onSelect without making it a dependency of the session effect — the session
  // must be built exactly once per mount. Assigned in an effect (not during render)
  // because eslint-plugin-react-hooks's react-hooks/refs rule forbids writing to a ref
  // while rendering; this still lands before any user-triggered choose() can read it.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // The session lives in a ref, created AND destroyed by the SAME effect below — never
  // a useMemo paired with a separately-scoped cleanup effect. createLookupSession's
  // destroy() sets a one-way "destroyed" flag that permanently no-ops the session, and
  // React Strict Mode double-invokes a committed mount's effects (setup -> cleanup ->
  // setup) WITHOUT recreating useMemo values — so a memoized session torn down by an
  // unrelated effect's cleanup would go create -> destroy -> (dead) before the user ever
  // types, and every later session.search() from handleChange would silently no-op.
  // Pairing create/destroy inside one effect means Strict Mode's extra cleanup+setup
  // cycle produces a fresh, live session instead of killing the only one that exists.
  // (Same class of dev-mode double-invoke bug lib/hooks.ts's useDbInit guards against —
  // see its "or React StrictMode double-invokes the effect in dev" comment.)
  const sessionRef = useRef<LookupSession | null>(null);

  useEffect(() => {
    const session = createLookupSession({
      onState: (next) => {
        setState(next);
        setActiveIndex(-1);
      },
      search: searchPlaces,
    });
    sessionRef.current = session;

    // The share-link import path (PlacePrefill.autoLookup) opens the sheet with a venue
    // name already seeded and expects suggestions immediately, with no keystroke and no
    // debounce to wait through.
    if (autoLookup && value.trim()) session.searchNow(value);

    return () => {
      session.destroy();
      sessionRef.current = null;
    };
    // Exactly once per mount (create/destroy paired, see sessionRef comment above):
    // re-running would restart the session mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The paste-a-link flow resolves a venue name AFTER mount, so it can't use autoLookup above.
  // React never fires onChange for a programmatic write, so without this nothing would search
  // for the name it just filled in. `value` is deliberately not a dependency — including it
  // would fire an undebounced search on every keystroke.
  useEffect(() => {
    if (!searchNonce) return;
    const query = value.trim();
    if (query) sessionRef.current?.searchNow(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchNonce]);

  // "loading" deliberately carries the *previous* results (lib/autocomplete.ts) so a new
  // debounce round doesn't blank the list — pulling from both statuses keeps it visible
  // and arrow-navigable while a fresh search is in flight, instead of flickering closed
  // on every keystroke.
  const results =
    state.status === "results" || state.status === "loading" ? state.results : [];
  const isOpen = results.length > 0;

  function handleChange(next: string) {
    onChange(next);
    sessionRef.current?.search(next);
  }

  function choose(result: LookupResult) {
    onChange(result.name);
    onSelectRef.current(result);
    sessionRef.current?.cancel();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      // Only swallow Escape when there's actually a list to close. useModalA11y attaches
      // its own Escape handler at the document level for the parent Sheet; if we always
      // stopped propagation here, Escape could never reach it and the Add-Place sheet
      // would become impossible to dismiss with the keyboard once this field existed.
      if (isOpen) e.stopPropagation();
      sessionRef.current?.cancel();
      return;
    }
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(results[activeIndex]);
    } else if (e.key === "Tab") {
      sessionRef.current?.cancel();
    }
  }

  return (
    <div>
      <label htmlFor="place-name" className="mb-1 block text-sm font-semibold text-ink-soft">
        Name
      </label>
      <input
        id="place-name"
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? LISTBOX_ID : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Taco Spot"
        className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
      />

      {/* Announced to screen readers without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {state.status === "results"
          ? `${state.results.length} suggestion${state.results.length === 1 ? "" : "s"}`
          : state.status === "loading"
            ? "Searching…"
            : state.status === "empty"
              ? "No matches"
              : state.status === "error"
                ? "Couldn't reach lookup — add manually."
                : ""}
      </p>

      {isOpen ? (
        <>
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Place suggestions"
            className="mt-2 flex flex-col gap-1.5"
          >
            {/*
              role="option" goes on the <li> itself, with no nested <button>. Two reasons:
              a listbox's children must be options, and putting role="option" on a button
              overrides the button's implicit role — legal ARIA, but a known source of
              screen-reader inconsistency. And because this is the aria-activedescendant
              pattern, focus never leaves the input, so options must not be focusable or
              tabbable; a button would be both. Keyboard selection is handled by the
              input's onKeyDown, and this onClick covers pointer and touch.
            */}
            {results.map((result, i) => (
              <li
                key={result.osmId ?? `${result.lat}-${result.lng}-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => choose(result)}
                className={`min-h-11 cursor-pointer rounded-xl border px-3.5 py-2.5 transition active:scale-[0.99] ${
                  i === activeIndex
                    ? "border-plum bg-surface-sunk"
                    : "border-line bg-surface active:bg-surface-sunk"
                }`}
              >
                <p className="text-sm font-semibold leading-snug text-ink">{result.name}</p>
                {result.address || result.city ? (
                  <p className="text-xs leading-snug text-ink-soft">
                    {[result.address, result.city].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {/* ODbL requires attribution for OSM-derived results. */}
          <p className="mt-1.5 text-xs text-ink-soft/70">
            Results ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              OpenStreetMap
            </a>{" "}
            contributors
          </p>
        </>
      ) : null}

      {state.status === "loading" ? (
        <p className="mt-2 text-sm text-ink-soft">Searching…</p>
      ) : null}

      {state.status === "empty" ? (
        <p className="mt-2 text-sm text-ink-soft">No matches — add manually.</p>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-2 text-sm text-ink-soft">Couldn&apos;t reach lookup — add manually.</p>
      ) : null}
    </div>
  );
}
