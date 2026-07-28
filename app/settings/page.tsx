"use client";

// Settings tab: rating-criteria editor, on-device storage status, backup export/import, and app
// info, in that order. Reads/writes for criteria flow through CriteriaEditor (which itself goes
// through lib/hooks / lib/repo, per the app's rule that components never touch Dexie directly).
// StoragePanel below talks to navigator.storage directly — there's no repo/hooks seam for
// browser storage APIs — which is why this whole page is a client component. It feature-detects
// estimate()/persisted() so older Safari (which lacks them) degrades to a message instead of
// crashing. Best-effort persist() on every app load already happens once in lib/hooks'
// useDbInit (mounted via AppInit in the root layout); the button here is for the user to
// retry/confirm explicitly. BackupPanel below goes through lib/backup (export/parse/import),
// itself layered on lib/repo/lib/db for the same never-touch-Dexie-directly rule.

import { useEffect, useState } from "react";
import { toast } from "@/app/components/Toast";
import { HeaderShell } from "@/app/components/ui";
import BackupPanel from "@/app/components/settings/BackupPanel";
import CriteriaEditor from "@/app/components/settings/CriteriaEditor";

export default function SettingsPage() {
  return (
    <>
      <HeaderShell title="Settings" />

      <section className="px-4 pt-4">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">Rating criteria</h2>
        <div className="mt-3">
          <CriteriaEditor />
        </div>
      </section>

      <section className="px-4 py-6">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">Storage</h2>
        <div className="mt-3">
          <StoragePanel />
        </div>
      </section>

      <section className="px-4 py-6">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">Backup</h2>
        <div className="mt-3">
          <BackupPanel />
        </div>
      </section>

      <section className="px-4 pb-8">
        <h2 className="font-util text-[0.53rem] font-bold uppercase tracking-[0.24em] text-gold">About</h2>
        <div className="mt-3 rounded-sm border border-rule bg-raised px-4 py-3.5 shadow-sm">
          <p className="font-display text-lg text-cream">savor v1</p>
          {/* text-cream, not text-sage: this card sits on bg-raised, where sage measures
              3.85:1 and fails AA (see WAVE-CONSTRAINTS.md's contrast table). */}
          <p className="mt-1 text-sm leading-relaxed text-cream">
            A personal tasting ledger for the places you&rsquo;ve been and the ones
            you&rsquo;re dying to try.
          </p>
        </div>
      </section>
    </>
  );
}

type StorageState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; usageLabel: string | null; persisted: boolean };

function StoragePanel() {
  const [state, setState] = useState<StorageState>({ status: "loading" });
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
    if (!storage || !storage.estimate || !storage.persisted || !storage.persist) {
      // Require all three: a "Protect my data" button with no persist() to call would be a
      // dead control, so treat that as unavailable too rather than half-rendering the panel.
      setState({ status: "unavailable" });
      return;
    }
    try {
      const [estimate, persisted] = await Promise.all([storage.estimate(), storage.persisted()]);
      setState({ status: "ready", usageLabel: formatBytes(estimate.usage), persisted });
    } catch {
      // Some browsers advertise the APIs but throw (e.g. in a locked-down/private context) —
      // fail closed to the same "unavailable" message rather than crash the settings page.
      setState({ status: "unavailable" });
    }
  }

  async function handlePersist() {
    if (state.status !== "ready" || !navigator.storage?.persist) return;
    setRequesting(true);
    try {
      const granted = await navigator.storage.persist();
      toast(granted ? "Protected against eviction" : "Browser declined to protect storage");
      await refresh();
    } catch {
      toast("Couldn't request persistent storage");
    } finally {
      setRequesting(false);
    }
  }

  if (state.status === "loading") {
    return <p className="px-1 text-sm text-sage">Checking storage…</p>;
  }

  if (state.status === "unavailable") {
    return (
      <p className="rounded-sm bg-ground-deep px-3.5 py-3 text-sm text-sage">
        Storage info unavailable on this browser.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-rule bg-raised px-4 py-3.5 shadow-sm">
      <p className="text-sm text-cream">
        {state.usageLabel ? `~${state.usageLabel} used` : "Usage unknown"}
      </p>
      <p className="text-sm text-sage">
        {state.persisted ? "Protected against eviction" : "Not yet protected"}
      </p>
      {!state.persisted ? (
        <button
          type="button"
          onClick={handlePersist}
          disabled={requesting}
          className="mt-1 inline-flex min-h-11 w-fit items-center justify-center rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-ground shadow-sm transition active:scale-95 active:bg-gold-deep disabled:opacity-50"
        >
          {requesting ? "Requesting…" : "Protect my data"}
        </button>
      ) : null}
    </div>
  );
}

/** "~X.X MB used"-ready label, or null when the browser doesn't report a usage figure. */
function formatBytes(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
