# Supper Club Phase 3 — Score Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 3 of the Supper Club design overhaul (issue #24, spec
`docs/superpowers/specs/2026-07-27-design-system-supper-club-design.md` §"Phase 3 — Make the
score legible") — a `ScoreBreakdown` component that answers "why is this 4.6?", mounted in two
places: place detail's per-list score chips (the canonical, always-available route) and a
long-press (touch) / hover-intent (mouse) peek over the ranked list on `/categories/[id]` (an
accelerator, never the only path).

**Architecture:** New pure functions in `lib/ranking.ts` (`explainScore`, `dominantContribution`,
`scoreAcrossCategories`, `summarizeScore`) compute what to show and say — fully unit-tested, no
DOM. One new presentational component (`ScoreBreakdown`) renders that data; it doesn't know
which mount it's in. A new framework-using-but-DOM-only hook (`lib/useLongPress.ts`, same
category as the existing `lib/useModalA11y.ts`) implements the long-press/hover-intent gesture
and is consumed only by the peek mount. No schema change, no new dependency, no `lib/repo.ts`
change — this is presentation and derived-data work on top of already-stored `ratings`/`weights`.

**Tech Stack:** Next.js 16 App Router, React, Tailwind v4 (Supper Club `@theme` tokens),
Pointer Events API, `navigator.vibrate` (feature-guarded), Vitest.

## Global Constraints

- **Green before every commit.** `npm test`, `npm run build`, and `npm run lint` must all pass
  after every task's commit.
- **No schema change, no new dependency.** Everything here reads `Place.ratings`,
  `Category.weights`, and `Criterion` — all already in `lib/types.ts`. `SCHEMA_VERSION` does not
  move; issue #2 is not triggered.
- **Supper Club tokens only.** No raw hex, no legacy Cellar token names
  (`lib/theme-contract.test.ts` enforces this over every `.tsx` file in `app/`).
- **Contrast floor — this is the one that has bitten this codebase twice already.**
  `ScoreBreakdown` always renders on a `bg-raised` surface (a `Sheet` body, or the peek's own
  `bg-raised` card) — never on `ground`/`ground-deep`. Per CLAUDE.md's contrast table, `sage` is
  3.85:1 on `raised` and **fails AA**; every text token inside `ScoreBreakdown` must be `cream`
  or `cream/80` (5.55:1), never `sage`. `sage-deep` remains fine as a **non-text** dim-bar fill
  (its documented use). This is the same class of bug Phase 0-1's final review fixed at 25 sites
  and Phase 2 Task 1 fixed again at a sixth — do not reintroduce it at a seventh.
- **Radius rule:** `0` (flat, hairline rows) is the default; `rounded-sm` for inputs, chips,
  sheets, buttons, and (new in this plan) the rating bar in `ScoreBreakdown`; `rounded-full` is
  reserved for the score seal and small circular indicators only — the rating bar is
  deliberately `rounded-sm`, not a rounded/pill progress bar.
- **Read through hooks, write through repo.** No component imports `dexie` directly. This plan
  adds no new repo writes at all — it is 100% derived/read-side.
- **Framework-free `lib/ranking.ts`.** All four new functions take plain data (`Place`,
  `Category`, `Criterion[]`, or already-computed results) and return plain data — no React, no
  DOM, unit-tested with the existing Vitest fixtures in `lib/ranking.test.ts`.
- **The long-press peek is an accelerator, never the only path (non-negotiable, per spec).** It
  is not discoverable, not keyboard-reachable, and not exposed to screen readers — the peek
  container is `aria-hidden` and never receives focus. The canonical, fully-accessible route is
  the same `ScoreBreakdown` mounted from place detail's `Sheet`.
- **`navigator.vibrate()` is Android-only (non-negotiable, per spec).** Safari has never
  implemented the Vibration API and there is no web equivalent for the Taptic Engine. Guard every
  call with `typeof navigator.vibrate === "function"`; no copy or comment may imply iOS gets a
  haptic tick.
- **`active:scale-95`/`transition` on interactive rows already established** — match existing
  row styling in `app/categories/[id]/page.tsx` exactly; this plan changes what's inside the row,
  not its base look.

---

## File Structure

- Modify: `lib/ranking.ts` — add `explainScore`, `dominantContribution`, `scoreAcrossCategories`,
  `summarizeScore`, and the `CriterionContribution` / `ScoreExplanation` / `CategoryScore` types.
- Modify: `lib/ranking.test.ts` — Vitest coverage for all four new functions.
- Create: `app/components/places/ScoreBreakdown.tsx` — presentational score explanation; one
  component, no knowledge of which mount renders it.
- Modify: `app/places/[id]/page.tsx` — Mount 1: tapping a per-list score chip opens a
  `ScoreBreakdown` inside a `Sheet`.
- Create: `lib/useLongPress.ts` — long-press (touch, ~450ms) / hover-intent (mouse, ~600ms,
  `(pointer: fine)` only) gesture hook; owns its own open state and Escape/scroll dismissal.
- Modify: `app/categories/[id]/page.tsx` — Mount 2: extract `RankedPlaceRow`, wire
  `useLongPress` + a floating `ScoreBreakdown` peek card over each ranked row.
