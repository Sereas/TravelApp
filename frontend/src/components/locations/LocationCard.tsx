"use client";

import { useState } from "react";
import {
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  Ticket,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  type CategoryKey,
  type DayChoice,
} from "@/lib/location-constants";
import { CategoryIcon } from "./CategoryIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

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
  added_by_email?: string | null;
  /** When true, shows a visual indicator that this location is scheduled in the itinerary. */
  inItinerary?: boolean;
  /** Which day(s) this location appears on in the itinerary (e.g. "May 15", "Day 1, Day 3"). */
  itineraryDayLabel?: string | null;
  /** Available days for scheduling. When provided, shows a "Schedule" action. */
  availableDays?: DayChoice[];
  /** Called when user picks a day to schedule this location to. */
  onScheduleToDay?: (dayId: string) => void;
  /** Legacy: inline Edit/Delete. Prefer onEdit + deleteTrigger for menu. */
  actions?: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  /** ConfirmDialog (with trigger) for Delete; when provided, Delete in menu opens this. */
  deleteTrigger?: React.ReactNode;
  className?: string;
}

function BookingBadge({ status }: { status: string }) {
  if (status === "no") return null;
  const isBooked = status === "yes_done";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        isBooked
          ? "bg-emerald-50/90 text-emerald-700 backdrop-blur-sm"
          : "bg-amber-50/90 text-amber-700 backdrop-blur-sm"
      )}
    >
      <Ticket size={10} />
      {isBooked ? "Booked \u2713" : "Booking needed"}
    </span>
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

const NOTE_LONG_THRESHOLD = 100;

function notePreview(text: string): string {
  if (text.length <= NOTE_LONG_THRESHOLD) return text;
  const cut = text.slice(0, NOTE_LONG_THRESHOLD).trim();
  const lastSpace = cut.lastIndexOf(" ");
  const preview = lastSpace > 60 ? cut.slice(0, lastSpace) : cut;
  return preview + "\u2026";
}

