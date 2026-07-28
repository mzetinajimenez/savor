// Pure ranking math for savor. No Dexie, no React, no I/O — only types are imported. Every
// function here is a plain deterministic transform so it can be unit-tested without a database
// and reused unchanged by both server-rendered and client UI code (T5/T10).

import type { Category, Criterion, Place } from "./types";

/**
 * Weighted average of a place's ratings for one category, over criteria that are "live" (not
 * tombstoned), weighted (> 0), and actually rated.
 *
 * For each criterion id present in `ratings`:
 *   - it is dropped unless `liveCriterionIds` contains it (tombstoned criteria never contribute,
 *     even if the place still carries a stale rating for them);
 *   - its weight is `weights[id] ?? 1` — categories don't re-enumerate weights when new criteria
 *     are added, so a missing key defaults to 1, not 0;
 *   - it is dropped if that weight is <= 0 (an explicit 0 excludes it, same as a missing rating).
 *
 * Returns the RAW, unrounded weighted average — `Σ(w×r)/Σ(w)` over the contributing criteria.
 * Rounding to display precision is the caller's job (see `formatScore`).
 *
 * Returns null when nothing contributes (no ratings, nothing live, or total weight is 0) — the
 * composite score is undefined in that case, not zero.
 */
export function compositeScore(
  ratings: Record<string, number>,
  weights: Record<string, number>,
  liveCriterionIds: Set<string>
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const criterionId of Object.keys(ratings)) {
    if (!liveCriterionIds.has(criterionId)) continue;
    const weight = weights[criterionId] ?? 1;
    if (weight <= 0) continue;
    weightedSum += weight * ratings[criterionId];
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/** Formats a score to one decimal place for display, e.g. `formatScore(4.333)` -> `"4.3"`. */
export function formatScore(score: number): string {
  return (Math.round(score * 10) / 10).toFixed(1);
}

export interface RankedEntry {
  place: Place;
  score: number;
  rank: number;
  tied: boolean;
}

/**
 * Ranks places within a single category by composite score, highest first.
 *
 * Contract: `places` must already be scoped to this category and non-tombstoned (deletedAt ===
 * null) — this function does not re-filter on either. It additionally keeps only places with
 * `status === "been"` and a non-null `compositeScore` (a `want_to_try` place, or one with no
 * contributing ratings, is excluded from the ranking entirely). Empty input, or input where
 * nothing qualifies, returns `[]`.
 *
 * `criteria` supplies the live-criterion set (any criterion with `deletedAt !== null` is
 * excluded from every place's composite score, even if a stale rating for it remains).
 *
 * Ties are determined at display precision: two scores tie iff `Math.round(a*10) ===
 * Math.round(b*10)` (matching what `formatScore` would render), since places showing the same
 * number to the user must rank as tied even if their raw scores differ slightly. Tied entries
 * share one `rank` under standard competition ranking (1, 2, 2, 4 — the rank after a tie group
 * skips ahead by the group's size) and are flagged `tied: true`. Within a tie group, entries are
 * ordered by most recent visit date (from `lastVisitByPlace`) descending — places with no visit
 * sort last in the group — then by name ascending (locale-insensitive lowercase compare).
 *
 * Each returned entry's `score` is the RAW composite score (see `compositeScore`); format it
 * with `formatScore` for display.
 */
export function rankCategory(
  places: Place[],
  category: Category,
  criteria: Criterion[],
  lastVisitByPlace: Map<string, string>
): RankedEntry[] {
  const liveCriterionIds = new Set(
    criteria.filter((c) => c.deletedAt === null).map((c) => c.id)
  );

  const scored = places
    .filter((place) => place.status === "been")
    .map((place) => ({
      place,
      score: compositeScore(place.ratings, category.weights, liveCriterionIds),
    }))
    .filter((entry): entry is { place: Place; score: number } => entry.score !== null)
    .map((entry) => ({ ...entry, displayKey: Math.round(entry.score * 10) }));

  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    if (a.displayKey !== b.displayKey) return b.displayKey - a.displayKey;

    const aVisit = lastVisitByPlace.get(a.place.id);
    const bVisit = lastVisitByPlace.get(b.place.id);
    if (aVisit !== bVisit) {
      if (aVisit === undefined) return 1; // no visit sorts last within the tie group
      if (bVisit === undefined) return -1;
      return aVisit > bVisit ? -1 : 1; // most recent first
    }

    return a.place.name.toLowerCase().localeCompare(b.place.name.toLowerCase());
  });

  const groupSizes = new Map<number, number>();
  for (const entry of scored) {
    groupSizes.set(entry.displayKey, (groupSizes.get(entry.displayKey) ?? 0) + 1);
  }

  let rank = 1;
  return scored.map((entry, index) => {
    if (index > 0 && entry.displayKey !== scored[index - 1].displayKey) {
      rank = index + 1;
    }
    return {
      place: entry.place,
      score: entry.score,
      rank,
      tied: (groupSizes.get(entry.displayKey) ?? 0) > 1,
    };
  });
}

