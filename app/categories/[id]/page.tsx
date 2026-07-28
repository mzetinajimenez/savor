"use client";

// Category detail: header (emoji + name, Weights + Edit actions), a Ranked section (rank #, tie
// marker, gold score seal — tap to a place, a dead link until a later task lands) and a Want to
// try section (plain rows). A missing/tombstoned category renders a friendly "not found" state
// instead of the detail chrome.

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { useCategory, useRankedCategory } from "@/lib/hooks";
import { EmptyState, HeaderShell, ScoreBadge } from "@/app/components/ui";
import CategoryForm from "@/app/components/categories/CategoryForm";
import WeightsEditor from "@/app/components/categories/WeightsEditor";

const actionButtonClass =
  "inline-flex min-h-11 items-center gap-1 rounded-sm border border-rule bg-ground-deep px-3.5 py-2 text-sm font-semibold text-gold transition active:scale-95 active:bg-rule";

export default function CategoryDetailPage() {
  // useSearchParams() (below, in the tab switch) makes this route dynamic and requires a
  // Suspense boundary around its caller, or `next build` fails — same split as
  // app/import/page.tsx.
  return (
    <Suspense fallback={null}>
      <CategoryDetailInner />
    </Suspense>
  );
}

function CategoryDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = useCategory(id);
  const rankedData = useRankedCategory(id);
  const [editOpen, setEditOpen] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  // Set the moment a delete is confirmed, before router.push("/categories") resolves. The
  // tombstone lands in Dexie (and useCategory flips to undefined) a beat before the route
  // actually changes, which would otherwise flash the "not found" state on the way out.
  const [leaving, setLeaving] = useState(false);

  const tab: "ranked" | "want" = searchParams.get("tab") === "want" ? "want" : "ranked";

  // Shared by the tab switch here and the city filter in Task 6. Uses replace (not push)
  // so switching a tab or a filter chip never grows the history stack.
  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

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
            className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-95 active:bg-gold-deep"
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

      <div role="tablist" aria-label="Category view" className="flex gap-5 border-b border-rule px-4">
        <TabButton active={tab === "ranked"} onClick={() => updateParam("tab", null)}>
          Ranked
        </TabButton>
        <TabButton active={tab === "want"} onClick={() => updateParam("tab", "want")}>
          Want to try
        </TabButton>
      </div>

      <section className="px-4 py-4">
        {tab === "ranked" ? (
          ranked === undefined ? null : ranked.length === 0 ? (
            <EmptyState
              emoji="🍽️"
              title="Nothing ranked yet"
              hint="Rate a place you've been to see it climb the list."
            />
          ) : (
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
          )
        ) : wantToTry === undefined ? null : wantToTry.length === 0 ? (
          <EmptyState
            emoji="📝"
            title="Nothing on the wishlist"
            hint="Places you want to try in this list will show up here."
          />
        ) : (
          <ul className="flex flex-col">
            {wantToTry.map((place) => (
              <li key={place.id} className="border-t border-rule">
                <Link
                  href={`/places/${place.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-3.5 transition active:bg-ground-deep"
                >
                  <span className="flex w-10 shrink-0 items-center">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-cream" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.95rem] text-cream">{place.name}</p>
                    {place.address ? (
                      <p className="mt-0.5 truncate text-[0.6875rem] text-sage">{place.address}</p>
                    ) : null}
                  </div>
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-11 border-b-2 px-0.5 pb-2 font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition ${
        active ? "border-gold text-gold" : "border-transparent text-sage active:text-cream"
      }`}
    >
      {children}
    </button>
  );
}
