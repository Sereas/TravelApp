"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Max note length — must match backend `_LOCATION_NOTE_MAX` in schemas.py.
const POPUP_NOTE_MAX_LENGTH = 2000;

export interface LocationPopupCardProps {
  name: string;
  category?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  requires_booking?: string | null;
  city?: string | null;
  note?: string | null;
  /** When true, hides all mutation affordances (edit/delete). Threaded as a
   *  prop (not via React context) because the popup is rendered into a
   *  detached root by `createRoot(popupContentEl)` and would not inherit
   *  the `ReadOnlyProvider` context from the surrounding page. */
  readOnly?: boolean;
  /** When provided (and not readOnly), shows a pencil button that reveals
   *  an inline textarea. Receives the trimmed next value. Rejected promise
   *  keeps edit mode open and surfaces an inline error. */
  onSaveNote?: (nextNote: string) => Promise<void> | void;
  /** When provided (and not readOnly), shows a trash button that reveals
   *  an inline confirmation row. Rejected promise keeps the confirm row
   *  visible and surfaces an inline error. */
  onDelete?: () => Promise<void> | void;
}

export function LocationPopupCard({
  name,
  category,
  image_url,
  user_image_url,
  requires_booking,
  city,
  note,
  readOnly,
  onSaveNote,
  onDelete,
}: LocationPopupCardProps) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Mirror the incoming `note` prop into the draft while NOT in edit mode.
  // If a save elsewhere updates the note, the popup's view should reflect it;
  // during active editing, the user's draft wins.
  useEffect(() => {
    if (!editingNote) {
      setNoteDraft(note ?? "");
    }
  }, [note, editingNote]);

  const imageUrl = user_image_url || image_url;
  const booking = requires_booking ?? "no";
  const showBooking = booking === "yes" || booking === "yes_done";
  const canEditNote = !readOnly && onSaveNote != null;
  const canDelete = !readOnly && onDelete != null;

  const enterEditMode = () => {
    // `noteDraft` is already kept in sync with `note` while !editingNote via
    // the effect above, so no explicit reset is needed here.
    setNoteError(null);
    setEditingNote(true);
  };

  const cancelEdit = () => {
    setEditingNote(false);
    setNoteDraft(note ?? "");
    setNoteError(null);
  };

  const submitEdit = async () => {
    if (!onSaveNote) return;
    const trimmed = noteDraft.trim();
    // No-op when the user hasn't actually changed anything. Exit edit mode
    // anyway so the pencil → Save round-trip feels like a valid "close" path.
    if (trimmed === (note ?? "")) {
      setEditingNote(false);
      setNoteError(null);
      return;
    }
    setSavingNote(true);
    setNoteError(null);
    try {
      await onSaveNote(trimmed);
      setEditingNote(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  const requestDelete = () => {
    setDeleteError(null);
    setConfirmingDelete(true);
  };

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      // Parent will typically remove this location, which destroys the
      // popup root entirely — no need to reset local state here.
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete location"
      );
      setDeleting(false);
    }
  };

  return (
    <div className="w-[220px] overflow-hidden rounded-xl bg-card shadow-lg">
      {imageUrl ? (
        <div className="relative h-28 w-full bg-muted">
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover object-center"
          />
          {/* Gradient overlay for badge readability */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {category && (
              <span
                data-testid="popup-category-badge"
                className="rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground shadow-sm"
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={booking === "yes_done" ? "Booked" : "Book"}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                  booking === "yes_done"
                    ? "bg-booking-done-bg/95 text-booking-done-text"
                    : "bg-booking-pending-bg/95 text-booking-pending-text"
                )}
              >
                {booking === "yes_done" ? "Booked ✓" : "Book"}
              </span>
            )}
          </div>
        </div>
      ) : (
        (category || showBooking) && (
          <div className="flex flex-wrap gap-1 px-3 pt-3">
            {category && (
              <span
                data-testid="popup-category-badge"
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground"
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={booking === "yes_done" ? "Booked" : "Book"}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  booking === "yes_done"
                    ? "border-booking-done-border bg-booking-done-bg text-booking-done-text"
                    : "border-booking-pending-border bg-booking-pending-bg text-booking-pending-text"
                )}
              >
                {booking === "yes_done" ? "Booked ✓" : "Book"}
              </span>
            )}
          </div>
        )
      )}
      <div className="px-3 pb-3 pt-2.5">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {name}
        </p>
        {city && (
          <p
            data-testid="popup-city"
            className="mt-0.5 text-xs text-muted-foreground"
          >
            {city}
          </p>
        )}

        {/* Note area — wraps the pill and an absolutely-positioned pencil
         *  overlay so the edit affordance is visually attached to the
         *  note field (addressing user feedback that a bottom-row icon
         *  looked detached and ambiguous). Also holds the "Add note"
         *  placeholder for the null-note case. */}
        {!editingNote && (
          <div data-testid="popup-note-container" className="relative mt-2">
            {note ? (
              <>
                <button
                  type="button"
                  data-testid="popup-note"
                  onClick={() => setNoteExpanded((prev) => !prev)}
                  className="block w-full cursor-pointer rounded-md bg-muted/60 px-2 py-1.5 pr-7 text-left text-[11px] leading-relaxed text-muted-foreground outline-none transition-colors hover:bg-muted"
                >
                  <span className={noteExpanded ? "" : "line-clamp-2"}>
                    {note}
                  </span>
                </button>
                {canEditNote && (
                  <button
                    type="button"
                    aria-label="Edit note"
                    onClick={(e) => {
                      // Sibling of (not child of) the note button above, so
                      // clicks here stop propagation defensively — the two
                      // live in the same relative wrapper and we don't want
                      // a bubble to hit the expand-toggle.
                      e.stopPropagation();
                      enterEditMode();
                    }}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm outline-none backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </>
            ) : (
              canEditNote && (
                <button
                  type="button"
                  aria-label="Edit note"
                  onClick={enterEditMode}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-2 py-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
                >
                  <Pencil size={11} />
                  Add note
                </button>
              )
            )}
          </div>
        )}

        {/* Note — edit mode */}
        {editingNote && (
          <div className="mt-2 flex flex-col gap-1.5">
            <textarea
              aria-label="Edit note"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelEdit();
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  void submitEdit();
                }
              }}
              rows={3}
              maxLength={POPUP_NOTE_MAX_LENGTH}
              disabled={savingNote}
              autoFocus
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[11px] leading-relaxed text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
              placeholder="Add a note…"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void submitEdit()}
                disabled={savingNote}
                className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {savingNote ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingNote}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground outline-none transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {noteError && (
              <p
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {noteError}
              </p>
            )}
          </div>
        )}

        {/* Delete confirmation row */}
        {confirmingDelete && (
          <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
            <p className="text-[11px] font-medium text-foreground">
              Delete this location?
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="rounded-md bg-destructive px-2.5 py-1 text-[11px] font-semibold text-destructive-foreground outline-none transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deleting}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground outline-none transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {deleteError && (
              <p
                role="alert"
                className="text-[11px] font-medium text-destructive"
              >
                {deleteError}
              </p>
            )}
          </div>
        )}

        {/* Labeled "Delete location" button — full-width with explicit text
         *  so users can't mistake it for "delete note". Hidden in read-only
         *  mode and while editing/confirming. */}
        {canDelete && !editingNote && !confirmingDelete && (
          <button
            type="button"
            aria-label="Delete location"
            onClick={requestDelete}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 size={12} />
            Delete location
          </button>
        )}
      </div>
    </div>
  );
}
