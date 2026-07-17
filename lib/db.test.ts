import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, ensureSeeded } from "./db";

// Fresh database per test so seeding/idempotency assertions don't leak across tests.
beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("schema", () => {
  it("creates the expected tables", () => {
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(["categories", "criteria", "meta", "places", "visits"].sort());
  });

  it("indexes places on id, status, categoryIds (multiEntry), deletedAt", () => {
    const schema = db.table("places").schema;
    expect(schema.primKey.name).toBe("id");
    const indexNames = schema.indexes.map((i) => i.name);
    expect(indexNames).toEqual(expect.arrayContaining(["status", "categoryIds", "deletedAt"]));
    const categoryIdsIndex = schema.indexes.find((i) => i.name === "categoryIds");
    expect(categoryIdsIndex?.multi).toBe(true);
  });

  it("indexes visits on id, placeId, date, deletedAt", () => {
    const schema = db.table("visits").schema;
    expect(schema.primKey.name).toBe("id");
    const indexNames = schema.indexes.map((i) => i.name);
    expect(indexNames).toEqual(expect.arrayContaining(["placeId", "date", "deletedAt"]));
  });

  it("indexes criteria on id, sortOrder, deletedAt", () => {
    const schema = db.table("criteria").schema;
    expect(schema.primKey.name).toBe("id");
    const indexNames = schema.indexes.map((i) => i.name);
    expect(indexNames).toEqual(expect.arrayContaining(["sortOrder", "deletedAt"]));
  });

  it("indexes categories on id, sortOrder, deletedAt", () => {
    const schema = db.table("categories").schema;
    expect(schema.primKey.name).toBe("id");
    const indexNames = schema.indexes.map((i) => i.name);
    expect(indexNames).toEqual(expect.arrayContaining(["sortOrder", "deletedAt"]));
  });

  it("keys meta by id only", () => {
    const schema = db.table("meta").schema;
    expect(schema.primKey.name).toBe("id");
    expect(schema.indexes).toHaveLength(0);
  });

  it("allows a place to be found by categoryIds via the multiEntry index", async () => {
    const now = new Date().toISOString();
    await db.places.add({
      id: crypto.randomUUID(),
      name: "Test Place",
      status: "want_to_try",
      categoryIds: ["cat-a", "cat-b"],
      ratings: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const found = await db.places.where("categoryIds").equals("cat-b").toArray();
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("Test Place");
  });
});

describe("ensureSeeded", () => {
  it("seeds the 4 default criteria in order on first run", async () => {
    await ensureSeeded();

    const criteria = await db.criteria.orderBy("sortOrder").toArray();
    expect(criteria).toHaveLength(4);
    expect(criteria.map((c) => c.name)).toEqual(["Cost", "Food quality", "Service", "Ambiance"]);
    expect(criteria.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3]);
    for (const c of criteria) {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.deletedAt).toBeNull();
      expect(typeof c.createdAt).toBe("string");
      expect(typeof c.updatedAt).toBe("string");
    }
  });

  it("seeds exactly one meta row on first run", async () => {
    await ensureSeeded();

    const metaRows = await db.meta.toArray();
    expect(metaRows).toHaveLength(1);
    expect(metaRows[0].id).toBe("meta");
    expect(typeof metaRows[0].installId).toBe("string");
    expect(metaRows[0].installId.length).toBeGreaterThan(0);
    expect(typeof metaRows[0].schemaVersion).toBe("number");
  });

  it("is idempotent: calling twice still yields exactly 4 criteria and 1 meta row", async () => {
    await ensureSeeded();
    await ensureSeeded();

    const criteria = await db.criteria.toArray();
    const metaRows = await db.meta.toArray();
    expect(criteria).toHaveLength(4);
    expect(metaRows).toHaveLength(1);
    expect(criteria.map((c) => c.name).sort()).toEqual(
      ["Ambiance", "Cost", "Food quality", "Service"].sort()
    );
  });

  it("is idempotent: does not mint a new installId or duplicate criteria ids on re-seed", async () => {
    await ensureSeeded();
    const firstMeta = (await db.meta.toArray())[0];
    const firstCriteriaIds = (await db.criteria.toArray()).map((c) => c.id).sort();

    await ensureSeeded();
    const secondMeta = (await db.meta.toArray())[0];
    const secondCriteriaIds = (await db.criteria.toArray()).map((c) => c.id).sort();

    expect(secondMeta.installId).toBe(firstMeta.installId);
    expect(secondCriteriaIds).toEqual(firstCriteriaIds);
  });

  it("does not seed criteria/meta before ensureSeeded is called", async () => {
    expect(await db.criteria.count()).toBe(0);
    expect(await db.meta.count()).toBe(0);
  });
});
