"use client";

import { useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  Ticket,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_META, type CategoryKey } from "@/lib/location-constants";
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        isBooked
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      )}
    >
      <Ticket size={11} />
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
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const isDetailedHoursValue =
    working_hours != null && working_hours.trim() !== ""
      ? isDetailedHours(working_hours)
      : false;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:shadow-md",
        inItinerary
          ? "border-primary/25 shadow-sm shadow-primary/5"
          : "border-border/60",
        className
      )}
    >
      {/* Colored top accent bar */}
      <div
        className={cn(
          "h-1 w-full shrink-0",
          catMeta?.bg ?? "bg-gradient-to-r from-gray-100 to-gray-50"
        )}
      />

      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-2.5">
        {/* Header row: name + category text + badges + menu */}
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight">
              {name}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {category && (
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    catMeta?.text ?? "text-muted-foreground"
                  )}
                >
                  {category}
                </span>
              )}
              {requires_booking && requires_booking !== "no" && (
                <BookingBadge status={requires_booking} />
              )}
            </div>
          </div>
          {useMenu && (
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-full text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
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
          )}
          {!useMenu && actions != null && (
            <div className="flex shrink-0 items-center gap-1">{actions}</div>
          )}
        </div>

        {/* Content: address, hours, notes */}
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5">
          {hasGeo && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin size={12} className="shrink-0 text-muted-foreground/50" />
              <span className="truncate">
                {city && address
                  ? `${city} \u00B7 ${address}`
                  : city || address}
              </span>
            </div>
          )}
          {working_hours && (
            <div className="flex flex-col gap-0.5">
              {isDetailedHoursValue ? (
                <>
                  <button
                    type="button"
                    onClick={() => setHoursExpanded((e) => !e)}
                    className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    aria-expanded={hoursExpanded}
                    aria-label={
                      hoursExpanded
                        ? "Collapse opening hours"
                        : "View opening hours"
                    }
                  >
                    <Clock
                      size={12}
                      className="shrink-0 text-muted-foreground/50"
                    />
                    <span className="underline decoration-dotted underline-offset-2">
                      {hoursExpanded
                        ? "Hide opening hours"
                        : "View opening hours"}
                    </span>
                  </button>
                  {hoursExpanded && (
                    <div className="ml-5 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {formatHoursLines(working_hours).map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock
                    size={12}
                    className="shrink-0 text-muted-foreground/50"
                  />
                  {working_hours}
                </div>
              )}
            </div>
          )}
          {note && (
            <div className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/80">
              <div className="flex items-start gap-1.5">
                <MessageSquare
                  size={12}
                  className="mt-0.5 shrink-0 text-muted-foreground/50"
                />
                <div className="min-w-0 flex-1">
                  {note.length <= NOTE_LONG_THRESHOLD ? (
                    <span>{note}</span>
                  ) : (
                    <>
                      <span>{noteExpanded ? note : notePreview(note)}</span>
                      <button
                        type="button"
                        onClick={() => setNoteExpanded((e) => !e)}
                        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                        aria-expanded={noteExpanded}
                      >
                        {noteExpanded ? (
                          <>
                            Show less
                            <ChevronUp size={11} />
                          </>
                        ) : (
                          <>
                            View note
                            <ChevronDown size={11} />
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer: itinerary status + Maps link + Added by */}
        <div className="mt-3 flex shrink-0 flex-col gap-1 border-t border-border/40 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[11px]">
              {inItinerary ? (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                  <CalendarCheck size={12} className="shrink-0" />
                  <span>
                    {itineraryDayLabel
                      ? `Scheduled \u00B7 ${itineraryDayLabel}`
                      : "Scheduled"}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground/50">
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
                className="inline-flex shrink-0 items-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
                aria-label="Open in Google Maps"
              >
                <ExternalLink size={11} />
                Location details
              </a>
            )}
          </div>
          {added_by_email && (
            <p className="text-[11px] text-muted-foreground/50">
              Added by {added_by_email}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
