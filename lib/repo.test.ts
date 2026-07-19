import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { queryVisits } from "./hooks";
import {
  createCategory,
  createCriterion,
  createPlace,
  createVisit,
  deleteCategory,
  deleteCriterion,
  deletePlace,
  deleteVisit,
  setRating,
  setWeights,
  updateCategory,
  updateCriterion,
  updatePlace,
  updateVisit,
} from "./repo";

// Fresh database per test, and a frozen fake clock so createdAt/updatedAt assertions are
// deterministic (no reliance on real-time sleeps to observe timestamp changes).
beforeEach(async () => {
  await db.delete();
  await db.open();
  // Only fake Date: fake-indexeddb schedules its internal transaction/event callbacks via real
  // setTimeout, so faking all timers would hang every Dexie call awaiting a transaction.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createPlace", () => {
  it("stamps the sync trio and persists the row", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "want_to_try" });

    expect(typeof place.id).toBe("string");
    expect(place.id.length).toBeGreaterThan(0);
    expect(place.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(place.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(place.deletedAt).toBeNull();

    const stored = await db.places.get(place.id);
    expect(stored).toEqual(place);
  });

  it("defaults ratings to {} and categoryIds to [] when omitted", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "want_to_try" });
    expect(place.ratings).toEqual({});
    expect(place.categoryIds).toEqual([]);
  });

  it("accepts explicit ratings/categoryIds", async () => {
    const place = await createPlace({
      name: "Ramen House",
      status: "been",
      categoryIds: ["cat-1"],
      ratings: { "crit-1": 5 },
    });
    expect(place.categoryIds).toEqual(["cat-1"]);
    expect(place.ratings).toEqual({ "crit-1": 5 });
  });

  it("rejects invalid input", async () => {
    await expect(createPlace({ name: "", status: "want_to_try" })).rejects.toThrow();
    await expect(
      // @ts-expect-error - deliberately invalid status to exercise runtime validation
      createPlace({ name: "X", status: "nope" })
    ).rejects.toThrow();
  });

  // Defense-in-depth: setRating already clamps to 1-5, but createPlace/updatePlace take ratings
  // directly, so the schema itself must reject an out-of-range value passed straight through.
  it("rejects an out-of-range rating value", async () => {
    await expect(
      createPlace({ name: "X", status: "been", ratings: { crit1: 999 } })
    ).rejects.toThrow();
    await expect(
      createPlace({ name: "X", status: "been", ratings: { crit1: 0 } })
    ).rejects.toThrow();
    await expect(
      createPlace({ name: "X", status: "been", ratings: { crit1: 3.5 } })
    ).rejects.toThrow();
  });
});

describe("updatePlace", () => {
  it("stamps updatedAt, preserves id/createdAt, and merges the patch", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "want_to_try" });

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await updatePlace(place.id, { name: "Taco Spot Deluxe" });

    const updated = await db.places.get(place.id);
    expect(updated?.id).toBe(place.id);
    expect(updated?.createdAt).toBe(place.createdAt);
    expect(updated?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(updated?.name).toBe("Taco Spot Deluxe");
    expect(updated?.status).toBe("want_to_try");
  });

  it("does not reset omitted array/record fields to their create-time defaults", async () => {
    const place = await createPlace({
      name: "Ramen House",
      status: "been",
      categoryIds: ["cat-1"],
      ratings: { "crit-1": 5 },
    });

    await updatePlace(place.id, { name: "Ramen House 2" });

    const updated = await db.places.get(place.id);
    expect(updated?.categoryIds).toEqual(["cat-1"]);
    expect(updated?.ratings).toEqual({ "crit-1": 5 });
  });

  it("throws when updating a missing id", async () => {
    await expect(updatePlace("nope", { name: "X" })).rejects.toThrow();
  });

  it("throws when updating a tombstoned id", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "want_to_try" });
    await deletePlace(place.id);
    await expect(updatePlace(place.id, { name: "X" })).rejects.toThrow();
  });

  it("rejects an out-of-range rating value", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "been" });
    await expect(updatePlace(place.id, { ratings: { crit1: 999 } })).rejects.toThrow();
  });
});

