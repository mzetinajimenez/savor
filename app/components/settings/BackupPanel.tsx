"use client";

// BackupPanel — export the full local dataset (places, categories, criteria, visits, tombstones
// included) as a downloadable JSON file, or restore from a previously exported one. Both
// directions go entirely through lib/backup (exportBackup/parseBackup/importBackup/
// summarizeBackup) — this component never touches Dexie directly. Import is destructive (it
// replaces all 4 entity tables), so a validated-but-not-yet-applied backup sits behind an
// in-panel confirm step — the same coral confirm-box pattern CriteriaEditor/CategoryForm use for
// delete — rather than window.confirm, showing a plain-language summary before anything is
// written.

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "@/app/components/Toast";
import { ConfirmBox } from "@/app/components/ui";
import {
  BackupValidationError,
  exportBackup,
  importBackup,
  parseBackup,
  summarizeBackup,
  type Backup,
} from "@/lib/backup";

type Status = "idle" | "exporting" | "reading" | "importing";

/** "YYYY-MM-DD" in the local timezone (not UTC) for the export filename. */
function localDateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function BackupPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [pending, setPending] = useState<Backup | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = status !== "idle";

  async function handleExport() {
    setStatus("exporting");
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `savor-backup-${localDateStamp(new Date())}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast("Backup downloaded");
    } catch {
      toast("Couldn't create backup — try again", true);
    } finally {
      setStatus("idle");
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setStatus("reading");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const backup = parseBackup(json);
      setPending(backup);
    } catch (err) {
      if (err instanceof BackupValidationError) {
        toast(err.message);
      } else if (err instanceof SyntaxError) {
        toast("That file isn't valid JSON");
      } else {
        toast("Couldn't read backup file", true);
      }
    } finally {
      setStatus("idle");
      // Reset so re-selecting the same file (e.g. after fixing it) still fires onChange.
      input.value = "";
    }
  }

  async function handleConfirmImport() {
    if (!pending) return;
    setStatus("importing");
    try {
      await importBackup(pending);
      toast("Backup restored");
      setPending(null);
    } catch {
      toast("Couldn't restore backup — try again", true);
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-rule bg-raised px-4 py-3.5 shadow-sm">
      <p className="text-sm text-cream">
        Save every place, list, and visit to a file, or restore from one you saved earlier.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy || pending !== null}
          className="min-h-11 flex-1 rounded-sm bg-gold px-4 text-sm font-semibold text-ground shadow-sm transition active:scale-[0.97] active:bg-gold-deep disabled:opacity-50"
        >
          {status === "exporting" ? "Exporting…" : "Export"}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || pending !== null}
          className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-cream transition active:scale-[0.97] active:bg-ground-deep disabled:opacity-50"
        >
          {status === "reading" ? "Reading…" : "Import"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          aria-label="Choose a backup file to import"
          className="hidden"
        />
      </div>

      {pending ? (
        <ConfirmBox
          message={`Replace everything in savor with this backup? Current data will be lost. Backup contains: ${summarizeBackup(pending)}`}
          confirmLabel={status === "importing" ? "Restoring…" : "Replace data"}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={handleConfirmImport}
        />
      ) : null}
    </div>
  );
}
