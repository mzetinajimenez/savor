import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  queryCategories,
  queryCategory,
  queryCriteria,
  queryPlace,
  queryPlaces,
  queryRankedCategory,
  queryVisits,
} from "./hooks";
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
} from "./repo";

// Fresh database per test, same isolation pattern as repo.test.ts / db.test.ts.
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ---- queryPlaces ----

describe("queryPlaces", () => {
  it("excludes tombstoned places", async () => {
    const live = await createPlace({ name: "Live Spot", status: "been" });
    const gone = await createPlace({ name: "Gone Spot", status: "been" });
    await deletePlace(gone.id);

    const places = await queryPlaces();
    expect(places.map((p) => p.id)).toEqual([live.id]);
  });

  it("defaults to name ascending sort", async () => {
    await createPlace({ name: "Zebra Diner", status: "been" });
    await createPlace({ name: "Apple Cafe", status: "been" });
    await createPlace({ name: "mango grill", status: "been" }); // lowercase, still sorts alphabetically

    const places = await queryPlaces();
    expect(places.map((p) => p.name)).toEqual(["Apple Cafe", "mango grill", "Zebra Diner"]);
  });

  it("filters by status", async () => {
    const been = await createPlace({ name: "Been Spot", status: "been" });
    await createPlace({ name: "Want Spot", status: "want_to_try" });

    const places = await queryPlaces({ status: "been" });
    expect(places.map((p) => p.id)).toEqual([been.id]);
  });

  it("filters by categoryId", async () => {
    const category = await createCategory({ name: "Mexican", sortOrder: 0 });
    const inCategory = await createPlace({
      name: "In Category",
      status: "been",
      categoryIds: [category.id],
    });
    await createPlace({ name: "Out of Category", status: "been" });

    const places = await queryPlaces({ categoryId: category.id });
    expect(places.map((p) => p.id)).toEqual([inCategory.id]);
  });

  it("filters by search on name, case-insensitively", async () => {
    const match = await createPlace({ name: "Taco Palace", status: "been" });
    await createPlace({ name: "Ramen House", status: "been" });

    const places = await queryPlaces({ search: "taco" });
    expect(places.map((p) => p.id)).toEqual([match.id]);
  });

  it("filters by search on cuisine, case-insensitively", async () => {
    const match = await createPlace({
      name: "Spot A",
      status: "been",
      cuisine: "Mexican",
    });
    await createPlace({ name: "Spot B", status: "been", cuisine: "Italian" });

    const places = await queryPlaces({ search: "MEXICAN" });
    expect(places.map((p) => p.id)).toEqual([match.id]);
  });

  it("filters by search on city, case-insensitively", async () => {
    const match = await createPlace({ name: "Spot A", status: "been", city: "Austin" });
    await createPlace({ name: "Spot B", status: "been", city: "Dallas" });

    const places = await queryPlaces({ search: "austin" });
    expect(places.map((p) => p.id)).toEqual([match.id]);
  });

  it("search matches substrings, not just prefixes", async () => {
    const match = await createPlace({ name: "The Great Taco Palace", status: "been" });

    const places = await queryPlaces({ search: "taco" });
    expect(places.map((p) => p.id)).toEqual([match.id]);
  });
});

// ---- queryPlace ----

describe("queryPlace", () => {
  it("returns the place by id", async () => {
    const place = await createPlace({ name: "Spot", status: "been" });
    const found = await queryPlace(place.id);
    expect(found?.id).toBe(place.id);
  });

  it("returns undefined for a missing id", async () => {
    expect(await queryPlace("nope")).toBeUndefined();
  });

  it("returns undefined for a tombstoned place", async () => {
    const place = await createPlace({ name: "Spot", status: "been" });
    await deletePlace(place.id);
    expect(await queryPlace(place.id)).toBeUndefined();
  });
});

// ---- queryCategories / queryCategory ----

describe("queryCategories", () => {
  it("excludes tombstoned categories", async () => {
    const live = await createCategory({ name: "Live", sortOrder: 0 });
    const gone = await createCategory({ name: "Gone", sortOrder: 1 });
    await deleteCategory(gone.id);

    const categories = await queryCategories();
    expect(categories.map((c) => c.id)).toEqual([live.id]);
  });

  it("sorts by sortOrder ascending", async () => {
    await createCategory({ name: "Third", sortOrder: 2 });
    await createCategory({ name: "First", sortOrder: 0 });
    await createCategory({ name: "Second", sortOrder: 1 });

    const categories = await queryCategories();
    expect(categories.map((c) => c.name)).toEqual(["First", "Second", "Third"]);
  });
});

