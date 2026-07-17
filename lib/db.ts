import Dexie, { type EntityTable } from "dexie";
import type { Category, Criterion, Meta, Place, Visit } from "./types";

// Dexie v1 schema. Migrations must stay additive-only (never destructive) — future
// schema changes add a new db.version(N) block rather than editing this one.
class SavorDB extends Dexie {
  places!: EntityTable<Place, "id">;
  criteria!: EntityTable<Criterion, "id">;
  categories!: EntityTable<Category, "id">;
  visits!: EntityTable<Visit, "id">;
  meta!: EntityTable<Meta, "id">;

  constructor() {
    super("savor");
    this.version(1).stores({
      places: "id, status, *categoryIds, deletedAt",
      visits: "id, placeId, date, deletedAt",
      criteria: "id, sortOrder, deletedAt",
      categories: "id, sortOrder, deletedAt",
      meta: "id",
    });
  }
}

export const db = new SavorDB();

const DEFAULT_CRITERIA_NAMES = ["Cost", "Food quality", "Service", "Ambiance"] as const;
const SCHEMA_VERSION = 1;

/**
 * Seeds the 4 default criteria and the singleton meta row on first run only.
 * Idempotent: safe to call on every app boot — subsequent calls are no-ops
 * once the meta row exists.
 */
export async function ensureSeeded(): Promise<void> {
  await db.transaction("rw", db.criteria, db.meta, async () => {
    const existingMeta = await db.meta.get("meta");
    if (existingMeta) return;

    const now = new Date().toISOString();

    const criteria: Criterion[] = DEFAULT_CRITERIA_NAMES.map((name, index) => ({
      id: crypto.randomUUID(),
      name,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    await db.criteria.bulkAdd(criteria);

    const meta: Meta = {
      id: "meta",
      schemaVersion: SCHEMA_VERSION,
      installId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await db.meta.add(meta);
  });
}
