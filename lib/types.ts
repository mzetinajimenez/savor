// Core data model for savor. Every entity carries the sync trio (id/createdAt/updatedAt/deletedAt)
// so deletes are tombstones and every read can filter deletedAt === null.

export type SyncFields = {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type PlaceStatus = "want_to_try" | "been";

export interface Place extends SyncFields {
  name: string;
  status: PlaceStatus;
  cuisine?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  categoryIds: string[];
  ratings: Record<string, number>;
}

export interface Criterion extends SyncFields {
  name: string;
  sortOrder: number;
}

export interface Category extends SyncFields {
  name: string;
  emoji?: string;
  weights: Record<string, number>;
  sortOrder: number;
}

export interface Visit extends SyncFields {
  placeId: string;
  date: string;
  dishes: string;
  notes: string;
}

// Singleton row holding install-level metadata. Not part of the sync trio since it has no
// deletedAt / tombstone semantics — there is exactly one row, keyed by the literal "meta".
export interface Meta {
  id: "meta";
  schemaVersion: number;
  installId: string;
  createdAt: string;
  updatedAt: string;
}

// Create/update payload shapes for lib/repo.ts: entity minus the sync trio. Place additionally
// makes ratings/categoryIds optional (defaulting to {} / [] on create) since those are usually
// populated after the place exists (via setRating) rather than at creation time.
export type PlaceInput = Omit<Place, keyof SyncFields | "ratings" | "categoryIds"> & {
  ratings?: Record<string, number>;
  categoryIds?: string[];
};

// weights is optional (defaults to {}) — categories are typically created first, then weights
// are populated via setWeights.
export type CategoryInput = Omit<Category, keyof SyncFields | "weights"> & {
  weights?: Record<string, number>;
};

export type CriterionInput = Omit<Criterion, keyof SyncFields>;

export type VisitInput = Omit<Visit, keyof SyncFields>;
