"use client";

// WeightsEditor — sheet with one integer 0–5 stepper per LIVE criterion (tombstoned criteria
// never appear, matching lib/ranking's liveCriterionIds). A missing key in category.weights
// displays as 1 (that's the semantic per lib/ranking's compositeScore: `weights[id] ?? 1`); 0
// means "excluded" and gets a hint. Save issues exactly one setWeights() call with every live
// criterion's value written explicitly, so the stored record is always complete — no silent
// gaps for criteria the user didn't touch. Rankings recompute live afterwards via
// useRankedCategory; this component does no manual refresh.

import { useState } from "react";
import { useCriteria } from "@/lib/hooks";
import { setWeights } from "@/lib/repo";
import type { Category } from "@/lib/types";
import Sheet from "@/app/components/Sheet";
import { EmptyState } from "@/app/components/ui";
import { toast } from "@/app/components/Toast";

export default function WeightsEditor({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const criteria = useCriteria();
  // Only the keys the user has actually touched this session; everything else falls back to
  // category.weights[id] ?? 1 via valueFor below.
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  function valueFor(id: string): number {
    if (id in edits) return edits[id];
    return category.weights[id] ?? 1;
  }

  function bump(id: string, delta: number) {
    const next = Math.min(5, Math.max(0, valueFor(id) + delta));
    setEdits((prev) => ({ ...prev, [id]: next }));
  }

  async function handleSave() {
    if (!criteria || criteria.length === 0) return;
    setSaving(true);
    try {
      const complete: Record<string, number> = {};
      for (const c of criteria) {
        complete[c.id] = valueFor(c.id);
      }
      await setWeights(category.id, complete);
      toast("Weights saved");
      onClose();
    } catch {
      toast("Couldn't save weights — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Weights"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !criteria || criteria.length === 0}
          className="flex min-h-11 w-full items-center justify-center rounded-full bg-plum px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-plum-deep disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      {criteria === undefined ? null : criteria.length === 0 ? (
        <EmptyState
          emoji="⚖️"
          title="No criteria yet"
          hint="Add rating criteria in Settings, then weight them here per list."
        />
      ) : (
        <div className="flex flex-col divide-y divide-line py-1">
          {criteria.map((c) => {
            const value = valueFor(c.id);
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.95rem] font-medium text-ink">{c.name}</p>
                  {value === 0 ? (
                    <p className="text-xs text-ink-soft">Excluded from score</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Decrease ${c.name} weight`}
                    onClick={() => bump(c.id, -1)}
                    disabled={value <= 0}
                    className="grid h-11 w-11 place-items-center rounded-full text-lg font-semibold text-plum transition active:scale-90 active:bg-surface-sunk disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="tabular w-6 text-center text-base font-semibold text-ink">
                    {value}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${c.name} weight`}
                    onClick={() => bump(c.id, 1)}
                    disabled={value >= 5}
                    className="grid h-11 w-11 place-items-center rounded-full text-lg font-semibold text-plum transition active:scale-90 active:bg-surface-sunk disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