describe("queryCategory", () => {
  it("returns undefined for a missing or tombstoned category", async () => {
    expect(await queryCategory("nope")).toBeUndefined();

    const category = await createCategory({ name: "Cat", sortOrder: 0 });
    await deleteCategory(category.id);
    expect(await queryCategory(category.id)).toBeUndefined();
  });
});

// ---- queryCriteria ----

describe("queryCriteria", () => {
  it("excludes tombstoned criteria", async () => {
    const live = await createCriterion({ name: "Live", sortOrder: 0 });
    const gone = await createCriterion({ name: "Gone", sortOrder: 1 });
    await deleteCriterion(gone.id);

    const criteria = await queryCriteria();
    expect(criteria.map((c) => c.id)).toEqual([live.id]);
  });

  it("sorts by sortOrder ascending", async () => {
    await createCriterion({ name: "Third", sortOrder: 2 });
    await createCriterion({ name: "First", sortOrder: 0 });
    await createCriterion({ name: "Second", sortOrder: 1 });

    const criteria = await queryCriteria();
    expect(criteria.map((c) => c.name)).toEqual(["First", "Second", "Third"]);
  });
});

// ---- queryVisits ----

describe("queryVisits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("excludes tombstoned visits", async () => {
    const place = await createPlace({ name: "Spot", status: "been" });
    const live = await createVisit({ placeId: place.id, date: "2026-01-01", dishes: "", notes: "" });
    const gone = await createVisit({ placeId: place.id, date: "2026-01-02", dishes: "", notes: "" });
    await deleteVisit(gone.id);

    const visits = await queryVisits();
    expect(visits.map((v) => v.id)).toEqual([live.id]);
  });

  it("filters by placeId when provided", async () => {
    const placeA = await createPlace({ name: "A", status: "been" });
    const placeB = await createPlace({ name: "B", status: "been" });
    const visitA = await createVisit({ placeId: placeA.id, date: "2026-01-01", dishes: "", notes: "" });
    await createVisit({ placeId: placeB.id, date: "2026-01-01", dishes: "", notes: "" });

    const visits = await queryVisits(placeA.id);
    expect(visits.map((v) => v.id)).toEqual([visitA.id]);
  });

  it("sorts by date desc, then createdAt desc", async () => {
    const place = await createPlace({ name: "Spot", status: "been" });
    const earlyDateVisit = await createVisit({
      placeId: place.id,
      date: "2026-01-01",
      dishes: "",
      notes: "",
    });

    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    const lateDateVisit = await createVisit({
      placeId: place.id,
      date: "2026-01-05",
      dishes: "",
      notes: "",
    });

    vi.setSystemTime(new Date("2026-01-01T00:02:00.000Z"));
    const sameDateNewerCreated = await createVisit({
      placeId: place.id,
      date: "2026-01-01",
      dishes: "",
      notes: "",
    });

    const visits = await queryVisits(place.id);
    // 2026-01-05 first (latest date), then the two 2026-01-01 visits ordered by createdAt desc.
    expect(visits.map((v) => v.id)).toEqual([
      lateDateVisit.id,
      sameDateNewerCreated.id,
      earlyDateVisit.id,
    ]);
  });
});

// ---- queryRankedCategory ----

