import { describe, expect, it } from "vitest";
import { compositeScore, formatScore, rankCategory } from "./ranking";
import type { Category, Criterion, Place } from "./types";

// ---- test fixtures ----

function place(overrides: Partial<Place> & { id: string }): Place {
  return {
    name: overrides.id,
    status: "been",
    categoryIds: [],
    ratings: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Mexican",
    weights: {},
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function criterion(id: string, overrides: Partial<Criterion> = {}): Criterion {
  return {
    id,
    name: id,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

// ---- compositeScore ----

describe("compositeScore", () => {
  it("computes a plain weighted average", () => {
    const ratings = { taste: 4, value: 2 };
    const weights = { taste: 3, value: 1 };
    const live = new Set(["taste", "value"]);
    // (4*3 + 2*1) / (3+1) = 14/4 = 3.5
    expect(compositeScore(ratings, weights, live)).toBe(3.5);
  });

  it("defaults a missing weight key to 1", () => {
    const ratings = { taste: 4, value: 2 };
    const weights = { taste: 3 }; // value omitted -> defaults to weight 1
    const live = new Set(["taste", "value"]);
    // (4*3 + 2*1) / (3+1) = 14/4 = 3.5
    expect(compositeScore(ratings, weights, live)).toBe(3.5);
  });

  it("excludes a criterion with an explicit weight of 0", () => {
    const ratings = { taste: 4, value: 2 };
    const weights = { taste: 3, value: 0 };
    const live = new Set(["taste", "value"]);
    // value excluded entirely: 4*3/3 = 4
    expect(compositeScore(ratings, weights, live)).toBe(4);
  });

  it("drops a criterion the place has no rating for (skipped rating)", () => {
    const ratings = { taste: 4 }; // value never rated
    const weights = { taste: 3, value: 1 };
    const live = new Set(["taste", "value"]);
    expect(compositeScore(ratings, weights, live)).toBe(4);
  });

  it("excludes a deleted criterion not present in liveCriterionIds", () => {
    const ratings = { taste: 4, value: 2 };
    const weights = { taste: 3, value: 1 };
    const live = new Set(["taste"]); // "value" tombstoned, dropped from live set
    expect(compositeScore(ratings, weights, live)).toBe(4);
  });

  it("returns null when total weight is zero", () => {
    const ratings = { taste: 4, value: 2 };
    const weights = { taste: 0, value: 0 };
    const live = new Set(["taste", "value"]);
    expect(compositeScore(ratings, weights, live)).toBeNull();
  });

  it("returns null when there are no ratings at all", () => {
    const ratings = {};
    const weights = { taste: 3, value: 1 };
    const live = new Set(["taste", "value"]);
    expect(compositeScore(ratings, weights, live)).toBeNull();
  });

  it("returns null when the only rated criteria are not live", () => {
    const ratings = { taste: 4 };
    const weights = { taste: 3 };
    const live = new Set<string>(); // taste tombstoned
    expect(compositeScore(ratings, weights, live)).toBeNull();
  });

  it("returns the raw unrounded average, not rounded to display precision", () => {
    const ratings = { a: 5, b: 4, c: 4 };
    const weights = { a: 1, b: 1, c: 1 };
    const live = new Set(["a", "b", "c"]);
    // (5+4+4)/3 = 4.333333...
    const score = compositeScore(ratings, weights, live);
    expect(score).not.toBeNull();
    expect(score).toBeCloseTo(4.3333333, 6);
  });
});

// ---- formatScore ----

describe("formatScore", () => {
  it("formats to one decimal place", () => {
    expect(formatScore(4.3333333)).toBe("4.3");
    expect(formatScore(4)).toBe("4.0");
    expect(formatScore(5)).toBe("5.0");
  });

  it("rounds consistently with the tie-grouping precision", () => {
    expect(formatScore(4.2999)).toBe("4.3");
    expect(formatScore(4.301)).toBe("4.3");
  });
});

// ---- rankCategory ----

describe("rankCategory", () => {
  const crit = [criterion("taste"), criterion("value")];
  const cat = category({ weights: { taste: 1, value: 1 } });

  it("returns [] for empty input", () => {
    expect(rankCategory([], cat, crit, new Map())).toEqual([]);
  });

  it("ranks places by descending composite score", () => {
    const places = [
      place({ id: "a", ratings: { taste: 3, value: 3 } }), // 3.0
      place({ id: "b", ratings: { taste: 5, value: 5 } }), // 5.0
      place({ id: "c", ratings: { taste: 4, value: 4 } }), // 4.0
    ];
    const result = rankCategory(places, cat, crit, new Map());
    expect(result.map((r) => r.place.id)).toEqual(["b", "c", "a"]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(result.every((r) => !r.tied)).toBe(true);
  });

  it("excludes want_to_try places", () => {
    const places = [
      place({ id: "a", status: "been", ratings: { taste: 5, value: 5 } }),
      place({ id: "b", status: "want_to_try", ratings: { taste: 5, value: 5 } }),
    ];
    const result = rankCategory(places, cat, crit, new Map());
    expect(result.map((r) => r.place.id)).toEqual(["a"]);
  });

  it("excludes places with no contributing ratings (null compositeScore)", () => {
    const places = [
      place({ id: "a", ratings: { taste: 5, value: 5 } }),
      place({ id: "b", ratings: {} }),
    ];
    const result = rankCategory(places, cat, crit, new Map());
    expect(result.map((r) => r.place.id)).toEqual(["a"]);
  });

  it("excludes ratings for criteria not present in the criteria list (tombstoned)", () => {
    // "value" criterion is tombstoned (deletedAt set) -> dropped from live set.
    const tombstonedCrit = [
      criterion("taste"),
      criterion("value", { deletedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const places = [place({ id: "a", ratings: { taste: 4, value: 1 } })];
    const result = rankCategory(places, cat, tombstonedCrit, new Map());
    expect(result[0].score).toBe(4);
  });

  it("ties at display precision: raw 4.2999 vs 4.3010 tie, with competition ranking", () => {
    // Real ratings are validated as integers 1-5 in repo.ts, but compositeScore/rankCategory
    // themselves place no such constraint, so we can feed exact boundary floats directly via a
    // single weight-1 criterion (whose composite score equals the rating itself) to hit the
    // precise raw decimals needed for this rounding-boundary test.
    const singleCrit = [criterion("only")];
    const singleCat = category({ weights: { only: 1 } });
    const places = [
      place({ id: "x", ratings: { only: 4.2999 } }),
      place({ id: "y", ratings: { only: 4.301 } }),
      place({ id: "z", ratings: { only: 4.9 } }),
    ];
    const result = rankCategory(places, singleCat, singleCrit, new Map());

    expect(result.map((r) => r.place.id)).toEqual(["z", "x", "y"]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 2]);
    expect(result.map((r) => r.tied)).toEqual([false, true, true]);
  });

  it("uses standard competition ranking (1,2,2,4) for a four-entry tie group", () => {
    const singleCrit = [criterion("only")];
    const singleCat = category({ weights: { only: 1 } });
    const places = [
      place({ id: "a", ratings: { only: 5 } }),
      place({ id: "b", ratings: { only: 4 } }),
      place({ id: "c", ratings: { only: 4 } }),
      place({ id: "d", ratings: { only: 3 } }),
    ];
    const result = rankCategory(places, singleCat, singleCrit, new Map());
    expect(result.map((r) => r.place.id)).toEqual(["a", "b", "c", "d"]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(result.map((r) => r.tied)).toEqual([false, true, true, false]);
  });

  it("breaks ties by most recent visit date descending", () => {
    const singleCrit = [criterion("only")];
    const singleCat = category({ weights: { only: 1 } });
    const places = [
      place({ id: "a", ratings: { only: 4 } }),
      place({ id: "b", ratings: { only: 4 } }),
      place({ id: "c", ratings: { only: 4 } }),
    ];
    const lastVisit = new Map([
      ["a", "2026-01-05"],
      ["b", "2026-02-10"], // most recent -> ranks first within the tie
      ["c", "2026-01-20"],
    ]);
    const result = rankCategory(places, singleCat, singleCrit, lastVisit);
    expect(result.map((r) => r.place.id)).toEqual(["b", "c", "a"]);
    expect(result.map((r) => r.rank)).toEqual([1, 1, 1]);
    expect(result.every((r) => r.tied)).toBe(true);
  });

  it("sorts places with no visit last within a tie group", () => {
    const singleCrit = [criterion("only")];
    const singleCat = category({ weights: { only: 1 } });
    const places = [
      place({ id: "a", ratings: { only: 4 } }), // no visit
      place({ id: "b", ratings: { only: 4 } }),
    ];
    const lastVisit = new Map([["b", "2026-01-01"]]);
    const result = rankCategory(places, singleCat, singleCrit, lastVisit);
    expect(result.map((r) => r.place.id)).toEqual(["b", "a"]);
  });

  it("breaks ties by name ascending (locale-insensitive) when visit dates also tie", () => {
    const singleCrit = [criterion("only")];
    const singleCat = category({ weights: { only: 1 } });
    const places = [
      place({ id: "z", name: "Zesty Tacos", ratings: { only: 4 } }),
      place({ id: "a", name: "amazing burritos", ratings: { only: 4 } }),
      place({ id: "m", name: "Mid Place", ratings: { only: 4 } }),
    ];
    // No visits at all for any -> all tie on the "no visit sorts last" rule too, so name decides.
    const result = rankCategory(places, singleCat, singleCrit, new Map());
    expect(result.map((r) => r.place.id)).toEqual(["a", "m", "z"]);
  });

  it("is pure: does not mutate its inputs", () => {
    const places = [place({ id: "a", ratings: { taste: 4, value: 4 } })];
    const placesCopy = JSON.parse(JSON.stringify(places));
    const catCopy = JSON.parse(JSON.stringify(cat));
    const critCopy = JSON.parse(JSON.stringify(crit));
    rankCategory(places, cat, crit, new Map());
    expect(places).toEqual(placesCopy);
    expect(cat).toEqual(catCopy);
    expect(crit).toEqual(critCopy);
  });
});
