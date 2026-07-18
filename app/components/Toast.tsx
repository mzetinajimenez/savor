"use client";

// Toast — a tiny module-level pub/sub (no React context, per global constraints). Call
// `toast("Saved")` from anywhere; mount <Toaster/> exactly once (in the root layout). Messages
// auto-dismiss after ~3s, announce politely to screen readers, and sit above the bottom nav
// clear of the home indicator.

import { useSyncExternalStore } from "react";

type ToastItem = { id: number; message: string };

const DISMISS_MS = 3000;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return items;
}

/** Show a transient message. Safe to call from event handlers, effects, or repo callbacks. */
export function toast(message: string) {
  const id = nextId++;
  items = [...items, { id, message }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, DISMISS_MS);
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4"
    >
      {current.map((t) => (
        <div
          key={t.id}
          className="anim-toast pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-shell shadow-lg"
        >
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-ember" />
          {t.message}
        </div>
      ))}
    </div>
  );
}
