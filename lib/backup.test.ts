import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, ensureSeeded } from "./db";
import {
  BackupValidationError,
  exportBackup,
  importBackup,
  parseBackup,
  summarizeBackup,
  type Backup,
} from "./backup";
import { createCategory, createCriterion, createPlace, createVisit, deletePlace } from "./repo";

// Fresh database per test so export/import assertions don't leak across tests.
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// Seeds a small, varied dataset (including a tombstoned row in each entity table) and returns
// the live rows for convenient assertions.
async function seedSampleData() {
  const place1 = await createPlace({ name: "Taco Spot", status: "been" });
  const place2 = await createPlace({ name: "Ramen House", status: "want_to_try" });
  const deletedPlace = await createPlace({ name: "Closed Diner", status: "been" });
  await deletePlace(deletedPlace.id);

  const category = await createCategory({ name: "Mexican", sortOrder: 0 });
  const deletedCategory = await createCategory({ name: "Defunct Cuisine", sortOrder: 1 });
  await db.categories.update(deletedCategory.id, { deletedAt: new Date().toISOString() });

  const criterion = await createCriterion({ name: "Value", sortOrder: 4 });

  const visit = await createVisit({
    placeId: place1.id,
    date: "2026-01-01",
    dishes: "Tacos",
    notes: "Great",
  });
  const deletedVisit = await createVisit({
    placeId: place1.id,
    date: "2026-01-02",
    dishes: "Burrito",
    notes: "",
  });
  await db.visits.update(deletedVisit.id, { deletedAt: new Date().toISOString() });

  return { place1, place2, deletedPlace, category, deletedCategory, criterion, visit, deletedVisit };
}

describe("exportBackup", () => {
  it("produces a pretty-printed application/json Blob with the envelope shape", async () => {
    await ensureSeeded();
    await seedSampleData();

    const blob = await exportBackup();
    expect(blob.type).toBe("application/json");

    const text = await blob.text();
    expect(text).toBe(JSON.stringify(JSON.parse(text), null, 2)); // pretty-printed (2-space)

    const parsed = JSON.parse(text);
    expect(parsed.app).toBe("savor");
    expect(typeof parsed.schemaVersion).toBe("number");
    expect(typeof parsed.exportedAt).toBe("string");
    expect(Array.isArray(parsed.places)).toBe(true);
    expect(Array.isArray(parsed.criteria)).toBe(true);
    expect(Array.isArray(parsed.categories)).toBe(true);
    expect(Array.isArray(parsed.visits)).toBe(true);
  });

  it("includes tombstoned rows", async () => {
    const { deletedPlace, deletedCategory, deletedVisit } = await seedSampleData();

    const blob = await exportBackup();
    const parsed: Backup = JSON.parse(await blob.text());

    expect(parsed.places.some((p) => p.id === deletedPlace.id && p.deletedAt !== null)).toBe(
      true
    );
    expect(
      parsed.categories.some((c) => c.id === deletedCategory.id && c.deletedAt !== null)
    ).toBe(true);
    expect(parsed.visits.some((v) => v.id === deletedVisit.id && v.deletedAt !== null)).toBe(
      true
    );
  });

  it("does not include the meta row anywhere in the payload", async () => {
    await ensureSeeded();
    const blob = await exportBackup();
    const text = await blob.text();
    expect(text).not.toContain("installId");
    const parsed = JSON.parse(text);
    expect(parsed.meta).toBeUndefined();
  });

  it("reflects the current schemaVersion from the meta row when present", async () => {
    await ensureSeeded();
    const blob = await exportBackup();
    const parsed = JSON.parse(await blob.text());
    const meta = await db.meta.get("meta");
    expect(parsed.schemaVersion).toBe(meta?.schemaVersion);
  });
});

describe("export -> wipe -> import round-trip", () => {
  it("deep-equals all 4 tables after a full wipe and re-import, tombstones included", async () => {
    await ensureSeeded();
    await seedSampleData();

    const before = {
      places: await db.places.toArray(),
      criteria: await db.criteria.toArray(),
      categories: await db.categories.toArray(),
      visits: await db.visits.toArray(),
    };

    const blob = await exportBackup();
    const backup = parseBackup(JSON.parse(await blob.text()));

    // Wipe: clear all 4 entity tables (simulating data loss) but leave meta alone.
    await db.places.clear();
    await db.criteria.clear();
    await db.categories.clear();
    await db.visits.clear();

    await importBackup(backup);

    const after = {
      places: await db.places.toArray(),
      criteria: await db.criteria.toArray(),
      categories: await db.categories.toArray(),
      visits: await db.visits.toArray(),
    };

    // Order isn't guaranteed to be preserved by clear+bulkAdd, so compare sorted by id.
    const byId = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));

    expect(byId(after.places)).toEqual(byId(before.places));
    expect(byId(after.criteria)).toEqual(byId(before.criteria));
    expect(byId(after.categories)).toEqual(byId(before.categories));
    expect(byId(after.visits)).toEqual(byId(before.visits));
  });

  it("leaves the meta row untouched by import", async () => {
    await ensureSeeded();
    await seedSampleData();
    const metaBefore = await db.meta.get("meta");

    const blob = await exportBackup();
    const backup = parseBackup(JSON.parse(await blob.text()));
    await importBackup(backup);

    const metaAfter = await db.meta.get("meta");
    expect(metaAfter).toEqual(metaBefore);
  });

  it("does not re-trigger ensureSeeded's default-criteria seeding after import", async () => {
    await ensureSeeded();
    // Replace the default criteria with a single custom one, then round-trip.
    await db.criteria.clear();
    await createCriterion({ name: "Only Criterion", sortOrder: 0 });

    const blob = await exportBackup();
    const backup = parseBackup(JSON.parse(await blob.text()));
    await importBackup(backup);

    // meta row still present (import didn't touch it) so ensureSeeded is a no-op.
    await ensureSeeded();
    const criteria = await db.criteria.toArray();
    expect(criteria.map((c) => c.name)).toEqual(["Only Criterion"]);
  });
});

