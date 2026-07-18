"use client";

// PlaceForm — the add-place flow (T8).
//
// AddPlaceHost is the sheet's host component: mount it once, high in the tree (see
// app/layout.tsx). It owns no data of its own besides "is the sheet open" — everything else
// lives in AddPlaceSheet, which is mounted/unmounted (not just hidden) as the sheet opens and
// closes, so a fresh form always starts from a clean slate with no manual reset step needed.
//
// Event contract (documented here since there's no other single place for it): the nav FAB and
// any "Add a place" empty-state button call `emitAddPlace()` (app/components/ui.tsx), which
// dispatches a bare `window` CustomEvent named by `ADD_PLACE_EVENT` — no payload, just an open
// signal. AddPlaceHost is the sole listener: `addEventListener` on mount, `removeEventListener`
// on cleanup. Any number of emitters, exactly one listener.
//
// Flow inside one sheet: name (required) -> optional OSM lookup (tap a result to autofill
// name/address/city/lat/lng) -> been/want_to_try status toggle (default "been") -> optional
// cuisine/notes -> category checkboxes (useCategories) -> if status is "been", one skippable
// RatingRow per live criterion (useCriteria) -> Save builds the ratings record from whichever
// rows were touched and makes exactly one repo.createPlace call. Cancel / the sheet's own
// close button / backdrop tap all close without saving (Sheet's onClose, unchanged).

import { useEffect, useState } from "react";
import { useCategories, useCriteria } from "@/lib/hooks";
import { searchPlaces, type LookupResult } from "@/lib/lookup";
import { createPlace } from "@/lib/repo";
import type { PlaceStatus } from "@/lib/types";
import Sheet from "../Sheet";
import { toast } from "../Toast";
import { ADD_PLACE_EVENT, Chip, RatingRow } from "../ui";

function emptyForm() {
  return {
    name: "",
    status: "been" as PlaceStatus,
    cuisine: "",
    notes: "",
    address: undefined as string | undefined,
    city: undefined as string | undefined,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    categoryIds: [] as string[],
    ratings: {} as Record<string, number>,
  };
}

export function AddPlaceHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }
    window.addEventListener(ADD_PLACE_EVENT, handleOpen);
    return () => window.removeEventListener(ADD_PLACE_EVENT, handleOpen);
  }, []);

  // Mounted only while open, so every fresh open gets a fresh AddPlaceSheet instance (and thus
  // fresh state) — no explicit "reset the form" step required on close.
  if (!open) return null;
  return <AddPlaceSheet onClose={() => setOpen(false)} />;
}

