"use client";

// Lists tab. Grid of category cards (emoji, name, place count) with a "New list" action that
// opens CategoryForm in create mode. Tapping a card navigates to /categories/[id].

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCategories, usePlaces } from "@/lib/hooks";
import type { Category } from "@/lib/types";
import { EmptyState, HeaderShell, PlusGlyph } from "@/app/components/ui";
import CategoryForm from "@/app/components/categories/CategoryForm";

export default function CategoriesPage() {
  const router = useRouter();
  const categories = useCategories();
  // One usePlaces() call + client-side count, rather than one query per category.
  const places = usePlaces();
  const [formOpen, setFormOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const place of places ?? []) {
      for (const categoryId of place.categoryIds) {
        map.set(categoryId, (map.get(categoryId) ?? 0) + 1);
      }
    }
    return map;
  }, [places]);

  return (
    <>
      <HeaderShell
        title="Lists"
        action={
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-plum px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-95 active:bg-plum-deep"
          >
            <PlusGlyph className="h-4 w-4" />
            New list
          </button>
        }
      />

      {categories === undefined ? null : categories.length === 0 ? (
        <EmptyState
          emoji="🏆"
          title="Make your first list"
          hint="Group places into your own rankings — best tacos, top ramen, whatever you crave."
        >
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-plum px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-plum-deep"
          >
            <PlusGlyph className="h-4 w-4" />
            New list
          </button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 py-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              count={counts.get(category.id) ?? 0}
              onOpen={() => router.push(`/categories/${category.id}`)}
            />
          ))}
        </div>
      )}

      {formOpen ? (
        <CategoryForm
          mode="create"
          categories={categories ?? []}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </>
  );
}

function CategoryCard({
  category,
  count,
  onOpen,
}: {
  category: Category;
  count: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 flex-col items-start gap-2 rounded-card border border-line bg-surface p-4 text-left shadow-sm transition active:scale-[0.98] active:bg-surface-sunk"
    >
      <span aria-hidden className="text-3xl">
        {category.emoji || "🏆"}
      </span>
      <span className="font-display text-lg leading-tight text-ink">{category.name}</span>
      <span className="text-xs font-medium text-ink-soft">
        {count} {count === 1 ? "place" : "places"}
      </span>
    </button>
  );
}