export interface CriterionContribution {
  criterionId: string;
  name: string;
  weight: number;
  rating: number | null;
  included: boolean;
}

export interface ScoreExplanation {
  score: number | null;
  contributions: CriterionContribution[];
}

export interface CategoryScore {
  categoryId: string;
  name: string;
  score: number | null;
}

/**
 * Explains a place's composite score for one category: every LIVE criterion (tombstoned ones
 * are omitted entirely — same contract as compositeScore), its effective weight (missing key ->
 * 1), the place's rating for it (or null if unrated), and whether it actually contributed
 * (`included`: weight > 0 && rating != null). `score` is exactly what `compositeScore` would
 * return for these same inputs — null when nothing contributes.
 */
export function explainScore(
  place: Place,
  category: Category,
  criteria: Criterion[]
): ScoreExplanation {
  const liveCriteria = criteria.filter((c) => c.deletedAt === null);
  const contributions: CriterionContribution[] = liveCriteria.map((c) => {
    const weight = category.weights[c.id] ?? 1;
    const rating = place.ratings[c.id] ?? null;
    return {
      criterionId: c.id,
      name: c.name,
      weight,
      rating,
      included: weight > 0 && rating !== null,
    };
  });

  const liveCriterionIds = new Set(liveCriteria.map((c) => c.id));
  const score = compositeScore(place.ratings, category.weights, liveCriterionIds);

  return { score, contributions };
}

/**
 * The single contribution "carrying the most weight" in a score: the included contribution with
 * the strictly highest weight. Returns null when fewer than two criteria are included (nothing
 * for it to be "more dominant" than) or when the top weight is tied between two or more
 * contributions (no single answer) — both cases fall back to a generic "counts equally"
 * message in `summarizeScore`.
 */
export function dominantContribution(
  contributions: CriterionContribution[]
): CriterionContribution | null {
  const included = contributions.filter((c) => c.included);
  if (included.length < 2) return null;

  const maxWeight = Math.max(...included.map((c) => c.weight));
  const atMax = included.filter((c) => c.weight === maxWeight);
  return atMax.length === 1 ? atMax[0] : null;
}

/**
 * A place's composite score in every category it belongs to (from `place.categoryIds`), in the
 * given `categories` order. Each entry's `score` follows `compositeScore`'s own null contract —
 * null when nothing contributes in that category.
 */
export function scoreAcrossCategories(
  place: Place,
  categories: Category[],
  criteria: Criterion[]
): CategoryScore[] {
  const liveCriterionIds = new Set(
    criteria.filter((c) => c.deletedAt === null).map((c) => c.id)
  );
  return categories
    .filter((cat) => place.categoryIds.includes(cat.id))
    .map((cat) => ({
      categoryId: cat.id,
      name: cat.name,
      score: compositeScore(place.ratings, cat.weights, liveCriterionIds),
    }));
}

/**
 * A plain-language sentence explaining a score: names the dominant criterion (or says every
 * criterion counts equally when there isn't one), then — if the place belongs to another
 * category with its own score — names whichever one diverges MOST from this score, to make
 * per-category weighting concrete rather than abstract ("the same ratings would score X in Y").
 * `currentCategoryId` excludes the category this explanation is already for from that
 * comparison. This is the only place savor's per-list weighting is stated in words.
 */
export function summarizeScore(
  currentCategoryId: string,
  explanation: ScoreExplanation,
  scoresAcrossCategories: CategoryScore[]
): string {
  if (explanation.score === null) return "No ratings contribute to this score yet.";

  const dominant = dominantContribution(explanation.contributions);
  const sentences: string[] = [
    dominant
      ? `${dominant.name} (×${dominant.weight}) carries the most weight here.`
      : "Every rated criterion counts equally here.",
  ];

  let mostDivergent: { name: string; score: number } | null = null;
  for (const other of scoresAcrossCategories) {
    if (other.categoryId === currentCategoryId || other.score === null) continue;
    const score = other.score;
    if (
      !mostDivergent ||
      Math.abs(score - explanation.score) > Math.abs(mostDivergent.score - explanation.score)
    ) {
      mostDivergent = { name: other.name, score };
    }
  }
  if (mostDivergent) {
    sentences.push(
      `The same ratings would score ${formatScore(mostDivergent.score)} in ${mostDivergent.name}.`
    );
  }

  return sentences.join(" ");
}