describe("parseBackup", () => {
  const validEnvelope = (): Record<string, unknown> => ({
    app: "savor",
    schemaVersion: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    places: [],
    criteria: [],
    categories: [],
    visits: [],
  });

  it("accepts a well-formed v1 backup", () => {
    const backup = parseBackup(validEnvelope());
    expect(backup.app).toBe("savor");
    expect(backup.schemaVersion).toBe(1);
  });

  it("rejects a non-object (non-JSON-shape) input", () => {
    expect(() => parseBackup("not an object")).toThrow(BackupValidationError);
    expect(() => parseBackup(null)).toThrow(BackupValidationError);
    expect(() => parseBackup(42)).toThrow(BackupValidationError);
    expect(() => parseBackup([])).toThrow(BackupValidationError);
  });

  it("rejects the wrong app name", () => {
    const bad = { ...validEnvelope(), app: "other-app" };
    expect(() => parseBackup(bad)).toThrow(BackupValidationError);
    expect(() => parseBackup(bad)).toThrow(/app/i);
  });

  it("rejects a newer/unsupported schemaVersion", () => {
    const bad = { ...validEnvelope(), schemaVersion: 2 };
    expect(() => parseBackup(bad)).toThrow(BackupValidationError);
    expect(() => parseBackup(bad)).toThrow(/schema version/i);
  });

  it("rejects a missing table array", () => {
    const bad = validEnvelope();
    delete bad.places;
    expect(() => parseBackup(bad)).toThrow(BackupValidationError);
  });

  it("rejects an entity missing a sync-trio field", () => {
    const bad = {
      ...validEnvelope(),
      places: [
        {
          // deletedAt omitted
          id: "p1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          name: "Taco Spot",
          status: "been",
          categoryIds: [],
          ratings: {},
        },
      ],
    };
    expect(() => parseBackup(bad)).toThrow(BackupValidationError);
  });

  it("rejects an entity with a malformed field (wrong type)", () => {
    const bad = {
      ...validEnvelope(),
      categories: [
        {
          id: "c1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          deletedAt: null,
          name: "Mexican",
          weights: {},
          sortOrder: "not-a-number", // wrong type
        },
      ],
    };
    expect(() => parseBackup(bad)).toThrow(BackupValidationError);
  });
});

describe("summarizeBackup", () => {
  it("counts non-tombstoned rows and omits criteria from the summary", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const syncTrio = { createdAt: now, updatedAt: now };
    const livePlace = () => ({
      ...syncTrio,
      id: crypto.randomUUID(),
      deletedAt: null,
      name: "P",
      status: "been" as const,
      categoryIds: [],
      ratings: {},
    });
    const deadPlace = () => ({ ...livePlace(), id: crypto.randomUUID(), deletedAt: now });
    const liveCategory = () => ({
      ...syncTrio,
      id: crypto.randomUUID(),
      deletedAt: null,
      name: "C",
      weights: {},
      sortOrder: 0,
    });
    const liveVisit = () => ({
      ...syncTrio,
      id: crypto.randomUUID(),
      deletedAt: null,
      placeId: "p",
      date: "2026-01-01",
      dishes: "",
      notes: "",
    });
    const deadVisit = () => ({ ...liveVisit(), id: crypto.randomUUID(), deletedAt: now });

    const backup: Backup = {
      app: "savor",
      schemaVersion: 1,
      exportedAt: now,
      places: [livePlace(), livePlace(), deadPlace()],
      criteria: [],
      categories: [liveCategory()],
      visits: [liveVisit(), deadVisit()],
    };

    expect(summarizeBackup(backup)).toBe("2 places, 1 categories, 1 visits");
  });

  it("returns zero counts for an empty backup", () => {
    const backup: Backup = {
      app: "savor",
      schemaVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      places: [],
      criteria: [],
      categories: [],
      visits: [],
    };
    expect(summarizeBackup(backup)).toBe("0 places, 0 categories, 0 visits");
  });
});

describe("importBackup atomicity", () => {
  it("leaves prior data intact when a bulkAdd fails partway through (duplicate id in payload)", async () => {
    await ensureSeeded();
    const { place1 } = await seedSampleData();

    const before = {
      places: await db.places.toArray(),
      criteria: await db.criteria.toArray(),
      categories: await db.categories.toArray(),
      visits: await db.visits.toArray(),
    };

    // Craft a payload whose places array has a duplicate primary key, which should make
    // bulkAdd throw (ConstraintError) and abort the whole transaction.
    const dupePlace = { ...place1 };
    const backup: Backup = {
      app: "savor",
      schemaVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      places: [dupePlace, { ...dupePlace }],
      criteria: before.criteria,
      categories: before.categories,
      visits: before.visits,
    };

    await expect(importBackup(backup)).rejects.toThrow();

    const after = {
      places: await db.places.toArray(),
      criteria: await db.criteria.toArray(),
      categories: await db.categories.toArray(),
      visits: await db.visits.toArray(),
    };

    const byId = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));

    expect(byId(after.places)).toEqual(byId(before.places));
    expect(byId(after.criteria)).toEqual(byId(before.criteria));
    expect(byId(after.categories)).toEqual(byId(before.categories));
    expect(byId(after.visits)).toEqual(byId(before.visits));
  });
});
