"use client";

// Fixed bottom navigation: 4 tabs (Places · Lists · Journal · Settings) around an elevated
// ember "＋" FAB. Active tab is derived from the pathname. The FAB dispatches the
// `savor:add-place` window event (via emitAddPlace) — T8's add-place flow listens for it, so
// this stays presentational with no data or routing side effects beyond navigation.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { emitAddPlace, PlusGlyph } from "./ui";

type Tab = {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  // A tab owns its own route subtree (e.g. Places also owns /places/[id]).
  match: (path: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Places",
    Icon: DiningIcon,
    match: (p) => p === "/" || p.startsWith("/places"),
  },
  {
    href: "/categories",
    label: "Lists",
    Icon: TrophyIcon,
    match: (p) => p.startsWith("/categories"),
  },
  {
    href: "/journal",
    label: "Journal",
    Icon: BookIcon,
    match: (p) => p.startsWith("/journal"),
  },
  {
    href: "/settings",
    label: "Settings",
    Icon: SlidersIcon,
    match: (p) => p.startsWith("/settings"),
  },
];

export default function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-shell/90 backdrop-blur-md"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 items-center px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
        <NavItem tab={TABS[0]} active={TABS[0].match(pathname)} />
        <NavItem tab={TABS[1]} active={TABS[1].match(pathname)} />

        {/* Elevated primary action — "add a place". */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={emitAddPlace}
            aria-label="Add a place"
            className="-mt-7 grid h-16 w-16 place-items-center rounded-full bg-ember text-white shadow-lg shadow-ember/30 ring-4 ring-shell transition active:scale-90 active:bg-ember-deep"
          >
            <PlusGlyph className="h-7 w-7" />
          </button>
        </div>

        <NavItem tab={TABS[2]} active={TABS[2].match(pathname)} />
        <NavItem tab={TABS[3]} active={TABS[3].match(pathname)} />
      </div>
    </nav>
  );
}

function NavItem({ tab, active }: { tab: Tab; active: boolean }) {
  const { href, label, Icon } = tab;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 flex-col items-center gap-0.5 py-1 transition ${
        active ? "text-plum" : "text-ink-soft active:text-ink"
      }`}
    >
      <span
        className={`grid h-8 w-14 place-items-center rounded-full transition ${
          active ? "bg-plum-tint" : "bg-transparent"
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-[0.66rem] font-semibold tracking-wide">{label}</span>
    </Link>
  );
}

/* ─── icons (1.75 stroke, rounded) ──────────────────────────────────────────
   Fork+knife (dining), trophy (rankings), book (journal), sliders (settings) —
   a small, food-forward set that reads at 24px. */

function DiningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 3v7m-2.5-7v4a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 9.5 7V3M7 12.5V21M17 3c-1.7 0-3 2-3 4.5S15 12 17 12v9"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 4h10v4a5 5 0 0 1-10 0V4Zm0 2H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5M12 13v3m-3 5h6m-4.5 0 .5-3.2h4l.5 3.2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v14H6.5A1.5 1.5 0 0 0 5 19.5v-15Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path
        d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 8h6M9 11.5h4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 7h9m4 0h3M4 17h3m4 0h9M14 4.5v5M8 14.5v5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
