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
// dispatches a `window` CustomEvent named by `ADD_PLACE_EVENT` carrying an optional
// `PlacePrefill` in `detail` — undefined for the plain FAB/empty-state path, populated when the
// /import share-link route (T7) wants the sheet to open pre-seeded. AddPlaceHost is the sole
// listener: `addEventListener` on mount, `removeEventListener` on cleanup. Any number of
// emitters, exactly one listener.
//
// Flow inside one sheet: name (required, optionally pre-seeded) -> live OSM suggestions as you
// type (LookupCombobox owns the debounce/abort/cache timing — see lib/autocomplete.ts — and
// fires immediately, with no debounce, when the prefill asks for it) -> been/want_to_try status
// toggle (default "been", or "want_to_try" when opened from a prefill) -> optional cuisine/notes
// -> category checkboxes (useCategories) -> if status is
// "been", one skippable RatingRow per live criterion (useCriteria) -> Save builds the ratings
// record from whichever rows were touched and makes exactly one repo.createPlace call (carrying
// sourceUrl/sourcePlatform through when present). Cancel / the sheet's own close button /
// backdrop tap all close without saving (Sheet's onClose, unchanged).

import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useCategories, useCriteria } from "@/lib/hooks";
import type { LookupResult } from "@/lib/lookup";
import { createPlace } from "@/lib/repo";
import { resolveSharedLink } from "@/lib/social";
import { pickUrl } from "@/lib/social/pickUrl";
import type { PlaceStatus } from "@/lib/types";
import { useSheetParam } from "@/lib/useSheetParam";
import Sheet from "../Sheet";
import { toast } from "../Toast";
import { ADD_PLACE_EVENT, Chip, PasteLinkField, RatingRow, type PlacePrefill } from "../ui";
import LookupCombobox from "./LookupCombobox";

// Every text input, textarea and select in this form shares this exact treatment — see
// WAVE-CONSTRAINTS.md's "standard input treatment." text-base is mandatory: it's what stops
// iOS from focus-zooming the viewport when a field is tapped.
const INPUT_CLASS =
  "w-full rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2.5 text-base text-cream placeholder:text-cream/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold";

// Every field label (and section pseudo-label: Status / Lists / Ratings) shares this exact
// treatment too. These labels sit directly on the sheet's own bg-raised body (Sheet.tsx has no
// intermediate surface), where text-sage measures 3.85:1 and fails AA — so text-cream, not
// text-sage, is the correct pairing here.
const LABEL_CLASS =
  "mb-1.5 block font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-cream";

// Secondary "(optional)" annotations inline in a label: text-cream/80 measures 5.55:1 on
// bg-raised (passes); text-cream/60 measures 3.86:1 (fails) — so /80 is the floor here.
const OPTIONAL_CLASS = "font-normal text-cream/80";

function emptyForm(initial?: PlacePrefill) {
  return {
    name: initial?.name ?? "",
    status: (initial ? "want_to_try" : "been") as PlaceStatus,
    cuisine: "",
    notes: "",
    address: undefined as string | undefined,
    city: undefined as string | undefined,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    osmId: undefined as string | undefined,
    categoryIds: [] as string[],
    ratings: {} as Record<string, number>,
    sourceUrl: initial?.sourceUrl,
    sourcePlatform: initial?.sourcePlatform,
  };
}

export function AddPlaceHost() {
  const pathname = usePathname();
  const { open, openSheet, closeSheet } = useSheetParam("add");
  const [prefill, setPrefill] = useState<PlacePrefill | undefined>(undefined);

  // /categories owns ?sheet=add for its own "new list" form. Both sheets are opened by an
  // explicit user action on the surface that owns them, so they can never be asked for at
  // once — but this host is mounted app-wide, so it has to decline the param there.
  const owned = pathname !== "/categories";

  useEffect(() => {
    function handleOpen(e: Event) {
      setPrefill((e as CustomEvent<PlacePrefill | undefined>).detail);
      openSheet();
    }
    window.addEventListener(ADD_PLACE_EVENT, handleOpen);
    return () => window.removeEventListener(ADD_PLACE_EVENT, handleOpen);
  });

  // Mounted only while open, so every fresh open gets a fresh AddPlaceSheet instance (and thus
  // fresh state) — no explicit "reset the form" step required on close.
  if (!open || !owned) return null;
  return <AddPlaceSheet onClose={closeSheet} initial={prefill} />;
}

