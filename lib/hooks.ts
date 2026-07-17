"use client";

// THE read path for savor: components never import Dexie directly (see lib/repo.ts for the
// write path). Query logic lives in exported plain async functions so it can be unit-tested
// with fake-indexeddb (see lib/hooks.test.ts) without React or jsdom; each hook below is a thin
// useLiveQuery wrapper around one of those functions. Every query filters tombstones
// (deletedAt === null) — a hook returns `undefined` while the first live query resolves, never
// as a "not found" result once loaded.

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ensureSeeded } from "./db";
import { rankCategory, type RankedEntry } from "./ranking";
import type { Category, Criterion, Place, PlaceStatus, Visit } from "./types";

export interface PlacesFilter {
  status?: PlaceStatus;
  categoryId?: string;
  search?: string;
}

// ---- query functions ----

/** All non-tombstoned places, optionally narrowed by status/categoryId/search, name ascending. */
export async function queryPlaces(filter?: PlacesFilter): Promise<Place[]> {
  let places = await db.places.filter((p) => p.deletedAt === null).toArray();

  if (filter?.status) {
    const status = filter.status;
    places = places.filter((p) => p.status === status);
  }
  if (filter?.categoryId) {
    const categoryId = filter.categoryId;
    places = places.filter((p) => p.categoryIds.includes(categoryId));
  }
  if (filter?.search) {
    // Case-insensitive substring match on name OR cuisine OR city.
    const term = filter.search.toLowerCase();
    places = places.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.cuisine ?? "").toLowerCase().includes(term) ||
        (p.city ?? "").toLowerCase().includes(term)
    );
  }

  places.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return places;
}

/** A single non-tombstoned place, or undefined if missing/deleted. */
export async function queryPlace(id: string): Promise<Place | undefined> {
  const place = await db.places.get(id);
  return place && place.deletedAt === null ? place : undefined;
}

/** All non-tombstoned categories, sortOrder ascending. */
export async function queryCategories(): Promise<Category[]> {
  const categories = await db.categories.filter((c) => c.deletedAt === null).toArray();
  categories.sort((a, b) => a.sortOrder - b.sortOrder);
  return categories;
}

/** A single non-tombstoned category, or undefined if missing/deleted. */
export async function queryCategory(id: string): Promise<Category | undefined> {
  const category = await db.categories.get(id);
  return category && category.deletedAt === null ? category : undefined;
}

/** All non-tombstoned criteria, sortOrder ascending. */
export async function queryCriteria(): Promise<Criterion[]> {
  const criteria = await db.criteria.filter((c) => c.deletedAt === null).toArray();
  criteria.sort((a, b) => a.sortOrder - b.sortOrder);
  return criteria;
}

/** Non-tombstoned visits, optionally narrowed to one place, date desc then createdAt desc. */
export async function queryVisits(placeId?: string): Promise<Visit[]> {
  let visits = await db.visits.filter((v) => v.deletedAt === null).toArray();
  if (placeId) {
    visits = visits.filter((v) => v.placeId === placeId);
  }

  visits.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
    return 0;
  });
  return visits;
}

/**
 * Ranks the non-tombstoned "been" places in this category (via lib/ranking's rankCategory) and
 * separately lists its "want_to_try" places, newest-created first. Returns `{ ranked: [],
 * wantToTry: [] }` — never undefined — when the category is missing or tombstoned.
 */
export async function queryRankedCategory(
  id: string
): Promise<{ ranked: RankedEntry[]; wantToTry: Place[] }> {
  const category = await queryCategory(id);
  if (!category) return { ranked: [], wantToTry: [] };

  const [allPlaces, criteria, allVisits] = await Promise.all([
    queryPlaces(),
    queryCriteria(),
    queryVisits(),
  ]);

  const scoped = allPlaces.filter((p) => p.categoryIds.includes(id));
  const scopedIds = new Set(scoped.map((p) => p.id));

  const lastVisitByPlace = new Map<string, string>();
  for (const visit of allVisits) {
    if (!scopedIds.has(visit.placeId)) continue;
    const current = lastVisitByPlace.get(visit.placeId);
    if (current === undefined || visit.date > current) {
      lastVisitByPlace.set(visit.placeId, visit.date);
    }
  }

  const ranked = rankCategory(scoped, category, criteria, lastVisitByPlace);
  const wantToTry = scoped
    .filter((p) => p.status === "want_to_try")
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
      return 0;
    });

  return { ranked, wantToTry };
}

// ---- hooks (thin useLiveQuery wrappers) ----

export function usePlaces(filter?: PlacesFilter): Place[] | undefined {
  return useLiveQuery(
    () => queryPlaces(filter),
    [filter?.status, filter?.categoryId, filter?.search]
  );
}

export function usePlace(id: string): Place | undefined {
  return useLiveQuery(() => queryPlace(id), [id]);
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => queryCategories(), []);
}

export function useCategory(id: string): Category | undefined {
  return useLiveQuery(() => queryCategory(id), [id]);
}

export function useCriteria(): Criterion[] | undefined {
  return useLiveQuery(() => queryCriteria(), []);
}

export function useVisits(placeId?: string): Visit[] | undefined {
  return useLiveQuery(() => queryVisits(placeId), [placeId]);
}

export function useRankedCategory(
  id: string
): { ranked: RankedEntry[]; wantToTry: Place[] } | undefined {
  return useLiveQuery(() => queryRankedCategory(id), [id]);
}

// ---- app init ----
// Module-level guard so ensureSeeded()/storage.persist() run at most once per app lifetime even
// if multiple components mount this hook (or React StrictMode double-invokes the effect in
// dev) — ensureSeeded is idempotent regardless, but this avoids redundant work. No DB access
// happens at module scope (SSR-safe): everything below runs inside a client-only effect.
let initStarted = false;

/**
 * Kicks off one-time app initialization (seed defaults, request persistent storage) and reports
 * readiness. Meant to be mounted once, high in the tree (T6's root layout).
 */
export function useDbInit(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (initStarted) return;
    initStarted = true;

    void (async () => {
      await ensureSeeded();
      try {
        await navigator.storage?.persist?.();
      } catch {
        // Best-effort: persistent storage isn't available/granted on every browser.
      }
      setReady(true);
    })();
  }, []);

  return ready;
}
