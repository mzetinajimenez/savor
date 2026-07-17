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
