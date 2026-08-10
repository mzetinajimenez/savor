"use client";

// The List/Map segmented control for the Places tab. Purely presentational — the caller owns
// the `?view=` URL state (see PlacesInner in app/page.tsx) and passes it down as `view` /
// `onChange`. Gold marks the active segment ("gold is yes" — CLAUDE.md); the inactive segment
// is sage-on-ground-deep, legal at 6.45:1.

const segmentBaseClass =
  "flex min-h-11 flex-1 items-center justify-center rounded-sm px-4 text-sm font-semibold transition active:scale-[0.97]";

export default function ViewToggle({
  view,
  onChange,
}: {
  view: "list" | "map";
  onChange: (view: "list" | "map") => void;
}) {
  return (
    <div
      role="group"
      aria-label="View"
      className="flex gap-1 rounded-sm border border-rule bg-ground-deep p-1"
    >
      <button
        type="button"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
        className={`${segmentBaseClass} ${
          view === "list" ? "bg-gold-deep text-ground" : "text-sage"
        }`}
      >
        List
      </button>
      <button
        type="button"
        aria-pressed={view === "map"}
        onClick={() => onChange("map")}
        className={`${segmentBaseClass} ${
          view === "map" ? "bg-gold-deep text-ground" : "text-sage"
        }`}
      >
        Map
      </button>
    </div>
  );
}