- Modify: `CLAUDE.md` — architecture-tree entries for the two new files; pin the two
  non-negotiable Phase 3 constraints under "Product decisions".

---

### Task 1: `explainScore`, `dominantContribution`, `scoreAcrossCategories`, `summarizeScore`

**Files:**
- Modify: `lib/ranking.ts` (add after `rankCategory`, end of file)
- Test: `lib/ranking.test.ts` (add after the existing `rankCategory` describe block; add new
  names to the top `import { ... } from "./ranking"` line)

**Interfaces:**
- Consumes: `compositeScore`, `formatScore` (both already in this file), `Category`, `Criterion`,
  `Place` (already imported).
- Produces: `CriterionContribution`, `ScoreExplanation`, `CategoryScore` types; `explainScore(place,
  category, criteria): ScoreExplanation`; `dominantContribution(contributions):
  CriterionContribution | null`; `scoreAcrossCategories(place, categories, criteria):
  CategoryScore[]`; `summarizeScore(currentCategoryId, explanation, scoresAcrossCategories):
  string`. All four consumed by Task 2's `ScoreBreakdown`.

- [ ] **Step 1: Write the failing tests**

Add to the top of `lib/ranking.test.ts`, change:

```ts
import { compositeScore, formatScore, rankCategory } from "./ranking";
```

to:

```ts
import {
  compositeScore,
  dominantContribution,
  explainScore,
  formatScore,
  rankCategory,
  scoreAcrossCategories,
  summarizeScore,
} from "./ranking";
```

Then append at the end of the file (after the closing `});` of the `rankCategory` describe
block):