function AddPlaceSheet({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const criteria = useCriteria();

  const [form, setForm] = useState(emptyForm);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);

  const trimmedName = form.name.trim();
  const canSave = trimmedName.length > 0 && !saving;

  async function handleLookup() {
    if (!trimmedName || lookupLoading) return;
    setLookupLoading(true);
    setSearched(false);
    // searchPlaces degrades to [] on any failure (bad shape, non-200, network throw) — a failed
    // lookup and a lookup with no matches look identical here, both land on the "nothing found"
    // hint below, and the form stays fully usable manually either way.
    const results = await searchPlaces(trimmedName);
    setLookupResults(results);
    setSearched(true);
    setLookupLoading(false);
  }

  function handleSelectResult(result: LookupResult) {
    setForm((f) => ({
      ...f,
      name: result.name,
      address: result.address,
      city: result.city,
      lat: result.lat,
      lng: result.lng,
    }));
    setLookupResults([]);
    setSearched(false);
  }

  function toggleCategory(id: string) {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((existing) => existing !== id)
        : [...f.categoryIds, id],
    }));
  }

  function handleRatingChange(criterionId: string, value: number | null) {
    setForm((f) => {
      const ratings = { ...f.ratings };
      if (value === null) delete ratings[criterionId];
      else ratings[criterionId] = value;
      return { ...f, ratings };
    });
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await createPlace({
        name: trimmedName,
        status: form.status,
        cuisine: form.cuisine.trim() || undefined,
        address: form.address,
        city: form.city,
        lat: form.lat,
        lng: form.lng,
        notes: form.notes.trim() || undefined,
        categoryIds: form.categoryIds,
        ratings: form.status === "been" ? form.ratings : {},
      });
      toast(`Added ${trimmedName}`);
      onClose();
    } catch {
      toast("Couldn't save that place — try again");
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Add a place"
      onClose={onClose}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-full border border-line px-5 py-3 text-[0.95rem] font-semibold text-ink-soft transition active:scale-95 active:bg-surface-sunk"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="min-h-11 flex-1 rounded-full bg-ember px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-ember-deep disabled:pointer-events-none disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Name + OSM lookup */}
        <div>
          <label htmlFor="place-name" className="mb-1 block text-sm font-semibold text-ink-soft">
            Name
          </label>
          <input
            id="place-name"
            type="text"
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm((f) => ({ ...f, name }));
              // Editing the name invalidates any prior lookup — a stale result list (or "nothing
              // found" hint) shouldn't linger and look like it applies to the new text.
              setLookupResults([]);
              setSearched(false);
            }}
            placeholder="Taco Spot"
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
          />

          {trimmedName ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={handleLookup}
                disabled={lookupLoading}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface-sunk px-4 text-sm font-semibold text-plum transition active:scale-95 active:bg-line disabled:opacity-60"
              >
                {lookupLoading ? "Looking up…" : "Look up"}
              </button>
            </div>
          ) : null}

          {lookupResults.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {lookupResults.map((result, i) => (
                <li key={`${result.lat}-${result.lng}-${i}`}>
                  <button
                    type="button"
                    onClick={() => handleSelectResult(result)}
                    className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition active:scale-[0.99] active:bg-surface-sunk"
                  >
                    <p className="text-sm font-semibold leading-snug text-ink">{result.name}</p>
                    {result.address || result.city ? (
                      <p className="text-xs leading-snug text-ink-soft">
                        {result.address ?? result.city}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {searched && !lookupLoading && lookupResults.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Nothing found — add manually.</p>
          ) : null}
        </div>

        {/* Status */}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-soft">Status</p>
          <div className="flex gap-2">
            <Chip
              active={form.status === "been"}
              onClick={() => setForm((f) => ({ ...f, status: "been" }))}
            >
              Been
            </Chip>
            <Chip
              active={form.status === "want_to_try"}
              onClick={() => setForm((f) => ({ ...f, status: "want_to_try" }))}
            >
              Want to try
            </Chip>
          </div>
        </div>

        {/* Cuisine (optional) */}
        <div>
          <label htmlFor="place-cuisine" className="mb-1 block text-sm font-semibold text-ink-soft">
            Cuisine <span className="font-normal text-ink-soft/70">(optional)</span>
          </label>
          <input
            id="place-cuisine"
            type="text"
            value={form.cuisine}
            onChange={(e) => setForm((f) => ({ ...f, cuisine: e.target.value }))}
            placeholder="Mexican, ramen, pizza…"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
          />
        </div>

        {/* Notes (optional) */}
        <div>
          <label htmlFor="place-notes" className="mb-1 block text-sm font-semibold text-ink-soft">
            Notes <span className="font-normal text-ink-soft/70">(optional)</span>
          </label>
          <textarea
            id="place-notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="What to order, the vibe, anything worth remembering…"
            rows={3}
            className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
          />
        </div>

        {/* Category checkboxes */}
        {categories && categories.length > 0 ? (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-soft">Lists</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  active={form.categoryIds.includes(c.id)}
                  onClick={() => toggleCategory(c.id)}
                >
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        {/* Ratings — only when status is "been"; every row is skippable. */}
        {form.status === "been" && criteria && criteria.length > 0 ? (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-soft">
              Ratings <span className="font-normal text-ink-soft/70">(optional — skip any)</span>
            </p>
            <div className="flex flex-col gap-3">
              {criteria.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <span className="text-[0.95rem] text-ink">{c.name}</span>
                  <RatingRow
                    label={c.name}
                    value={form.ratings[c.id]}
                    onChange={(v) => handleRatingChange(c.id, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