function AddPlaceSheet({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: PlacePrefill;
}) {
  const categories = useCategories();
  const criteria = useCriteria();

  const [form, setForm] = useState(() => emptyForm(initial));
  const [saving, setSaving] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteHint, setPasteHint] = useState(false);
  const [resolving, setResolving] = useState(false);
  // Bumped to ask LookupCombobox to search the current name immediately. The paste-a-link flow
  // resolves a venue name after mount, so it can't use the combobox's mount-time autoLookup.
  const [searchNonce, setSearchNonce] = useState(0);

  const trimmedName = form.name.trim();
  const canSave = trimmedName.length > 0 && !saving;

  async function handlePasteResolve(e: FormEvent) {
    e.preventDefault();
    const candidate = pickUrl(null, pasteValue);
    if (!candidate) {
      setPasteHint(true);
      return;
    }
    setPasteHint(false);
    setResolving(true);
    try {
      // resolveSharedLink is structurally guaranteed not to throw (see lib/social/index.ts) —
      // an unrecognized platform returns null, and each adapter's hydrate() degrades to a
      // URL-only result on any fetch/parse failure (see lib/social/tiktok.ts and
      // lib/social/instagram.ts). The try/finally here is defense in depth regardless, so
      // `resolving` can never get stuck true on a hypothetical throw.
      const link = await resolveSharedLink(candidate);
      setForm((f) => ({
        ...f,
        name: link?.nameGuess ?? f.name,
        // A resolved nameGuess replaces the name, same as a manual edit — so any
        // previously-captured location is just as stale here as it is in
        // handleNameChange above, for the same reason. No nameGuess means the name
        // (and thus the location) is untouched, so leave it alone.
        ...(link?.nameGuess
          ? { address: undefined, city: undefined, lat: undefined, lng: undefined, osmId: undefined }
          : null),
        sourceUrl: link?.url ?? candidate,
        sourcePlatform: link?.platform,
      }));
      setPasteOpen(false);
      setPasteValue("");
      // setPasteOpen(false) unmounts PasteLinkField while its input is still the focused
      // element — focus would otherwise fall back to <body>, from which the next Tab can
      // escape useModalA11y's focus trap (it only redirects Tab from the trap's exact
      // first/last element, see lib/useModalA11y.ts). The Name input is always present in the
      // DOM regardless of pasteOpen, so refocusing it here is safe with no timing concern.
      document.getElementById("place-name")?.focus();
      // The name just changed programmatically, and React doesn't fire the combobox's onChange
      // for that — so nothing would search for the venue we just resolved. Bumping the nonce is
      // the explicit ask.
      if (link?.nameGuess) setSearchNonce((n) => n + 1);
    } finally {
      setResolving(false);
    }
  }

  function handleSelectResult(result: LookupResult) {
    setForm((f) => ({
      ...f,
      name: result.name,
      address: result.address,
      city: result.city,
      lat: result.lat,
      lng: result.lng,
      osmId: result.osmId,
    }));
  }

  // A selection captures lat/lng/osmId alongside the name. If the user then edits the
  // name, that captured location is almost certainly wrong for the new name — and
  // unlike every other field here, lat/lng/osmId are never shown or editable anywhere
  // else in the app (see app/places/[id]/page.tsx's PlaceEditSheet), so a stale value
  // that slips into a saved Place can never be corrected through any UI. Clearing it on
  // edit is cheap insurance; the City/Address inputs below are what let the user see it happen.
  function handleNameChange(name: string) {
    setForm((f) =>
      f.lat === undefined && f.osmId === undefined
        ? { ...f, name }
        : {
            ...f,
            name,
            address: undefined,
            city: undefined,
            lat: undefined,
            lng: undefined,
            osmId: undefined,
          }
    );
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
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        lat: form.lat,
        lng: form.lng,
        osmId: form.osmId,
        notes: form.notes.trim() || undefined,
        categoryIds: form.categoryIds,
        ratings: form.status === "been" ? form.ratings : {},
        sourceUrl: form.sourceUrl,
        sourcePlatform: form.sourcePlatform,
      });
      toast(`Added ${trimmedName}`);
      onClose();
    } catch {
      toast("Couldn't save that place — try again", true);
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
            className="min-h-11 flex-1 rounded-sm border border-rule px-5 py-3 text-[0.95rem] font-semibold text-cream transition active:scale-95 active:bg-ground-deep"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="min-h-11 flex-1 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:pointer-events-none disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {form.sourceUrl ? (
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-sm font-semibold text-gold">
              {form.sourcePlatform === "instagram"
                ? "Imported from Instagram"
                : form.sourcePlatform === "tiktok"
                ? "Imported from TikTok"
                : "Source link attached"}
            </p>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, sourceUrl: undefined, sourcePlatform: undefined }))
              }
              className="min-h-11 shrink-0 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:opacity-70"
            >
              Remove
            </button>
          </div>
        ) : null}

        {!form.sourceUrl ? (
          <div>
            {pasteOpen ? (
              <PasteLinkField
                value={pasteValue}
                onChange={(v) => {
                  setPasteValue(v);
                  setPasteHint(false);
                }}
                onSubmit={handlePasteResolve}
                showHint={pasteHint}
                submitting={resolving}
                variant="secondary"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPasteOpen(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 text-sm font-semibold text-gold transition active:scale-95 active:bg-rule"
              >
                Paste a link
              </button>
            )}
          </div>
        ) : null}

        <div>
          {/* Name + live OSM lookup. The combobox owns both; see LookupCombobox.tsx. */}
          <LookupCombobox
            value={form.name}
            onChange={handleNameChange}
            onSelect={handleSelectResult}
            autoLookup={Boolean(initial?.autoLookup && initial.name)}
            searchNonce={searchNonce}
          />
        </div>

        {/* Status */}
        <div>
          <p className={LABEL_CLASS}>Status</p>
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
          <label htmlFor="place-cuisine" className={LABEL_CLASS}>
            Cuisine <span className={OPTIONAL_CLASS}>(optional)</span>
          </label>
          <input
            id="place-cuisine"
            type="text"
            value={form.cuisine}
            onChange={(e) => setForm((f) => ({ ...f, cuisine: e.target.value }))}
            placeholder="Mexican, ramen, pizza…"
            className={INPUT_CLASS}
          />
        </div>

        {/* City (optional) */}
        <div>
          <label htmlFor="place-city" className={LABEL_CLASS}>
            City <span className={OPTIONAL_CLASS}>(optional)</span>
          </label>
          <input
            id="place-city"
            type="text"
            value={form.city ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value || undefined }))}
            placeholder="Austin"
            className={INPUT_CLASS}
          />
        </div>

        {/* Address (optional) */}
        <div>
          <label htmlFor="place-address" className={LABEL_CLASS}>
            Address <span className={OPTIONAL_CLASS}>(optional)</span>
          </label>
          <input
            id="place-address"
            type="text"
            value={form.address ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || undefined }))}
            placeholder="123 Main St"
            className={INPUT_CLASS}
          />
        </div>

        {/* Notes (optional) */}
        <div>
          <label htmlFor="place-notes" className={LABEL_CLASS}>
            Notes <span className={OPTIONAL_CLASS}>(optional)</span>
          </label>
          <textarea
            id="place-notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="What to order, the vibe, anything worth remembering…"
            rows={3}
            className={`resize-none ${INPUT_CLASS}`}
          />
        </div>

        {/* Category checkboxes */}
        {categories && categories.length > 0 ? (
          <div>
            <p className={LABEL_CLASS}>Lists</p>
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
            <p className={LABEL_CLASS}>
              Ratings <span className={OPTIONAL_CLASS}>(optional — skip any)</span>
            </p>
            <div className="flex flex-col gap-3">
              {criteria.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <span className="text-[0.95rem] text-cream">{c.name}</span>
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
