"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Clock,
  ExternalLink,
  Link2,
  MapPin,
  Pencil,
  Ticket,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  type CategoryKey,
} from "@/lib/location-constants";

// Max note length — must match backend `_LOCATION_NOTE_MAX` in schemas.py.
const POPUP_NOTE_MAX_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAY_PATTERN =
  /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:/i;

function isDetailedHours(hours: string): boolean {
  return WEEKDAY_PATTERN.test(hours);
}

function formatHoursLines(hours: string): string[] {
  return hours
    .split(/\s*\|\s*|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Returns true when the user has drag-selected text — used to avoid toggling
 *  expand/collapse when the intent was text selection, not a click. */
function hasTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && sel.toString().length > 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface LocationPopupCardProps {
  name: string;
  category?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  requires_booking?: string | null;
  city?: string | null;
  working_hours?: string | null;
  useful_link?: string | null;
  google_link?: string | null;
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
  working_hours,
  useful_link,
  google_link,
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
  const [hoursExpanded, setHoursExpanded] = useState(false);

  useEffect(() => {
    if (!editingNote) {
      setNoteDraft(note ?? "");
    }
  }, [note, editingNote]);

  const imageUrl = user_image_url || image_url;
  const booking = requires_booking ?? "no";
  const showBooking = booking === "yes" || booking === "yes_done";
  const isBooked = booking === "yes_done";
  const canEditNote = !readOnly && onSaveNote != null;
  const canDelete = !readOnly && onDelete != null;
  const catMeta = category ? CATEGORY_META[category as CategoryKey] : null;
  const isDetailedHoursValue = working_hours ? isDetailedHours(working_hours) : false;

  const enterEditMode = () => {
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
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete location"
      );
      setDeleting(false);
    }
  };

  return (
    <div className="w-[280px] overflow-hidden rounded-xl bg-card shadow-lg ring-1 ring-border/50">
      {/* ── Hero image ── */}
      {imageUrl ? (
        <div className="relative h-[130px] w-full overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
          {/* Badges over image */}
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {category && (
              <span
                data-testid="popup-category-badge"
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm",
                  catMeta
                    ? `${catMeta.bg} ${catMeta.text}`
                    : "bg-white/90 text-foreground"
                )}
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={isBooked ? "Booked" : "Booking needed"}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm",
                  isBooked
                    ? "bg-booking-done-bg/95 text-booking-done-text"
                    : "bg-booking-pending-bg/95 text-booking-pending-text"
                )}
              >
                <Ticket size={9} className="shrink-0" />
                {isBooked ? "Booked" : "Book"}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* No image — show badges inline */
        (category || showBooking) && (
          <div className="flex flex-wrap gap-1 px-3.5 pt-3">
            {category && (
              <span
                data-testid="popup-category-badge"
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  catMeta
                    ? `${catMeta.bg} ${catMeta.text}`
                    : "border border-border bg-muted text-foreground"
                )}
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={isBooked ? "Booked" : "Booking needed"}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  isBooked
                    ? "border-booking-done-border bg-booking-done-bg text-booking-done-text"
                    : "border-booking-pending-border bg-booking-pending-bg text-booking-pending-text"
                )}
              >
                <Ticket size={9} className="shrink-0" />
                {isBooked ? "Booked" : "Book"}
              </span>
            )}
          </div>
        )
      )}

      {/* ── Content ── */}
      <div className="flex flex-col gap-2.5 px-3.5 pb-3 pt-2.5">
        {/* Name + City */}
        <div>
          <p className="text-[13px] font-semibold leading-snug text-foreground">
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
        </div>

        {/* ── Note ── */}
        {!editingNote && (
          <div data-testid="popup-note-container">
            {note ? (
              <div className="relative">
                <div
                  data-testid="popup-note"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!hasTextSelection()) setNoteExpanded((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setNoteExpanded((prev) => !prev);
                    }
                  }}
                  className="block w-full cursor-pointer select-text rounded-lg border-l-2 border-primary/30 bg-primary/[0.04] px-2.5 py-1.5 pr-7 text-left text-[11px] leading-relaxed text-foreground/80 outline-none transition-colors hover:bg-primary/[0.08]"
                >
                  <span className={cn("break-words", !noteExpanded && "line-clamp-2")}>
                    {note}
                  </span>
                </div>
                {canEditNote && (
                  <button
                    type="button"
                    aria-label="Edit note"
                    onClick={(e) => {
                      e.stopPropagation();
                      enterEditMode();
                    }}
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm outline-none backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                  >
                    <Pencil size={10} />
                  </button>
                )}
              </div>
            ) : (
              canEditNote && (
                <button
                  type="button"
                  aria-label="Edit note"
                  onClick={enterEditMode}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-primary/30 hover:bg-primary/[0.04] hover:text-foreground"
                >
                  <Pencil size={10} />
                  Add note
                </button>
              )
            )}
          </div>
        )}

        {/* Note — edit mode */}
        {editingNote && (
          <div className="flex flex-col gap-1.5">
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
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
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
              <p role="alert" className="text-[11px] font-medium text-destructive">
                {noteError}
              </p>
            )}
          </div>
        )}

        {/* ── Opening hours ── */}
        {working_hours && (
          <div>
            {isDetailedHoursValue ? (
              <div>
                <button
                  type="button"
                  onClick={() => setHoursExpanded((prev) => !prev)}
                  className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  aria-expanded={hoursExpanded}
                >
                  <Clock size={11} className="shrink-0 opacity-60" />
                  <span className="underline decoration-dotted underline-offset-2">
                    {hoursExpanded ? "Hide hours" : "Opening hours"}
                  </span>
                  <ChevronDown
                    size={11}
                    className={cn(
                      "ml-auto shrink-0 opacity-50 transition-transform duration-200",
                      hoursExpanded && "rotate-180"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    hoursExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="mt-1.5 rounded-lg border border-border bg-card">
                      {formatHoursLines(working_hours).map((line, i) => {
                        const parts = line.split(/:\s*(.+)/);
                        const dayName = parts[0];
                        const time = parts[1] || "";
                        const isClosed = /closed/i.test(time);
                        return (
                          <div
                            key={line}
                            className={cn(
                              "flex items-center justify-between px-2.5 py-1 text-[10px]",
                              i > 0 && "border-t border-border/60"
                            )}
                          >
                            <span className="font-medium text-foreground">
                              {dayName}
                            </span>
                            <span
                              className={
                                isClosed
                                  ? "text-muted-foreground/50"
                                  : "text-muted-foreground"
                              }
                            >
                              {time || line}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock size={11} className="shrink-0 opacity-60" />
                <span>{working_hours}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Links ── */}
        {(useful_link || google_link) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {useful_link && (
              <a
                href={useful_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary transition-colors hover:text-primary-strong"
              >
                <Link2 size={10} className="shrink-0" />
                <span className="max-w-[140px] truncate">
                  {domainFromUrl(useful_link)}
                </span>
                <ExternalLink size={8} className="shrink-0" />
              </a>
            )}
            {google_link && (
              <a
                href={google_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary transition-colors hover:text-primary-strong"
              >
                <MapPin size={10} className="shrink-0" />
                Maps
                <ExternalLink size={8} className="shrink-0" />
              </a>
            )}
          </div>
        )}

        {/* ── Delete confirmation ── */}
        {confirmingDelete && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2">
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
              <p role="alert" className="text-[11px] font-medium text-destructive">
                {deleteError}
              </p>
            )}
          </div>
        )}

        {/* ── Delete button ── */}
        {canDelete && !editingNote && !confirmingDelete && (
          <button
            type="button"
            aria-label="Delete location"
            onClick={requestDelete}
            className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 size={11} />
            Delete location
          </button>
        )}
      </div>
    </div>
  );
}
