// Backup export/import for savor. The full local dataset (places, criteria, categories,
// visits — tombstones included) round-trips through a single JSON envelope so a user can move
// their data between devices/browsers or recover from a wipe. The singleton `meta` row is
// deliberately excluded: it holds install-level identity (installId) that must survive a
// restore, and its presence is also what stops ensureSeeded() from re-seeding on next boot —
// importing a backup must not resurrect the "first run" seeding path.

import { z } from "zod";
import { db, SCHEMA_VERSION } from "./db";
import { categoryFields, criterionFields, placeFields, visitFields } from "./repo";
import type { Category, Criterion, Place, Visit } from "./types";

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

// ---- validation schemas (internal) ----
// Unlike repo.ts's create/update schemas (which validate user input and let createEntity mint
// the sync trio), backup entities ARE the full stored rows, so every schema here validates the
// complete shape — sync trio included. Field-level shapes (name/status/weights/etc.) are reused
// from repo.ts's exported *Fields objects rather than restated here, so the two can't drift.

const syncFieldsShape = {
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: z.string().nullable(),
};

const placeSchema = z.object({ ...syncFieldsShape, ...placeFields });

const criterionSchema = z.object({ ...syncFieldsShape, ...criterionFields });

const categorySchema = z.object({ ...syncFieldsShape, ...categoryFields });

const visitSchema = z.object({ ...syncFieldsShape, ...visitFields });

const backupSchema = z.object({
  app: z.literal("savor"),
  schemaVersion: z.number(),
  exportedAt: z.string().min(1),
  places: z.array(placeSchema),
  criteria: z.array(criterionSchema),
  categories: z.array(categorySchema),
  visits: z.array(visitSchema),
});

export type Backup = {
  app: "savor";
  schemaVersion: number;
  exportedAt: string;
  places: Place[];
  criteria: Criterion[];
  categories: Category[];
  visits: Visit[];
};

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

// ---- parse ----

/**
 * Validates an arbitrary JSON value as a savor Backup. Checks `app` and `schemaVersion` first
 * (with a specific, human-readable message for each) before falling back to full-shape zod
 * validation for the entity arrays, so the most common rejection reasons — wrong app, wrong/
 * newer schema version — read clearly instead of surfacing a generic zod dump.
 */
export function parseBackup(json: unknown): Backup {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new BackupValidationError("Backup file is not a valid JSON object");
  }

  const record = json as Record<string, unknown>;

  if (record.app !== "savor") {
    throw new BackupValidationError(
      `Not a savor backup file (expected app "savor", got ${JSON.stringify(record.app)})`
    );
  }

  if (record.schemaVersion !== SCHEMA_VERSION) {
    throw new BackupValidationError(
      `Unsupported backup schema version ${JSON.stringify(record.schemaVersion)} ` +
        `(expected ${SCHEMA_VERSION})`
    );
  }

  const result = backupSchema.safeParse(json);
  if (!result.success) {
    throw new BackupValidationError(`Malformed backup data: ${formatZodError(result.error)}`);
  }
  return result.data;
}

// ---- export ----

/**
 * Exports every row (including tombstones) from the 4 entity tables as a pretty-printed JSON
 * Blob. `meta` is intentionally excluded — see the file header comment.
 */
export async function exportBackup(): Promise<Blob> {
  const meta = await db.meta.get("meta");
  const schemaVersion = meta?.schemaVersion ?? SCHEMA_VERSION;

  const [places, criteria, categories, visits] = await Promise.all([
    db.places.toArray(),
    db.criteria.toArray(),
    db.categories.toArray(),
    db.visits.toArray(),
  ]);

  const backup: Backup = {
    app: "savor",
    schemaVersion,
    exportedAt: new Date().toISOString(),
    places,
    criteria,
    categories,
    visits,
  };

  return new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
}

// ---- import ----

/**
 * Destructively replaces the 4 entity tables with the contents of `b`. Runs as a single Dexie
 * `rw` transaction (clear + bulkAdd per table) so a failure partway through (e.g. a duplicate
 * id within the payload) rolls back every write, leaving prior data intact. Callers must
 * validate with parseBackup first — this function assumes `b` is already a well-formed Backup
 * and does not re-check `app`/`schemaVersion`. `meta` is never touched.
 */
export async function importBackup(b: Backup): Promise<void> {
  await db.transaction("rw", db.places, db.criteria, db.categories, db.visits, async () => {
    await db.places.clear();
    await db.places.bulkAdd(b.places);

    await db.criteria.clear();
    await db.criteria.bulkAdd(b.criteria);

    await db.categories.clear();
    await db.categories.bulkAdd(b.categories);

    await db.visits.clear();
    await db.visits.bulkAdd(b.visits);
  });
}

// ---- summarize ----

/**
 * Human-readable one-liner for a confirm-before-import prompt: counts only live (non-
 * tombstoned) rows, since tombstones aren't user-visible data. Criteria are intentionally
 * omitted from the summary.
 */
export function summarizeBackup(b: Backup): string {
  const liveCount = (rows: { deletedAt: string | null }[]) =>
    rows.filter((row) => row.deletedAt === null).length;

  return (
    `${liveCount(b.places)} places, ` +
    `${liveCount(b.categories)} categories, ` +
    `${liveCount(b.visits)} visits`
  );
}
