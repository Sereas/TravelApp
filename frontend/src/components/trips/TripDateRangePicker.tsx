"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TripDateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onDateRangeChange: (start: string, end: string) => void;
  disabled?: boolean;
}

function toDate(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  return parseISO(iso);
}

function fmtDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}

function formatTriggerText(
  startDate: string | null,
  endDate: string | null
): string {
  if (startDate && endDate)
    return `${fmtDate(startDate)} \u2014 ${fmtDate(endDate)}`;
  if (startDate) return fmtDate(startDate);
  if (endDate) return fmtDate(endDate);
  return "Set dates";
}

export function TripDateRangePicker({
  startDate,
  endDate,
  onDateRangeChange,
  disabled,
}: TripDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = toDate(startDate);
    const to = toDate(endDate);
    return from || to ? { from, to } : undefined;
  });

  // Sync range state when props change (e.g., after optimistic update revert)
  useEffect(() => {
    if (!open) {
      const from = toDate(startDate);
      const to = toDate(endDate);
      setRange(from || to ? { from, to } : undefined);
    }
  }, [startDate, endDate, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const from = toDate(startDate);
      const to = toDate(endDate);
      setRange(from || to ? { from, to } : undefined);
    }
    setOpen(nextOpen);
  }

  function handleSelect(newRange: DateRange | undefined) {
    const hadComplete = !!(range?.from && range?.to);
    const gotComplete = !!(newRange?.from && newRange?.to);

    if (hadComplete && gotComplete) {
      // rdp adjusted an existing range on click — force single-day reset
      // so the user always makes two fresh clicks for a new range
      const toChanged = newRange.to!.getTime() !== range!.to!.getTime();
      const clickedDay = toChanged ? newRange.to! : newRange.from!;
      setRange({ from: clickedDay, to: undefined });
      return;
    }

    // rdp may return same date for both from/to on first click —
    // treat as incomplete (only start selected), keep popover open
    if (gotComplete && newRange!.from!.getTime() === newRange!.to!.getTime()) {
      setRange({ from: newRange!.from, to: undefined });
      return;
    }

    setRange(newRange);

    if (!hadComplete && gotComplete) {
      // Was selecting (only from) → now complete → save and close
      onDateRangeChange(
        format(newRange!.from!, "yyyy-MM-dd"),
        format(newRange!.to!, "yyyy-MM-dd")
      );
      setOpen(false);
    }
  }

  const defaultMonth = toDate(startDate) ?? toDate(endDate) ?? new Date();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Date range"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-muted/60 hover:text-foreground",
            !startDate && !endDate && "text-muted-foreground"
          )}
        >
          <CalendarDays size={14} className="shrink-0 opacity-60" />
          <span>{formatTriggerText(startDate, endDate)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={2}
          defaultMonth={defaultMonth}
          classNames={{
            months: "flex flex-col sm:flex-row gap-4",
            range_middle:
              "aria-selected:bg-primary/15 aria-selected:text-foreground",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
