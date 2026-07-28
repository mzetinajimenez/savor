"use client";

// CategoryForm — create/edit sheet for a list (Category). Create mode: name (required) + emoji
// (optional plain text), sortOrder = max(existing sortOrder) + 1. Edit mode: rename/re-emoji the
// same fields, plus a two-step "Delete list" confirm that tombstones the category and lets the
// caller navigate back (repo.deleteCategory does the tombstone; this component never touches
// Dexie directly).

import { useState, type FormEvent } from "react";
import { createCategory, deleteCategory, updateCategory } from "@/lib/repo";
import type { Category } from "@/lib/types";
import Sheet from "@/app/components/Sheet";
import { toast } from "@/app/components/Toast";

// See WAVE-CONSTRAINTS.md's "standard input treatment" — every text input in this form shares
// this exact class list so the app converges on one look.
const INPUT_CLASS =
  "w-full rounded-sm border border-rule bg-raised px-3.5 py-2.5 text-base text-cream placeholder:text-cream/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold";

// Matches PlaceForm's LABEL_CLASS: these labels sit directly on Sheet's own bg-raised body
// (Sheet.tsx has no intermediate surface), where text-sage measures 3.85:1 and fails AA — so
// text-cream, not text-sage, is the correct pairing here.
const LABEL_CLASS =
  "mb-1.5 block font-util text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-cream";

export default function CategoryForm({
  mode,
  category,
  categories = [],
  onClose,
  onSaved,
  onDeleted,
}: {
  mode: "create" | "edit";
  /** Required (and used) only in edit mode. */
  category?: Category;
  /** Live categories, used in create mode to compute the next sortOrder. Unused in edit mode. */
  categories?: Category[];
  onClose: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [emoji, setEmoji] = useState(category?.emoji ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && !saving && !deleting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    try {
      const trimmedEmoji = emoji.trim();
      if (mode === "create") {
        const nextSortOrder =
          categories.length === 0 ? 0 : Math.max(...categories.map((c) => c.sortOrder)) + 1;
        await createCategory({
          name: trimmedName,
          emoji: trimmedEmoji || undefined,
          sortOrder: nextSortOrder,
        });
        toast("List created");
      } else if (category) {
        await updateCategory(category.id, { name: trimmedName, emoji: trimmedEmoji });
        toast("List updated");
      }
      onSaved?.();
      onClose();
    } catch {
      toast("Couldn't save that list — try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!category) return;
    setDeleting(true);
    try {
      await deleteCategory(category.id);
      toast("List deleted");
      onDeleted?.();
      onClose();
    } catch {
      toast("Couldn't delete that list — try again");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet
      title={mode === "create" ? "New list" : "Edit list"}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="category-form"
          disabled={!canSave}
          className="flex min-h-11 w-full items-center justify-center rounded-sm bg-gold px-5 py-3 text-[0.95rem] font-semibold text-ground shadow-sm transition active:scale-95 active:bg-gold-deep disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        <label className="flex flex-col">
          <span className={LABEL_CLASS}>Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Best tacos"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col">
          <span className={LABEL_CLASS}>Emoji (optional)</span>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🌮"
            maxLength={8}
            className={`w-24 text-lg ${INPUT_CLASS}`}
          />
        </label>

        {mode === "edit" && category ? (
          <div className="mt-1 border-t border-rule pt-4">
            {confirmingDelete ? (
              <div className="flex flex-col gap-3 rounded-sm bg-coral/10 p-3.5">
                <p className="text-sm text-cream">
                  Delete “{category.name}”? This can’t be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-sage transition active:scale-95 active:bg-ground-deep"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="min-h-11 flex-1 rounded-sm bg-coral px-4 text-sm font-semibold text-ground transition active:scale-95 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="min-h-11 text-sm font-semibold text-coral transition active:opacity-70"
              >
                Delete list
              </button>
            )}
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
