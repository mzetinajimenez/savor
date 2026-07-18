"use client";

// Filter chips for the Places tab: three independently-scrollable rows (status, category,
// cuisine) that compose with AND. Status is a tri-state segmented control (All is itself an
// explicit option). Category and cuisine are single-select toggles — tapping the active chip
// again clears that filter, since neither row carries its own "All" option. Purely
// presentational/controlled: state lives in app/page.tsx.

import type { ReactNode } from "react";
import type { Category, PlaceStatus } from "@/lib/types";
import { Chip } from "../ui";

const STATUS_OPTIONS: { value: PlaceStatus | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "been", label: "Been" },
  { value: "want_to_try", label: "Want to try" },
];

export default function PlaceFilters({
  status,
  onStatusChange,
  categories,
  categoryId,
  onCategoryChange,
  cuisines,
  cuisine,
  onCuisineChange,
}: {
  status: PlaceStatus | undefined;
  onStatusChange: (status: PlaceStatus | undefined) => void;
  categories: Category[];
  categoryId: string | undefined;
  onCategoryChange: (categoryId: string | undefined) => void;
  cuisines: string[];
  cuisine: string | undefined;
  onCuisineChange: (cuisine: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ChipRow ariaLabel="Filter by status">
        {STATUS_OPTIONS.map((opt) => (
          <Chip
            key={opt.label}
            active={status === opt.value}
            onClick={() => onStatusChange(opt.value)}
            className="whitespace-nowrap"
          >
            {opt.label}
          </Chip>
        ))}
      </ChipRow>

      {categories.length > 0 ? (
        <ChipRow ariaLabel="Filter by category">
          {categories.map((c) => (
            <Chip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => onCategoryChange(categoryId === c.id ? undefined : c.id)}
              className="whitespace-nowrap"
            >
              {c.emoji ? `${c.emoji} ` : ""}
              {c.name}
            </Chip>
          ))}
        </ChipRow>
      ) : null}

      {cuisines.length > 0 ? (
        <ChipRow ariaLabel="Filter by cuisine">
          {cuisines.map((cu) => (
            <Chip
              key={cu}
              active={cuisine === cu}
              onClick={() => onCuisineChange(cuisine === cu ? undefined : cu)}
              className="whitespace-nowrap"
            >
              {cu}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
    </div>
  );
}

// -mx-4/px-4 lets the row's scroll area bleed to the screen edge (matching HeaderShell's own
// padding) while still starting the first chip flush with the title above it.
function ChipRow({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