export function LocationCard({
  name,
  address,
  google_link,
  note,
  city,
  category,
  requires_booking,
  working_hours,
  added_by_email,
  inItinerary,
  itineraryDayLabel,
  availableDays,
  onScheduleToDay,
  actions,
  onEdit,
  onDelete,
  deleteTrigger,
  className,
}: LocationCardProps) {
  const catMeta = category ? CATEGORY_META[category as CategoryKey] : undefined;
  const hasGeo = city || address;
  const useMenu = onEdit != null || onDelete != null || deleteTrigger != null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const canSchedule =
    availableDays != null &&
    availableDays.length > 0 &&
    onScheduleToDay != null;
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const isDetailedHoursValue =
    working_hours != null && working_hours.trim() !== ""
      ? isDetailedHours(working_hours)
      : false;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-surface-card transition-all hover:shadow-md",
        inItinerary
          ? "border-brand-green/25 shadow-sm shadow-brand-green/5"
          : "border-warm-border",
        className
      )}
    >
      {/* Image placeholder area */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-xl">
        <div
          className={cn(
            "flex h-full w-full items-center justify-center bg-gradient-to-br",
            catMeta?.gradient ?? "from-gray-100 to-gray-50"
          )}
          data-testid="image-placeholder"
        >
          {category ? (
            <CategoryIcon
              category={category as CategoryKey}
              size={40}
              className="opacity-20"
            />
          ) : (
            <MapPin size={40} className="text-gray-400 opacity-20" />
          )}
        </div>

        {/* Overlaid badges */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
          {category && (
            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-content-primary backdrop-blur-sm">
              {category}
            </span>
          )}
          {requires_booking && requires_booking !== "no" && (
            <BookingBadge status={requires_booking} />
          )}
        </div>

        {/* Three-dot menu overlay */}
        {useMenu && (
          <div className="absolute right-2 top-2">
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full bg-black/20 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/40 hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100"
                  aria-label="Location actions"
                >
                  <MoreVertical size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="end" sideOffset={4}>
                {onEdit && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent"
                    onClick={() => {
                      onEdit();
                      setMenuOpen(false);
                    }}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                )}
                {(onDelete || deleteTrigger) && (
                  <div className="flex w-full">
                    {deleteTrigger ?? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          onDelete?.();
                          setMenuOpen(false);
                        }}
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
        {!useMenu && actions != null && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {actions}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
        {/* Location name */}
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-content-primary">
          {name}
        </h3>

        {/* City — prominent but subordinate to name */}
        {city && (
          <p className="mt-0.5 text-xs font-medium text-content-muted">
            {city}
          </p>
        )}

        {/* Details: address, hours, notes */}
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5">
          {address && (
            <div className="flex items-center gap-1.5 text-[11px] text-content-muted/70">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          )}
          {working_hours && (
            <div className="flex flex-col gap-0.5">
              {isDetailedHoursValue ? (
                <>
                  <button
                    type="button"
                    onClick={() => setHoursExpanded((e) => !e)}
                    className="flex w-fit items-center gap-1.5 text-xs text-content-muted hover:text-content-primary"
                    aria-expanded={hoursExpanded}
                    aria-label={
                      hoursExpanded
                        ? "Collapse opening hours"
                        : "View opening hours"
                    }
                  >
                    <Clock size={12} className="shrink-0 opacity-50" />
                    <span className="underline decoration-dotted underline-offset-2">
                      {hoursExpanded
                        ? "Hide opening hours"
                        : "View opening hours"}
                    </span>
                  </button>
                  {hoursExpanded && (
                    <div className="ml-0.5 mt-1 rounded-lg border border-warm-border bg-surface-card">
                      {formatHoursLines(working_hours).map((line, i) => {
                        const parts = line.split(/:\s*(.+)/);
                        const dayName = parts[0];
                        const time = parts[1] || "";
                        const isClosed = /closed/i.test(time);
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex items-center justify-between px-2.5 py-1 text-[11px]",
                              i > 0 && "border-t border-warm-border/60"
                            )}
                          >
                            <span className="font-medium text-content-primary">
                              {dayName}
                            </span>
                            <span
                              className={
                                isClosed
                                  ? "text-content-muted/50"
                                  : "text-content-muted"
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
                <div className="flex items-center gap-1.5 text-xs text-content-muted">
                  <Clock size={12} className="shrink-0 opacity-50" />
                  {working_hours}
                </div>
              )}
            </div>
          )}
          {note && (
            <div className="rounded-lg border-l-2 border-brand-terracotta/30 bg-brand-terracotta/[0.04] py-1.5 pl-2.5 pr-2 text-xs leading-relaxed text-content-primary/80">
              {note.length <= NOTE_LONG_THRESHOLD ? (
                <span>{note}</span>
              ) : (
                <>
                  <span>{noteExpanded ? note : notePreview(note)}</span>
                  <button
                    type="button"
                    onClick={() => setNoteExpanded((e) => !e)}
                    className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-brand-terracotta hover:underline"
                    aria-expanded={noteExpanded}
                  >
                    {noteExpanded ? (
                      <>
                        less
                        <ChevronUp size={11} />
                      </>
                    ) : (
                      <>
                        more
                        <ChevronDown size={11} />
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer: itinerary status + schedule + Maps link + Added by */}
        <div className="mt-3 flex shrink-0 flex-col gap-1 border-t border-warm-border pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
              {inItinerary ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CalendarCheck size={12} className="shrink-0" />
                  <span>
                    {itineraryDayLabel
                      ? `Scheduled \u00B7 ${itineraryDayLabel}`
                      : "Scheduled"}
                  </span>
                </span>
              ) : canSchedule ? (
                <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-terracotta transition-colors hover:text-brand-terracotta-dark"
                      aria-label="Schedule to a day"
                    >
                      <CalendarPlus size={12} className="shrink-0" />
                      <span>Schedule to day</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-48 p-1"
                    align="start"
                    sideOffset={4}
                  >
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
                      Schedule to
                    </p>
                    <div className="flex max-h-52 flex-col overflow-y-auto">
                      {availableDays!.map((day) => (
                        <button
                          key={day.id}
                          type="button"
                          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-content-primary transition-colors hover:bg-brand-green-light"
                          onClick={() => {
                            onScheduleToDay!(day.id);
                            setScheduleOpen(false);
                          }}
                        >
                          <CalendarPlus
                            size={13}
                            className="shrink-0 text-brand-green"
                          />
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="inline-flex items-center gap-1 text-content-muted/50">
                  <CalendarCheck size={12} className="shrink-0" />
                  <span>Not scheduled</span>
                </span>
              )}
            </div>
            {google_link && (
              <a
                href={google_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-md text-[11px] font-medium text-brand-terracotta transition-colors hover:text-brand-terracotta-dark"
                aria-label="Open in Google Maps"
              >
                Details &rarr;
              </a>
            )}
          </div>
          {added_by_email && (
            <p className="text-[11px] text-content-muted/50">
              Added by {added_by_email}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