```ts

// ---- explainScore ----

describe("explainScore", () => {
  it("includes every live criterion, rated or not, with its effective weight", () => {
    const crit = [criterion("taste"), criterion("value")];
    const cat = category({ weights: { taste: 3 } }); // value omitted -> defaults to weight 1
    const p = place({ id: "a", ratings: { taste: 4 } }); // value never rated
    const result = explainScore(p, cat, crit);
    expect(result.contributions).toEqual([
      { criterionId: "taste", name: "taste", weight: 3, rating: 4, included: true },
      { criterionId: "value", name: "value", weight: 1, rating: null, included: false },
    ]);
  });

  it("marks a criterion excluded when its weight is explicitly 0, even if rated", () => {
    const crit = [criterion("taste"), criterion("value")];
    const cat = category({ weights: { taste: 3, value: 0 } });
    const p = place({ id: "a", ratings: { taste: 4, value: 5 } });
    const result = explainScore(p, cat, crit);
    expect(result.contributions.find((c) => c.criterionId === "value")).toEqual({
      criterionId: "value",
      name: "value",
      weight: 0,
      rating: 5,
      included: false,
    });
  });

  it("omits tombstoned criteria from contributions entirely", () => {
    const crit = [
      criterion("taste"),
      criterion("value", { deletedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const cat = category({ weights: { taste: 1, value: 1 } });
    const p = place({ id: "a", ratings: { taste: 4, value: 5 } });
    const result = explainScore(p, cat, crit);
    expect(result.contributions.map((c) => c.criterionId)).toEqual(["taste"]);
  });

  it("returns the same score compositeScore would, for the same inputs", () => {
    const crit = [criterion("taste"), criterion("value")];
    const cat = category({ weights: { taste: 3, value: 1 } });
    const p = place({ id: "a", ratings: { taste: 4, value: 2 } });
    const result = explainScore(p, cat, crit);
    expect(result.score).toBe(
      compositeScore(p.ratings, cat.weights, new Set(["taste", "value"]))
    );
  });

  it("returns a null score, and no included contributions, when nothing contributes", () => {
    const crit = [criterion("taste")];
    const cat = category({ weights: { taste: 1 } });
    const p = place({ id: "a", ratings: {} });
    const result = explainScore(p, cat, crit);
    expect(result.score).toBeNull();
    expect(result.contributions).toEqual([
      { criterionId: "taste", name: "taste", weight: 1, rating: null, included: false },
    ]);
  });
});

// ---- dominantContribution ----

describe("dominantContribution", () => {
  it("returns null when fewer than two criteria are included", () => {
    const contributions = [
      { criterionId: "a", name: "A", weight: 3, rating: 4, included: true },
      { criterionId: "b", name: "B", weight: 1, rating: null, included: false },
    ];
    expect(dominantContribution(contributions)).toBeNull();
  });

  it("returns the included contribution with the highest weight", () => {
    const contributions = [
      { criterionId: "a", name: "A", weight: 3, rating: 4, included: true },
      { criterionId: "b", name: "B", weight: 1, rating: 5, included: true },
    ];
    expect(dominantContribution(contributions)?.criterionId).toBe("a");
  });

  it("returns null when the top weight is tied", () => {
    const contributions = [
      { criterionId: "a", name: "A", weight: 2, rating: 4, included: true },
      { criterionId: "b", name: "B", weight: 2, rating: 5, included: true },
    ];
    expect(dominantContribution(contributions)).toBeNull();
  });
});

// ---- scoreAcrossCategories ----

describe("scoreAcrossCategories", () => {
  it("returns a score entry for every category the place belongs to, in the given order", () => {
    const crit = [criterion("taste")];
    const catA = category({ id: "cat-a", name: "Tacos", weights: { taste: 1 } });
    const catB = category({ id: "cat-b", name: "Date Night", weights: { taste: 1 } });
    const p = place({ id: "p", ratings: { taste: 4 }, categoryIds: ["cat-a", "cat-b"] });
    const result = scoreAcrossCategories(p, [catA, catB], crit);
    expect(result).toEqual([
      { categoryId: "cat-a", name: "Tacos", score: 4 },
      { categoryId: "cat-b", name: "Date Night", score: 4 },
    ]);
  });

  it("excludes categories the place does not belong to", () => {
    const crit = [criterion("taste")];
    const catA = category({ id: "cat-a", weights: { taste: 1 } });
    const catB = category({ id: "cat-b", weights: { taste: 1 } });
    const p = place({ id: "p", ratings: { taste: 4 }, categoryIds: ["cat-a"] });
    const result = scoreAcrossCategories(p, [catA, catB], crit);
    expect(result.map((r) => r.categoryId)).toEqual(["cat-a"]);
  });

  it("reports a null score for a category where nothing contributes", () => {
    const crit = [criterion("taste")];
    const catA = category({ id: "cat-a", name: "Tacos", weights: { taste: 0 } }); // excluded
    const p = place({ id: "p", ratings: { taste: 4 }, categoryIds: ["cat-a"] });
    const result = scoreAcrossCategories(p, [catA], crit);
    expect(result).toEqual([{ categoryId: "cat-a", name: "Tacos", score: null }]);
  });
});

// ---- summarizeScore ----

describe("summarizeScore", () => {
  it("states no ratings contribute when the score is null", () => {
    expect(summarizeScore("cat-a", { score: null, contributions: [] }, [])).toBe(
      "No ratings contribute to this score yet."
    );
  });

  it("names the dominant criterion by weight", () => {
    const explanation = {
      score: 4,
      contributions: [
        { criterionId: "a", name: "Food quality", weight: 3, rating: 4, included: true },
        { criterionId: "b", name: "Value", weight: 1, rating: 5, included: true },
      ],
    };
    expect(summarizeScore("cat-a", explanation, [])).toBe(
      "Food quality (×3) carries the most weight here."
    );
  });

  it('falls back to "equally" when there is no single dominant criterion', () => {
    const explanation = {
      score: 4,
      contributions: [
        { criterionId: "a", name: "Food quality", weight: 1, rating: 4, included: true },
        { criterionId: "b", name: "Value", weight: 1, rating: 4, included: true },
      ],
    };
    expect(summarizeScore("cat-a", explanation, [])).toBe(
      "Every rated criterion counts equally here."
    );
  });

  it("names the other category whose score diverges most from this one", () => {
    const explanation = {
      score: 4,
      contributions: [
        { criterionId: "a", name: "Food quality", weight: 3, rating: 4, included: true },
        { criterionId: "b", name: "Value", weight: 1, rating: 4, included: true },
      ],
    };
    const others = [
      { categoryId: "cat-a", name: "Tacos", score: 4 }, // the current category — excluded
      { categoryId: "cat-b", name: "Date Night", score: 3.2 }, // |3.2-4| = 0.8, largest gap
      { categoryId: "cat-c", name: "Cheap Eats", score: 3.9 }, // |3.9-4| = 0.1
    ];
    expect(summarizeScore("cat-a", explanation, others)).toBe(
      "Food quality (×3) carries the most weight here. The same ratings would score 3.2 in Date Night."
    );
  });

  it("omits the divergence sentence when there is no other category with a score", () => {
    const explanation = {
      score: 4,
      contributions: [
        { criterionId: "a", name: "Food quality", weight: 3, rating: 4, included: true },
        { criterionId: "b", name: "Value", weight: 1, rating: 4, included: true },
      ],
    };
    expect(
      summarizeScore("cat-a", explanation, [{ categoryId: "cat-a", name: "Tacos", score: 4 }])
    ).toBe("Food quality (×3) carries the most weight here.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ranking.test.ts`
Expected: FAIL — `explainScore`, `dominantContribution`, `scoreAcrossCategories`,
`summarizeScore` are not exported from `./ranking` yet.

- [ ] **Step 3: Implement the four functions in `lib/ranking.ts`**

