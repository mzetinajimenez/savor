"use client";

// Journal tab: a reverse-chronological feed of every logged visit, grouped by date, plus the
// "Log a visit" entry point for the standalone (no fixed place) VisitForm flow. Visit-detail
// links point at /places/[placeId] — that route lands in a later task.

import { useMemo, useState } from "react";
import { usePlaces, useVisits } from "@/lib/hooks";
import type { Place, Visit } from "@/lib/types";
import { EmptyState, HeaderShell, PlusGlyph } from "../components/ui";
import VisitCard from "../components/visits/VisitCard";
import VisitForm from "../components/visits/VisitForm";

// Local-timezone YYYY-MM-DD — see the matching helper/comment in VisitForm.tsx. Kept separate
// (not imported) so each component stays self-contained; it's three lines.
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function shiftDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const shifted = new Date(y, (m ?? 1) - 1, (d ?? 1) + delta);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(
    shifted.getDate()
  ).padStart(2, "0")}`;
}

function formatGroupHeading(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return "Today";
  if (dateStr === shiftDays(today, -1)) return "Yesterday";

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

// Visits already arrive newest-date-first with same-day ties broken by createdAt (see
// queryVisits in lib/hooks.ts), so same-day visits are always contiguous — a single linear pass
// groups them without needing a Map keyed by date.
function groupByDate(visits: Visit[]): { date: string; visits: Visit[] }[] {
  const groups: { date: string; visits: Visit[] }[] = [];
  for (const visit of visits) {
    const current = groups[groups.length - 1];
    if (current && current.date === visit.date) {
      current.visits.push(visit);
    } else {
      groups.push({ date: visit.date, visits: [visit] });
    }
  }
  return groups;
}

function LogVisitButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full bg-ember font-semibold text-white shadow-sm transition active:scale-95 active:bg-ember-deep ${className}`}
    >
      <PlusGlyph className="h-4 w-4" />
      Log a visit
    </button>
  );
}

export default function JournalPage() {
  const visits = useVisits();
  const places = usePlaces();
  const [formOpen, setFormOpen] = useState(false);

  // Resolved once here (not per-card) — see VisitCard's comment on why it takes a plain
  // `placeName` string instead of calling usePlace() itself.
  const placesById = useMemo(() => {
    const map: Record<string, Place> = {};
    for (const place of places ?? []) map[place.id] = place;
    return map;
  }, [places]);

  const groups = useMemo(() => groupByDate(visits ?? []), [visits]);

  return (
    <>
      <HeaderShell
        title="Journal"
        action={
          <LogVisitButton onClick={() => setFormOpen(true)} className="min-h-11 px-4 text-sm" />
        }
      />

      {visits === undefined ? null : visits.length === 0 ? (
        <EmptyState
          emoji="📔"
          title="Your journal is empty"
          hint="Your food journal starts here — log a visit"
        >
          <LogVisitButton onClick={() => setFormOpen(true)} className="px-5 py-3 text-[0.95rem]" />
        </EmptyState>
      ) : (
        <div className="px-4 pb-6">
          {groups.map((group, i) => (
            <section key={group.date}>
              <h2
                className={`pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-soft ${
                  i === 0 ? "pt-4" : "pt-5"
                }`}
              >
                {formatGroupHeading(group.date)}
              </h2>
              <div className="flex flex-col gap-2.5">
                {group.visits.map((visit) => (
                  <VisitCard
                    key={visit.id}
                    visit={visit}
                    placeName={placesById[visit.placeId]?.name ?? "Unknown place"}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <VisitForm open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
