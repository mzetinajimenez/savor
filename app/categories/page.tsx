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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-gold px-4 py-2 text-sm font-semibold text-ground shadow-sm transition active:scale-95 active:bg-gold-deep"
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
            className="inline-flex items-center gap-2 rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-95 active:bg-gold-deep"
          >
            <PlusGlyph className="h-4 w-4" />
            New list
          </button>
        </EmptyState>
      ) : (
        <ul className="flex flex-col px-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              count={counts.get(category.id) ?? 0}
              onOpen={() => router.push(`/categories/${category.id}`)}
            />
          ))}
        </ul>
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
    <li className="border-t border-rule">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 w-full items-center gap-3 py-3 text-left transition active:bg-ground-deep"
      >
        <span aria-hidden className="text-2xl">
          {category.emoji || "🏆"}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-lg leading-tight text-cream">
          {category.name}
        </span>
        <span className="shrink-0 text-[0.6875rem] text-sage">
          {count} {count === 1 ? "place" : "places"}
        </span>
      </button>
    </li>
  );
}