describe("deletePlace", () => {
  it("tombstones the row instead of removing it", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "want_to_try" });

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await deletePlace(place.id);

    const stored = await db.places.get(place.id);
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(stored?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(stored?.name).toBe("Taco Spot");
  });

  it("throws when deleting a missing id", async () => {
    await expect(deletePlace("nope")).rejects.toThrow();
  });

  it("throws when deleting an already-tombstoned id", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "want_to_try" });
    await deletePlace(place.id);
    await expect(deletePlace(place.id)).rejects.toThrow();
  });

  // Regression test: there's no visit-delete UI, so a place delete that didn't cascade would
  // leave that place's visits permanently orphaned ("Unknown place" in the journal) and would
  // desync the tombstone data for the future cloud-sync path.
  it("cascades to the place's own non-tombstoned visits, leaving other places' visits untouched", async () => {
    const place = await createPlace({ name: "Taco Spot", status: "been" });
    const otherPlace = await createPlace({ name: "Ramen House", status: "been" });

    const visit1 = await createVisit({
      placeId: place.id,
      date: "2026-01-01",
      dishes: "Tacos",
      notes: "",
    });
    const visit2 = await createVisit({
      placeId: place.id,
      date: "2026-01-02",
      dishes: "Burrito",
      notes: "",
    });
    const otherVisit = await createVisit({
      placeId: otherPlace.id,
      date: "2026-01-01",
      dishes: "Ramen",
      notes: "",
    });

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await deletePlace(place.id);

    const storedPlace = await db.places.get(place.id);
    expect(storedPlace?.deletedAt).toBe("2026-01-01T00:05:00.000Z");

    // Rows are tombstoned (still present), not physically removed, and stamped with the same
    // deletedAt/updatedAt as the place itself.
    const storedVisit1 = await db.visits.get(visit1.id);
    const storedVisit2 = await db.visits.get(visit2.id);
    expect(storedVisit1).toBeDefined();
    expect(storedVisit1?.deletedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(storedVisit1?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(storedVisit2).toBeDefined();
    expect(storedVisit2?.deletedAt).toBe("2026-01-01T00:05:00.000Z");
    expect(storedVisit2?.updatedAt).toBe("2026-01-01T00:05:00.000Z");

    // A different place's visit is untouched.
    const storedOtherVisit = await db.visits.get(otherVisit.id);
    expect(storedOtherVisit?.deletedAt).toBeNull();

    // Journal-visible reads (queryVisits, the same query useVisits/the journal UI runs through)
    // exclude the now-tombstoned visits but still return the other place's live visit.
    const allVisible = await queryVisits();
    expect(allVisible.map((v) => v.id)).not.toContain(visit1.id);
    expect(allVisible.map((v) => v.id)).not.toContain(visit2.id);
    expect(allVisible.map((v) => v.id)).toContain(otherVisit.id);

    const placeScoped = await queryVisits(place.id);
    expect(placeScoped).toEqual([]);
  });
});

