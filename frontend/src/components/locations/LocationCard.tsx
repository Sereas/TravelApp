"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Location } from "@/lib/api/types";
import {
  CalendarCheck,
  CalendarPlus,
  Camera,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Info,
  Link2,
  MapPin,
  MessageSquare,
  Pencil,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import {
  CATEGORY_META,
  CATEGORY_OPTIONS,
  type CategoryKey,
  type DayChoice,
  REQUIRES_BOOKING_OPTIONS,
} from "@/lib/location-constants";
import { CategoryIcon } from "./CategoryIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { PhotoUploadDialog } from "./PhotoUploadDialog";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { api } from "@/lib/api";
import type { ImageCropData } from "@/lib/api/types";
import { cropToBgStyle } from "@/lib/image-crop";

export interface LocationCardProps {
  id: string;
  name: string;
  address?: string | null;
  google_link?: string | null;
  note?: string | null;
  city?: string | null;
  category?: string | null;
  requires_booking?: string | null;
  working_hours?: string | null;
  useful_link?: string | null;
  added_by_email?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  user_image_crop?: ImageCropData | null;
  attribution_name?: string | null;
  attribution_uri?: string | null;
  onPhotoUpload?: (file: File, cropData: ImageCropData) => Promise<void>;
  onPhotoReset?: () => Promise<void>;
  inItinerary?: boolean;
  itineraryDayLabel?: string | null;
  availableDays?: DayChoice[];
  onScheduleToDay?: (dayId: string) => void;
  /** Legacy: inline Edit/Delete. Prefer deleteTrigger for menu. */
  actions?: React.ReactNode;
  onDelete?: () => void;
  deleteTrigger?: React.ReactNode;
  onCardClick?: () => void;
  isHighlighted?: boolean;
  /** Called with location id on mouseenter, null on mouseleave. */
  onLocationHover?: (locationId: string | null) => void;
  className?: string;
  /** Trip ID — required for inline editing saves. */
  tripId?: string;
  /** Called after a successful inline save. */
  onLocationUpdated?: (updated: Location) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function BookingBadge({ status }: { status: string }) {
  if (status === "no") return null;
  const isBooked = status === "yes_done";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm",
        isBooked
          ? "bg-booking-done-bg/90 text-booking-done-text"
          : "bg-booking-pending-bg/90 text-booking-pending-text"
      )}
    >
      <Ticket size={10} className="shrink-0" />
      {isBooked ? "Booked \u2713" : "Booking needed"}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
      aria-label={copied ? "Copied!" : `Copy ${label}`}
    >
      {copied ? <Check size={11} className="text-brand" /> : <Copy size={11} />}
    </button>
  );
}

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

/** Returns true when the user has drag-selected text — used to avoid entering
 *  inline-edit mode when the intent was text selection, not a click. */
function hasTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && sel.toString().length > 0;
}

// ---------------------------------------------------------------------------
// Inline edit hook — single field at a time
// ---------------------------------------------------------------------------

type EditableField =
  | "note"
  | "address"
  | "working_hours"
  | "useful_link"
  | "name"
  | "city"
  | "category"
  | "requires_booking";

