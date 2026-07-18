"use client";

// VisitForm — the "log a visit" sheet, opened either from the Journal tab (standalone: the user
// picks a place from a searchable list) or from a place's detail page (fixed: the place is
// already known, no picker). EXPORTED PROP CONTRACT: a later task (place detail) imports this
// exact `{ open, onClose, placeId? }` shape — don't change it without updating that caller too.
//
// `open` gates whether this module renders a <Sheet> at all (split into VisitForm/VisitFormPanel
// below) rather than toggling visibility on an always-mounted sheet: Sheet's focus trap
// (useModalA11y) runs once per mount, and the panel's field state should start blank on every
// open — both need a real mount/unmount, not a hidden style. No rating-nudge here: that lands
// with the place-detail task's RatingEditor.

import { useMemo, useState, type ReactNode } from "react";
import { usePlaces } from "@/lib/hooks";
import { createVisit } from "@/lib/repo";
import Sheet from "../Sheet";
import { toast } from "../Toast";

export interface VisitFormProps {
  open: boolean;
  onClose: () => void;
  placeId?: string;
}

export default function VisitForm({ open, onClose, placeId }: VisitFormProps) {
  if (!open) return null;
  return <VisitFormPanel onClose={onClose} placeId={placeId} />;
}

// Local-timezone YYYY-MM-DD, matching the format `<input type="date">` produces/consumes.
// Deliberately not toISOString() (UTC) — that can read as the wrong calendar day near midnight
// in timezones behind UTC.
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function VisitFormPanel({ onClose, placeId }: { onClose: () => void; placeId?: string }) {
  // Single hook covers both modes: fixed mode looks its place up in the same list rather than
  // adding a second usePlace() query.
  const places = usePlaces();
  const fixedPlace = useMemo(
    () => (placeId ? places?.find((p) => p.id === placeId) : undefined),
    [places, placeId]
  );

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>(placeId);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(todayStr());
  const [dishes, setDishes] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredPlaces = useMemo(() => {
    if (!places) return undefined;
    const term = search.trim().toLowerCase();
    if (!term) return places;
    return places.filter((p) => p.name.toLowerCase().includes(term));
  }, [places, search]);

  const canSave = Boolean(selectedPlaceId) && Boolean(date) && !saving;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSave || !selectedPlaceId) return;
    setSaving(true);
    try {
      await createVisit({
        placeId: selectedPlaceId,
        date,
        dishes: dishes.trim(),
        notes: notes.trim(),
      });
      toast("Logged");
      onClose();
    } catch {
      toast("Couldn't save that visit");
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Log a visit"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="visit-form"
          disabled={!canSave}
          className="flex min-h-11 w-full items-center justify-center rounded-full bg-ember px-5 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-[0.98] active:bg-ember-deep disabled:opacity-40 disabled:active:scale-100"
        >
          {saving ? "Saving…" : "Save visit"}
        </button>
      }
    >
      <form id="visit-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            Place
          </p>
          {placeId ? (
            <p className="rounded-xl bg-surface-sunk px-3.5 py-2.5 text-[0.95rem] font-medium text-ink">
              {fixedPlace?.name ?? "…"}
            </p>
          ) : places === undefined ? (
            <p className="px-0.5 text-sm text-ink-soft">Loading places…</p>
          ) : places.length === 0 ? (
            <p className="rounded-xl bg-surface-sunk px-3.5 py-2.5 text-sm text-ink-soft">
              Add a place first with ＋
            </p>
          ) : (
            <div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your places…"
                aria-label="Search places"
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-soft/70 focus-visible:outline-2 focus-visible:outline-plum"
              />
              <div
                role="radiogroup"
                aria-label="Select a place"
                className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-line bg-surface p-1.5"
              >
                {filteredPlaces && filteredPlaces.length === 0 ? (
                  <p className="px-2.5 py-2 text-sm text-ink-soft">
                    No places match &ldquo;{search}&rdquo;.
                  </p>
                ) : (
                  filteredPlaces?.map((p) => {
                    const selected = p.id === selectedPlaceId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setSelectedPlaceId(p.id)}
                        className={`min-h-11 rounded-lg px-3 py-2 text-left text-[0.95rem] transition active:scale-[0.99] ${
                          selected
                            ? "bg-plum-tint font-medium text-plum"
                            : "text-ink active:bg-surface-sunk"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <Field label="Date" htmlFor="visit-date">
          <input
            id="visit-date"
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink focus-visible:outline-2 focus-visible:outline-plum"
          />
        </Field>

        <Field label="Dishes" htmlFor="visit-dishes">
          <input
            id="visit-dishes"
            type="text"
            value={dishes}
            onChange={(e) => setDishes(e.target.value)}
            placeholder="What did you eat?"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-soft/70 focus-visible:outline-2 focus-visible:outline-plum"
          />
        </Field>

        <Field label="Notes" htmlFor="visit-notes" optional>
          <textarea
            id="visit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="How was it?"
            className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-soft/70 focus-visible:outline-2 focus-visible:outline-plum"
          />
        </Field>
      </form>
    </Sheet>
  );
}

function Field({
  label,
  htmlFor,
  optional = false,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-soft"
      >
        {label}
        {optional ? <span className="normal-case tracking-normal"> (optional)</span> : null}
      </label>
      {children}
    </div>
  );
}
