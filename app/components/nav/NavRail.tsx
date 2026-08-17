"use client";

// Desktop (≥md) left nav rail — replaces BottomNav once the viewport is wide enough for a
// vertical rail to make sense. Same four tabs, same TABS/icons as BottomNav (nav/tabs.tsx) so
// the two surfaces can't drift. The FAB becomes a plain gold button at the top of the rail,
// still dispatching the same `savor:add-place` window event BottomNav's FAB does.
//
// Width (15rem / w-60) is also hardcoded as the `md:ml-60` offset on <main> in app/layout.tsx —
// the two must move together if this ever changes.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { emitAddPlace, PlusGlyph } from "../ui";
import { TABS, type Tab } from "./tabs";

export default function NavRail() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-rule/80 bg-ground-deep px-3 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 md:flex"
    >
      <p className="px-2 font-display text-2xl italic font-semibold text-gold">savor</p>

      <button
        type="button"
        onClick={() => emitAddPlace()}
        className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-sm bg-gold px-4 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep md:hover:bg-gold-deep"
      >
        <PlusGlyph className="h-4 w-4" />
        Add a place
      </button>

      <div className="mt-6 flex flex-col gap-1">
        {TABS.map((tab) => (
          <RailItem key={tab.href} tab={tab} active={tab.match(pathname)} />
        ))}
      </div>
    </nav>
  );
}

function RailItem({ tab, active }: { tab: Tab; active: boolean }) {
  const { href, label, Icon } = tab;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-sm px-2.5 py-2 font-util text-[0.8rem] font-semibold uppercase tracking-[0.1em] transition ${
        active
          ? "bg-raised text-gold"
          : "text-sage md:hover:bg-raised md:hover:text-cream"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
