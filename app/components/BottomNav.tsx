"use client";

// Fixed bottom navigation: 4 tabs (Places · Lists · Journal · Settings) around an elevated
// ember "＋" FAB. Active tab is derived from the pathname. The FAB dispatches the
// `savor:add-place` window event (via emitAddPlace) — T8's add-place flow listens for it, so
// this stays presentational with no data or routing side effects beyond navigation.
// Mobile/tablet only (<md) — NavRail (app/components/nav/NavRail.tsx) takes over at md, and
// both import their tab list from nav/tabs.tsx so the two surfaces can't drift apart.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { emitAddPlace, PlusGlyph } from "./ui";
import { TABS, type Tab } from "./nav/tabs";

export default function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule/80 bg-ground-deep backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid max-w-xl grid-cols-5 items-center px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
        <NavItem tab={TABS[0]} active={TABS[0].match(pathname)} />
        <NavItem tab={TABS[1]} active={TABS[1].match(pathname)} />

        {/* Elevated primary action — "add a place". */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => emitAddPlace()}
            aria-label="Add a place"
            className="-mt-7 grid h-16 w-16 place-items-center rounded-full bg-gold text-ground shadow-lg shadow-gold/30 ring-4 ring-ground-deep transition active:scale-[0.97] active:bg-gold-deep"
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
        active
          ? "text-gold shadow-[inset_0_2px_0_var(--color-gold)]"
          : "text-sage active:text-cream"
      }`}
    >
      <span
        className={`grid h-8 w-14 place-items-center rounded-full transition ${
          active ? "bg-raised" : "bg-transparent"
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="font-util text-[0.53rem] font-bold uppercase tracking-[0.16em]">
        {label}
      </span>
    </Link>
  );
}
