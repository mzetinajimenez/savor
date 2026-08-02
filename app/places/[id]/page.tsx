"use client";

// Place detail: header (name + Edit action), a status pill that doubles as the been/want_to_try
// toggle, an info block (cuisine · city, address, notes — each omitted when empty), per-category
// composite-score chips, a read-only ratings summary with an "Edit ratings" entry into
// RatingEditor, an inline category (Lists) multi-select, a compact visit list with "Log visit",
// and edit/delete via a small in-file sheet. A missing/tombstoned id renders a friendly "not
// found" state instead of the detail chrome — mirrors app/categories/[id]/page.tsx exactly (see
// its comment: usePlace resolves to undefined both while loading and when the place is
// missing/deleted, with no separate signal to tell those apart; in practice the DB round trip is
// near-instant, so a genuinely-loading flash is imperceptible).

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { useCategories, useCriteria, usePlace, useVisits } from "@/lib/hooks";
import { compositeScore } from "@/lib/ranking";
import { deletePlace, updatePlace } from "@/lib/repo";
import type { Category, Criterion, Place, PlaceStatus } from "@/lib/types";
import { useSheetParam } from "@/lib/useSheetParam";
import Sheet from "@/app/components/Sheet";
import { toast } from "@/app/components/Toast";
import { Chip, EmptyState, HeaderShell, LinkGlyph, PlusGlyph, RatingRow, ScoreBadge } from "@/app/components/ui";
import RatingEditor from "@/app/components/places/RatingEditor";
import ScoreBreakdown from "@/app/components/places/ScoreBreakdown";
import VisitForm from "@/app/components/visits/VisitForm";

const STATUS_LABEL: Record<PlaceStatus, string> = {
  been: "Been",
  want_to_try: "Want to try",
};

const actionButtonClass =
  "inline-flex min-h-11 items-center gap-1 rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2 text-sm font-semibold text-sage transition active:scale-[0.97] active:bg-ground-deep";

const goldButtonClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-gold px-4 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep";

// Local-timezone-safe date formatting for a plain YYYY-MM-DD string (matches the pattern used by
// VisitForm/JournalPage for the same `<input type="date">` format — deliberately not
// `new Date(dateStr)`, which parses as UTC midnight and can read as the wrong calendar day).
function formatVisitDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function PlaceDetailPage() {
  // useSheetParam() calls useSearchParams(), which makes this route dynamic and requires a
  // Suspense boundary around its caller or `next build` fails — same split as
  // app/categories/[id]/page.tsx and app/import/page.tsx.
  return (
    <Suspense fallback={null}>
      <PlaceDetailInner />
    </Suspense>
  );
}

function PlaceDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const place = usePlace(id);
  const categories = useCategories();
  const criteria = useCriteria();
  const visits = useVisits(id);

  const edit = useSheetParam("edit");
  const ratings = useSheetParam("ratings");
  const visit = useSheetParam("visit");
  const score = useSheetParam("score");
  const [statusPending, setStatusPending] = useState(false);
  // Which category the breakdown is for. Deliberately NOT in the query — the route already
  // owns an id (the place), and a second entity id in the URL is exactly what the sheet-param
  // convention rules out. `score.open` is the source of truth for whether it shows; this is
  // only the argument. When Back clears the param the sheet unmounts and this goes unread.
  const [breakdownCategoryId, setBreakdownCategoryId] = useState<string | null>(null);

  // Belt-and-suspenders with hooks.ts's own tombstone filter (matches app/page.tsx's identical
  // pattern) rather than a correctness requirement — queryCriteria() already excludes
  // deletedAt !== null rows.
  const liveCriterionIds = useMemo(
    () => new Set((criteria ?? []).filter((c) => c.deletedAt === null).map((c) => c.id)),
    [criteria]
  );

  // usePlace resolves to undefined both while loading and when the id is missing/tombstoned —
  // there's no separate signal to tell those apart, so this renders "not found" for both. In
  // practice the DB round trip is near-instant, so a genuinely-loading flash is imperceptible.
  if (place === undefined) {
    return (
      <>
        <HeaderShell title="Place not found" />
        <EmptyState
          emoji="🍽️"
          title="Place not found"
          hint="This place may have been deleted, or the link is out of date."
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep"
          >
            Back to savor
          </Link>
        </EmptyState>
      </>
    );
  }

  const subtitle = [place.cuisine, place.city].filter(Boolean).join(" · ");

  // TS's control-flow narrowing from the `place === undefined` guard above doesn't persist into
  // the nested closures below (they could in principle run after a reassignment, even though
  // `place` never actually is one) — rebind to a const whose own type is already `Place`, not a
  // union, so the closures need no further narrowing.
  const currentPlace: Place = place;

  async function handleStatusToggle() {
    if (statusPending) return;
    const next: PlaceStatus = currentPlace.status === "been" ? "want_to_try" : "been";
    setStatusPending(true);
    try {
      await updatePlace(currentPlace.id, { status: next });
      // Marking a want_to_try place as been is the "rate it now" moment — open the editor.
      if (next === "been") ratings.openSheet();
    } catch {
      toast("Couldn't update status", true);
    } finally {
      setStatusPending(false);
    }
  }

  async function toggleCategory(categoryId: string) {
    const next = currentPlace.categoryIds.includes(categoryId)
      ? currentPlace.categoryIds.filter((existing) => existing !== categoryId)
      : [...currentPlace.categoryIds, categoryId];
    try {
      await updatePlace(currentPlace.id, { categoryIds: next });
    } catch {
      toast("Couldn't update lists", true);
    }
  }

  return (
    <>
      <HeaderShell
        title={place.name}
        action={
          <button type="button" onClick={edit.openSheet} className={actionButtonClass}>
            Edit
          </button>
        }
      />

      <section className="px-4 pt-4">
        <button
          type="button"
          onClick={handleStatusToggle}
          disabled={statusPending}
          // "Been" and "Want to try" are distinguished by the label, not by colour: this is a
          // status toggle, and gold-vs-gold said nothing while still reading as active state.
          // Matches PlaceCard, which renders the same datum as a recessed Chip.
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-rule bg-ground-deep px-4 font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-cream transition active:scale-[0.97] active:bg-raised disabled:opacity-60"
        >
          {STATUS_LABEL[place.status]}
        </button>

        {subtitle ? <p className="mt-3 text-[0.95rem] text-sage">{subtitle}</p> : null}
        {place.address ? <p className="mt-1 text-sm text-sage">{place.address}</p> : null}
        {place.notes ? <p className="mt-3 text-[0.95rem] leading-relaxed text-cream">{place.notes}</p> : null}

        {place.sourceUrl ? (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gold active:opacity-70"
          >
            <LinkGlyph className="h-4 w-4" />
            {place.sourcePlatform === "instagram"
              ? "View on Instagram"
              : place.sourcePlatform === "tiktok"
              ? "View on TikTok"
              : "View source"}
          </a>
        ) : null}

        {categories === undefined ? null : (
          <div className="mt-3 flex flex-wrap gap-2">
            {place.categoryIds.map((categoryId) => {
              const category = categories.find((c) => c.id === categoryId);
              if (!category) return null;
              const placeScore = compositeScore(place.ratings, category.weights, liveCriterionIds);
              if (placeScore === null) return null;
              return (
                <Chip
                  key={categoryId}
                  onClick={() => {
                    setBreakdownCategoryId(categoryId);
                    score.openSheet();
                  }}
                >
                  <span className="mr-1">
                    {category.emoji ? `${category.emoji} ` : ""}
                    {category.name}
                  </span>
                  <ScoreBadge score={placeScore} size="sm" />
                </Chip>
              );
            })}
          </div>
        )}
      </section>

      <section className="px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">Ratings</h2>
          <button
            type="button"
            onClick={ratings.openSheet}
            className={goldButtonClass}
          >
            Edit ratings
          </button>
        </div>

        {criteria === undefined ? null : criteria.length === 0 ? (
          <p className="mt-3 text-sm text-sage">
            Add rating criteria in Settings to start rating places.
          </p>
        ) : (
          <div className="mt-3 flex flex-col divide-y divide-rule rounded-sm border border-sage-deep bg-ground-deep px-4">
            {criteria.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-[0.95rem] text-cream">{c.name}</span>
                <RatingRow label={c.name} value={place.ratings[c.id]} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="px-4 py-5">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">Lists</h2>
        {categories === undefined ? null : categories.length === 0 ? (
          <p className="mt-3 text-sm text-sage">
            No lists yet — create one from the Lists tab.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={place.categoryIds.includes(c.id)}
                onClick={() => toggleCategory(c.id)}
              >
                {c.emoji ? `${c.emoji} ` : ""}
                {c.name}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section className="px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">Visits</h2>
          <button
            type="button"
            onClick={visit.openSheet}
            className={goldButtonClass}
          >
            <PlusGlyph className="h-4 w-4" />
            Log visit
          </button>
        </div>

        {visits === undefined ? null : visits.length === 0 ? (
          <EmptyState
            emoji="📔"
            title="No visits logged"
            hint="Log a visit to start building this place's history."
          />
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {visits.map((v) => (
              <li
                key={v.id}
                className="rounded-sm border border-sage-deep bg-ground-deep px-4 py-3 shadow-sm"
              >
                <p className="text-sm font-semibold text-cream">{formatVisitDate(v.date)}</p>
                {v.dishes ? (
                  <p className="mt-0.5 truncate text-sm text-sage">{v.dishes}</p>
                ) : null}
                {v.notes ? (
                  <p className="mt-0.5 truncate text-[0.82rem] text-cream/80">{v.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {edit.open ? (
        <PlaceEditSheet
          place={place}
          onClose={edit.closeSheet}
          // replace, not push: consumes the ?sheet=edit history entry instead of stacking a new
          // one on top of it (PlaceEditSheet's handleDelete deliberately does not call onClose
          // on this path — see its comment).
          onDeleted={() => router.replace("/")}
        />
      ) : null}

      {ratings.open ? <RatingEditor place={place} onClose={ratings.closeSheet} /> : null}

      <VisitForm open={visit.open} onClose={visit.closeSheet} placeId={place.id} />

      {score.open && breakdownCategoryId && categories !== undefined && criteria !== undefined ? (
        <ScoreBreakdownSheet
          place={currentPlace}
          categoryId={breakdownCategoryId}
          categories={categories}
          criteria={criteria}
          onClose={score.closeSheet}
        />
      ) : null}
    </>
  );
}

function PlaceEditSheet({
  place,
  onClose,
  onDeleted,
}: {
  place: Place;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(place.name);
  const [cuisine, setCuisine] = useState(place.cuisine ?? "");
  const [city, setCity] = useState(place.city ?? "");
  const [address, setAddress] = useState(place.address ?? "");
  const [notes, setNotes] = useState(place.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && !saving && !deleting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await updatePlace(place.id, {
        name: trimmedName,
        cuisine: cuisine.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast("Place updated");
      onClose();
    } catch {
      toast("Couldn't save changes — try again", true);
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePlace(place.id);
      toast("Place deleted");
      // Deliberately no onClose() here: closeSheet's history.back() is a queued traversal that
      // resolves against whatever the history index is *when the queue drains*, not when it was
      // called — a synchronous router navigation right after it would land first and the
      // deferred back() would then resolve against the post-navigation index, landing on
      // ?sheet=edit for a place that no longer exists. Navigating away unmounts this sheet on
      // its own; the caller must navigate with router.replace (not push) so the replace itself
      // consumes the ?sheet= entry instead of stacking a new one on top of it.
      onDeleted();
    } catch {
      toast("Couldn't delete that place — try again", true);
      setDeleting(false);
    }
  }

  return (
    <Sheet
      title="Edit place"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="place-edit-form"
          disabled={!canSave}
          className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      <form id="place-edit-form" onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-cream">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Taco Spot"
            className="min-h-11 rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2.5 text-base text-cream outline-none focus-visible:border-gold"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-cream">
            Cuisine <span className="font-normal text-cream/80">(optional)</span>
          </span>
          <input
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            placeholder="Mexican, ramen, pizza…"
            className="min-h-11 rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2.5 text-base text-cream outline-none focus-visible:border-gold"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-cream">
            City <span className="font-normal text-cream/80">(optional)</span>
          </span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Austin"
            className="min-h-11 rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2.5 text-base text-cream outline-none focus-visible:border-gold"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-cream">
            Address <span className="font-normal text-cream/80">(optional)</span>
          </span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St"
            className="min-h-11 rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2.5 text-base text-cream outline-none focus-visible:border-gold"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-cream">
            Notes <span className="font-normal text-cream/80">(optional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What to order, the vibe, anything worth remembering…"
            className="resize-none rounded-sm border border-sage-deep bg-ground-deep px-3.5 py-2.5 text-base text-cream outline-none focus-visible:border-gold"
          />
        </label>

        <div className="mt-1 border-t border-rule pt-4">
          {confirmingDelete ? (
            <div className="flex flex-col gap-3 rounded-sm bg-coral/10 p-3.5">
              <p className="text-sm text-cream">
                Delete &ldquo;{place.name}&rdquo;? This hides the place and its history from
                savor.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="min-h-11 flex-1 rounded-sm bg-coral-deep px-4 text-sm font-semibold text-ground transition active:scale-[0.97] disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-11 rounded-sm bg-ground-deep px-3.5 text-sm font-semibold text-coral transition active:opacity-70"
            >
              Delete place
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

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
