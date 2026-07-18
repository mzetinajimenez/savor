// THE write path for savor: components never write Dexie directly (see lib/hooks.ts for the
// read path). Every write here zod-validates input, stamps timestamps, and — for creates —
// mints id/createdAt/deletedAt. Deletes only ever set deletedAt (tombstone); rows are never
// physically removed. This module is also the future cloud-sync seam: sync can hook in here
// without touching call sites.

import type { EntityTable } from "dexie";
import { z } from "zod";
import { db } from "./db";
import type {
  Category,
  CategoryInput,
  Criterion,
  CriterionInput,
  Place,
  PlaceInput,
  SyncFields,
  Visit,
  VisitInput,
} from "./types";

// ---- validation schemas ----
// Field schemas are shared between create/update so the two variants can't drift, but create
// and update schemas are built separately: create applies defaults (ratings: {}, weights: {})
// for omitted fields, while update must NOT inject those defaults — an update patch that omits
// a field should leave the existing value untouched, not reset it.
//
// The four *Fields objects are also exported for lib/backup.ts, which composes its full-row
// (sync trio + fields) schemas from these instead of restating each field's zod type by hand —
// a single source of truth for what shape each entity's non-sync-trio fields take.

export const placeFields = {
  name: z.string().min(1),
  status: z.enum(["want_to_try", "been"]),
  cuisine: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().optional(),
  categoryIds: z.array(z.string()),
  ratings: z.record(z.string(), z.number()),
};
const placeCreateSchema = z.object(placeFields).extend({
  categoryIds: z.array(z.string()).default([]),
  ratings: z.record(z.string(), z.number()).default({}),
});
const placeUpdateSchema = z.object(placeFields).partial();

export const categoryFields = {
  name: z.string().min(1),
  emoji: z.string().optional(),
  weights: z.record(z.string(), z.number()),
  sortOrder: z.number(),
};
const categoryCreateSchema = z.object(categoryFields).extend({
  weights: z.record(z.string(), z.number()).default({}),
});
const categoryUpdateSchema = z.object(categoryFields).partial();

export const criterionFields = {
  name: z.string().min(1),
  sortOrder: z.number(),
};
const criterionCreateSchema = z.object(criterionFields);
const criterionUpdateSchema = z.object(criterionFields).partial();

export const visitFields = {
  placeId: z.string().min(1),
  date: z.string().min(1),
  dishes: z.string(),
  notes: z.string(),
};
const visitCreateSchema = z.object(visitFields);
const visitUpdateSchema = z.object(visitFields).partial();

// z.number() in zod v4 already rejects NaN/Infinity, so no separate .finite() is needed.
const ratingValueSchema = z.number().nullable();
const weightsSchema = z.record(z.string(), z.number().min(0));

// ---- generic CRUD helpers ----
// Every entity shares the same create/update/delete shape (stamp trio, tombstone-only delete,
// throw on writes to missing/deleted rows), so the exported per-entity functions below are thin
// wrappers around these.

function nowIso(): string {
  return new Date().toISOString();
}

async function createEntity<TEntity extends SyncFields>(
  table: EntityTable<TEntity, "id">,
  schema: z.ZodTypeAny,
  input: unknown
): Promise<TEntity> {
  const parsed = schema.parse(input) as Record<string, unknown>;
  const timestamp = nowIso();
  const entity = {
    ...parsed,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  } as TEntity;
  await table.add(entity);
  return entity;
}

// Dexie's Table.get()/update() key overloads resolve the key type from TEntity via a
// conditional type (IDType), which TypeScript can't fully reduce for a still-generic TEntity.
// All our entity ids are plain strings (the sync trio), so the `as never` casts below are a
// narrow, deliberate escape hatch for that generic-wrapper limitation — the exported
// per-entity functions above stay fully and concretely typed.

async function getLiveOrThrow<TEntity extends SyncFields>(
  table: EntityTable<TEntity, "id">,
  id: string,
  entityName: string
): Promise<TEntity> {
  const existing = await table.get(id as never);
  if (!existing || existing.deletedAt !== null) {
    throw new Error(`Cannot write to ${entityName} "${id}": not found or already deleted`);
  }
  return existing;
}