describe("category CRUD", () => {
  it("creates with the sync trio and defaults weights to {}", async () => {
    const category = await createCategory({ name: "Mexican", sortOrder: 0 });
    expect(typeof category.id).toBe("string");
    expect(category.createdAt).toBe(category.updatedAt);
    expect(category.deletedAt).toBeNull();
    expect(category.weights).toEqual({});

    const stored = await db.categories.get(category.id);
    expect(stored).toEqual(category);
  });

  it("updates stamp updatedAt and preserve createdAt", async () => {
    const category = await createCategory({ name: "Mexican", sortOrder: 0 });
    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await updateCategory(category.id, { name: "Mexican Food" });

    const updated = await db.categories.get(category.id);
    expect(updated?.name).toBe("Mexican Food");
    expect(updated?.createdAt).toBe(category.createdAt);
    expect(updated?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("delete tombstones instead of removing the row", async () => {
    const category = await createCategory({ name: "Mexican", sortOrder: 0 });
    await deleteCategory(category.id);

    const stored = await db.categories.get(category.id);
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("throws updating a tombstoned or missing category", async () => {
    const category = await createCategory({ name: "Mexican", sortOrder: 0 });
    await deleteCategory(category.id);
    await expect(updateCategory(category.id, { name: "X" })).rejects.toThrow();
    await expect(updateCategory("nope", { name: "X" })).rejects.toThrow();
  });
});

describe("criterion CRUD", () => {
  it("creates with the sync trio", async () => {
    const criterion = await createCriterion({ name: "Value", sortOrder: 4 });
    expect(typeof criterion.id).toBe("string");
    expect(criterion.createdAt).toBe(criterion.updatedAt);
    expect(criterion.deletedAt).toBeNull();

    const stored = await db.criteria.get(criterion.id);
    expect(stored).toEqual(criterion);
  });

  it("update stamps updatedAt and preserves createdAt", async () => {
    const criterion = await createCriterion({ name: "Value", sortOrder: 4 });
    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await updateCriterion(criterion.id, { sortOrder: 5 });

    const updated = await db.criteria.get(criterion.id);
    expect(updated?.sortOrder).toBe(5);
    expect(updated?.createdAt).toBe(criterion.createdAt);
    expect(updated?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("delete tombstones instead of removing the row", async () => {
    const criterion = await createCriterion({ name: "Value", sortOrder: 4 });
    await deleteCriterion(criterion.id);

    const stored = await db.criteria.get(criterion.id);
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("throws updating a tombstoned or missing criterion", async () => {
    const criterion = await createCriterion({ name: "Value", sortOrder: 4 });
    await deleteCriterion(criterion.id);
    await expect(updateCriterion(criterion.id, { name: "X" })).rejects.toThrow();
    await expect(updateCriterion("nope", { name: "X" })).rejects.toThrow();
  });
});

describe("visit CRUD", () => {
  const baseVisit = { placeId: "place-1", date: "2026-01-01", dishes: "Tacos", notes: "Great" };

  it("creates with the sync trio", async () => {
    const visit = await createVisit(baseVisit);
    expect(typeof visit.id).toBe("string");
    expect(visit.createdAt).toBe(visit.updatedAt);
    expect(visit.deletedAt).toBeNull();

    const stored = await db.visits.get(visit.id);
    expect(stored).toEqual(visit);
  });

  it("update stamps updatedAt and preserves createdAt", async () => {
    const visit = await createVisit(baseVisit);
    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await updateVisit(visit.id, { notes: "Even better" });

    const updated = await db.visits.get(visit.id);
    expect(updated?.notes).toBe("Even better");
    expect(updated?.createdAt).toBe(visit.createdAt);
    expect(updated?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("delete tombstones instead of removing the row", async () => {
    const visit = await createVisit(baseVisit);
    await deleteVisit(visit.id);

    const stored = await db.visits.get(visit.id);
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("throws updating a tombstoned or missing visit", async () => {
    const visit = await createVisit(baseVisit);
    await deleteVisit(visit.id);
    await expect(updateVisit(visit.id, { notes: "X" })).rejects.toThrow();
    await expect(updateVisit("nope", { notes: "X" })).rejects.toThrow();
  });
});

describe("setRating", () => {
  it("clamps above-range values down to 5", async () => {
    const place = await createPlace({ name: "P", status: "been" });
    await setRating(place.id, "crit-1", 7);
    const stored = await db.places.get(place.id);
    expect(stored?.ratings["crit-1"]).toBe(5);
  });

  it("clamps below-range values up to 1", async () => {
    const place = await createPlace({ name: "P", status: "been" });
    await setRating(place.id, "crit-1", 0.4);
    const stored = await db.places.get(place.id);
    expect(stored?.ratings["crit-1"]).toBe(1);
  });

  it("rounds non-integer in-range values", async () => {
    const place = await createPlace({ name: "P", status: "been" });
    await setRating(place.id, "crit-1", 3.6);
    const stored = await db.places.get(place.id);
    expect(stored?.ratings["crit-1"]).toBe(4);
  });

  it("clears the rating key when value is null", async () => {
    const place = await createPlace({
      name: "P",
      status: "been",
      ratings: { "crit-1": 4, "crit-2": 2 },
    });
    await setRating(place.id, "crit-1", null);
    const stored = await db.places.get(place.id);
    expect(stored?.ratings).toEqual({ "crit-2": 2 });
  });

  it("stamps updatedAt on the place", async () => {
    const place = await createPlace({ name: "P", status: "been" });
    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await setRating(place.id, "crit-1", 3);
    const stored = await db.places.get(place.id);
    expect(stored?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("throws when the place is missing or tombstoned", async () => {
    await expect(setRating("nope", "crit-1", 5)).rejects.toThrow();

    const place = await createPlace({ name: "P", status: "been" });
    await deletePlace(place.id);
    await expect(setRating(place.id, "crit-1", 5)).rejects.toThrow();
  });

  // Regression test: setRating does a read-modify-write on the whole `ratings` map. Two calls
  // for DIFFERENT criteria on the same place, fired without awaiting between them, must not
  // let the second write clobber the first's key (lost update) — each must read the other's
  // write, not a stale pre-mutation snapshot. This requires the get+merge+write to be atomic
  // (e.g. a single Dexie readwrite transaction), not just three independently-awaited steps.
  it("does not lose a concurrent setRating on a different criterion", async () => {
    const place = await createPlace({ name: "P", status: "been" });

    await Promise.all([setRating(place.id, "crit-1", 3), setRating(place.id, "crit-2", 5)]);

    const stored = await db.places.get(place.id);
    expect(stored?.ratings).toEqual({ "crit-1": 3, "crit-2": 5 });
  });
});

describe("setWeights", () => {
  it("replaces the weights record wholesale", async () => {
    const category = await createCategory({ name: "Cat", sortOrder: 0, weights: { a: 1 } });
    await setWeights(category.id, { b: 2, c: 3 });

    const stored = await db.categories.get(category.id);
    expect(stored?.weights).toEqual({ b: 2, c: 3 });
  });

  it("rejects negative weight values", async () => {
    const category = await createCategory({ name: "Cat", sortOrder: 0 });
    await expect(setWeights(category.id, { a: -1 })).rejects.toThrow();
  });

  it("rejects non-finite weight values", async () => {
    const category = await createCategory({ name: "Cat", sortOrder: 0 });
    await expect(setWeights(category.id, { a: Infinity })).rejects.toThrow();
    await expect(setWeights(category.id, { a: Number.NaN })).rejects.toThrow();
  });

  it("throws when the category is missing or tombstoned", async () => {
    await expect(setWeights("nope", { a: 1 })).rejects.toThrow();

    const category = await createCategory({ name: "Cat", sortOrder: 0 });
    await deleteCategory(category.id);
    await expect(setWeights(category.id, { a: 1 })).rejects.toThrow();
  });
});
