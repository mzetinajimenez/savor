"use client";

// BackupPanel — export the full local dataset (places, categories, criteria, visits, tombstones
// included) as a downloadable JSON file, or restore from a previously exported one. Both
// directions go entirely through lib/backup (exportBackup/parseBackup/importBackup/
// summarizeBackup) — this component never touches Dexie directly. Import is destructive (it
// replaces all 4 entity tables), so a validated-but-not-yet-applied backup sits behind an
// in-panel confirm step — the same chili confirm-box pattern CriteriaEditor/CategoryForm use for
// delete — rather than window.confirm, showing a plain-language summary before anything is
// written.

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "@/app/components/Toast";
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
      toast("Couldn't create backup — try again");
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
        toast("Couldn't read backup file");
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
      toast("Couldn't restore backup — try again");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-sm">
      <p className="text-sm text-ink-soft">
        Save every place, list, and visit to a file, or restore from one you saved earlier.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy || pending !== null}
          className="min-h-11 flex-1 rounded-full bg-plum px-4 text-sm font-semibold text-white shadow-sm transition active:scale-95 active:bg-plum-deep disabled:opacity-50"
        >
          {status === "exporting" ? "Exporting…" : "Export"}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || pending !== null}
          className="min-h-11 flex-1 rounded-full border border-line px-4 text-sm font-semibold text-ink-soft transition active:scale-95 active:bg-surface-sunk disabled:opacity-50"
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
        <div className="flex flex-col gap-3 rounded-xl bg-chili/10 p-3.5">
          <p className="text-sm text-ink">
            {`Replace everything in savor with this backup? Current data will be lost. Backup contains: ${summarizeBackup(pending)}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full border border-line px-4 text-sm font-semibold text-ink-soft transition active:scale-95 active:bg-surface-sunk disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full bg-chili px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {status === "importing" ? "Restoring…" : "Replace data"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