async function updateEntity<TEntity extends SyncFields>(
  table: EntityTable<TEntity, "id">,
  schema: z.ZodTypeAny,
  id: string,
  patch: unknown,
  entityName: string
): Promise<void> {
  await getLiveOrThrow(table, id, entityName);
  const parsed = schema.parse(patch) as Record<string, unknown>;
  await table.update(id as never, { ...parsed, updatedAt: nowIso() } as never);
}

async function deleteEntity<TEntity extends SyncFields>(
  table: EntityTable<TEntity, "id">,
  id: string,
  entityName: string
): Promise<void> {
  await getLiveOrThrow(table, id, entityName);
  const timestamp = nowIso();
  await table.update(id as never, { deletedAt: timestamp, updatedAt: timestamp } as never);
}

// ---- places ----

export async function createPlace(input: PlaceInput): Promise<Place> {
  return createEntity(db.places, placeCreateSchema, input);
}

export async function updatePlace(id: string, patch: Partial<PlaceInput>): Promise<void> {
  return updateEntity(db.places, placeUpdateSchema, id, patch, "place");
}

export async function deletePlace(id: string): Promise<void> {
  return deleteEntity(db.places, id, "place");
}

// ---- categories ----

export async function createCategory(input: CategoryInput): Promise<Category> {
  return createEntity(db.categories, categoryCreateSchema, input);
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<void> {
  return updateEntity(db.categories, categoryUpdateSchema, id, patch, "category");
}

export async function deleteCategory(id: string): Promise<void> {
  return deleteEntity(db.categories, id, "category");
}

// ---- criteria ----

export async function createCriterion(input: CriterionInput): Promise<Criterion> {
  return createEntity(db.criteria, criterionCreateSchema, input);
}

export async function updateCriterion(id: string, patch: Partial<CriterionInput>): Promise<void> {
  return updateEntity(db.criteria, criterionUpdateSchema, id, patch, "criterion");
}

export async function deleteCriterion(id: string): Promise<void> {
  return deleteEntity(db.criteria, id, "criterion");
}

// ---- visits ----

export async function createVisit(input: VisitInput): Promise<Visit> {
  return createEntity(db.visits, visitCreateSchema, input);
}

export async function updateVisit(id: string, patch: Partial<VisitInput>): Promise<void> {
  return updateEntity(db.visits, visitUpdateSchema, id, patch, "visit");
}

export async function deleteVisit(id: string): Promise<void> {
  return deleteEntity(db.visits, id, "visit");
}

// ---- ratings & weights ----
// Fine-grained setters so callers don't need to read-modify-write the whole ratings/weights map
// themselves (and can't accidentally clobber sibling keys via a partial update()).

// setRating and setWeights each do a read-modify-write on a whole nested map (ratings /
// weights). Left as separate awaited get() then update() calls, two concurrent calls targeting
// the same row (e.g. two different criteria's ratings) could both read the pre-mutation map and
// the second write would silently clobber the first's key — a lost update. Wrapping the
// get+validate+write in a single Dexie `rw` transaction makes it atomic: IndexedDB serializes
// readwrite transactions with overlapping scope, so a second call's read can't start until the
// first call's transaction (read AND write) has committed.

export async function setRating(
  placeId: string,
  criterionId: string,
  value: number | null
): Promise<void> {
  const validated = ratingValueSchema.parse(value);

  await db.transaction("rw", db.places, async () => {
    const place = await getLiveOrThrow(db.places, placeId, "place");

    const ratings = { ...place.ratings };
    if (validated === null) {
      delete ratings[criterionId];
    } else {
      ratings[criterionId] = Math.min(5, Math.max(1, Math.round(validated)));
    }
    await db.places.update(placeId, { ratings, updatedAt: nowIso() });
  });
}

export async function setWeights(
  categoryId: string,
  weights: Record<string, number>
): Promise<void> {
  const validated = weightsSchema.parse(weights);

  await db.transaction("rw", db.categories, async () => {
    await getLiveOrThrow(db.categories, categoryId, "category");
    await db.categories.update(categoryId, { weights: validated, updatedAt: nowIso() });
  });
}