Append at the end of `lib/ranking.ts` (after `rankCategory`'s closing brace):

```ts

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/ranking.test.ts`
Expected: PASS — every new test green, and every pre-existing test in the file still green.

- [ ] **Step 5: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/ranking.ts lib/ranking.test.ts
git commit -m "feat(ranking): add explainScore, scoreAcrossCategories, and score summary helpers"
```

---

### Task 2: `ScoreBreakdown` component

**Files:**
- Create: `app/components/places/ScoreBreakdown.tsx`
- Modify: `CLAUDE.md` (architecture tree)

**Interfaces:**
- Consumes: `explainScore`, `scoreAcrossCategories`, `summarizeScore` (Task 1); `ScoreBadge` from
  `@/app/components/ui`; `Category`, `Criterion`, `Place` from `@/lib/types`.
- Produces: `export default function ScoreBreakdown({ place, category, categories, criteria })` —
  a `Category`, a `Category[]` (every category, for the cross-list comparison — the component
  filters to `place.categoryIds` itself via `scoreAcrossCategories`), a `Criterion[]`, and the
  `Place`. No other exports. Consumed by Task 3 (place detail's Sheet mount) and Task 5 (the
  long-press peek's floating card).

- [ ] **Step 1: Write the component**

Create `app/components/places/ScoreBreakdown.tsx`:

```tsx
"use client";

// Presentational answer to "why is this score what it is?" — one component, two mounts: place
// detail's per-list score chips (the canonical, always-available route) and the ranked-list
// long-press/hover-intent peek (an accelerator; see app/categories/[id]/page.tsx). This
// component doesn't know which mount it's in.
//
// Always rendered on a bg-raised surface (a Sheet body, or the peek's own bg-raised card) — so
// per CLAUDE.md's contrast table every text token here is cream or cream/80, never sage (sage
// is 3.85:1 on raised and fails AA; this is the same class of bug the Phase 0-1 restyle's final
// review fixed at 25 sites and Phase 2 Task 1 fixed again at a sixth).

import { explainScore, scoreAcrossCategories, summarizeScore } from "@/lib/ranking";
import type { Category, Criterion, Place } from "@/lib/types";
import { ScoreBadge } from "@/app/components/ui";

export default function ScoreBreakdown({
  place,
  category,
  categories,
  criteria,
}: {
  place: Place;
  category: Category;
  categories: Category[];
  criteria: Criterion[];
}) {
  const explanation = explainScore(place, category, criteria);
  // Both real mounts only ever render this component for a place/category pair that already has
  // a non-null score (place detail's chip loop and the ranked list itself both filter to
  // non-null scores first) — this guard is defensive, matching the same
  // `if (score === null) return null` idiom already used at both call sites.
  if (explanation.score === null) return null;

  const otherScores = scoreAcrossCategories(place, categories, criteria);
  const summary = summarizeScore(category.id, explanation, otherScores);

  return (
    <div>
      <div className="flex items-center gap-3">
        <ScoreBadge score={explanation.score} />
        <p className="min-w-0 truncate font-display text-lg text-cream">
          {category.emoji ? `${category.emoji} ` : ""}
          {category.name}
        </p>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-rule">
        {explanation.contributions.map((c) => (
          <li key={c.criterionId} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] text-cream">{c.name}</p>
              {!c.included ? (
                <p className="text-xs text-cream/80">
                  {c.weight === 0 ? "Excluded from score" : "Not rated"}
                </p>
              ) : null}
            </div>
            <span className="tabular shrink-0 font-util text-[0.6875rem] font-semibold text-cream/80">
              ×{c.weight}
            </span>
            <div className="h-1.5 w-16 shrink-0 rounded-sm bg-ground-deep">
              <div
                className={`h-full rounded-sm ${c.included ? "bg-gold" : "bg-sage-deep"}`}
                style={{ width: `${((c.rating ?? 0) / 5) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-rule pt-4 text-sm leading-relaxed text-cream/80">
        {summary}
      </p>
    </div>
  );
}
```

No Vitest test for this file — matches every other component in `app/components/` (`PlaceCard`,
`WeightsEditor`, etc. have none either; savor has no component-rendering test infra, a known gap
tracked by issue #24 Thread 3). The logic it calls (`explainScore`/`scoreAcrossCategories`/
`summarizeScore`) already has full coverage from Task 1.

- [ ] **Step 2: Update CLAUDE.md's architecture tree**

In `CLAUDE.md`, find:

```
│       │   ├── PlaceFilters.tsx  #   status filter chips (All / Been / Want to try)
│       │   └── RatingEditor.tsx  #   per-criterion 1–5 editor → repo.setRating
```

Replace with:

```
│       │   ├── PlaceFilters.tsx  #   status filter chips (All / Been / Want to try)
│       │   ├── RatingEditor.tsx  #   per-criterion 1–5 editor → repo.setRating
│       │   └── ScoreBreakdown.tsx#   per-criterion weight/rating/why explanation, 2 mounts
```

- [ ] **Step 3: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green (this is a new, currently-unused file — `npm run build`/`tsc` confirms it at
least compiles standalone; it has no callers until Task 3).

- [ ] **Step 4: Commit**

```bash
git add app/components/places/ScoreBreakdown.tsx CLAUDE.md
git commit -m "feat(places): add the ScoreBreakdown component"
```

---

### Task 3: Mount 1 — place detail's score chips open a breakdown Sheet

**Files:**
- Modify: `app/places/[id]/page.tsx`

**Interfaces:**
- Consumes: `ScoreBreakdown` (Task 2); existing `useCategories`, `useCriteria` (already called
  in this file); existing `Sheet`, `Chip`.
- Produces: no new exports — `PlaceDetailPage`'s default export and props are unchanged.

- [ ] **Step 1: Add the `ScoreBreakdown` import and `Category`/`Criterion` types**

Change:

```tsx
import type { Place, PlaceStatus } from "@/lib/types";
```

to:

```tsx
import type { Category, Criterion, Place, PlaceStatus } from "@/lib/types";
```

Add, after the `RatingEditor` import:

```tsx
import ScoreBreakdown from "@/app/components/places/ScoreBreakdown";
```

- [ ] **Step 2: Add breakdown-sheet state**

In `PlaceDetailPage`, change:

```tsx
  const [editOpen, setEditOpen] = useState(false);
  const [ratingEditorOpen, setRatingEditorOpen] = useState(false);
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
```

to:

```tsx
  const [editOpen, setEditOpen] = useState(false);
  const [ratingEditorOpen, setRatingEditorOpen] = useState(false);
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [breakdownCategoryId, setBreakdownCategoryId] = useState<string | null>(null);
```

- [ ] **Step 3: Make each per-list score chip open the breakdown**

Change:

```tsx
              return (
                <Chip key={categoryId}>
                  <span className="mr-1">
                    {category.emoji ? `${category.emoji} ` : ""}
                    {category.name}
                  </span>
                  <ScoreBadge score={score} size="sm" />
                </Chip>
              );
```

to:

```tsx
              return (
                <Chip key={categoryId} onClick={() => setBreakdownCategoryId(categoryId)}>
                  <span className="mr-1">
                    {category.emoji ? `${category.emoji} ` : ""}
                    {category.name}
                  </span>
                  <ScoreBadge score={score} size="sm" />
                </Chip>
              );
```

- [ ] **Step 4: Mount the breakdown Sheet**

Change:

```tsx
      {ratingEditorOpen ? (
        <RatingEditor place={place} onClose={() => setRatingEditorOpen(false)} />
      ) : null}

      <VisitForm open={visitFormOpen} onClose={() => setVisitFormOpen(false)} placeId={place.id} />
    </>
  );
}
```

to:

```tsx
      {ratingEditorOpen ? (
        <RatingEditor place={place} onClose={() => setRatingEditorOpen(false)} />
      ) : null}

      <VisitForm open={visitFormOpen} onClose={() => setVisitFormOpen(false)} placeId={place.id} />

      {breakdownCategoryId && categories !== undefined && criteria !== undefined ? (
        <ScoreBreakdownSheet
          place={currentPlace}
          categoryId={breakdownCategoryId}
          categories={categories}
          criteria={criteria}
          onClose={() => setBreakdownCategoryId(null)}
        />
      ) : null}
    </>
  );
}
```

(`currentPlace` — not `place` — because this JSX sits below the earlier `place === undefined`
guard's closures-narrowing note (line ~96-100 in the existing file): `currentPlace: Place` is the
already-narrowed rebinding this file already uses for the same reason in `handleStatusToggle`/
`toggleCategory`, and `ScoreBreakdownSheet` below needs `place: Place`, not `Place | undefined`.)

- [ ] **Step 5: Add the `ScoreBreakdownSheet` wrapper**

At the end of the file (after `PlaceEditSheet`'s closing brace), add:

```tsx

function ScoreBreakdownSheet({
  place,
  categoryId,
  categories,
  criteria,
  onClose,
}: {
  place: Place;
  categoryId: string;
  categories: Category[];
  criteria: Criterion[];
  onClose: () => void;
}) {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;

  return (
    <Sheet title="Score breakdown" onClose={onClose}>
      <ScoreBreakdown place={place} category={category} categories={categories} criteria={criteria} />
    </Sheet>
  );
}
```

- [ ] **Step 6: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green.

- [ ] **Step 7: Manually verify in the browser**

Start the dev server (`npm run dev -- -p 3001` if 3000 is in use), open a place that belongs to
at least one list and has at least one live, weighted, rated criterion (so its score chip
renders). Confirm:
- Tapping the list's score chip on place detail opens a "Score breakdown" sheet.
- The sheet shows the score seal, the list name, one row per live criterion with its `×weight`
  and a gold bar proportional to the rating (0 width when unrated), "Excluded from score" for a
  weight-0 criterion, "Not rated" for an unrated one (dim `sage-deep` bar in both cases), and a
  plain-language sentence at the bottom.
- If the place belongs to a second list with a different score, the sentence names that list and
  what the same ratings would score there. If it belongs to only one list, the sentence stops
  after naming (or declining to name) a dominant criterion.
- Every piece of text in the sheet is legibly `cream`-toned against the sheet's `bg-raised` body
  (no sage anywhere) — this is the contrast bug class called out in Global Constraints.
- Closing the sheet (Escape, backdrop tap, × button) returns to place detail normally.

- [ ] **Step 8: Commit**

```bash
git add app/places/\[id\]/page.tsx
git commit -m "feat(places): open a score breakdown sheet from place detail's list chips"
```

---

### Task 4: `useLongPress` — long-press (touch) / hover-intent (mouse) gesture hook

**Files:**
- Create: `lib/useLongPress.ts`
- Modify: `CLAUDE.md` (architecture tree)

**Interfaces:**
- Consumes: React (`useEffect`, `useRef`, `useState`), the Pointer Events API, `navigator.vibrate`
  (feature-guarded), `window.matchMedia`.
- Produces: `export function useLongPress(): { open: boolean; consumeTrigger: () => boolean;
  handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerEnter,
  onPointerLeave, onContextMenu } }`. Consumed by Task 5's `RankedPlaceRow`.

- [ ] **Step 1: Write the hook**

Create `lib/useLongPress.ts`:

```ts
"use client";

// Long-press (touch/pen, ~450ms) / hover-intent (mouse, ~600ms, `(pointer: fine)` only) gesture
// for the ranked-list score peek (app/categories/[id]/page.tsx). Same category of hook as
// useModalA11y.ts: uses React + DOM, lives in lib/ because it's a reusable interaction primitive,
// not page-specific JSX.
//
// This is NOT a modal: the peek it drives is `aria-hidden`, never focus-trapped, and dismissed
// by pointerup/pointercancel/pointerleave, Escape, or any scroll — matching the spec's "the peek
// is an accelerator, never the only path" constraint (CLAUDE.md Product decisions).

import { useEffect, useRef, useState } from "react";

const TOUCH_DELAY_MS = 450;
const HOVER_DELAY_MS = 600;
const MOVE_CANCEL_PX = 10;

export function useLongPress(): {
  open: boolean;
  /** Call at the top of the row's onClick. Returns true (and resets) if the open peek was
   *  triggered by a touch long-press — meaning the click that just fired is the same gesture's
   *  pointerup-then-click, not a separate tap, and navigation should be suppressed. Always false
   *  for a mouse-hover-triggered peek, so a real mouse click still navigates normally. */
  consumeTrigger: () => boolean;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
} {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const triggeredRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function schedule(delayMs: number, suppressNextClick: boolean) {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (suppressNextClick) triggeredRef.current = true;
      if (typeof navigator.vibrate === "function") navigator.vibrate(10);
      setOpen(true);
    }, delayMs);
  }

  function dismiss() {
    clearTimer();
    startRef.current = null;
    setOpen(false);
  }

  // Escape / scroll dismissal only while the peek is actually open. `{ capture: true }` on the
  // scroll listener catches a scroll anywhere in the DOM tree (scroll events don't bubble), not
  // just a direct window scroll — same trick used for detecting scroll inside a nested
  // scrollable container without one listener per container.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    function onScroll() {
      dismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return {
    open,
    consumeTrigger() {
      if (!triggeredRef.current) return false;
      triggeredRef.current = false;
      return true;
    },
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        if (e.pointerType === "mouse") return; // mouse uses hover-intent below, not this timer
        startRef.current = { x: e.clientX, y: e.clientY };
        schedule(TOUCH_DELAY_MS, true);
      },
      onPointerMove(e: React.PointerEvent) {
        if (!startRef.current) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearTimer();
      },
      onPointerUp() {
        clearTimer();
        if (open) dismiss();
      },
      onPointerCancel() {
        clearTimer();
        dismiss();
      },
      onPointerEnter(e: React.PointerEvent) {
        if (e.pointerType !== "mouse") return;
        if (!window.matchMedia("(pointer: fine)").matches) return;
        schedule(HOVER_DELAY_MS, false); // a real mouse click must still navigate — see consumeTrigger
      },
      onPointerLeave() {
        clearTimer();
        if (open) dismiss();
      },
      onContextMenu(e: React.MouseEvent) {
        // Only suppress iOS's native callout during/after an active touch long-press
        // (startRef is only set by the touch path in onPointerDown, and `open` covers the case
        // where the callout would otherwise appear over our own peek). A desktop right-click —
        // startRef stays null, open stays false — is untouched, so "open link in new tab" etc.
        // keeps working on the same row.
        if (startRef.current !== null || open) e.preventDefault();
      },
    },
  };
}
```

- [ ] **Step 2: Update CLAUDE.md's architecture tree**

In `CLAUDE.md`, find:

```
│   ├── useModalA11y.ts          # focus trap + Escape-to-close + body scroll-lock for overlays
│   └── *.test.ts                # Vitest suites across lib/ (db, repo, hooks, ranking, lookup, photon, autocomplete, backup) and lib/social/ (index, parse, pickUrl)
```

Replace with:

```
│   ├── useModalA11y.ts          # focus trap + Escape-to-close + body scroll-lock for overlays
│   ├── useLongPress.ts          # long-press/hover-intent peek gesture (categories/[id]'s ranked rows)
│   └── *.test.ts                # Vitest suites across lib/ (db, repo, hooks, ranking, lookup, photon, autocomplete, backup) and lib/social/ (index, parse, pickUrl)
```

- [ ] **Step 3: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green (this file has no callers yet, same as Task 2 — `tsc`/build confirm it
compiles standalone).

- [ ] **Step 4: Commit**

```bash
git add lib/useLongPress.ts CLAUDE.md
git commit -m "feat: add useLongPress, the long-press/hover-intent peek gesture hook"
```

---

### Task 5: Mount 2 — long-press/hover peek over the ranked list, and pin the two non-negotiable constraints

**Files:**
- Modify: `app/categories/[id]/page.tsx`
- Modify: `CLAUDE.md` (Product decisions)

**Interfaces:**
- Consumes: `useLongPress` (Task 4), `ScoreBreakdown` (Task 2), `useCategories`/`useCriteria`
  (already exported from `lib/hooks.ts`, not yet called in this file), `RankedEntry` (already
  exported from `lib/ranking.ts`).
- Produces: no new exports — `CategoryDetailPage`'s default export is unchanged. Adds a
  page-local `RankedPlaceRow` component (same file, same pattern as the existing page-local
  `TabButton`).

- [ ] **Step 1: Add the new hook calls and imports**

Change:

```tsx
import { useCategory, useRankedCategory } from "@/lib/hooks";
import { Chip, EmptyState, HeaderShell, ScoreBadge } from "@/app/components/ui";
import CategoryForm from "@/app/components/categories/CategoryForm";
import WeightsEditor from "@/app/components/categories/WeightsEditor";
```

to:

```tsx
import { useCategories, useCategory, useCriteria, useRankedCategory } from "@/lib/hooks";
import { Chip, EmptyState, HeaderShell, ScoreBadge } from "@/app/components/ui";
import CategoryForm from "@/app/components/categories/CategoryForm";
import WeightsEditor from "@/app/components/categories/WeightsEditor";
import ScoreBreakdown from "@/app/components/places/ScoreBreakdown";
import { useLongPress } from "@/lib/useLongPress";
import type { RankedEntry } from "@/lib/ranking";
import type { Category, Criterion } from "@/lib/types";
```

In `CategoryDetailInner`, change:

```tsx
  const category = useCategory(id);
  const rankedData = useRankedCategory(id);
```

to:

```tsx
  const category = useCategory(id);
  const rankedData = useRankedCategory(id);
  const categories = useCategories();
  const criteria = useCriteria();
```

- [ ] **Step 2: Replace the inline ranked row with `RankedPlaceRow`**

Change:

```tsx
            <ul className="flex flex-col">
              {ranked.map((entry) => (
                <li key={entry.place.id} className="border-t border-rule">
                  <Link
                    href={`/places/${entry.place.id}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep"
                  >
                    <span className="tabular w-10 shrink-0 font-util text-[0.6875rem] font-semibold text-sage">
                      #{entry.rank}
                      {entry.tied ? " =" : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.95rem] text-cream">{entry.place.name}</p>
                      {entry.place.address ? (
                        <p className="mt-0.5 truncate text-[0.6875rem] text-sage">
                          {entry.place.address}
                        </p>
                      ) : null}
                    </div>
                    <ScoreBadge score={entry.score} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
```

to:

```tsx
            <ul className="flex flex-col">
              {ranked.map((entry) => (
                <RankedPlaceRow
                  key={entry.place.id}
                  entry={entry}
                  category={category}
                  categories={categories ?? []}
                  criteria={criteria ?? []}
                />
              ))}
            </ul>
```

(`categories ?? []` / `criteria ?? []`: these are separate live queries from `rankedData` and may
resolve a tick later. The peek itself can't appear before a 450-600ms gesture completes, by which
point both — near-instant IndexedDB reads, per this file's own existing comments — have
certainly resolved; defaulting to `[]` meanwhile just means an empty-contributions breakdown
would render for an instant if someone managed to peek in that impossible window, not a crash.)

- [ ] **Step 3: Add the `RankedPlaceRow` component**

At the end of the file (after `TabButton`'s closing brace), add:

```tsx

function RankedPlaceRow({
  entry,
  category,
  categories,
  criteria,
}: {
  entry: RankedEntry;
  category: Category;
  categories: Category[];
  criteria: Criterion[];
}) {
  const longPress = useLongPress();

  return (
    <li className="relative border-t border-rule">
      <Link
        href={`/places/${entry.place.id}`}
        className="flex min-h-11 select-none items-center gap-3 px-4 py-3.5 transition [-webkit-touch-callout:none] active:bg-ground-deep"
        onClick={(e) => {
          if (longPress.consumeTrigger()) e.preventDefault();
        }}
        {...longPress.handlers}
      >
        <span className="tabular w-10 shrink-0 font-util text-[0.6875rem] font-semibold text-sage">
          #{entry.rank}
          {entry.tied ? " =" : ""}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] text-cream">{entry.place.name}</p>
          {entry.place.address ? (
            <p className="mt-0.5 truncate text-[0.6875rem] text-sage">{entry.place.address}</p>
          ) : null}
        </div>
        <ScoreBadge score={entry.score} size="sm" />
      </Link>

      {longPress.open ? (
        // aria-hidden + pointer-events-none: the peek is an accelerator only, never the only
        // path to this information (CLAUDE.md Product decisions) — not discoverable, not
        // keyboard-reachable. The canonical, fully-accessible route is the same ScoreBreakdown
        // mounted from place detail's Sheet (Task 3).
        <div aria-hidden className="pointer-events-none absolute inset-x-4 top-full z-30 -mt-1">
          <div className="rounded-sm border border-rule bg-raised p-4 shadow-2xl">
            <ScoreBreakdown
              place={entry.place}
              category={category}
              categories={categories}
              criteria={criteria}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 4: Pin the two non-negotiable constraints in CLAUDE.md**

In `CLAUDE.md`, find the end of the "No component library — decided, not defaulted" bullet
(the last bullet in "Product decisions"), which ends:

```
  needs a hard accessibility state machine, adopting a *headless* primitive for
  that one interaction is a separate decision on its own merits, and is not
  foreclosed by this.
```

Replace with:

```
  needs a hard accessibility state machine, adopting a *headless* primitive for
  that one interaction is a separate decision on its own merits, and is not
  foreclosed by this.
- **The score-breakdown long-press/hover-intent peek is an accelerator, never the only
  path.** It is not discoverable, not keyboard-reachable, and not exposed to screen readers —
  its container is `aria-hidden` and never receives focus. The canonical, fully-accessible route
  to the same information is `ScoreBreakdown` mounted in a `Sheet` from place detail's score
  chips. Any future mount of the peek elsewhere must keep this property, not just the two mounts
  that exist today.
- **`navigator.vibrate()` is Android-only.** Safari has never implemented the Vibration API and
  there is no web equivalent for the Taptic Engine. Every call must be feature-guarded
  (`typeof navigator.vibrate === "function"`); no copy or comment may imply iOS gets a haptic
  tick from the long-press peek.
```

- [ ] **Step 5: Run the full verification suite**

Run: `npm test && npm run build && npm run lint`
Expected: all green.

- [ ] **Step 6: Manually verify in the browser**

Open a category detail page's Ranked tab with at least one place. On a touch device (or Chrome
DevTools' touch emulation):
- Press and hold a ranked row for under half a second, release before it triggers: the row
  navigates normally (a short tap still works).
- Press and hold past ~450ms: a floating card appears below the row showing that place's score
  breakdown for this list (score seal, list name, per-criterion rows with weight and bar,
  summary sentence). Confirm the phone vibrates briefly (Android) or just shows the visual peek
  with no vibration (iOS/Safari — this is correct, not a bug).
- Moving your finger more than ~10px before 450ms cancels the peek and the row still navigates
  normally on release (a scroll-starting touch doesn't accidentally trigger it).
- Releasing after the peek is showing dismisses it **without** navigating to the place.
- Scrolling the page while the peek is open dismisses it.

On desktop (mouse):
- Hovering a ranked row for ~600ms shows the same peek; moving the mouse away dismisses it.
- Clicking the row (a real, deliberate click) always navigates to the place, whether or not a
  peek happened to be showing from a preceding hover.
- Right-clicking a ranked row (no peek active) still shows the normal browser context menu
  ("Open link in new tab" etc.) — the `onContextMenu` guard must not have broken this.
- Pressing Escape while a peek is open (either input method) dismisses it.

- [ ] **Step 7: Commit**

```bash
git add app/categories/\[id\]/page.tsx CLAUDE.md
git commit -m "feat(categories): long-press/hover peek shows the score breakdown over ranked rows"
```

---

## Verification

1. `npm test`, `npm run build`, `npm run lint` green after every task.
2. `lib/ranking.test.ts` covers `explainScore`, `dominantContribution`, `scoreAcrossCategories`,
   and `summarizeScore` — the only genuinely new logic in this plan; everything downstream of it
   (the component, the two mounts, the gesture hook) is presentation with no independent test
   infra, matching this codebase's existing, documented limitation (issue #24 Thread 3).
3. Manual browser pass (per Tasks 3 and 5's steps) over both mounts, on both a touch-emulated and
   a real mouse input, checking specifically for: the contrast floor (no `sage` text on the
   `bg-raised` breakdown), the iOS-no-vibration case, and that a real click always navigates
   regardless of a preceding hover-triggered peek.
4. Confirm `lib/theme-contract.test.ts` still passes with zero legacy-token/raw-hex violations —
   this plan introduces no new colors outside existing tokens.

## Risks

- **The long-press pointer-tracking is the riskiest thing in this plan** (mirroring the design
  spec's own note that Phase 4's drag-to-dismiss is its riskiest item, for the same reason:
  hand-rolled pointer-event state machines are easy to get subtly wrong on real touch hardware in
  ways no unit test catches). Task 5 Step 6's manual pass is not optional polish — it's the only
  verification this behavior gets.
- **`consumeTrigger`'s click-suppression only applies to the touch path, by design** — a
  mouse-hover-triggered peek must never block a real click from navigating (see Task 4's
  `onPointerEnter` comment). Getting this backwards would make every list row un-clickable
  on desktop after a hover, which is a severe, easy-to-miss-in-a-quick-check regression — the
  manual pass explicitly checks "clicking always navigates" for this reason.
- **Existing places/categories with only one list, or only one rated criterion,** will often hit
  `summarizeScore`'s fallback branches (no dominant criterion named, no divergence sentence) —
  confirmed correct by Task 1's tests, but worth another look in Task 3/5's manual passes to make
  sure the shorter sentence still reads naturally rather than looking cut off.

## Non-goals

| Deferred | Why |
| --- | --- |
| Editing weights from inside the breakdown | Still only via the existing `WeightsEditor` sheet — `ScoreBreakdown` is read-only, matching its "explain, don't edit" purpose |
| A tap/long-press breakdown on the Places-tab (ungrouped) score badge | That badge isn't scoped to any `Category` (it's an implicit all-weight-1 average, `PlaceCard.tsx`'s `compositeScore(place.ratings, {}, liveCriterionIds)`), so it has no "how this scores in another list" hook — Phase 3 scopes the breakdown to explicit list context |
| Sheet drag-to-dismiss, sheet-history back button, #9's confirm-step/`useId` a11y bundle | Phase 4 |
| Desktop ≥`md` layout | Phase 5 |
| Playwright + the nine journeys | Phase 6 — gated on the "ask before adding a dependency" rule |
| Historical score-over-time / trend view | Not in the spec; a bigger feature on its own |
