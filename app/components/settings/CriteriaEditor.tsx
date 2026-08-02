"use client";

// CriteriaEditor — the list of rating criteria used to score places (T5's Criterion entity).
// Reads via useCriteria (sortOrder asc, live), writes via lib/repo — never touches Dexie
// directly. Supports inline rename, up/down reorder (swaps sortOrder with a neighbor via two
// updateCriterion calls), delete-with-confirm (states the ranking consequence — deleteCriterion
// only tombstones the criterion row; it never touches place.ratings, so already-entered scores
// for it just stop being counted by lib/ranking's live-criterion filter), and add-at-bottom
// (ignores empty/duplicate names, case-insensitively, with a toast explaining why).

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "@/app/components/Toast";
import { useCriteria } from "@/lib/hooks";
import { createCriterion, deleteCriterion, updateCriterion } from "@/lib/repo";
import type { Criterion } from "@/lib/types";

export default function CriteriaEditor() {
  const criteria = useCriteria();
  // List-level lock: disables every row's reorder buttons while ANY swap is in flight. A
  // per-row lock isn't enough — two rapid taps on *different* rows can each read a
  // pre-swap sortOrder snapshot and race (see moveCriterion below), so the lock has to cover
  // the whole list, not just the row that was tapped.
  const [reordering, setReordering] = useState(false);

  // Looks up the tapped criterion and its neighbor from `criteria` (the live-query result for
  // *this* render) at call time, rather than trusting sortOrder/neighbor values a row captured
  // as props at its last render — those can go stale the instant another row's swap commits.
  async function moveCriterion(id: string, direction: "up" | "down") {
    if (reordering) return;
    const list = criteria ?? [];
    const index = list.findIndex((c) => c.id === id);
    if (index === -1) return;
    const neighborIndex = direction === "up" ? index - 1 : index + 1;
    const current = list[index];
    const neighbor = list[neighborIndex];
    if (!neighbor) return;

    setReordering(true);
    try {
      await Promise.all([
        updateCriterion(current.id, { sortOrder: neighbor.sortOrder }),
        updateCriterion(neighbor.id, { sortOrder: current.sortOrder }),
      ]);
    } catch {
      toast("Couldn't reorder — try again", true);
    } finally {
      setReordering(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {criteria === undefined ? (
        <p className="px-1 text-sm text-sage">Loading…</p>
      ) : criteria.length === 0 ? (
        <p className="rounded-sm bg-ground-deep px-3.5 py-3 text-sm text-sage">
          No rating criteria yet — add one below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {criteria.map((criterion, index) => (
            <li key={criterion.id}>
              <CriterionRow
                criterion={criterion}
                canMoveUp={index > 0}
                canMoveDown={index < criteria.length - 1}
                reordering={reordering}
                onMove={moveCriterion}
              />
            </li>
          ))}
        </ul>
      )}

      <AddCriterionRow existing={criteria ?? []} />
    </div>
  );
}

function CriterionRow({
  criterion,
  canMoveUp,
  canMoveDown,
  reordering,
  onMove,
}: {
  criterion: Criterion;
  canMoveUp: boolean;
  canMoveDown: boolean;
  reordering: boolean;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(criterion.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set right before an Escape-triggered setEditing(false); guards the ensuing blur (unmounting
  // a focused input can fire one) so cancel never re-triggers a commit.
  const skipBlurRef = useRef(false);

  function startEditing() {
    setDraft(criterion.name);
    setEditing(true);
  }

  async function commit() {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === criterion.name) return;
    try {
      await updateCriterion(criterion.id, { name: trimmed });
    } catch {
      toast(`Couldn't rename "${criterion.name}" — try again`);
    }
  }

  function cancelEditing() {
    skipBlurRef.current = true;
    setDraft(criterion.name);
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteCriterion(criterion.id);
      toast(`Deleted “${criterion.name}”`);
    } catch {
      toast(`Couldn't delete "${criterion.name}" — try again`);
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="rounded-sm border border-rule bg-raised px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5">
        {/* Side-by-side (not stacked) so each reorder button keeps a full 44px touch target
            without ballooning the row's height. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(criterion.id, "up")}
            disabled={!canMoveUp || reordering}
            aria-label={`Move ${criterion.name} up`}
            className="grid h-11 w-11 place-items-center rounded-sm text-sage transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-25"
          >
            <ChevronGlyph direction="up" />
          </button>
          <button
            type="button"
            onClick={() => onMove(criterion.id, "down")}
            disabled={!canMoveDown || reordering}
            aria-label={`Move ${criterion.name} down`}
            className="grid h-11 w-11 place-items-center rounded-sm text-sage transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-25"
          >
            <ChevronGlyph direction="down" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              aria-label={`Rename ${criterion.name}`}
              className="min-h-11 w-full rounded-sm border border-gold bg-raised px-3 py-2 text-base text-cream outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="min-h-11 w-full truncate rounded-sm px-3 py-2 text-left text-base text-cream transition active:bg-ground-deep"
            >
              {criterion.name}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={busy}
          aria-label={`Delete ${criterion.name}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-sage transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-40"
        >
          <TrashGlyph className="h-4 w-4" />
        </button>
      </div>

      {confirmingDelete ? (
        <div className="mt-2.5 flex flex-col gap-3 rounded-sm bg-coral/10 p-3.5">
          <p className="text-sm text-cream">
            Delete “{criterion.name}”? Existing scores for this criterion will stop counting
            toward rankings.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="min-h-11 flex-1 rounded-sm bg-coral-deep px-4 text-sm font-semibold text-ground transition active:scale-[0.97] disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddCriterionRow({ existing }: { existing: Criterion[] }) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Give the criterion a name first");
      return;
    }
    const isDuplicate = existing.some(
      (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      toast(`“${trimmed}” is already a rating criterion`);
      return;
    }

    setAdding(true);
    try {
      const nextSortOrder =
        existing.length === 0 ? 0 : Math.max(...existing.map((c) => c.sortOrder)) + 1;
      await createCriterion({ name: trimmed, sortOrder: nextSortOrder });
      setName("");
      toast(`Added “${trimmed}”`);
    } catch {
      toast(`Couldn't add "${trimmed}" — try again`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={handleAdd} className="mt-1 flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add a criterion…"
        aria-label="New criterion name"
        className="min-h-11 flex-1 rounded-sm border border-rule bg-raised px-3.5 py-2.5 text-base text-cream outline-none focus-visible:border-gold"
      />
      <button
        type="submit"
        disabled={adding}
        className="min-h-11 shrink-0 rounded-sm bg-gold px-4 text-sm font-semibold text-ground transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}

function ChevronGlyph({ direction }: { direction: "up" | "down" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
      <path
        d={direction === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
