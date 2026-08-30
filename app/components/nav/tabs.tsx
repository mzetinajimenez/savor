// Shared nav-tab config: the four primary routes (Places · Lists · Journal ·
// Settings), used by both BottomNav (mobile, <md) and NavRail (desktop, ≥md) so
// the two surfaces can never list a different set of tabs.

export type Tab = {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  // A tab owns its own route subtree (e.g. Places also owns /places/[id]).
  match: (path: string) => boolean;
};

export const TABS: Tab[] = [
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

/* ─── icons (1.75 stroke, rounded) ──────────────────────────────────────────
   Fork+knife (dining), trophy (rankings), book (journal), sliders (settings) —
   a small, food-forward set that reads at 24px. */

export function DiningIcon({ className }: { className?: string }) {
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

export function TrophyIcon({ className }: { className?: string }) {
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

export function BookIcon({ className }: { className?: string }) {
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

export function SlidersIcon({ className }: { className?: string }) {
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