function useInlineEdit(
  tripId: string | undefined,
  locationId: string,
  onLocationUpdated: ((updated: Location) => void) | undefined
) {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<
    Partial<Record<EditableField, string | null>>
  >({});
  const originalRef = useRef("");

  const startEdit = useCallback(
    (field: EditableField, currentValue: string) => {
      setEditingField(field);
      setDraft(currentValue);
      originalRef.current = currentValue;
      setError(null);
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setDraft("");
    setError(null);
  }, []);

  /** Return optimistic override if pending, otherwise the prop value. */
  const getValue = useCallback(
    (field: EditableField, propValue: string | null | undefined) => {
      return field in optimistic ? optimistic[field] : propValue;
    },
    [optimistic]
  );

  const saveEdit = useCallback(async () => {
    if (!tripId || !editingField) return;
    const trimmed = draft.trim();
    if (trimmed === originalRef.current) {
      cancelEdit();
      return;
    }
    const field = editingField;
    const value = trimmed || null;
    // Optimistic: close edit and show new value immediately
    setOptimistic((prev) => ({ ...prev, [field]: value }));
    setEditingField(null);
    setDraft("");
    setError(null);
    try {
      const updated = await api.locations.update(tripId, locationId, {
        [field]: value,
      });
      onLocationUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [tripId, locationId, editingField, draft, cancelEdit, onLocationUpdated]);

  /** Optimistic save for select/dropdown fields. */
  const saveSelect = useCallback(
    async (field: EditableField, value: string | null) => {
      if (!tripId) return;
      setOptimistic((prev) => ({ ...prev, [field]: value }));
      setError(null);
      try {
        const updated = await api.locations.update(tripId, locationId, {
          [field]: value,
        });
        onLocationUpdated?.(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [tripId, locationId, onLocationUpdated]
  );

  return {
    editingField,
    draft,
    setDraft,
    saving,
    error,
    startEdit,
    cancelEdit,
    saveEdit,
    saveSelect,
    getValue,
  };
}

// ---------------------------------------------------------------------------
// Inline editable text field
// ---------------------------------------------------------------------------

function InlineEditableField({
  field,
  value,
  label,
  icon: Icon,
  placeholder,
  editState,
  readOnly,
  multiline,
  inputType = "text",
  copyable,
}: {
  field: EditableField;
  value: string | null | undefined;
  label: string;
  icon?: React.ElementType;
  placeholder?: string;
  editState: ReturnType<typeof useInlineEdit>;
  readOnly: boolean;
  multiline?: boolean;
  inputType?: "text" | "url";
  copyable?: boolean;
}) {
  const isEditing = editState.editingField === field;
  const canEdit = !readOnly && editState.editingField === null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      editState.cancelEdit();
    } else if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      void editState.saveEdit();
    }
  };

  // Place cursor at end of text when entering edit mode
  const setEndRef = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    },
    []
  );

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-1.5">
          {Icon && (
            <Icon
              size={11}
              className="mt-[5px] shrink-0 text-muted-foreground"
            />
          )}
          {multiline ? (
            <textarea
              ref={setEndRef}
              aria-label={`Edit ${label}`}
              value={editState.draft}
              onChange={(e) => editState.setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => void editState.saveEdit()}
              rows={2}
              disabled={editState.saving}
              autoFocus
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-xs leading-relaxed text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
              placeholder={placeholder}
            />
          ) : (
            <input
              ref={setEndRef}
              aria-label={`Edit ${label}`}
              type={inputType}
              value={editState.draft}
              onChange={(e) => editState.setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => void editState.saveEdit()}
              disabled={editState.saving}
              autoFocus
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
              placeholder={placeholder}
            />
          )}
        </div>
        {editState.error && (
          <p role="alert" className="text-[10px] font-medium text-destructive">
            {editState.error}
          </p>
        )}
      </div>
    );
  }

  if (!value) {
    if (canEdit) {
      return (
        <button
          type="button"
          onClick={() => editState.startEdit(field, "")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          {Icon && <Icon size={12} className="shrink-0" />}
          <span className="italic">Add {label.toLowerCase()}…</span>
        </button>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "group/field flex items-start gap-1.5 text-xs text-muted-foreground",
        canEdit &&
          "cursor-pointer rounded-md transition-colors hover:bg-muted/50"
      )}
      onClick={
        canEdit
          ? () => {
              if (!hasTextSelection()) editState.startEdit(field, value);
            }
          : undefined
      }
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onKeyDown={
        canEdit
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                editState.startEdit(field, value);
              }
            }
          : undefined
      }
    >
      {Icon && <Icon size={12} className="mt-[1px] shrink-0" />}
      <span className="min-w-0 break-words">{value}</span>
      {(copyable || canEdit) && (
        <span className="ml-auto flex shrink-0 items-center gap-1 mt-[1px] opacity-0 transition-opacity hover-none:opacity-100 group-hover/field:opacity-100">
          {copyable && value && <CopyButton text={value} label={label} />}
          {canEdit && <Pencil size={11} className="shrink-0 opacity-60" />}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LocationCard({
  id,
  name,
  address,
  google_link,
  note,
  city,
  category,
  requires_booking,
  working_hours,
  useful_link,
  added_by_email,
  inItinerary,
  itineraryDayLabel,
  availableDays,
  onScheduleToDay,
  actions,
  onDelete,
  image_url,
  user_image_url,
  user_image_crop,
  attribution_name,
  attribution_uri,
  onPhotoUpload,
  onPhotoReset,
  deleteTrigger,
  onCardClick,
  isHighlighted,
  onLocationHover,
  className,
  tripId,
  onLocationUpdated,
}: LocationCardProps) {
  const readOnly = useReadOnly();
  const canDelete = !readOnly && (onDelete != null || deleteTrigger != null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [noteClamped, setNoteClamped] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const effectiveImageUrl = user_image_url ?? image_url;
  const showAttribution = !user_image_url && image_url && attribution_name;
  const canSchedule =
    availableDays != null &&
    availableDays.length > 0 &&
    onScheduleToDay != null;

  const editState = useInlineEdit(tripId, id, onLocationUpdated);

  // Effective values: optimistic overrides while API save is in-flight
  const eName = editState.getValue("name", name);
  const eCity = editState.getValue("city", city);
  const eNote = editState.getValue("note", note);
  const eAddress = editState.getValue("address", address);
  const eWorkingHours = editState.getValue("working_hours", working_hours);
  const eUsefulLink = editState.getValue("useful_link", useful_link);
  const eCategory = editState.getValue("category", category);
  const eBooking = editState.getValue("requires_booking", requires_booking);

  const catMeta = eCategory
    ? CATEGORY_META[eCategory as CategoryKey]
    : undefined;
  const isDetailedHoursValue =
    eWorkingHours != null && eWorkingHours.trim() !== ""
      ? isDetailedHours(eWorkingHours)
      : false;
  const [hoursExpanded, setHoursExpanded] = useState(false);

  useEffect(() => {
    const el = noteRef.current;
    if (!el || noteExpanded) return;
    setNoteClamped(el.scrollHeight > el.clientHeight + 1);
  }, [eNote, noteExpanded]);

  return (
    <div
      id={`loc-card-${id}`}
      data-location-id={id}
      className={cn(
        "card-flip-container group h-full",
        onCardClick && "cursor-pointer",
        className
      )}
      onClick={(e) => {
        if (!onCardClick || flipped) return;
        const target = e.target as HTMLElement | null;
        if (
          target?.closest(
            'button, a, input, textarea, select, [role="menu"], [role="menuitem"], [role="dialog"]'
          )
        ) {
          return;
        }
        onCardClick();
      }}
      onMouseEnter={() => onLocationHover?.(id)}
      onMouseLeave={() => onLocationHover?.(null)}
    >
      <div
        className={cn(
          "card-flip-inner h-full rounded-xl border border-border bg-card transition-shadow hover:shadow-md",
          inItinerary && "ring-1 ring-brand/25 shadow-sm shadow-brand/5",
          isHighlighted && "animate-location-highlight",
          flipped && "flipped"
        )}
      >
        {/* ============================================================
            FRONT FACE
            ============================================================ */}
        <div className="card-flip-face flex h-full flex-col overflow-hidden rounded-xl">
          {/* Image area */}
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-xl">
            {effectiveImageUrl ? (
              <>
                {/* When crop data exists, use a div with background-image to
                    show only the cropped region. This avoids Tailwind preflight
                    `img { max-width: 100% }` which breaks absolute-positioned
                    img scaling. When no crop, fall back to plain img + object-cover. */}
                {user_image_crop &&
                user_image_crop.width > 0 &&
                user_image_crop.height > 0 ? (
                  <div
                    className="h-full w-full cursor-pointer transition-transform duration-300 hover:scale-[1.02]"
                    style={cropToBgStyle(effectiveImageUrl, user_image_crop)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxOpen(true);
                    }}
                    role="img"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setLightboxOpen(true);
                      }
                    }}
                    aria-label={`View ${eName ?? name} photo full size`}
                  />
                ) : (
                  <img
                    src={effectiveImageUrl}
                    alt={eName ?? name}
                    className="h-full w-full cursor-pointer object-cover transition-transform duration-300 hover:scale-[1.02]"
                    loading="lazy"
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxOpen(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setLightboxOpen(true);
                      }
                    }}
                    aria-label={`View ${eName ?? name} photo full size`}
                  />
                )}
                {showAttribution && (
                  <div className="absolute bottom-0 right-0 bg-black/50 px-1.5 py-0.5 text-[10px] leading-tight text-white/80">
                    {attribution_uri ? (
                      <a
                        href={attribution_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white"
                      >
                        {attribution_name}
                      </a>
                    ) : (
                      attribution_name
                    )}
                  </div>
                )}
              </>
            ) : (
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center bg-gradient-to-br",
                  catMeta?.gradient ?? "from-muted to-background"
                )}
                data-testid="image-placeholder"
              >
                {eCategory ? (
                  <CategoryIcon
                    category={eCategory as CategoryKey}
                    size={40}
                    className="opacity-20"
                  />
                ) : (
                  <MapPin
                    size={40}
                    className="text-muted-foreground opacity-20"
                  />
                )}
              </div>
            )}

            {/* Overlaid badges */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
              {eCategory && (
                <span className="whitespace-nowrap rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground backdrop-blur-sm">
                  {eCategory}
                </span>
              )}
              {eBooking && eBooking !== "no" && (
                <BookingBadge status={eBooking} />
              )}
            </div>

            {/* Camera button */}
            {!readOnly && onPhotoUpload && (
              <div className="absolute left-2 top-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-target h-7 w-7 shrink-0 rounded-full bg-black/20 text-white backdrop-blur-sm transition-opacity hover:bg-black/40 hover:text-white hover-hover:opacity-0 hover-hover:group-hover:opacity-100 hover-none:opacity-100"
                  aria-label="Upload photo"
                  onClick={() => setPhotoDialogOpen(true)}
                >
                  <Camera size={16} />
                </Button>
              </div>
            )}

            {/* Delete button */}
            {canDelete && (
              <div className="absolute right-2 top-2">
                {deleteTrigger ?? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="touch-target h-7 w-7 shrink-0 rounded-full bg-black/20 text-white backdrop-blur-sm transition-opacity hover:bg-red-600/80 hover:text-white hover-hover:opacity-0 hover-hover:group-hover:opacity-100 hover-none:opacity-100"
                    aria-label="Delete location"
                    onClick={() => onDelete?.()}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            )}
            {!canDelete && actions != null && (
              <div className="absolute right-2 top-2 flex items-center gap-1">
                {actions}
              </div>
            )}
          </div>

          {/* Front content — min-h ensures grid cards align */}
          <div className="flex min-h-[140px] flex-1 flex-col px-3.5 pb-3 pt-3">
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
              {eName}
            </h3>

            {eCity && (
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                {eCity}
              </p>
            )}

            {/* Note — inline editable on front */}
            <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5">
              {editState.editingField === "note" ? (
                <InlineEditableField
                  field="note"
                  value={eNote}
                  label="Note"
                  icon={MessageSquare}
                  placeholder="Add a note…"
                  editState={editState}
                  readOnly={readOnly}
                  multiline
                />
              ) : eNote ? (
                <div>
                  <div
                    ref={noteRef}
                    className={cn(
                      "rounded-lg bg-primary/[0.06] py-1.5 px-2.5 text-xs leading-relaxed text-foreground/80 break-words",
                      !noteExpanded && "line-clamp-2",
                      !readOnly &&
                        tripId &&
                        "cursor-pointer transition-colors hover:bg-primary/[0.08]"
                    )}
                    onClick={
                      !readOnly && tripId
                        ? (e) => {
                            e.stopPropagation();
                            if (!hasTextSelection())
                              editState.startEdit("note", eNote);
                          }
                        : undefined
                    }
                    role={!readOnly && tripId ? "button" : undefined}
                    tabIndex={!readOnly && tripId ? 0 : undefined}
                    onKeyDown={
                      !readOnly && tripId
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!hasTextSelection())
                                editState.startEdit("note", eNote!);
                            }
                          }
                        : undefined
                    }
                  >
                    {eNote}
                  </div>
                  {(noteClamped || noteExpanded) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNoteExpanded((prev) => !prev);
                      }}
                      className="mt-0.5 text-[10px] font-medium text-primary/70 transition-colors hover:text-primary"
                    >
                      {noteExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              ) : !readOnly && tripId ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    editState.startEdit("note", "");
                  }}
                  className="flex items-center gap-1.5 text-xs italic text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <MessageSquare size={12} className="shrink-0" />
                  Add note…
                </button>
              ) : null}
            </div>

            {/* Footer */}
            <div className="mt-3 flex shrink-0 flex-col gap-1 border-t border-border pt-2">
              <div className="flex items-center justify-between gap-2">
                {/* Scheduled status */}
                <div className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">
                  {inItinerary ? (
                    <span className="inline-flex items-center gap-1 text-brand">
                      <CalendarCheck size={12} className="shrink-0" />
                      <span>Scheduled</span>
                    </span>
                  ) : !readOnly && canSchedule ? (
                    <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary transition-colors hover:text-primary-strong"
                          aria-label="Schedule to a day"
                        >
                          <CalendarPlus size={12} className="shrink-0" />
                          <span>Schedule</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-48 p-1"
                        align="start"
                        sideOffset={4}
                      >
                        <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Schedule to
                        </p>
                        <div className="flex max-h-52 flex-col overflow-y-auto">
                          {availableDays!.map((day) => (
                            <button
                              key={day.id}
                              type="button"
                              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
                              onClick={() => {
                                onScheduleToDay!(day.id);
                                setScheduleOpen(false);
                              }}
                            >
                              <CalendarPlus
                                size={13}
                                className="shrink-0 text-brand"
                              />
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                      <CalendarCheck size={12} className="shrink-0" />
                      <span>Not scheduled</span>
                    </span>
                  )}
                </div>

                {/* Flip trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlipped(true);
                  }}
                  className="touch-target inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10"
                  aria-label="Show location details"
                >
                  <Info size={11} />
                  More info
                </button>
              </div>
              {!readOnly && added_by_email && (
                <p className="text-xs text-muted-foreground/60">
                  Added by {added_by_email}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================
            BACK FACE
            ============================================================ */}
        <div className="card-flip-face card-flip-back flex flex-col rounded-xl bg-card">
          {/* Back header — warm accent bar with editable name/city */}
          <div className="flex items-center justify-between rounded-t-xl bg-primary/5 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              {editState.editingField === "name" ? (
                <InlineEditableField
                  field="name"
                  value={eName}
                  label="Name"
                  editState={editState}
                  readOnly={readOnly}
                  placeholder="Location name"
                />
              ) : !readOnly && tripId ? (
                <button
                  type="button"
                  className="block w-full truncate text-left text-sm font-semibold text-foreground rounded transition-colors hover:text-primary"
                  onClick={() => {
                    if (!hasTextSelection())
                      editState.startEdit("name", eName ?? "");
                  }}
                >
                  {eName}
                </button>
              ) : (
                <p className="truncate text-sm font-semibold text-foreground">
                  {eName}
                </p>
              )}
              {editState.editingField === "city" ? (
                <InlineEditableField
                  field="city"
                  value={eCity}
                  label="City"
                  editState={editState}
                  readOnly={readOnly}
                  placeholder="City"
                />
              ) : eCity ? (
                !readOnly && tripId ? (
                  <button
                    type="button"
                    className="block text-left text-xs text-muted-foreground rounded transition-colors hover:text-foreground"
                    onClick={() => {
                      if (!hasTextSelection())
                        editState.startEdit("city", eCity);
                    }}
                  >
                    {eCity}
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">{eCity}</p>
                )
              ) : !readOnly && tripId ? (
                <button
                  type="button"
                  onClick={() => editState.startEdit("city", "")}
                  className="text-xs italic text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  Add city…
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFlipped(false);
                editState.cancelEdit();
              }}
              className="touch-target ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Back to front"
            >
              <X size={14} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3.5 py-3">
            {/* Location section */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Location
              </p>
              <InlineEditableField
                field="address"
                value={eAddress}
                label="Address"
                icon={MapPin}
                editState={editState}
                readOnly={readOnly}
                placeholder="Full address"
                copyable
              />
              {google_link && (
                <div className="group/gmaps flex items-center gap-1">
                  <a
                    href={google_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center gap-1 rounded-md text-xs text-primary transition-colors hover:text-primary-strong"
                  >
                    <ExternalLink size={11} />
                    Open in Google Maps
                  </a>
                  <span className="opacity-0 transition-opacity hover-none:opacity-100 group-hover/gmaps:opacity-100">
                    <CopyButton text={google_link} label="Google Maps link" />
                  </span>
                </div>
              )}
            </div>

            {/* Info section */}
            <div className="flex flex-col gap-2 border-t border-border/50 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Info
              </p>

              {/* Working hours */}
              {editState.editingField === "working_hours" ? (
                <InlineEditableField
                  field="working_hours"
                  value={eWorkingHours}
                  label="Hours"
                  icon={Clock}
                  editState={editState}
                  readOnly={readOnly}
                  multiline
                  placeholder="e.g. Mon-Fri: 9am-5pm"
                />
              ) : eWorkingHours ? (
                <div
                  className={cn(
                    "flex flex-col gap-0.5",
                    !readOnly &&
                      tripId &&
                      "cursor-pointer rounded-md transition-colors hover:bg-muted/50"
                  )}
                  onClick={
                    !readOnly && tripId
                      ? () => {
                          if (!hasTextSelection())
                            editState.startEdit("working_hours", eWorkingHours);
                        }
                      : undefined
                  }
                  role={!readOnly && tripId ? "button" : undefined}
                  tabIndex={!readOnly && tripId ? 0 : undefined}
                  onKeyDown={
                    !readOnly && tripId
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            editState.startEdit("working_hours", eWorkingHours);
                          }
                        }
                      : undefined
                  }
                >
                  {isDetailedHoursValue ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHoursExpanded((prev) => !prev);
                        }}
                        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        aria-expanded={hoursExpanded}
                      >
                        <Clock size={12} className="shrink-0 opacity-50" />
                        <span className="underline decoration-dotted underline-offset-2">
                          {hoursExpanded
                            ? "Hide opening hours"
                            : "View opening hours"}
                        </span>
                      </button>
                      {hoursExpanded && (
                        <div className="ml-0.5 mt-1 rounded-lg border border-border bg-card">
                          {formatHoursLines(eWorkingHours!).map((line, i) => {
                            const parts = line.split(/:\s*(.+)/);
                            const dayName = parts[0];
                            const time = parts[1] || "";
                            const isClosed = /closed/i.test(time);
                            return (
                              <div
                                key={i}
                                className={cn(
                                  "flex items-center justify-between px-2.5 py-1 text-xs",
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
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock size={12} className="shrink-0 opacity-50" />
                      {eWorkingHours}
                    </div>
                  )}
                </div>
              ) : !readOnly && tripId ? (
                <button
                  type="button"
                  onClick={() => editState.startEdit("working_hours", "")}
                  className="flex items-center gap-1.5 text-xs italic text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <Clock size={12} className="shrink-0" />
                  Add hours…
                </button>
              ) : null}

              {/* Useful link */}
              {editState.editingField === "useful_link" ? (
                <InlineEditableField
                  field="useful_link"
                  value={eUsefulLink}
                  label="Useful link"
                  icon={Link2}
                  editState={editState}
                  readOnly={readOnly}
                  placeholder="https://…"
                  inputType="url"
                />
              ) : eUsefulLink ? (
                <div
                  className={cn(
                    "group/field flex items-center gap-1.5",
                    !readOnly &&
                      tripId &&
                      "cursor-pointer rounded-md transition-colors hover:bg-muted/50"
                  )}
                  onClick={
                    !readOnly && tripId
                      ? () => {
                          if (!hasTextSelection())
                            editState.startEdit("useful_link", eUsefulLink);
                        }
                      : undefined
                  }
                  role={!readOnly && tripId ? "button" : undefined}
                  tabIndex={!readOnly && tripId ? 0 : undefined}
                  onKeyDown={
                    !readOnly && tripId
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            editState.startEdit("useful_link", eUsefulLink!);
                          }
                        }
                      : undefined
                  }
                >
                  <Link2 size={12} className="shrink-0 text-muted-foreground" />
                  <a
                    href={eUsefulLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-xs text-primary transition-colors hover:text-primary-strong"
                  >
                    {domainFromUrl(eUsefulLink)}
                    <ExternalLink size={9} className="ml-0.5 inline" />
                  </a>
                  {!readOnly && tripId && (
                    <Pencil
                      size={10}
                      className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/field:opacity-50"
                    />
                  )}
                </div>
              ) : !readOnly && tripId ? (
                <button
                  type="button"
                  onClick={() => editState.startEdit("useful_link", "")}
                  className="flex items-center gap-1.5 text-xs italic text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <Link2 size={12} className="shrink-0" />
                  Add useful link…
                </button>
              ) : null}

              {/* Category & booking — labeled selects */}
              {!readOnly && tripId ? (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`cat-select-${id}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Category
                    </label>
                    <select
                      id={`cat-select-${id}`}
                      value={eCategory ?? ""}
                      onChange={(e) => {
                        void editState.saveSelect(
                          "category",
                          e.target.value || null
                        );
                      }}
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none transition-colors focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="">None</option>
                      {CATEGORY_OPTIONS.map((cat: string) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`booking-select-${id}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Booking
                    </label>
                    <select
                      id={`booking-select-${id}`}
                      value={eBooking ?? "no"}
                      onChange={(e) => {
                        void editState.saveSelect(
                          "requires_booking",
                          e.target.value
                        );
                      }}
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none transition-colors focus:ring-1 focus:ring-primary/30"
                    >
                      {REQUIRES_BOOKING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editState.error && (
                    <p
                      role="alert"
                      className="col-span-2 text-[10px] font-medium text-destructive"
                    >
                      {editState.error}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {eCategory && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {eCategory}
                    </span>
                  )}
                  {eBooking && eBooking !== "no" && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        eBooking === "yes_done"
                          ? "bg-booking-done-bg text-booking-done-text"
                          : "bg-booking-pending-bg text-booking-pending-text"
                      )}
                    >
                      {eBooking === "yes_done" ? "Booked" : "Booking needed"}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Schedule section */}
            {inItinerary && itineraryDayLabel && (
              <div className="flex flex-col gap-1.5 border-t border-border/50 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Schedule
                </p>
                <div className="flex items-start gap-1.5 text-xs text-brand">
                  <CalendarCheck size={12} className="mt-[1px] shrink-0" />
                  <span className="font-medium leading-relaxed">
                    {itineraryDayLabel}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Photo upload dialog */}
      {!readOnly && onPhotoUpload && onPhotoReset && (
        <PhotoUploadDialog
          open={photoDialogOpen}
          onOpenChange={setPhotoDialogOpen}
          currentImageUrl={effectiveImageUrl ?? null}
          hasUserOverride={user_image_url != null && user_image_url !== ""}
          onUpload={onPhotoUpload}
          onReset={onPhotoReset}
        />
      )}
      {effectiveImageUrl && (
        <ImageLightbox
          src={effectiveImageUrl}
          alt={eName ?? name}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