describe("queryRankedCategory", () => {
  it("returns empty ranked/wantToTry for a missing category", async () => {
    expect(await queryRankedCategory("nope")).toEqual({ ranked: [], wantToTry: [] });
  });

  it("returns empty ranked/wantToTry for a tombstoned category", async () => {
    const category = await createCategory({ name: "Cat", sortOrder: 0 });
    await deleteCategory(category.id);
    expect(await queryRankedCategory(category.id)).toEqual({ ranked: [], wantToTry: [] });
  });

  it("ranks 'been' places with ratings and buckets 'want_to_try' places separately", async () => {
    const criterion = await createCriterion({ name: "Taste", sortOrder: 0 });
    const category = await createCategory({ name: "Mexican", sortOrder: 0 });

    const ratedPlace = await createPlace({
      name: "Rated Spot",
      status: "been",
      categoryIds: [category.id],
    });
    await setRating(ratedPlace.id, criterion.id, 5);

    const wantPlace = await createPlace({
      name: "Want Spot",
      status: "want_to_try",
      categoryIds: [category.id],
    });

    const outOfCategory = await createPlace({
      name: "Other Category Spot",
      status: "been",
      categoryIds: [],
    });
    await setRating(outOfCategory.id, criterion.id, 3);

    const result = await queryRankedCategory(category.id);

    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].place.id).toBe(ratedPlace.id);
    expect(result.ranked[0].score).toBe(5);

    expect(result.wantToTry.map((p) => p.id)).toEqual([wantPlace.id]);
  });

  it("sorts wantToTry by createdAt desc", async () => {
    const category = await createCategory({ name: "Cat", sortOrder: 0 });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const older = await createPlace({
      name: "Older",
      status: "want_to_try",
      categoryIds: [category.id],
    });

    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    const newer = await createPlace({
      name: "Newer",
      status: "want_to_try",
      categoryIds: [category.id],
    });
    vi.useRealTimers();

    const result = await queryRankedCategory(category.id);
    expect(result.wantToTry.map((p) => p.id)).toEqual([newer.id, older.id]);
  });

  it("builds lastVisitByPlace from the max non-tombstoned visit date per place", async () => {
    const criterion = await createCriterion({ name: "Taste", sortOrder: 0 });
    const category = await createCategory({ name: "Cat", sortOrder: 0 });

    // Two places that will tie on displayed score, so rankCategory's tie-break sorts by
    // lastVisitByPlace descending — proving the max-date computation feeds into the ranking.
    const placeA = await createPlace({
      name: "A Place",
      status: "been",
      categoryIds: [category.id],
    });
    await setRating(placeA.id, criterion.id, 4);
    const placeB = await createPlace({
      name: "B Place",
      status: "been",
      categoryIds: [category.id],
    });
    await setRating(placeB.id, criterion.id, 4);

    // placeA's most recent visit (after excluding an earlier and a tombstoned-later one) is
    // 2026-02-01; placeB's only visit is 2026-03-01, so placeB should rank first.
    await createVisit({ placeId: placeA.id, date: "2026-01-01", dishes: "", notes: "" });
    await createVisit({ placeId: placeA.id, date: "2026-02-01", dishes: "", notes: "" });
    const laterTombstoned = await createVisit({
      placeId: placeA.id,
      date: "2026-06-01",
      dishes: "",
      notes: "",
    });
    await deleteVisit(laterTombstoned.id);
    await createVisit({ placeId: placeB.id, date: "2026-03-01", dishes: "", notes: "" });

    const result = await queryRankedCategory(category.id);
    expect(result.ranked.map((e) => e.place.id)).toEqual([placeB.id, placeA.id]);
  });

  it("excludes places outside the category from ranking even if rated", async () => {
    const criterion = await createCriterion({ name: "Taste", sortOrder: 0 });
    const category = await createCategory({ name: "Cat", sortOrder: 0 });
    const other = await createPlace({ name: "Elsewhere", status: "been", categoryIds: [] });
    await setRating(other.id, criterion.id, 5);

    const result = await queryRankedCategory(category.id);
    expect(result.ranked).toEqual([]);
  });

  it("respects category weights via rankCategory (missing key defaults to weight 1)", async () => {
    const criterion = await createCriterion({ name: "Taste", sortOrder: 0 });
    const category = await createCategory({ name: "Cat", sortOrder: 0, weights: {} });
    const place = await createPlace({
      name: "Spot",
      status: "been",
      categoryIds: [category.id],
    });
    await setRating(place.id, criterion.id, 4);

    const result = await queryRankedCategory(category.id);
    expect(result.ranked[0].score).toBe(4);
  });

  it("does not rank a place whose only weight is explicitly 0", async () => {
    const criterion = await createCriterion({ name: "Taste", sortOrder: 0 });
    const category = await createCategory({ name: "Cat", sortOrder: 0 });
    await setWeights(category.id, { [criterion.id]: 0 });
    const place = await createPlace({
      name: "Spot",
      status: "been",
      categoryIds: [category.id],
    });
    await setRating(place.id, criterion.id, 4);

    const result = await queryRankedCategory(category.id);
    expect(result.ranked).toEqual([]);
  });
});
