"use client";

// Places tab — savor's home screen. Search + status/category/cuisine filters (all AND) narrow
// the list; search and status/category run inside usePlaces' live query, cuisine is filtered
// client-side afterward since PlacesFilter (lib/hooks.ts) doesn't carry a cuisine field. Two
// distinct empty states: no places at all (onboarding) vs. filters excluding everything (a
// lighter nudge to loosen them) — kept apart so a first-time user and a frustrated filterer see
// different messages.

import { useMemo, useState } from "react";
import { useCategories, useCriteria, usePlaces } from "@/lib/hooks";
import type { PlaceStatus } from "@/lib/types";
import PlaceCard from "./components/places/PlaceCard";
import PlaceFilters from "./components/places/PlaceFilters";
import { AddPlaceButton, EmptyState, HeaderShell } from "./components/ui";

export default function PlacesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PlaceStatus | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [cuisine, setCuisine] = useState<string | undefined>(undefined);

  // Unfiltered, for the global empty-state check and for deriving the cuisine chip list — both
  // need to see every place, not just the ones passing the current filters.
  const allPlaces = usePlaces();
  const searchTerm = search.trim();
  const statusFiltered = usePlaces({
    status,
    categoryId,
    search: searchTerm || undefined,
  });
  const categories = useCategories();
  const criteria = useCriteria();

  const liveCriterionIds = useMemo(
    () => new Set((criteria ?? []).filter((c) => c.deletedAt === null).map((c) => c.id)),
    [criteria]
  );

  const cuisines = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPlaces ?? []) {
      if (p.cuisine) set.add(p.cuisine);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allPlaces]);

  const places = useMemo(() => {
    if (!statusFiltered) return undefined;
    if (!cuisine) return statusFiltered;
    return statusFiltered.filter((p) => p.cuisine === cuisine);
  }, [statusFiltered, cuisine]);

  const loading =
    allPlaces === undefined ||
    places === undefined ||
    categories === undefined ||
    criteria === undefined;
  const hasAnyPlaces = (allPlaces?.length ?? 0) > 0;
  const hasFiltersActive = Boolean(searchTerm || status || categoryId || cuisine);

  return (
    <>
      <HeaderShell title="savor">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={setSearch} />
          {hasAnyPlaces ? (
            <PlaceFilters
              status={status}
              onStatusChange={setStatus}
              categories={categories ?? []}
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
              cuisines={cuisines}
              cuisine={cuisine}
              onCuisineChange={setCuisine}
            />
          ) : null}
        </div>
      </HeaderShell>

      {!loading && !hasAnyPlaces ? (
        <EmptyState
          emoji="🍽️"
          title="Nothing on the table yet"
          hint="Add your first place — one you've eaten, or one you're dying to try. Tap the ＋ button below to get started."
        >
          <AddPlaceButton label="Add your first place" />
        </EmptyState>
      ) : null}

      {!loading && hasAnyPlaces && places && places.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title="No matches"
          hint={
            hasFiltersActive
              ? "Nothing fits these filters yet. Try clearing a chip or the search."
              : "Nothing here yet."
          }
        />
      ) : null}

      {places && places.length > 0 ? (
        <ul className="flex flex-col gap-2.5 px-4 py-4">
          {places.map((place) => (
            <li key={place.id}>
              <PlaceCard place={place} liveCriterionIds={liveCriterionIds} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <SearchGlyph className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search places, cuisine, city…"
        aria-label="Search places"
        className="h-11 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-[0.95rem] text-ink placeholder:text-ink-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
      />
    </div>
  );
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth={1.75} />
      <path d="M20 20l-4.3-4.3" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  );
}
