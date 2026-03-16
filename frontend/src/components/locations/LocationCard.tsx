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
  /** Which day(s) (e.g. "Day 1", "Day 1, 3") this location appears on in the itinerary. */
  itineraryDayLabel?: string | null;
  /** Legacy: inline Edit/Delete. Prefer onEdit + deleteTrigger for menu. */
  actions?: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  /** ConfirmDialog (with trigger) for Delete; when provided, Delete in menu opens this. */
  deleteTrigger?: React.ReactNode;
  className?: string;
}

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category as CategoryKey];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.bg,
        meta.text
      )}
    >
      <CategoryIcon category={category as CategoryKey} size={12} />
      {category}
    </span>
  );
}

function BookingBadge({ status }: { status: string }) {
  if (status === "no") return null;
  const isBooked = status === "yes_done";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        isBooked ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
      )}
    >
      <Ticket size={12} />
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
        "flex flex-col rounded-lg border bg-card px-3 py-2.5 transition-shadow hover:shadow-sm",
        inItinerary ? "border-primary/30" : "border-border",
        className
      )}
    >
      {/* Header row: icon, name, category, badge, three-dot menu */}
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              catMeta?.bg ?? "bg-gray-50"
            )}
          >
            {category ? (
              <CategoryIcon
                category={category as CategoryKey}
                size={14}
                className={catMeta?.text}
              />
            ) : (
              <MapPin size={14} className="text-gray-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold leading-tight">
                {name}
              </span>
              {category && <CategoryBadge category={category} />}
              {requires_booking && requires_booking !== "no" && (
                <BookingBadge status={requires_booking} />
              )}
            </div>
          </div>
        </div>
        {useMenu && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Location actions"
              >
                <MoreVertical size={18} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end" sideOffset={6}>
              {onEdit && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={() => {
                    onEdit();
                    setMenuOpen(false);
                  }}
                >
                  <Pencil size={14} />
                  Edit
                </button>
              )}
              {(onDelete || deleteTrigger) && (
                <div className="flex w-full">
                  {deleteTrigger ?? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        onDelete?.();
                        setMenuOpen(false);
                      }}
                    >
                      <Trash2 size={14} />
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

      {/* Main content block: address, hours, notes, itinerary status, Maps link */}
      <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1">
        {hasGeo && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={11} className="shrink-0 opacity-70" />
            <span className="truncate">
              {city && address ? `${city} \u00B7 ${address}` : city || address}
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
                  className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  aria-expanded={hoursExpanded}
                  aria-label={
                    hoursExpanded
                      ? "Collapse opening hours"
                      : "View opening hours"
                  }
                >
                  <Clock size={11} className="shrink-0 opacity-70" />
                  {hoursExpanded ? "Hide opening hours" : "View opening hours"}
                </button>
                {hoursExpanded && (
                  <div className="ml-4 border-l-2 border-border/50 pl-2 text-[11px] text-muted-foreground">
                    {formatHoursLines(working_hours).map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={11} className="shrink-0 opacity-70" />
                {working_hours}
              </div>
            )}
          </div>
        )}
        {note && (
          <div
            className={cn(
              "rounded-r-md border-l-2 border-primary/25 bg-muted/30 py-1 pl-2 pr-2",
              "text-xs text-foreground/90"
            )}
          >
            <div className="flex items-start gap-1.5">
              <MessageSquare
                size={12}
                className="mt-0.5 shrink-0 text-primary/70"
              />
              <div className="min-w-0 flex-1">
                {note.length <= NOTE_LONG_THRESHOLD ? (
                  <span className="leading-snug">{note}</span>
                ) : (
                  <>
                    <span className="leading-snug">
                      {noteExpanded ? note : notePreview(note)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setNoteExpanded((e) => !e)}
                      className="mt-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                      aria-expanded={noteExpanded}
                    >
                      {noteExpanded ? (
                        <>
                          Show less
                          <ChevronUp size={12} />
                        </>
                      ) : (
                        <>
                          View note
                          <ChevronDown size={12} />
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

      {/* Footer: itinerary status, Maps link, Created by */}
      <div className="mt-2 flex shrink-0 flex-col gap-1.5 border-t border-border/50 pt-2">
        <div className="flex items-center justify-between gap-2">
          {/* Itinerary status */}
          <div className="flex items-center gap-1 text-xs">
            {inItinerary ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <CalendarCheck size={12} className="shrink-0" />
                <span>
                  {itineraryDayLabel
                    ? `In itinerary \u00B7 ${itineraryDayLabel}`
                    : "In itinerary"}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                <CalendarCheck size={12} className="shrink-0" />
                <span>Not scheduled</span>
              </span>
            )}
          </div>
          {/* Maps / Location details link */}
          {google_link && (
            <a
              href={google_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/5 hover:underline"
              aria-label="Open in Google Maps"
            >
              <ExternalLink size={11} />
              Location details
            </a>
          )}
        </div>
        {added_by_email && (
          <p className="text-[11px] text-muted-foreground/70">
            Added by {added_by_email}
          </p>
        )}
      </div>
    </div>
  );
}
