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
          className="flex min-h-11 w-full items-center justify-center rounded-full bg-plum px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-plum-deep disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-soft">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Best tacos"
            className="min-h-11 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none focus-visible:border-plum"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-soft">Emoji (optional)</span>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🌮"
            maxLength={8}
            className="min-h-11 w-24 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-lg text-ink outline-none focus-visible:border-plum"
          />
        </label>

        {mode === "edit" && category ? (
          <div className="mt-1 border-t border-line pt-4">
            {confirmingDelete ? (
              <div className="flex flex-col gap-3 rounded-xl bg-chili/10 p-3.5">
                <p className="text-sm text-ink">
                  Delete “{category.name}”? This can’t be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="min-h-11 flex-1 rounded-full border border-line px-4 text-sm font-semibold text-ink-soft transition active:scale-95 active:bg-surface-sunk"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="min-h-11 flex-1 rounded-full bg-chili px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="min-h-11 text-sm font-semibold text-chili transition active:opacity-70"
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
