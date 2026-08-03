"use client";

// Places tab — savor's home screen. Search + status/category/cuisine filters (all AND) narrow
// the list; search and status/category run inside usePlaces' live query, cuisine is filtered
// client-side afterward since PlacesFilter (lib/hooks.ts) doesn't carry a cuisine field. Two
// distinct empty states: no places at all (onboarding) vs. filters excluding everything (a
// lighter nudge to loosen them) — kept apart so a first-time user and a frustrated filterer see
// different messages. A `?view=` param (list/map) toggles the body between the list and the
// map, both fed by the same filtered `places` array — see PlacesInner below.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useCategories, useCriteria, usePlaces } from "@/lib/hooks";
import { partitionByCoords } from "@/lib/mapBounds";
import { useSheetParam } from "@/lib/useSheetParam";
import type { PlaceStatus } from "@/lib/types";
import MapView from "./components/places/MapView";
import PinlessPlacesSheet from "./components/places/PinlessPlacesSheet";
import PlaceCard from "./components/places/PlaceCard";
import PlaceFilters from "./components/places/PlaceFilters";
import ViewToggle from "./components/places/ViewToggle";
import { AddPlaceButton, EmptyState, HeaderShell } from "./components/ui";

export default function PlacesPage() {
  // The List/Map toggle reads ?view= via useSearchParams(), which makes this route dynamic
  // and requires a Suspense boundary around its caller or `next build` fails — same split as
  // app/categories/[id]/page.tsx.
  return (
    <Suspense fallback={null}>
      <PlacesInner />
    </Suspense>
  );
}

function PlacesInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ?view= is a VIEW TOGGLE, not a sheet: read here and written with router.replace, exactly
  // like ?tab= / ?city= on the category route. It deliberately does NOT go through
  // useSheetParam — that hook pushes a history entry and consumes it with history.back(),
  // which is right for a sheet you dismiss and wrong for a view you switch to and stay in.
  const view: "list" | "map" = searchParams.get("view") === "map" ? "map" : "list";

  function setView(next: "list" | "map") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "map") params.set("view", "map");
    else params.delete("view");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

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

  // `?sheet=pinless` — the pinless-places sheet lives here, not in PlacesMap: URL concerns stay
  // in the page, MapLibre concerns stay in the map component (PlacesMap takes onShowPinless
  // rather than owning useSheetParam itself). Partitioned from the SAME filtered `places` array
  // the map renders, so the sheet's list can never disagree with what the footer line counted.
  const pinless = useSheetParam("pinless");
  const pinlessPlaces = useMemo(
    () => (places ? partitionByCoords(places).pinless : []),
    [places]
  );

  return (
    <>
      <HeaderShell title="Places">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={setSearch} />
          {hasAnyPlaces ? <ViewToggle view={view} onChange={setView} /> : null}
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

      {view === "list" && !loading && hasAnyPlaces && places && places.length === 0 ? (
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

      {view === "list" && places && places.length > 0 ? (
        <ul className="flex flex-col">
          {places.map((place) => (
            <li key={place.id}>
              <PlaceCard place={place} liveCriterionIds={liveCriterionIds} />
            </li>
          ))}
        </ul>
      ) : null}

      {view === "map" && places ? (
        // 100dvh minus the sticky header (safe-area-aware title + search + toggle + filter
        // row, ~9.5rem in practice) and the fixed BottomNav (h-16 plus its safe-area inset,
        // ~4.5rem) — see layout.tsx's pb-[calc(8rem+env(safe-area-inset-bottom))] on <main>.
        <div className="h-[calc(100dvh-14rem)] w-full overscroll-contain">
          <MapView
            places={places}
            liveCriterionIds={liveCriterionIds}
            onShowPinless={pinless.openSheet}
          />
        </div>
      ) : null}

      {pinless.open ? (
        <PinlessPlacesSheet places={pinlessPlaces} onClose={pinless.closeSheet} />
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
      <SearchGlyph className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cream/80" />
      <input
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search places, cuisine, city…"
        aria-label="Search places"
        className="w-full rounded-sm border border-rule bg-raised pl-9 pr-3.5 py-2.5 text-base text-cream placeholder:text-cream/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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
