"use client";

// Category detail: header (emoji + name, Weights + Edit actions), a Ranked section (rank #, tie
// marker, gold score seal — tap to a place, a dead link until a later task lands) and a Want to
// try section (plain rows). A missing/tombstoned category renders a friendly "not found" state
// instead of the detail chrome.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useCategory, useRankedCategory } from "@/lib/hooks";
import { EmptyState, HeaderShell, ScoreBadge } from "@/app/components/ui";
import CategoryForm from "@/app/components/categories/CategoryForm";
import WeightsEditor from "@/app/components/categories/WeightsEditor";

const actionButtonClass =
  "inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink-soft transition active:scale-95 active:bg-surface-sunk";

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const category = useCategory(id);
  const rankedData = useRankedCategory(id);
  const [editOpen, setEditOpen] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  // Set the moment a delete is confirmed, before router.push("/categories") resolves. The
  // tombstone lands in Dexie (and useCategory flips to undefined) a beat before the route
  // actually changes, which would otherwise flash the "not found" state on the way out.
  const [leaving, setLeaving] = useState(false);

  // useCategory resolves to undefined both while loading and when the id is missing/tombstoned
  // — there's no separate signal to tell those apart, so this renders "not found" for both. In
  // practice the DB round trip is near-instant, so a genuinely-loading flash is imperceptible.
  if (category === undefined) {
    if (leaving) return null;
    return (
      <>
        <HeaderShell title="List not found" />
        <EmptyState
          emoji="🗂️"
          title="List not found"
          hint="This list may have been deleted, or the link is out of date."
        >
          <Link
            href="/categories"
            className="inline-flex items-center gap-2 rounded-full bg-plum px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-plum-deep"
          >
            Back to Lists
          </Link>
        </EmptyState>
      </>
    );
  }

  const ranked = rankedData?.ranked;
  const wantToTry = rankedData?.wantToTry;
  const headerTitle = category.emoji ? `${category.emoji} ${category.name}` : category.name;

  return (
    <>
      <HeaderShell
        title={headerTitle}
        action={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeightsOpen(true)} className={actionButtonClass}>
              Weights
            </button>
            <button type="button" onClick={() => setEditOpen(true)} className={actionButtonClass}>
              Edit
            </button>
          </div>
        }
      />

      <section className="px-4 pt-4">
        <h2 className="font-display text-xl text-plum">Ranked</h2>
        {ranked === undefined ? null : ranked.length === 0 ? (
          <EmptyState
            emoji="🍽️"
            title="Nothing ranked yet"
            hint="Rate a place you've been to see it climb the list."
          />
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {ranked.map((entry) => (
              <li key={entry.place.id}>
                <Link
                  href={`/places/${entry.place.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-surface-sunk"
                >
                  <span className="tabular w-10 shrink-0 text-sm font-semibold text-ink-soft">
                    #{entry.rank}
                    {entry.tied ? " =" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] text-ink">
                    {entry.place.name}
                  </span>
                  <ScoreBadge score={entry.score} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-4 py-6">
        <h2 className="font-display text-xl text-plum">Want to try</h2>
        {wantToTry === undefined ? null : wantToTry.length === 0 ? (
          <EmptyState
            emoji="📝"
            title="Nothing on the wishlist"
            hint="Places you want to try in this list will show up here."
          />
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {wantToTry.map((place) => (
              <li key={place.id}>
                <Link
                  href={`/places/${place.id}`}
                  className="flex min-h-11 items-center px-4 py-3.5 transition active:bg-surface-sunk"
                >
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] text-ink">
                    {place.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editOpen ? (
        <CategoryForm
          mode="edit"
          category={category}
          onClose={() => setEditOpen(false)}
          onDeleted={() => {
            setLeaving(true);
            router.push("/categories");
          }}
        />
      ) : null}

      {weightsOpen ? <WeightsEditor category={category} onClose={() => setWeightsOpen(false)} /> : null}
    </>
  );
}
